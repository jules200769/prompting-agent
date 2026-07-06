import type { CaptureMode } from "./types";
import { isTerminalCaptureContext, isCaptureNoiseText } from "./terminalDetect";

/** Pure helper mirroring terminal capture mode resolution in capture.ts. */
export function resolveTerminalCaptureMode(selectionText: string | null | undefined): CaptureMode {
  return selectionText?.trim() ? "terminal" : "empty";
}

/** Screen coordinates of the resolved terminal pane (from UIA BoundingRectangle). */
export interface TerminalBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface TerminalSnapshotContext {
  className?: string;
  process?: string;
  focusedIsTerminalPane?: boolean;
  terminalBounds?: TerminalBounds;
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

const TERMINAL_BANNER_LINE_PATTERNS: RegExp[] = [
  /^Windows PowerShell$/i,
  /Copyright \(C\) Microsoft Corporation/i,
  /Install the latest PowerShell/i,
  /https:\/\/aka\.ms\/PSWindows/i,
];

function isBannerLine(line: string): boolean {
  const t = trimTerminalLine(line).trim();
  if (!t) return false;
  return TERMINAL_BANNER_LINE_PATTERNS.some((re) => re.test(t));
}

/** Strip fixed-width padding and leading PowerShell startup banner lines. */
function stripTerminalBanner(lines: string[]): string[] {
  let start = 0;
  while (start < lines.length) {
    const line = lines[start];
    if (isBannerLine(line)) {
      start++;
      continue;
    }
    if (!trimTerminalLine(line).trim()) {
      start++;
      continue;
    }
    break;
  }
  return lines.slice(start);
}

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
 * Extract meaningful terminal context from capture text.
 * Keeps scrollback output and the current prompt line; strips startup banners and a11y noise.
 */
export function extractTerminalInput(text: string): string | null {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const trimmed = normalized.trim();
  if (!trimmed) return null;
  if (isCaptureNoiseText(trimmed)) return null;

  const lines = normalized.split("\n").map(trimTerminalLine);
  const contentLines = stripTerminalBanner(lines);
  const nonEmpty = contentLines.filter((l) => l.trim());

  if (nonEmpty.length === 0) return null;

  const joined = contentLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!joined) return null;

  // Single non-prompt line (plain selection or typed command).
  if (nonEmpty.length === 1) {
    const only = nonEmpty[0].trim();
    for (const pattern of SHELL_PROMPT_PATTERNS) {
      const match = only.match(pattern);
      if (match) {
        const input = (match[1] ?? "").trim();
        return input ? only : null;
      }
    }
    return only;
  }

  // Multi-line: keep full context (output + prompts). Trim trailing empty prompt-only line.
  const lastNonEmpty = nonEmpty[nonEmpty.length - 1];
  for (const pattern of SHELL_PROMPT_PATTERNS) {
    const match = lastNonEmpty.match(pattern);
    if (match && !(match[1] ?? "").trim() && nonEmpty.length > 1) {
      const withoutEmptyPrompt = contentLines
        .slice(0, contentLines.lastIndexOf(lastNonEmpty))
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      return withoutEmptyPrompt || null;
    }
  }

  return joined;
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

  if (!trimmed || isCaptureNoiseText(trimmed)) {
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
