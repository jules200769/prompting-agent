// Electron main: lifecycle, overlay + studio windows, tray, global hotkey, IPC.
import { app, BrowserWindow, globalShortcut, Tray, Menu, nativeImage, ipcMain, shell, screen } from "electron";
import { join } from "node:path";
import { IPC, type AppSettings, type CaptureMode, type OptimizeRequest, type OverlayPlacement, type Provider, type WorkbenchSeed, isOverlayPlacement } from "../shared/types";
import { resolveOverlayPosition } from "../shared/overlayPosition";
import { analyze } from "../engine/orchestrator";
import * as store from "./storage";
import { keyStore } from "./keyStore";
import { runOptimize } from "./optimizeHandler";
import { startDevBridge } from "./devBridge";
import {
  rememberForeground,
  prepareCaptureTarget,
  startForegroundTracking,
  captureSelection,
  injectText,
  copyToClipboard,
  hotkeySnapshot,
  canUseEarlyCaptureFastPath,
  warmCaptureBridge,
  getFrozenInjectHwnd,
  waitUntilForeground,
  hwndFromBuffer,
  sleep,
} from "./capture";

function getSkipCaptureHwnds(): number[] {
  const skip: number[] = [];
  if (overlay?.isVisible()) {
    skip.push(hwndFromBuffer(overlay.getNativeWindowHandle()));
  }
  if (onboarding?.isVisible()) {
    skip.push(hwndFromBuffer(onboarding.getNativeWindowHandle()));
  }
  return skip.filter((h) => h > 0);
}

function getStudioFallbackHwnd(): number | null {
  if (!studio) return null;
  const h = hwndFromBuffer(studio.getNativeWindowHandle());
  return h > 0 ? h : null;
}

const isDev = !!process.env.VITE_DEV_SERVER_URL;
let overlay: BrowserWindow | null = null;
let studio: BrowserWindow | null = null;
let onboarding: BrowserWindow | null = null;
let tray: Tray | null = null;
let pendingCapture: {
  text: string;
  mode: CaptureMode;
  snapshot: { text: string; hasText: boolean };
  terminalContext?: boolean;
} | null = null;
let isOptimizing = false;
let hotkeyInFlight = false;
/** True while the overlay session is open (user-visible popup); not the same as isVisible() when resident. */
let overlaySessionOpen = false;
let overlayPreparedResolve: (() => void) | null = null;

const OVERLAY_SIZE = { width: 720, height: 520 };

function loadUrl(win: BrowserWindow, route: string): void {
  if (isDev) {
    win.loadURL(`${process.env.VITE_DEV_SERVER_URL!}/#${route}`);
  } else {
    win.loadFile(join(__dirname, "..", "..", "dist-renderer", "index.html"), { hash: route });
  }
}

