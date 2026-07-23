// Pure helpers for session auto-memory refresh (no Electron/Node deps).

import type { CaptureContext, RunRecord } from "./types";

export const SESSION_MEMORY_MAX_RUNS = 5;
export const SESSION_MEMORY_RUN_FIELD_MAX = 800;
export const SESSION_MEMORY_DELTA_MAX = 24_000;

function truncateField(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

function isFinalizedRun(record: RunRecord): boolean {
  return Boolean(record.actions?.applied || record.actions?.copied);
}

/** One-line destination hint from capture context (app/site/file only). */
export function formatDestinationHint(capture?: CaptureContext): string | undefined {
  if (!capture?.app) return undefined;
  const parts: string[] = [];
  const app = capture.app;
  if (app.site) parts.push(`site: ${app.site}`);
  else if (app.editorKind) parts.push(`app: ${app.editorKind}`);
  else if (app.processName) parts.push(`app: ${app.processName}`);
  if (capture.files?.activeFile) parts.push(`file: ${capture.files.activeFile}`);
  return parts.length > 0 ? `Destination: ${parts.join(", ")}` : undefined;
}

function latestVerdictLine(run: RunRecord): string | undefined {
  const comment = run.comments.find((c) => c.verdict);
  if (!comment) return undefined;
  const snippet = comment.text.trim().slice(0, 120);
  const detail = snippet ? `: ${snippet}` : "";
  return `User feedback (${comment.verdict})${detail}`;
}

/**
 * Build a capped activity delta from applied/copied runs (newest first).
 * Skips runs that are not finalized.
 */
export function buildSessionMemoryDelta(runs: RunRecord[]): string {
  const finalized = runs
    .filter(isFinalizedRun)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, SESSION_MEMORY_MAX_RUNS);
  if (finalized.length === 0) return "";

  const blocks: string[] = [];
  let total = 0;

  for (const [index, run] of finalized.entries()) {
    const original = truncateField(run.input.prompt, SESSION_MEMORY_RUN_FIELD_MAX);
    const finalText = truncateField(
      run.output.finalPrompt ?? run.output.optimizedPrompt,
      SESSION_MEMORY_RUN_FIELD_MAX,
    );
    const action = run.actions?.applied ? "applied" : "copied";
    const lines = [
      `Run ${index + 1} (${action}):`,
      `Original draft: """${original}"""`,
      `Final text used: """${finalText}"""`,
    ];
    const dest = formatDestinationHint(run.input.captureContext);
    if (dest) lines.push(dest);
    const verdict = latestVerdictLine(run);
    if (verdict) lines.push(verdict);
    const block = lines.join("\n");

    if (total + block.length > SESSION_MEMORY_DELTA_MAX) break;
    blocks.push(block);
    total += block.length + 2;
  }

  return blocks.join("\n\n");
}
