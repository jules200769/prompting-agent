// Opt-cache key building — extracted from storage.ts (which imports electron)
// so the key composition is unit-testable.

import type { CaptureContext } from "./types";
import { REWRITE_CONFIG } from "./types";

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
  sessionContext?: string;
  projectContext?: string;
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
  // Session/project context are hashed (up to 4000 chars each) — empty/absent
  // contributes nothing so pre-session cache keys stay byte-identical.
  const sess = req.sessionContext?.trim() ? `|sess:${fnv1a(req.sessionContext.trim())}` : "";
  const proj = req.projectContext?.trim() ? `|proj:${fnv1a(req.projectContext.trim())}` : "";
  const rewriteModel = REWRITE_CONFIG.modelId;
  return `v${version}|rw:${rewriteModel}|${req.model}|${req.level}|${req.persona ?? ""}|${req.context ?? ""}${term}${type}${writing}${ctx}${sess}${proj}|${req.prompt.trim().toLowerCase()}`;
}
