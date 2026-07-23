import type { CaptureMode } from "./types";
import {
  isCaptureNoiseText,
  isKnownNonTerminalControl,
  isTerminalCaptureContext,
} from "./terminalDetect";

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
  /** Focused UIA element class (field path) — blocks text-heuristic terminal flips. */
  elementClassName?: string;
  automationId?: string;
  controlType?: string;
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

// Specific prompt shapes (PowerShell, drive path, user@host) — a match here is almost
// certainly a real shell prompt, so the current command is the text captured in group 1.
const SPECIFIC_PROMPT_PATTERNS: RegExp[] = [
  /^PS\s+\(.+\)\s+.+>\s*(.*)$/i,
  /^PS\s+.+>\s*(.*)$/i,
  /^[A-Za-z]:\\[^>]*>\s*(.*)$/,
  /^[\w@.-]+:[~\w/\\.-]*[$#]\s*(.*)$/,
];

// Bare `$`/`>` prompts. These also match ordinary output lines (e.g. an npm script line
// like "> build"), so they are only consulted when no specific prompt is present.
const GENERIC_PROMPT_PATTERNS: RegExp[] = [/^\$\s*(.*)$/, /^>\s*(.*)$/];

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

/** The typed command on a prompt line, or null if the line has no prompt marker. */
function matchPromptCommand(line: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (match) return (match[1] ?? "").trim();
  }
  return null;
}

/**
 * Extract only the command the user typed at the current prompt, discarding the scrollback
 * (prior commands and their output) above it. Strips the PowerShell startup banner and a11y
 * noise first.
 *
 * Returns:
 *  - the typed command (prompt prefix removed) when a prompt line is found;
 *  - null when the current prompt is empty (nothing typed) — caller opens empty compose;
 *  - the text unchanged when no prompt marker is present (plain selection / pasted script),
 *    since there is no scrollback to strip.
 */
export function extractCurrentCommandInput(text: string): string | null {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const trimmed = normalized.trim();
  if (!trimmed) return null;
  if (isCaptureNoiseText(trimmed)) return null;

  const lines = normalized.split("\n").map(trimTerminalLine);
  const contentLines = stripTerminalBanner(lines);
  const nonEmpty = contentLines.filter((l) => l.trim()).map((l) => l.trim());
  if (nonEmpty.length === 0) return null;

  // Prefer the last specific prompt (the active command line); fall back to a bare $/> prompt
  // only when no specific prompt exists so an output line like "> build" is not mistaken for one.
  for (const patterns of [SPECIFIC_PROMPT_PATTERNS, GENERIC_PROMPT_PATTERNS]) {
    for (let i = nonEmpty.length - 1; i >= 0; i--) {
      const command = matchPromptCommand(nonEmpty[i], patterns);
      if (command !== null) {
        return command || null;
      }
    }
  }

  // No prompt marker at all — nothing to strip; return the content as-is.
  return contentLines.join("\n").replace(/\n{3,}/g, "\n\n").trim() || null;
}

/**
 * Text-shape heuristics are a missed-terminal fallback only.
 * Never override a known non-terminal control or an explicit non-pane UIA result.
 */
function textHeuristicsMayForceTerminal(ctx?: TerminalSnapshotContext): boolean {
  if (
    isKnownNonTerminalControl({
      elementClassName: ctx?.elementClassName,
      automationId: ctx?.automationId,
    })
  ) {
    return false;
  }
  // PS/UIA already confirmed this is not an integrated terminal pane.
  if (ctx?.focusedIsTerminalPane === false) return false;
  return true;
}

/** Normalize raw capture text into terminal or field mode (used on every capture path). */
export function resolveCaptureFromPossibleTerminal(
  raw: string,
  ctx?: TerminalSnapshotContext,
): TerminalCaptureResolution {
  const trimmed = raw.trim();
  const uiaTerminal = isTerminalCaptureContext(
    ctx?.className,
    ctx?.process,
    ctx?.focusedIsTerminalPane,
  );
  const textLooksTerminal = isTerminalBufferDump(trimmed) || isLikelyFullConsoleBuffer(trimmed);
  const terminalContext =
    uiaTerminal || (textLooksTerminal && textHeuristicsMayForceTerminal(ctx));

  if (!trimmed || isCaptureNoiseText(trimmed)) {
    return { text: "", mode: "empty", terminalContext };
  }

  if (terminalContext) {
    const extracted = extractCurrentCommandInput(trimmed);
    if (extracted) {
      return { text: extracted, mode: "terminal", terminalContext: true };
    }
    return { text: "", mode: "empty", terminalContext: true };
  }

  return { text: trimmed, mode: "field", terminalContext: false };
}
