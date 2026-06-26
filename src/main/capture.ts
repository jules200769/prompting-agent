// Windows capture/inject bridge.
//
// Uses scripts/win-capture.ps1 (UI Automation + WM_GETTEXT + keybd_event fallback)
// because inline SendInput struct marshalling is unreliable from Node.

import { spawn } from "node:child_process";
import { writeFile, unlink, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { clipboard, app } from "electron";
import type { CaptureMode } from "../shared/types";
import { resolveCaptureResult } from "../shared/captureResolve";
import { shouldUseEarlyCaptureFastPath } from "../shared/captureFastPath";
import { getForegroundHwnd, normalizeHwnd } from "./win32";

type SkipHwndProvider = () => number[];

let getSkipHwnds: SkipHwndProvider = () => [];
let getFallbackHwnd: () => number | null = () => null;
let trackingInterval: ReturnType<typeof setInterval> | null = null;
let pollInFlight = false;
/** Last foreground window where the user was typing (Studio, Cursor, Chrome, …). */
let lastTrackedForegroundHwnd: number | null = null;
let lastForegroundHwnd: number | null = null;
/** UIA metadata for the text control captured at hotkey time (Chromium has NativeWindowHandle=0). */
export interface UiaTargetMeta {
  method: string;
  runtimeId: number[];
  className: string;
  controlType: string;
  bounds: { left: number; top: number; right: number; bottom: number };
}

/** Frozen inject target from the last successful capture (survives overlay focus changes). */
let frozenInjectTarget: { windowHwnd: number; uia: UiaTargetMeta | null } | null = null;
/** UIA element snapshotted at hotkey time, before any window hide/focus steal. */
let pendingUiaMeta: UiaTargetMeta | null = null;
/** Text read during pre-hide UIA snapshot (focus is still stable). */
let pendingCaptureText: string | null = null;

async function readForegroundHwnd(): Promise<number> {
  return getForegroundHwnd();
}

function hwndFromBuffer(buf: Buffer): number {
  if (buf.length >= 8) return normalizeHwnd(Number(buf.readBigUInt64LE(0)));
  if (buf.length >= 4) return normalizeHwnd(buf.readUInt32LE(0));
  return 0;
}

function scriptPath(name: string): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "scripts", name);
  }
  return join(app.getAppPath(), "scripts", name);
}

function psFile(args: string[]): Promise<{ stdout: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", ...args], {
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => {
      if (code === 0 || stdout.trim()) {
        resolve({ stdout: stdout.trim(), code: code ?? 1 });
      } else {
        reject(new Error(`powershell exit ${code}: ${stderr.trim() || stdout.trim() || "no output"}`));
      }
    });
    child.on("error", reject);
  });
}

/** Poll foreground and remember the last window (including PromptForge Studio). */
export function startForegroundTracking(
  skipProvider: SkipHwndProvider,
  fallbackProvider?: () => number | null,
): void {
  getSkipHwnds = skipProvider;
  if (fallbackProvider) getFallbackHwnd = fallbackProvider;
  if (trackingInterval) return;
  void pollForeground();
  trackingInterval = setInterval(() => void pollForeground(), 150);
}

async function pollForeground(): Promise<void> {
  if (pollInFlight) return;
  pollInFlight = true;
  try {
    const hwnd = await readForegroundHwnd();
    const skip = new Set(getSkipHwnds().map(normalizeHwnd));
    if (hwnd > 0 && !skip.has(hwnd)) {
      lastTrackedForegroundHwnd = hwnd;
    }
  } catch (err) {
    console.warn("[PromptForge] foreground poll failed:", err);
  } finally {
    pollInFlight = false;
  }
}

export function prepareCaptureTarget(): void {
  if (lastTrackedForegroundHwnd != null) {
    lastForegroundHwnd = lastTrackedForegroundHwnd;
  }
}

