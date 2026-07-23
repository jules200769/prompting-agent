// Resident PowerShell STA bridge client — one process for snapshot/capture/inject.
// File-based IPC (stdin/stdout NDJSON is unreliable with powershell.exe -File under Electron).

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile, unlink, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { app } from "electron";

export const BRIDGE_SNAPSHOT_TIMEOUT_MS = 2000;
export const BRIDGE_CAPTURE_TIMEOUT_MS = 1500;
export const BRIDGE_INJECT_TIMEOUT_MS = 4000;
/** Shared hotkey capture budget (snapshot + optional slow capture). */
export const BRIDGE_SHARED_CAPTURE_DEADLINE_MS = 3500;
export const BRIDGE_READY_TIMEOUT_MS = 15_000;

export type BridgeCmd = "ping" | "snapshot" | "capture" | "inject" | "shutdown";

export interface BridgeRequestArgs {
  MetaPath?: string;
  TextPath?: string;
  ContextPath?: string;
  TargetHwnd?: number;
  WindowHandle?: number;
}

export interface BridgeResponse {
  id?: string;
  ok?: boolean;
  cmd?: string;
  stdout?: string;
  code?: number;
  error?: string;
  event?: string;
  pid?: number;
}

type Pending = {
  id: string;
  resolve: (value: BridgeResponse) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

let child: ChildProcess | null = null;
let nextId = 1;
let pending: Pending | null = null;
let queue: Array<() => void> = [];
let starting: Promise<void> | null = null;
let bridgeWarm = false;
let intentionalStop = false;
let bridgeDir = join(tmpdir(), "anvyll-ps-bridge");

function scriptsDir(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "scripts");
  }
  const candidates = [
    join(app.getAppPath(), "scripts"),
    join(__dirname, "..", "..", "scripts"),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, "ps-bridge-host.ps1"))) return dir;
  }
  return candidates[0]!;
}

function hostScriptPath(): string {
  return join(scriptsDir(), "ps-bridge-host.ps1");
}

function isBridgeAlive(): boolean {
  return (
    child != null &&
    !child.killed &&
    child.exitCode == null &&
    child.signalCode == null
  );
}

/** Parse one NDJSON/JSON protocol line (exported for unit tests). */
export function parseBridgeLine(line: string): BridgeResponse | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as BridgeResponse;
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    /* ignore non-JSON noise */
  }
  return null;
}

function killProcessTree(proc: ChildProcess): void {
  const pid = proc.pid;
  if (pid && process.platform === "win32") {
    try {
      spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
    } catch {
      try {
        proc.kill();
      } catch {
        /* ignore */
      }
    }
  } else {
    try {
      proc.kill();
    } catch {
      /* ignore */
    }
  }
}

function failPending(err: Error): void {
  if (!pending) return;
  clearTimeout(pending.timer);
  const p = pending;
  pending = null;
  p.reject(err);
}

function settlePending(resp: BridgeResponse): void {
  if (!pending) return;
  if (resp.id && resp.id !== pending.id) return;
  clearTimeout(pending.timer);
  const p = pending;
  pending = null;
  p.resolve(resp);
  pumpQueue();
}

function pumpQueue(): void {
  if (pending || queue.length === 0) return;
  const next = queue.shift();
  next?.();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForReadyFile(timeoutMs: number): Promise<void> {
  const readyPath = join(bridgeDir, "ready.json");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isBridgeAlive()) {
      throw new Error("ps-bridge exited before ready");
    }
    try {
      if (existsSync(readyPath)) {
        const raw = await readFile(readyPath, "utf8");
        const parsed = parseBridgeLine(raw);
        if (parsed?.event === "ready") {
          bridgeWarm = true;
          return;
        }
      }
    } catch {
      /* retry */
    }
    await sleep(20);
  }
  throw new Error("ps-bridge ready timeout");
}

async function waitForResponseFile(id: string, timeoutMs: number): Promise<BridgeResponse> {
  const resPath = join(bridgeDir, `res-${id}.json`);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isBridgeAlive()) {
      throw new Error("ps-bridge exited during request");
    }
    try {
      if (existsSync(resPath)) {
        const raw = await readFile(resPath, "utf8");
        await unlink(resPath).catch(() => {});
        const parsed = parseBridgeLine(raw);
        if (parsed) return parsed;
        throw new Error("ps-bridge invalid response");
      }
    } catch (err) {
      if (err instanceof Error && err.message === "ps-bridge invalid response") throw err;
      /* retry read races */
    }
    await sleep(10);
  }
  throw new Error(`ps-bridge timeout after ${timeoutMs}ms`);
}

function attachChild(proc: ChildProcess): void {
  child = proc;
  proc.stderr?.setEncoding("utf8");
  proc.stderr?.on("data", (d: string) => {
    const msg = d.trim();
    if (msg) console.warn("[Anvyll] ps-bridge stderr:", msg.slice(0, 800));
  });
  proc.on("close", (code) => {
    if (child === proc) child = null;
    bridgeWarm = false;
    const err = new Error(`ps-bridge exited (code ${code ?? "?"})`);
    failPending(err);
    if (!intentionalStop) {
      console.warn("[Anvyll]", err.message);
    }
    queue.length = 0;
  });
  proc.on("error", (err) => {
    if (child === proc) child = null;
    bridgeWarm = false;
    failPending(err instanceof Error ? err : new Error(String(err)));
  });
}

