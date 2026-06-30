import type { CaptureMode } from "./types";
import { isTerminalAccessibilityNoise, isTerminalCaptureContext } from "./terminalDetect";

/** Pure helper mirroring terminal capture mode resolution in capture.ts. */
export function resolveTerminalCaptureMode(selectionText: string | null | undefined): CaptureMode {
  return selectionText?.trim() ? "terminal" : "empty";
}

export interface TerminalSnapshotContext {
  className?: string;
  process?: string;
  focusedIsTerminalPane?: boolean;
}

export interface TerminalCaptureResolution {
  text: string;
  mode: CaptureMode;
  terminalContext: boolean;
}

/** Strip fixed-width console column padding from a terminal line. */
function trimTerminalLine(line: string): string {
  return line.replace(/\s+$/g, "");
}

const SHELL_PROMPT_PATTERNS: RegExp[] = [
  /^PS\s+\(.+\)\s+.+>\s*(.*)$/i,
  /^PS\s+.+>\s*(.*)$/i,
  /^[A-Za-z]:\\[^>]*>\s*(.*)$/,
  /^[\w@.-]+:[~\w/\\.-]*[$#]\s*(.*)$/,
  /^\$\s*(.*)$/,
  /^>\s*(.*)$/,
];

const TERMINAL_BUFFER_MARKERS = [
  /Copyright \(C\) Microsoft Corporation/i,
  /Install the latest PowerShell/i,
  /^Windows PowerShell$/m,
  /https:\/\/aka\.ms\/PSWindows/i,
];

/** Whether captured text looks like a full console buffer rather than a deliberate selection. */
export function isTerminalBufferDump(text: string): boolean {
  return TERMINAL_BUFFER_MARKERS.some((re) => re.test(text));
}

/** UIA often returns the entire console buffer as the "selection" — not a real user highlight. */
export function isLikelyFullConsoleBuffer(text: string): boolean {
  if (isTerminalBufferDump(text)) return true;
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((l) => trimTerminalLine(l).trim());
  return lines.length >= 4 && text.length > 180;
}

/**
 * Extract user input from terminal capture text.
 * Handles full-buffer reads (PowerShell banner + prompt line) and plain selections.
 */
export function extractTerminalInput(text: string): string | null {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const trimmed = normalized.trim();
  if (!trimmed) return null;

  const lines = normalized.split("\n").map(trimTerminalLine);

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line.trim()) continue;
    for (const pattern of SHELL_PROMPT_PATTERNS) {
      const match = line.match(pattern);
      if (match) {
        const input = (match[1] ?? "").trim();
        if (input) return input;
        if (isTerminalBufferDump(trimmed) || lines.filter((l) => l.trim()).length > 1) return null;
        continue;
      }
    }
  }

  if (isTerminalBufferDump(trimmed)) return null;

  const nonEmptyLines = lines.filter((l) => l.trim());
  if (nonEmptyLines.length === 1) return nonEmptyLines[0].trim() || null;

  // Multi-line deliberate selection (not a console buffer banner read).
  if (!isLikelyFullConsoleBuffer(trimmed)) return trimmed;

  return null;
}

/** Normalize raw capture text into terminal or field mode (used on every capture path). */
export function resolveCaptureFromPossibleTerminal(
  raw: string,
  ctx?: TerminalSnapshotContext,
): TerminalCaptureResolution {
  const trimmed = raw.trim();
  const terminalContext =
    isTerminalCaptureContext(ctx?.className, ctx?.process, ctx?.focusedIsTerminalPane) ||
    isTerminalBufferDump(trimmed) ||
    isLikelyFullConsoleBuffer(trimmed);

  if (!trimmed || isTerminalAccessibilityNoise(trimmed)) {
    return { text: "", mode: "empty", terminalContext };
  }

  if (terminalContext) {
    const extracted = extractTerminalInput(trimmed);
    if (extracted) {
      return { text: extracted, mode: "terminal", terminalContext: true };
    }
    return { text: "", mode: "empty", terminalContext: true };
  }

  return { text: trimmed, mode: "field", terminalContext: false };
}