async function refreshCaptureTargetFromForeground(): Promise<void> {
  try {
    const hwnd = await readForegroundHwnd();
    const skip = new Set(getSkipHwnds().map(normalizeHwnd));
    if (hwnd > 0 && !skip.has(hwnd)) {
      lastForegroundHwnd = hwnd;
      lastTrackedForegroundHwnd = hwnd;
      return;
    }
  } catch (err) {
    console.warn("[PromptForge] foreground read failed:", err);
  }
  const fallback = normalizeHwnd(getFallbackHwnd() ?? 0);
  if (fallback > 0) {
    lastForegroundHwnd = fallback;
    lastTrackedForegroundHwnd = fallback;
  } else {
    lastForegroundHwnd = null;
  }
}

export async function reconcileCaptureTarget(): Promise<void> {
  prepareCaptureTarget();
  await refreshCaptureTargetFromForeground();
}

export async function rememberForeground(): Promise<void> {
  await reconcileCaptureTarget();
}

function snapshotClipboard(): { text: string; hasText: boolean } {
  const text = clipboard.readText();
  return { text, hasText: text.length > 0 };
}

function restoreClipboardSnapshot(snap: { text: string; hasText: boolean }): void {
  if (snap.hasText) clipboard.writeText(snap.text);
  else clipboard.clear();
}

export interface CaptureResult {
  text: string;
  mode: CaptureMode;
  snapshot: { text: string; hasText: boolean };
  uia: UiaTargetMeta | null;
}

async function readCaptureMeta(metaPath: string): Promise<UiaTargetMeta | null> {
  try {
    const raw = (await readFile(metaPath, "utf8")).replace(/^\uFEFF/, "").trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UiaTargetMeta & { runtimeId?: number[] };
    const runtimeId = Array.isArray(parsed.runtimeId)
      ? parsed.runtimeId.map(Number).filter((n) => Number.isFinite(n))
      : [];
    if (runtimeId.length === 0 && !parsed.bounds) return null;
    return { ...parsed, runtimeId };
  } catch (err) {
    console.warn("[PromptForge] readCaptureMeta failed:", err);
    return null;
  }
}

function freezeInjectTarget(windowHwnd: number, uia: UiaTargetMeta | null): void {
  lastForegroundHwnd = windowHwnd;
  frozenInjectTarget = { windowHwnd, uia };
}

interface HotkeySnapshotJson {
  hwnd?: number;
  uia?: string;
  chars?: number;
}

/** Combined foreground + UIA snapshot in one PS spawn (call before hideForCapture on slow path). */
export async function hotkeySnapshot(): Promise<UiaTargetMeta | null> {
  const metaPath = join(tmpdir(), `promptforge-uia-snapshot-${Date.now()}.json`);
  const textPath = join(tmpdir(), `promptforge-uia-text-${Date.now()}.txt`);
  try {
    const { stdout } = await psFile([
      "-File",
      scriptPath("win-hotkey-snapshot.ps1"),
      "-MetaPath",
      metaPath,
      "-TextPath",
      textPath,
    ]);
    let summary: HotkeySnapshotJson | null = null;
    try {
      summary = JSON.parse(stdout.trim()) as HotkeySnapshotJson;
    } catch {
      /* stdout may include non-JSON noise from PS; meta files are authoritative */
    }
    const hwnd = normalizeHwnd(summary?.hwnd ?? 0);
    if (hwnd > 0) {
      const skip = new Set(getSkipHwnds().map(normalizeHwnd));
      if (!skip.has(hwnd)) {
        lastTrackedForegroundHwnd = hwnd;
        lastForegroundHwnd = hwnd;
      }
    }
    const meta = await readCaptureMeta(metaPath);
    pendingUiaMeta = meta;
    pendingCaptureText = null;
    if (meta) {
      try {
        const early = (await readFile(textPath, "utf8")).replace(/^\uFEFF/, "");
        pendingCaptureText = early.trim() ? early : null;
      } catch {
        pendingCaptureText = null;
      }
    }
    console.log(
      "[PromptForge] hotkey snapshot:",
      summary ? `hwnd ${summary.hwnd} uia ${summary.uia}` : stdout.trim(),
      meta ? meta.className : "(none)",
      pendingCaptureText ? `${pendingCaptureText.length} chars` : "no text",
    );
    return meta;
  } catch (err) {
    console.warn("[PromptForge] hotkey snapshot failed:", err);
    pendingUiaMeta = null;
    pendingCaptureText = null;
    return null;
  } finally {
    await unlink(metaPath).catch(() => {});
    await unlink(textPath).catch(() => {});
  }
}