function createOverlay(): BrowserWindow {
  const w = new BrowserWindow({
    width: OVERLAY_SIZE.width,
    height: OVERLAY_SIZE.height,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: true,
    webPreferences: {
      preload: join(__dirname, "..", "preload", "index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });
  w.on("blur", () => {
    // Ignore blur while hotkey capture runs — showOverlayShell + FocusWindow can spuriously blur.
    if (overlaySessionOpen && !hotkeyInFlight) void hideOverlay();
  });
  loadUrl(w, "/overlay");
  return w;
}

/** First-run onboarding: separate frameless glass window — never reuse the resident overlay. */
function createOnboarding(): BrowserWindow {
  const w = new BrowserWindow({
    width: 720,
    height: 560,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: false,
    center: true,
    webPreferences: {
      preload: join(__dirname, "..", "preload", "index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });
  w.once("ready-to-show", () => w.show());
  loadUrl(w, "/onboarding");
  w.on("closed", () => {
    onboarding = null;
  });
  return w;
}

function createStudio(): BrowserWindow {
  const w = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: "PromptForge Studio",
    backgroundColor: "#0a0b0f",
    webPreferences: {
      preload: join(__dirname, "..", "preload", "index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: true,
    },
  });
  loadUrl(w, "/studio");
  w.on("closed", () => {
    studio = null;
  });
  return w;
}

// Place the overlay from the user's snap placement on the active display work area.
function positionOverlay(): void {
  if (!overlay) return;
  const cursor = screen.getCursorScreenPoint();
  const active = screen.getDisplayNearestPoint(cursor).workArea;
  store.migrateLegacyOverlayPlacement(active, OVERLAY_SIZE);
  const settings = store.getSettings();
  const [width, height] = overlay.getSize();
  const pos = resolveOverlayPosition(settings.overlayPlacement, { width, height }, active);
  overlay.setPosition(pos.x, pos.y);
}

/** Wait until the renderer has applied pending/show state (avoids stale-content flash). */
function waitForOverlayPrepared(timeoutMs = 200): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      overlayPreparedResolve = null;
      resolve();
    }, timeoutMs);
    overlayPreparedResolve = () => {
      clearTimeout(timer);
      overlayPreparedResolve = null;
      resolve();
    };
  });
}

/** Position and show overlay at opacity 0 (resident window skips showInactive when already shown). */
function revealOverlay(): void {
  if (!overlay) overlay = createOverlay();
  positionOverlay();
  overlay.setOpacity(0);
  if (!overlay.isVisible()) {
    overlay.showInactive();
  }
}

async function deliverCaptureToOverlay(capture: {
  text: string;
  mode: CaptureMode;
  snapshot: { text: string; hasText: boolean };
  terminalContext?: boolean;
}): Promise<void> {
  if (!overlay) overlay = createOverlay();
  if (overlay.webContents.isLoading()) {
    await new Promise<void>((resolve) => {
      overlay!.webContents.once("did-finish-load", () => resolve());
    });
  }
  pendingCapture = capture;
  // When showOverlayShell() already ran, skip reveal — second OVERLAY_SHOW only updates text.
  if (!overlaySessionOpen) {
    revealOverlay();
  }
  const prepared = waitForOverlayPrepared();
  overlay.webContents.send(IPC.OVERLAY_SHOW, {
    text: capture.text,
    mode: capture.mode,
    snapshot: capture.snapshot,
    terminalContext: capture.terminalContext ?? false,
  });
  await prepared;
  overlay.setOpacity(1);
  overlaySessionOpen = true;
  // Focus once per session, only after the UIA snapshot is frozen (still hotkeyInFlight
  // here) so Enter/1-4/Esc work without a click. Never focus in showOverlayShell() —
  // that would steal focus from the source app before the snapshot runs.
  overlay.focus();
}

async function hideOverlay(): Promise<void> {
  if (!overlay) return;
  pendingCapture = null;
  overlaySessionOpen = false;
  if (overlay.isVisible()) {
    overlay.setOpacity(0);
  }
  const prepared = waitForOverlayPrepared();
  overlay.webContents.send(IPC.OVERLAY_CLEAR);
  await prepared;
  overlay.setOpacity(0);
}

/** Hide overlay for inject without clearing renderer session (Apply may need to re-open on fallback). */
async function hideOverlayForInject(): Promise<void> {
  if (!overlay) return;
  overlaySessionOpen = false;
  if (overlay.isVisible()) {
    overlay.setOpacity(0);
    overlay.hide();
  }
}

async function finalizeOverlayAfterInject(): Promise<void> {
  if (!overlay) return;
  pendingCapture = null;
  const prepared = waitForOverlayPrepared();
  overlay.webContents.send(IPC.OVERLAY_CLEAR);
  await prepared;
}

async function revealOverlayAfterInjectFallback(): Promise<void> {
  if (!overlay) return;
  revealOverlay();
  overlay.setOpacity(1);
  overlaySessionOpen = true;
  overlay.focus();
}

/** Prime hidden framebuffer to blank session state (matches first hotkey after reload). */
async function primeOverlayBuffer(): Promise<void> {
  if (!overlay) return;
  if (overlay.webContents.isLoading()) {
    await new Promise<void>((resolve) => {
      overlay!.webContents.once("did-finish-load", () => resolve());
    });
  }
  await sleep(32);
  const prepared = waitForOverlayPrepared();
  overlay.webContents.send(IPC.OVERLAY_CLEAR);
  await prepared;
  positionOverlay();
  overlay.setOpacity(0);
  if (!overlay.isVisible()) {
    overlay.showInactive();
  }
}

function sendStudioRoute(route: string): void {
  studio?.webContents.send(IPC.STUDIO_ROUTE, route);
}

function ensureStudio(route?: "settings"): void {
  if (!studio) {
    studio = createStudio();
    if (route) {
      studio.webContents.once("did-finish-load", () => sendStudioRoute(route));
    }
  } else if (route) {
    sendStudioRoute(route);
  }
  if (!studio.isVisible()) studio.show();
  studio.focus();
}

async function waitForWindowsHidden(maxMs = 80, intervalMs = 10): Promise<void> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (BrowserWindow.getAllWindows().every((w) => w === overlay || !w.isVisible())) return;
    await sleep(intervalMs);
  }
}

async function hideForCapture(): Promise<void> {
  if (overlay?.isVisible()) {
    overlay.setOpacity(0);
  }
  for (const w of BrowserWindow.getAllWindows()) {
    if (w === overlay) continue;
    if (w.isVisible()) w.hide();
  }
  await waitForWindowsHidden();
}