async function spawnBridge(): Promise<void> {
  intentionalStop = false;
  const script = hostScriptPath();
  if (!existsSync(script)) {
    throw new Error(`ps-bridge host missing: ${script}`);
  }
  bridgeDir = join(tmpdir(), `anvyll-ps-bridge-${process.pid}`);
  await mkdir(bridgeDir, { recursive: true });
  await rm(join(bridgeDir, "ready.json"), { force: true }).catch(() => {});
  await rm(join(bridgeDir, "shutdown"), { force: true }).catch(() => {});

  console.log("[Anvyll] ps-bridge starting:", script);
  const proc = spawn(
    "powershell.exe",
    ["-STA", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script],
    {
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
      env: {
        ...process.env,
        ANVYLL_BRIDGE: "1",
        ANVYLL_BRIDGE_DIR: bridgeDir,
      },
    },
  );
  attachChild(proc);
  await waitForReadyFile(BRIDGE_READY_TIMEOUT_MS);
}

/** Start (or no-op if already running) the resident PowerShell bridge. */
export async function startPsBridge(): Promise<void> {
  if (isBridgeAlive()) return;
  if (child && !isBridgeAlive()) {
    child = null;
    bridgeWarm = false;
  }
  if (starting) return starting;
  starting = spawnBridge()
    .catch((err) => {
      console.warn("[Anvyll] ps-bridge start failed:", err);
      throw err;
    })
    .finally(() => {
      starting = null;
    });
  return starting;
}

/** Graceful shutdown; safe to call multiple times. */
export async function stopPsBridge(): Promise<void> {
  intentionalStop = true;
  const proc = child;
  if (!proc) return;
  try {
    if (pending) {
      failPending(new Error("ps-bridge stopping"));
    }
    queue.length = 0;
    await writeFile(join(bridgeDir, "shutdown"), "1", "utf8");
  } catch {
    /* ignore */
  }
  await sleep(200);
  if (child === proc) {
    killProcessTree(proc);
    child = null;
  }
  bridgeWarm = false;
}

export function isPsBridgeWarm(): boolean {
  return bridgeWarm && isBridgeAlive();
}

async function ensureBridge(): Promise<void> {
  if (isBridgeAlive()) return;
  await startPsBridge();
}

/**
 * Send one command to the resident bridge. Serializes requests (max one in-flight).
 * On timeout, kills the bridge process tree and rejects.
 */
export async function bridgeRequest(
  cmd: BridgeCmd,
  args: BridgeRequestArgs = {},
  timeoutMs: number = BRIDGE_SNAPSHOT_TIMEOUT_MS,
): Promise<{ stdout: string; code: number }> {
  await ensureBridge();

  const runOnce = (): Promise<BridgeResponse> =>
    new Promise<BridgeResponse>((resolve, reject) => {
      const job = () => {
        void (async () => {
          if (!isBridgeAlive()) {
            reject(new Error("ps-bridge not running"));
            pumpQueue();
            return;
          }
          const id = String(nextId++);
          const timer = setTimeout(() => {
            if (pending?.id === id) {
              pending = null;
              if (child) killProcessTree(child);
              child = null;
              bridgeWarm = false;
              reject(new Error(`ps-bridge timeout after ${timeoutMs}ms (${cmd})`));
              pumpQueue();
            }
          }, timeoutMs);
          pending = { id, resolve, reject, timer };
          try {
            const reqPath = join(bridgeDir, `req-${id}.json`);
            const payload = JSON.stringify({ id, cmd, args });
            await writeFile(reqPath, payload, "utf8");
            const resp = await waitForResponseFile(id, timeoutMs);
            settlePending(resp);
          } catch (err) {
            if (pending?.id === id) {
              clearTimeout(timer);
              pending = null;
              reject(err instanceof Error ? err : new Error(String(err)));
              pumpQueue();
            }
          }
        })();
      };
      if (pending) {
        queue.push(job);
      } else {
        job();
      }
    });

  let resp: BridgeResponse;
  try {
    resp = await runOnce();
  } catch (firstErr) {
    child = null;
    bridgeWarm = false;
    try {
      await startPsBridge();
    } catch {
      throw firstErr;
    }
    resp = await runOnce();
  }

  if (resp.ok === false && resp.error) {
    throw new Error(`ps-bridge ${cmd}: ${resp.error}`);
  }
  return { stdout: resp.stdout ?? "", code: resp.code ?? 1 };
}

/** Launch-time warmup: start resident bridge (replaces throwaway ps-warmup.ps1). */
export function warmCaptureBridge(): void {
  void startPsBridge().catch((err) => {
    console.warn("[Anvyll] capture bridge warmup failed:", err);
  });
}
