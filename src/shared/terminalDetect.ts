/** Known terminal window class names (Windows Terminal, conhost, etc.). */
const TERMINAL_CLASS_NAMES = new Set([
  "CASCADIA_HOSTING_WINDOW_CLASS",
  "ConsoleWindowClass",
  "mintty",
]);

/** Process names that indicate a terminal host (lowercase, without .exe). */
const TERMINAL_PROCESS_NAMES = new Set([
  "windowsterminal",
  "conhost",
  "cmd",
  "powershell",
  "pwsh",
  "mintty",
  "wsl",
  "bash",
]);

/** IDE hosts whose integrated terminal panes need selection-only capture. */
const INTEGRATED_TERMINAL_HOSTS = new Set(["cursor", "code", "code - insiders"]);

/** Whether the foreground window is a native terminal host (not a generic text field). */
export function isTerminalWindow(className: string | undefined, processName: string | undefined): boolean {
  const cls = (className ?? "").trim();
  if (cls && TERMINAL_CLASS_NAMES.has(cls)) return true;

  const proc = normalizeProcessName(processName);
  if (proc && TERMINAL_PROCESS_NAMES.has(proc)) return true;

  return false;
}

/** Whether the foreground app hosts an integrated terminal (Cursor, VS Code). */
export function isIntegratedTerminalHost(processName: string | undefined): boolean {
  const proc = normalizeProcessName(processName);
  return Boolean(proc && INTEGRATED_TERMINAL_HOSTS.has(proc));
}

/**
 * UIA document text from integrated terminal panes — screen-reader hints, not user input.
 * Example: "Terminal 15, powershell Run the command: Toggle Screen Reader..."
 */
export function isTerminalAccessibilityNoise(text: string | undefined): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;
  if (/Toggle Screen Reader Accessibility Mode/i.test(t)) return true;
  if (/Alt\+F1 for terminal accessibility help/i.test(t)) return true;
  if (/Run the command:/i.test(t)) return true;
  if (/Terminal \d+,?\s*(powershell|pwsh|cmd|bash|zsh|wsl|sh)\b/i.test(t)) return true;
  return false;
}

/** Cursor/VS Code window or tab titles accidentally read via UIA/WM_GETTEXT. */
export function isIdeWindowTitleNoise(text: string | undefined): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;
  if (/\s-\s.+?\s-\s(Cursor|Visual Studio Code)\s*$/i.test(t)) return true;
  if (/\s-\s.+\s-\sCode\s*$/i.test(t)) return true;
  if (/\s-\sCursor\s*$/i.test(t)) return true;
  return false;
}

/** Text that must never be treated as user capture input. */
export function isCaptureNoiseText(text: string | undefined): boolean {
  return isTerminalAccessibilityNoise(text) || isIdeWindowTitleNoise(text);
}

/** UIA hints that a single element belongs to an integrated terminal pane. */
export function isTerminalPaneHint(opts: {
  className?: string;
  automationId?: string;
  name?: string;
  controlType?: string;
}): boolean {
  const name = (opts.name ?? "").trim();
  if (/^Terminal \d+/i.test(name)) return true;
  const aid = (opts.automationId ?? "").trim();
  if (/terminal/i.test(aid)) return true;
  const cls = (opts.className ?? "").trim();
  if (/terminal|xterm/i.test(cls)) return true;
  const ct = opts.controlType ?? "";
  if (ct === "ControlType.Pane" && /(powershell|pwsh|cmd|bash|zsh|wsl|git bash)/i.test(name)) return true;
  if (ct === "ControlType.Document" && /Windows/i.test(cls)) return true;
  if (/Console/i.test(cls)) return true;
  return false;
}

/** Whether capture should use the terminal selection-only path. */
export function isTerminalCaptureContext(
  className: string | undefined,
  processName: string | undefined,
  focusedIsTerminalPane?: boolean,
): boolean {
  if (isTerminalWindow(className, processName)) return true;
  if (focusedIsTerminalPane && isIntegratedTerminalHost(processName)) return true;
  return false;
}

function normalizeProcessName(processName: string | undefined): string {
  return (processName ?? "").trim().toLowerCase().replace(/\.exe$/, "");
}