/**
 * Instant hotkey glass — must run before snapshot/capture in triggerHotkey().
 *
 * AGENTS: Do not remove this or move capture ahead of it. Users perceive popup latency
 * from when glass becomes visible (opacity 1), not when capture finishes. Reverting to
 * "capture first, then deliverCaptureToOverlay only" regressed UX even when capture
 * was fast (~100–300ms invisible wait). Empty shell → deliver fills text is intentional.
 * Keep overlaySessionOpen + resident hideOverlay (no hide()) in sync — see AGENTS.md hotkey flow.
 * Blur handler must ignore events while hotkeyInFlight or shell closes before capture finishes.
 */
async function showOverlayShell(): Promise<void> {
  if (!overlay) overlay = createOverlay();
  if (overlay.webContents.isLoading()) {
    await new Promise<void>((resolve) => {
      overlay!.webContents.once("did-finish-load", () => resolve());
    });
  }
  revealOverlay();
  const prepared = waitForOverlayPrepared();
  overlay.webContents.send(IPC.OVERLAY_SHOW, {
    text: "",
    mode: "field",
    snapshot: { text: "", hasText: false },
    terminalContext: false,
  });
  await prepared;
  overlay.setOpacity(1);
  overlaySessionOpen = true;
}

async function triggerHotkey(): Promise<void> {
  if (hotkeyInFlight || isOptimizing) return;
  if (overlaySessionOpen) {
    await hideOverlay();
    return;
  }

  hotkeyInFlight = true;
  const t0 = isDev ? Date.now() : 0;
  try {
    // Order is load-bearing: prepareCaptureTarget → showOverlayShell → snapshot → capture → deliver.
    // See showOverlayShell() — do not reorder for "cleaner" single-reveal flow.
    prepareCaptureTarget();

    const tShell = isDev ? Date.now() : 0;
    await showOverlayShell();
    if (isDev) console.log(`[PromptForge] overlay shell: ${Date.now() - tShell}ms`);

    const tSnap = isDev ? Date.now() : 0;
    await hotkeySnapshot();
    if (isDev) console.log(`[PromptForge] hotkey snapshot: ${Date.now() - tSnap}ms`);

    if (!canUseEarlyCaptureFastPath()) {
      await hideForCapture();
    }

    const tCap = isDev ? Date.now() : 0;
    const capture = await captureSelection();
    if (isDev) console.log(`[PromptForge] capture: ${Date.now() - tCap}ms`);

    const tDeliver = isDev ? Date.now() : 0;
    await deliverCaptureToOverlay(capture);
    if (isDev) {
      console.log(`[PromptForge] deliver: ${Date.now() - tDeliver}ms`);
      console.log(`[PromptForge] hotkey total: ${Date.now() - t0}ms`);
    }
  } finally {
    hotkeyInFlight = false;
  }
}

function registerHotkey(settings: AppSettings): void {
  globalShortcut.unregisterAll();
  const ok = globalShortcut.register(settings.hotkey, () => {
    void triggerHotkey();
  });
  if (!ok) console.warn(`PromptForge: failed to register hotkey ${settings.hotkey}`);
}

