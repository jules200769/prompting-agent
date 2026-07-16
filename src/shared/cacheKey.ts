// Opt-cache key building — extracted from storage.ts (which imports electron)
// so the key composition is unit-testable.

import type { CaptureContext } from "./types";

export interface CacheKeyRequest {
  prompt: string;
  model: string;
  level: number;
  persona?: string;
  context?: string;
  terminalContext?: boolean;
  promptType?: string;
  writingType?: string;
  captureContext?: CaptureContext;
}

/** FNV-1a 32-bit hash (hex) — compact fingerprint for the context string. */
export function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

/**
 * Canonical string over exactly the CaptureContext fields that reach the
 * meta-prompt. suggestedModel is UI-only and excluded on purpose.
 */
export function canonicalContextString(ctx: CaptureContext | undefined): string {
  if (!ctx) return "";
  const fields = [
    ctx.app?.site ?? "",
    ctx.app?.processName ?? "",
    ctx.app?.hostKind ?? "",
    ctx.app?.windowTitle ?? "",
    ctx.text?.scope ?? "",
    ctx.text?.selectedText ?? "",
    ctx.text?.beforeCursor ?? "",
    ctx.text?.afterCursor ?? "",
    ctx.files?.activeFile ?? "",
    (ctx.files?.recentFiles ?? []).join(","),
    ctx.app?.category ?? "",
    ctx.styleHint ?? "",
  ];
  // All-empty context contributes nothing (same key as no context).
  if (fields.every((f) => f === "")) return "";
  return [...fields.slice(0, 5), ctx.text?.hasSelection ? "1" : "0", ...fields.slice(5)].join("|");
}

export function buildCacheKey(version: number, req: CacheKeyRequest): string {
  const term = req.terminalContext ? "|terminal" : "";
  const type = req.promptType && req.promptType !== "auto" ? `|type:${req.promptType}` : "";
  const writing = req.writingType ? `|writing:${req.writingType}` : "";
  const canonical = canonicalContextString(req.captureContext);
  const ctx = canonical ? `|ctx:${fnv1a(canonical)}` : "";
  return `v${version}|${req.model}|${req.level}|${req.persona ?? ""}|${req.context ?? ""}${term}${type}${writing}${ctx}|${req.prompt.trim().toLowerCase()}`;
}
