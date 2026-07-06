// Win32 foreground window via user32.dll (no PowerShell spawn per poll).
import koffi from "koffi";

const user32 = koffi.load("user32.dll");
const GetForegroundWindow = user32.func("uintptr_t __stdcall GetForegroundWindow()");

let testReader: (() => number) | null = null;

/** Test hook — avoids loading user32 in unit tests. */
export function setForegroundReader(reader: (() => number) | null): void {
  testReader = reader;
}

export function getForegroundHwnd(): number {
  if (testReader) return normalizeHwnd(testReader());
  const hwnd = Number(GetForegroundWindow());
  return normalizeHwnd(hwnd);
}

export function normalizeHwnd(h: number): number {
  if (!Number.isFinite(h) || h <= 0) return 0;
  return h >>> 0;
}

const ASFW_ANY = 0xffffffff;
const AllowSetForegroundWindow = user32.func("bool __stdcall AllowSetForegroundWindow(uint32 dwProcessId)");

/** Let the OS allow our process to restore foreground to the capture target. */
export function allowSetForeground(): void {
  try {
    AllowSetForegroundWindow(ASFW_ANY);
  } catch {
    /* non-fatal on older Windows builds */
  }
}