/** Whether pre-hide snapshot is enough to skip hide + win-capture.ps1. */
export function canUseEarlyCaptureFastPath(): boolean {
  return shouldUseEarlyCaptureFastPath(pendingCaptureText, pendingUiaMeta != null);
}

/** Preload PowerShell + UIA assemblies so the first hotkey capture is not cold-started. */
export function warmCaptureBridge(): void {
  void psFile(["-File", scriptPath("ps-warmup.ps1")]).catch((err) => {
    console.warn("[PromptForge] capture warmup failed:", err);
  });
}

function pickCaptureText(scriptText: string, earlyText: string | null): string {
  const fromScript = scriptText.trim();
  const fromEarly = earlyText?.trim() ?? "";
  if (!fromScript) return fromEarly;
  if (!fromEarly) return fromScript;
  if (fromEarly.length > fromScript.length) {
    console.log("[PromptForge] capture: prefer pre-hide text", fromEarly.length, "vs", fromScript.length, "chars");
    return fromEarly;
  }
  return fromScript;
}

function consumeEarlyCaptureText(): string | null {
  const text = pendingCaptureText;
  pendingCaptureText = null;
  return text;
}

function consumeUiaMeta(fromCaptureScript: UiaTargetMeta | null): UiaTargetMeta | null {
  const meta = fromCaptureScript ?? pendingUiaMeta;
  pendingUiaMeta = null;
  return meta;
}

async function captureViaScript(hwnd: number, metaPath: string): Promise<string> {
  const { stdout } = await psFile([
    "-File",
    scriptPath("win-capture.ps1"),
    "-WindowHandle",
    String(hwnd),
    "-MetaPath",
    metaPath,
  ]);
  return stdout;
}

export async function captureSelection(): Promise<CaptureResult> {
  const snapshot = snapshotClipboard();

  if (lastForegroundHwnd == null) {
    await refreshCaptureTargetFromForeground();
  }

  const hwnd = lastForegroundHwnd;
  if (hwnd == null || hwnd === 0) {
    console.warn("[PromptForge] capture: no target window tracked (click in a text field first, then press the hotkey)");
    restoreClipboardSnapshot(snapshot);
    return { text: "", mode: "empty", snapshot: { text: "", hasText: false }, uia: null };
  }

  console.log("[PromptForge] capture: target hwnd", hwnd);

  const earlyTextPeek = pendingCaptureText;
  const earlyUiaPeek = pendingUiaMeta;
  if (shouldUseEarlyCaptureFastPath(earlyTextPeek, earlyUiaPeek != null)) {
    pendingCaptureText = null;
    pendingUiaMeta = null;
    const text = earlyTextPeek!.trim();
    console.log("[PromptForge] capture: fast-path", text.length, "chars");
    console.log(
      "[PromptForge] capture: uia",
      earlyUiaPeek!.className,
      "runtimeId",
      earlyUiaPeek!.runtimeId.join(","),
    );
    freezeInjectTarget(hwnd, earlyUiaPeek);
    return { text, mode: "field", snapshot, uia: earlyUiaPeek };
  }

  const metaPath = join(tmpdir(), `promptforge-capture-meta-${Date.now()}.json`);
  let captured = "";
  try {
    captured = await captureViaScript(hwnd, metaPath);
  } catch (err) {
    console.warn("[PromptForge] capture script failed:", err);
  }
  const uiaFromScript = await readCaptureMeta(metaPath);
  await unlink(metaPath).catch(() => {});
  const uiaMeta = consumeUiaMeta(uiaFromScript);
  const earlyText = consumeEarlyCaptureText();
  const text = pickCaptureText(captured, earlyText);

  if (text.trim()) {
    console.log("[PromptForge] capture: got", text.trim().length, "chars");
    if (uiaMeta) {
      console.log("[PromptForge] capture: uia", uiaMeta.className, "runtimeId", uiaMeta.runtimeId.join(","));
    } else {
      console.warn("[PromptForge] capture: no UIA metadata (inject may fail in Chromium apps)");
    }
    freezeInjectTarget(hwnd, uiaMeta);
    return { text: text.trim(), mode: "field", snapshot, uia: uiaMeta };
  }

  console.warn("[PromptForge] capture: hwnd ok but no text read");

  const resolved = resolveCaptureResult({
    snapshotText: snapshot.text,
    afterCopy: captured,
    afterSelectAllCopy: captured,
  });

  const resolvedText = pickCaptureText(resolved.text, earlyText);
  if (resolved.mode === "field" && resolvedText.trim()) {
    freezeInjectTarget(hwnd, uiaMeta);
    return { text: resolvedText.trim(), mode: "field", snapshot, uia: uiaMeta };
  }

  restoreClipboardSnapshot(snapshot);
  return { text: "", mode: "empty", snapshot: { text: "", hasText: false }, uia: null };
}

