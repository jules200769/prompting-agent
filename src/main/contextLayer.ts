// Context layer: assembles the structured CaptureContext during the existing
// hotkey capture pass. All signal sources (window title, sidecar selection
// structure, chromium URL) ride win-hotkey-snapshot.ps1 — no new PS spawns.

import type { CaptureContext, CaptureMode } from "../shared/types";
import { CONTEXT_CAPS } from "../shared/types";
import { stripUiPrivateUseGlyphs } from "../shared/captureTextSanitize";
import {
  detectAppCategory,
  detectSite,
  editorKindFromProcess,
  extractFileFromEditorTitle,
  sanitizeEditorWindowTitle,
  relevantFileMemory,
  shouldAttachFileContext,
  suggestTargetModel,
} from "../shared/contextSignals";
import type { HostKind } from "../shared/injectStrategy";
import type { UiaTargetMeta } from "./capture";
import { getSettings, listFileMemory, recordFileMemory } from "./storage";

function cleanCaptureField(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const cleaned = stripUiPrivateUseGlyphs(text).trim();
  return cleaned || undefined;
}

/** Selection-structure sidecar written by win-hotkey-snapshot.ps1 (-ContextPath). */
export interface ContextSidecarSignals {
  hasSelection?: boolean;
  selectedText?: string;
  beforeCursor?: string;
  afterCursor?: string;
}

export interface SnapshotContextSignals {
  windowTitle?: string;
  siteUrl?: string;
  process?: string;
  className?: string;
  hostKind?: HostKind;
  isPassword?: boolean;
}

function capHead(text: string | undefined, max: number): string | undefined {
  if (!text) return undefined;
  return text.length > max ? text.slice(0, max) : text;
}

function capTail(text: string | undefined, max: number): string | undefined {
  if (!text) return undefined;
  return text.length > max ? text.slice(-max) : text;
}

/**
 * Build the CaptureContext for this hotkey session. Returns undefined when the
 * screenContext setting is off or the focused element was a password field.
 */
export function assembleCaptureContext(opts: {
  mode: CaptureMode;
  capturedText: string;
  uia: UiaTargetMeta | null;
  sidecar: ContextSidecarSignals | null;
  snapshot: SnapshotContextSignals;
}): CaptureContext | undefined {
  const settings = getSettings();
  if (!settings.screenContext) return undefined;
  if (opts.snapshot.isPassword) return undefined;

  const processName = opts.snapshot.process;
  const windowTitle = capHead(
    sanitizeEditorWindowTitle(opts.snapshot.windowTitle, processName),
    CONTEXT_CAPS.windowTitle,
  );
  const site = detectSite({ processName, windowTitle, url: opts.snapshot.siteUrl }) ?? undefined;
  const editorKind = editorKindFromProcess(processName);
  const category = detectAppCategory({
    processName,
    site,
    hostKind: opts.snapshot.hostKind,
    editorKind,
    elementClassName: opts.uia?.className,
  });

  const ctx: CaptureContext = {};

  if (processName || windowTitle || opts.snapshot.hostKind || site || editorKind) {
    ctx.app = {
      processName,
      windowTitle,
      hostKind: opts.snapshot.hostKind,
      site,
      editorKind,
      category,
    };
  }

  const sidecar = opts.sidecar;
  // Compose/empty sessions must not carry "selected passage" rewrite instructions —
  // hotkey with a highlight opens empty draft on purpose (see capture.ts).
  if (opts.mode === "empty") {
    ctx.text = { scope: "empty", hasSelection: false };
  } else {
    const hasSelection = Boolean(sidecar?.hasSelection);
    ctx.text = {
      scope: hasSelection ? "selection" : "field",
      hasSelection,
      selectedText: capHead(cleanCaptureField(sidecar?.selectedText), CONTEXT_CAPS.selectedText),
      beforeCursor: capTail(cleanCaptureField(sidecar?.beforeCursor), CONTEXT_CAPS.beforeCursor),
      afterCursor: capHead(cleanCaptureField(sidecar?.afterCursor), CONTEXT_CAPS.afterCursor),
    };
  }

  // File context is category-scoped: code editors expose the open file via the
  // window title; AI-chat panes (Cursor chat) carry a workspace name, not a
  // file, so activeFile is skipped there and only prompt-token memory matches
  // surface. Terminals, email, chat, docs, and unknown apps get no files.
  if (shouldAttachFileContext(category)) {
    const activeFile =
      category === "code-editor"
        ? (extractFileFromEditorTitle(windowTitle, processName) ?? undefined)
        : undefined;
    const cleanedCaptured = stripUiPrivateUseGlyphs(opts.capturedText);
    const matched = relevantFileMemory(cleanedCaptured, listFileMemory(), activeFile, CONTEXT_CAPS.files);
    const recentFiles = matched.filter((f) => f.toLowerCase() !== activeFile?.toLowerCase());
    if (activeFile || recentFiles.length > 0) {
      ctx.files = { activeFile, recentFiles: recentFiles.length > 0 ? recentFiles : undefined };
    }
  }

  ctx.suggestedModel = suggestTargetModel({
    site,
    processName,
    elementClassName: opts.uia?.className,
  });

  return ctx;
}

/** Persist file names seen in editor window titles (deferred via setImmediate at call site). */
export function harvestFileMemory(title: string | undefined, processName: string | undefined): void {
  try {
    if (!getSettings().screenContext) return;
    const file = extractFileFromEditorTitle(title, processName);
    if (file) recordFileMemory([file]);
  } catch (err) {
    console.warn("[PromptForge] harvestFileMemory failed:", err);
  }
}