function buildTray(): void {
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, "assets", "tray.png")
    : join(app.getAppPath(), "assets", "tray.png");
  let icon = nativeImage.createFromPath(iconPath);
  if (!icon.isEmpty()) {
    icon = icon.resize({ width: 16, height: 16 });
  }
  tray = new Tray(icon);
  const menu = Menu.buildFromTemplate([
    { label: "Open Studio", click: () => ensureStudio() },
    { label: "New Optimization", click: () => void triggerHotkey() },
    { type: "separator" },
    { label: "Settings", click: () => ensureStudio("settings") },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip("PromptForge — Ctrl+Shift+O");
}

// ---------- IPC handlers ----------
function registerIpc(): void {
  ipcMain.handle(IPC.OPTIMIZE, async (evt, req: OptimizeRequest) => {
    const win = BrowserWindow.fromWebContents(evt.sender);
    isOptimizing = true;
    try {
      return await runOptimize(req, (chunk) => {
        win?.webContents.send(IPC.OPTIMIZE_STREAM, chunk);
      });
    } finally {
      isOptimizing = false;
    }
  });

  ipcMain.handle(IPC.ANALYZE, (_evt, prompt: string) => analyze(prompt));

  ipcMain.handle(IPC.CAPTURE_TRIGGER, async () => {
    await rememberForeground();
    const c = await captureSelection();
    pendingCapture = c;
    return c;
  });

  ipcMain.handle(IPC.CAPTURE_INJECT, async (_evt, text: string, snapshot: { text: string; hasText: boolean }) => {
    const snap = snapshot || pendingCapture?.snapshot || { text: "", hasText: false };
    await hideOverlayForInject();
    const injectHwnd = getFrozenInjectHwnd();
    if (injectHwnd) {
      await waitUntilForeground(injectHwnd);
      // Let the target app restore internal focus (terminal pane) after overlay hide.
      await sleep(200);
    }
    const res = await injectText(text, snap);
    if (res === "injected") {
      await finalizeOverlayAfterInject();
    } else {
      await revealOverlayAfterInjectFallback();
    }
    return res;
  });

  ipcMain.handle(IPC.CAPTURE_COPY, async (_evt, text: string) => {
    await copyToClipboard(text, pendingCapture?.snapshot || { text: "", hasText: false });
    await hideOverlay();
    return true;
  });

  ipcMain.handle(IPC.SETTINGS_GET, () => {
    try {
      const s = store.getSettings();
      console.log("[PromptForge] SETTINGS_GET ->", s);
      return s;
    } catch (e) {
      console.error("[PromptForge] SETTINGS_GET failed:", e);
      throw e;
    }
  });
  ipcMain.handle(IPC.SETTINGS_SET, (_evt, s: AppSettings) => {
    store.setSettings(s);
    registerHotkey(s);
    return true;
  });

  ipcMain.handle(IPC.KEYS_SET, (_evt, provider: Provider, key: string) => {
    keyStore.set(provider, key);
    return true;
  });
  ipcMain.handle(IPC.KEYS_HAS, (_evt, provider: Provider) => keyStore.has(provider));
  ipcMain.handle(IPC.KEYS_DELETE, (_evt, provider: Provider) => { keyStore.delete(provider); return true; });
  ipcMain.handle(IPC.KEYS_PROVIDERS, () => keyStore.providers());
  ipcMain.handle("promptforge:keys:secure", () => keyStore.isSecure());

  ipcMain.handle(IPC.LIBRARY_LIST, () => store.listLibrary());
  ipcMain.handle(IPC.LIBRARY_SAVE, (_evt, input: any) => store.saveLibrary(input));
  ipcMain.handle(IPC.LIBRARY_DELETE, (_evt, id: string) => { store.deleteLibrary(id); return true; });

  ipcMain.handle(IPC.HISTORY_LIST, () => store.listHistory());
  ipcMain.handle(IPC.HISTORY_CLEAR, () => { store.clearHistory(); return true; });

  ipcMain.on(IPC.OVERLAY_HIDE, () => {
    void hideOverlay();
  });
  ipcMain.on(IPC.OVERLAY_PREPARED, () => {
    overlayPreparedResolve?.();
  });

  ipcMain.handle(IPC.OVERLAY_PLACEMENT_SET, (_evt, placement: OverlayPlacement) => {
    if (!isOverlayPlacement(placement)) return false;
    store.setSettings({ ...store.getSettings(), overlayPlacement: placement });
    positionOverlay();
    return true;
  });
  ipcMain.on(IPC.STUDIO_SHOW, () => ensureStudio());
  ipcMain.on(IPC.STUDIO_SETTINGS, () => ensureStudio("settings"));

  ipcMain.on(IPC.STUDIO_OPEN_WORKBENCH, (_evt, seed: WorkbenchSeed) => {
    const send = () => studio?.webContents.send(IPC.STUDIO_WORKBENCH_SEED, seed);
    if (!studio) {
      studio = createStudio();
      studio.webContents.once("did-finish-load", send);
    } else {
      send();
    }
    if (!studio.isVisible()) studio.show();
    studio.focus();
    void hideOverlay();
  });

  ipcMain.on(IPC.ONBOARDING_FINISH, () => {
    store.setSettings({ ...store.getSettings(), onboardingDone: true });
    onboarding?.close();
  });
  ipcMain.handle(IPC.SHELL_OPEN_EXTERNAL, (_evt, url: unknown) => {
    if (typeof url === "string" && /^https:\/\//.test(url)) {
      void shell.openExternal(url);
      return true;
    }
    return false;
  });
  ipcMain.on(IPC.TRAY_QUIT, () => app.quit());

  // Open external links in the default browser, not in-app.
  app.on("web-contents-created", (_e, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith("http://") || url.startsWith("https://")) {
        shell.openExternal(url);
        return { action: "deny" };
      }
      return { action: "allow" };
    });
  });
}

// ---------- Lifecycle ----------
app.whenReady().then(() => {
  store.initDb();
  registerIpc();
  buildTray();
  startForegroundTracking(getSkipCaptureHwnds, getStudioFallbackHwnd);
  warmCaptureBridge();
  overlay = createOverlay();
  void primeOverlayBuffer();
  const settings = store.getSettings();
  registerHotkey(settings);
  if (isDev) startDevBridge();
  if (!settings.onboardingDone) {
    onboarding = createOnboarding();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) ensureStudio();
  });
});

app.on("window-all-closed", () => {
  // Keep running in the tray on Windows; the hotkey + tray still work.
  if (process.platform !== "darwin") {
    // Intentionally do NOT quit — resident tray utility.
  }
});

app.on("before-quit", () => {
  globalShortcut.unregisterAll();
});