export async function injectText(text: string, snapshot: { text: string; hasText: boolean }): Promise<"injected" | "copied"> {
  const target = frozenInjectTarget ?? (
    lastForegroundHwnd != null ? { windowHwnd: lastForegroundHwnd, uia: null } : null
  );

  if (target == null || target.windowHwnd === 0) {
    clipboard.writeText(text);
    return "copied";
  }

  console.log(
    "[PromptForge] inject: window hwnd",
    target.windowHwnd,
    target.uia ? `uia ${target.uia.className} rid=${target.uia.runtimeId.join(",")}` : "uia (none)",
  );

  const tmpPath = join(tmpdir(), `promptforge-inject-${Date.now()}.txt`);
  const metaPath = join(tmpdir(), `promptforge-inject-meta-${Date.now()}.json`);
  try {
    await writeFile(tmpPath, text, "utf8");
    if (target.uia) {
      await writeFile(metaPath, JSON.stringify(target.uia), "utf8");
    }
    const args = [
      "-File",
      scriptPath("win-inject.ps1"),
      "-WindowHandle",
      String(target.windowHwnd),
      "-TextPath",
      tmpPath,
    ];
    if (target.uia) {
      args.push("-MetaPath", metaPath);
    }
    const { stdout, code } = await psFile(args);
    for (const line of stdout.split("\n")) {
      if (line.startsWith("PF_INJECT")) console.log("[PromptForge]", line);
    }
    if (code !== 0 || !stdout.includes("PF_INJECT_OK")) {
      throw new Error(`inject not verified (exit ${code})`);
    }
  } catch (err) {
    console.warn("[PromptForge] inject script failed:", err);
    clipboard.writeText(text);
    restoreClipboardSnapshot(snapshot);
    return "copied";
  } finally {
    await unlink(tmpPath).catch(() => {});
    await unlink(metaPath).catch(() => {});
    frozenInjectTarget = null;
  }

  restoreClipboardSnapshot(snapshot);
  return "injected";
}

export async function restoreForeground(): Promise<void> {
  /* focus restore handled inside win-inject.ps1 / win-capture.ps1 */
}

export async function copyToClipboard(text: string, snapshot: { text: string; hasText: boolean }): Promise<void> {
  clipboard.writeText(text);
  void snapshot;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function userDataFile(name: string): string {
  return app.getPath("userData").replace(/\\/g, "/") + "/" + name;
}

export { hwndFromBuffer, normalizeHwnd };
