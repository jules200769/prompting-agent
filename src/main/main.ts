// Electron main: lifecycle, overlay + studio windows, tray, global hotkey, IPC.
import { app, BrowserWindow, globalShortcut, Tray, Menu, nativeImage, ipcMain, shell, screen } from "electron";
import { join } from "node:path";
import { IPC, type AppSettings, type CaptureMode, type OptimizeRequest, type Provider } from "../shared/types";
import { optimize, analyze } from "../engine/orchestrator";
import * as store from "./storage";
import { keyStore } from "./keyStore";
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
  hwndFromBuffer,
  sleep,
} from "./capture";

function getSkipCaptureHwnds(): number[] {
  const skip: number[] = [];
  if (overlay?.isVisible()) {
    skip.push(hwndFromBuffer(overlay.getNativeWindowHandle()));
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
let tray: Tray | null = null;
let pendingCapture: { text: string; mode: CaptureMode; snapshot: { text: string; hasText: boolean } } | null = null;
let isOptimizing = false;
let hotkeyInFlight = false;
let overlayPreparedResolve: (() => void) | null = null;

function loadUrl(win: BrowserWindow, route: string): void {
  if (isDev) {
    win.loadURL(`${process.env.VITE_DEV_SERVER_URL!}/#${route}`);
  } else {
    win.loadFile(join(__dirname, "..", "..", "dist-renderer", "index.html"), { hash: route });
  }
}

function createOverlay(): BrowserWindow {
  const w = new BrowserWindow({
    width: 720,
    height: 520,
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
    if (w.isVisible()) void hideOverlay();
  });
  loadUrl(w, "/overlay");
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

// Center the overlay on the active display work area.
function positionOverlayCenter(): void {
  if (!overlay) return;
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const { x: ax, y: ay, width: aw, height: ah } = display.workArea;
  const [w, h] = overlay.getSize();
  const x = Math.round(ax + (aw - w) / 2);
  const y = Math.round(ay + (ah - h) / 2);
  overlay.setPosition(x, y);
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

/** Show overlay once per hotkey — skip if already visible (no 2nd showInactive / reposition). */
function revealOverlay(): void {
  if (!overlay) overlay = createOverlay();
  if (overlay.isVisible()) return;
  positionOverlayCenter();
  // Hide compositor white flash on transparent windows until renderer paints.
  overlay.setOpacity(0);
  overlay.showInactive();
}

async function deliverCaptureToOverlay(capture: {
  text: string;
  mode: CaptureMode;
  snapshot: { text: string; hasText: boolean };
}): Promise<void> {
  if (!overlay) overlay = createOverlay();
  if (overlay.webContents.isLoading()) {
    await new Promise<void>((resolve) => {
      overlay!.webContents.once("did-finish-load", () => resolve());
    });
  }
  pendingCapture = capture;
  const prepared = waitForOverlayPrepared();
  overlay.webContents.send(IPC.OVERLAY_SHOW, {
    text: capture.text,
    mode: capture.mode,
    snapshot: capture.snapshot,
  });
  await prepared;
  if (!overlay.isVisible()) {
    revealOverlay();
    overlay.webContents.invalidate();
    // One compositor tick before fade-in (reduces white flash on transparent win).
    await sleep(16);
  }
  overlay.setOpacity(1);
}

async function hideOverlay(): Promise<void> {
  if (!overlay) return;
  pendingCapture = null;
  if (overlay.isVisible()) {
    overlay.setOpacity(0);
  }
  const prepared = waitForOverlayPrepared();
  overlay.webContents.send(IPC.OVERLAY_CLEAR);
  await prepared;
  if (overlay.isVisible()) {
    overlay.hide();
  }
  // Stay at opacity 0 until the next reveal paints fresh content.
  overlay.setOpacity(0);
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
  overlay.setOpacity(0);
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
    if (BrowserWindow.getAllWindows().every((w) => !w.isVisible())) return;
    await sleep(intervalMs);
  }
}

async function hideForCapture(): Promise<void> {
  for (const w of BrowserWindow.getAllWindows()) {
    if (w.isVisible()) w.hide();
  }
  await waitForWindowsHidden();
}

async function triggerHotkey(): Promise<void> {
  if (hotkeyInFlight || isOptimizing) return;
  if (overlay && overlay.isVisible()) {
    await hideOverlay();
    return;
  }

  hotkeyInFlight = true;
  try {
    await hotkeySnapshot();
    prepareCaptureTarget();

    if (!canUseEarlyCaptureFastPath()) {
      await hideForCapture();
    }

    const capture = await captureSelection();
    await deliverCaptureToOverlay(capture);
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
  const icon = nativeImage.createEmpty();
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
  tray.setToolTip("PromptForge");
}

// ---------- IPC handlers ----------
function registerIpc(): void {
  ipcMain.handle(IPC.OPTIMIZE, async (evt, req: OptimizeRequest) => {
    const win = BrowserWindow.fromWebContents(evt.sender);
    const hash = store.cacheHash(req);
    const cached = store.getCache(hash, req.prompt);
    if (cached) {
      win?.webContents.send(IPC.OPTIMIZE_STREAM, cached.optimizedPrompt);
      return cached;
    }
    isOptimizing = true;
    try {
      const result = await optimize({
        request: req,
        onText: (chunk) => win?.webContents.send(IPC.OPTIMIZE_STREAM, chunk),
      });
      store.setCache(hash, result);
      store.addHistory(result, req.prompt);
      return result;
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
    // Hide overlay first so it does not steal focus; avoid resizing the target via inject.
    await hideOverlay();
    await sleep(250);
    const res = await injectText(text, snap);
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
  ipcMain.on(IPC.STUDIO_SHOW, () => ensureStudio());
  ipcMain.on(IPC.STUDIO_SETTINGS, () => ensureStudio("settings"));
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
