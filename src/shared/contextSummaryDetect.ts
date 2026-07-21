// Recognizes an Anvyll context summary sitting on the clipboard (the answer the
// external AI produced from an import prompt), so the overlay can offer a
// one-click "add to memory" toast. Pure and unit-testable — no Electron deps.
// Only text that already matches Anvyll's own six-label format is ever accepted,
// which is also the privacy boundary (nothing else crosses IPC).

import {
  PROJECT_SUMMARY_LABELS,
  SESSION_SUMMARY_LABELS,
  type ContextImportScope,
} from "./contextImportPrompt";
import { SESSION_CONTEXT_MAX_CHARS } from "./session";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True when every numbered label appears at a line start, in ascending order. */
function matchesAllLabelsInOrder(text: string, labels: readonly string[]): boolean {
  let lastIndex = -1;
  for (let i = 0; i < labels.length; i++) {
    const re = new RegExp(String.raw`^\s*${i + 1}\.\s*${escapeRegExp(labels[i])}\b`, "m");
    const m = re.exec(text);
    if (!m) return false;
    if (m.index <= lastIndex) return false;
    lastIndex = m.index;
  }
  return true;
}

/**
 * Returns the scope of a pasted-back summary, or null. Rejects the export
 * prompts themselves (they contain all six labels but also prompt-only markers)
 * so the toast never appears right after the Step-1 Copy.
 */
export function detectContextSummary(text: string): ContextImportScope | null {
  const trimmed = text.trim();
  // Cheap length guard: summaries are ≤250 words; reject giant clipboards early.
  if (trimmed.length < 40 || trimmed.length > SESSION_CONTEXT_MAX_CHARS * 2) return null;
  // Critical false-positive guard: the export prompt itself carries all labels.
  if (trimmed.includes("You are helping me export")) return null;
  if (/^WHAT TO INCLUDE$/m.test(trimmed)) return null;
  if (/^ACCURACY$/m.test(trimmed)) return null;

  if (matchesAllLabelsInOrder(trimmed, SESSION_SUMMARY_LABELS)) return "session";
  if (matchesAllLabelsInOrder(trimmed, PROJECT_SUMMARY_LABELS)) return "project";
  return null;
}
