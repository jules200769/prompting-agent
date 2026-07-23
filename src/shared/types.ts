// Shared types between main process, preload, and renderer.

import type { ThemeId } from "./themes";

export type ModelId =
  | "claude-opus-4.8"
  | "gpt-5"
  | "gemini-3"
  | "deepseek-v3"
  | "grok-4"
  | "composer-2.5";

export type Provider = "anthropic" | "openai" | "google" | "deepseek" | "xai";

export type OptLevel = 1 | 2 | 3 | 4;

export interface ModelInfo {
  id: ModelId;
  label: string;
  provider: Provider;
  rewriteModel: string; // model id used by the rewrite LLM in managed/byok mode
}

export const MODELS: ModelInfo[] = [
  { id: "claude-opus-4.8", label: "Claude Opus 4.8", provider: "anthropic", rewriteModel: "claude-opus-4-8" },
  { id: "gpt-5", label: "GPT-5", provider: "openai", rewriteModel: "gpt-5" },
  { id: "gemini-3", label: "Gemini 3 Pro", provider: "google", rewriteModel: "gemini-3-pro" },
  { id: "deepseek-v3", label: "DeepSeek V3", provider: "deepseek", rewriteModel: "deepseek-chat" },
  { id: "grok-4", label: "Grok 4", provider: "xai", rewriteModel: "grok-4" },
  { id: "composer-2.5", label: "Composer 2.5", provider: "openai", rewriteModel: "composer-2.5" },
];

/** Single rewrite LLM used for all optimizations regardless of target model. */
export const REWRITE_CONFIG = {
  provider: "openai" as const,
  modelId: "gpt-4.1",
  label: "GPT-4.1",
  /** Fixed optimal temperature â€” never varies by level or user setting. */
  temperature: 0.3,
} as const;

/** Guide structure adherence labels (L1 = cool, L4 = max). */
export const LEVEL_LABELS: Record<OptLevel, string> = {
  1: "Cool",
  2: "Warm",
  3: "Hot",
  4: "Max",
};

/** Level recognition colors â€” identical on every surface (overlay slider label, Studio segments). */
export const LEVEL_COLORS: Record<OptLevel, string> = {
  1: "#5AC8FA",
  2: "#FFD60A",
  3: "#FF9F0A",
  4: "#FF453A",
};

export type CaptureMode = "field" | "empty" | "terminal";

// ---------- Capture context (destination-aware rewrites) ----------

/** Where the captured text sits relative to the field: full field, a selection, or nothing. */
export type ContextTextScope = "selection" | "field" | "empty";

/** Hard caps applied to every context field before it can reach the meta-prompt. */
export const CONTEXT_CAPS = {
  selectedText: 4000,
  beforeCursor: 1500,
  afterCursor: 500,
  windowTitle: 200,
  files: 10,
} as const;

/** Destination app category â€” used for destination context labeling. */
export type AppCategory =
  | "ai-chat"
  | "code-editor"
  | "terminal"
  | "email"
  | "chat"
  | "docs-notes"
  | "other";

export const APP_CATEGORIES: AppCategory[] = [
  "ai-chat",
  "code-editor",
  "terminal",
  "email",
  "chat",
  "docs-notes",
  "other",
];

export const APP_CATEGORY_LABELS: Record<AppCategory, string> = {
  "ai-chat": "AI chat",
  "code-editor": "Code editor",
  terminal: "Terminal",
  email: "Email",
  chat: "Chat & messaging",
  "docs-notes": "Docs & notes",
  other: "Other",
};

/** Per-category tone selection; "auto" uses the category default, "off" disables the directive. */
export type CategoryStylePreset = "auto" | "formal" | "neutral" | "casual" | "off";

/**
 * Structured destination signal captured at hotkey time (screenContext setting on).
 * Assembled main-side, echoed back on every OptimizeRequest for the overlay session.
 */
export interface CaptureContext {
  app?: {
    processName?: string;
    windowTitle?: string;
    hostKind?: "native" | "chromium" | "richEditor" | "terminal";
    /** Normalized site host for browser targets (e.g. "claude.ai"). */
    site?: string;
    editorKind?: "cursor" | "vscode" | "windsurf";
    /** Destination app category, resolved from process/site/host signals. */
    category?: AppCategory;
  };
  text?: {
    scope: ContextTextScope;
    hasSelection: boolean;
    selectedText?: string;
    beforeCursor?: string;
    afterCursor?: string;
  };
  files?: {
    activeFile?: string;
    recentFiles?: string[];
  };
  /** UI preselect only â€” never rendered into the meta-prompt block. */
  suggestedModel?: ModelId;
}

/**
 * Overlay writing mode deliverable. When set on a request the output is the
 * final written text itself (an email, chat message, â€¦) â€” not a refined prompt.
 */
export type WritingType = "question" | "email" | "message" | "explain";

export const WRITING_TYPES: WritingType[] = ["question", "email", "message", "explain"];

/**
 * L1â€“L4 slider labels per writing type (colors stay Coolâ†’Max). Single source of
 * truth: the overlay slider shows these AND the engine derives its tone
 * instructions from the same names.
 */
export const WRITING_LEVEL_LABELS: Record<WritingType, Record<OptLevel, string>> = {
  email: { 1: "Structure", 2: "Formal", 3: "Friendly", 4: "Informal" },
  question: { 1: "Structure", 2: "Closed", 3: "Open", 4: "Auto" },
  explain: { 1: "Structure", 2: "Simple", 3: "Technical", 4: "Step by step" },
  message: { 1: "Structure", 2: "Informal", 3: "Formal", 4: "Auto" },
};

/** Overlay top-tab prompt type: shapes the rewrite deliverable; "auto" adds no hint. */
export type PromptType = "auto" | "question" | "prompt" | "letter";

export const PROMPT_TYPES: PromptType[] = ["auto", "question", "prompt", "letter"];

export const PROMPT_TYPE_LABELS: Record<PromptType, string> = {
  auto: "Auto",
  question: "Question",
  prompt: "Prompt",
  letter: "Letter",
};

export type InjectResult = "injected" | "copied";

export interface SubScores {
  clarity: number;
  context: number;
  structure: number;
  format: number;
  examples: number;
  persona: number;
  verifiability: number;
}

export interface DiffSegment {
  type: "add" | "remove" | "context";
  text: string;
  tag?: string; // e.g. "+ Role/persona"
}

export interface OptimizeResult {
  optimizedPrompt: string;
  score: number; // 0-100, post-optimization
  baselineScore: number; // pre-optimization
  subscores: SubScores;
  baselineSubscores: SubScores;
  diff: DiffSegment[];
  personaSuggestion: string;
  notes: string[];
  model: ModelId;
  level: OptLevel;
  /** Measured guide-structure adherence of the optimized prompt (Cool/Warm/Hot/Max). */
  adherenceLevel: OptLevel;
  source: "llm" | "local";
  packVersion: string;
}

export interface OptimizeRequest {
  prompt: string;
  model: ModelId;
  level: OptLevel;
  persona?: string;
  context?: string;
  /** When true, bypass persisted opt cache (e.g. overlay Regenerate). */
  skipCache?: boolean;
  /** Overlay top-tab type hint; "auto"/undefined adds nothing to the meta-prompt. */
  promptType?: PromptType;
  /** Terminal capture: refined output must be a single line (no newlines) for shell paste. */
  terminalContext?: boolean;
  /** Writing mode: rewrite the input as this deliverable (level = tone via WRITING_LEVEL_LABELS). */
  writingType?: WritingType;
  /** Destination context captured at hotkey time (screenContext on); shapes the rewrite fit. */
  captureContext?: CaptureContext;
  /** Active-session context. Resolved main-side in runOptimize; renderer-supplied values are overwritten. */
  sessionContext?: string;
  /** Standing project context; same main-side resolution rule as sessionContext. */
  projectContext?: string;
}

/** Request to compact a long Import-context paste into standing session/project memory. */
export interface ContextCompactRequest {
  scope: "session" | "project";
  text: string;
}

export interface ContextCompactResult {
  text: string;
}

export interface LibraryItem {
  id: string;
  title: string;
  originalText: string;
  optimizedText: string;
  model: ModelId;
  level: OptLevel;
  score: number;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

/** @deprecated Preâ€“run-ledger history row; migrated to RunRecord on load. */
export interface HistoryItem {
  id: string;
  originalText: string;
  optimizedText: string;
  model: ModelId;
  level: OptLevel;
  score: number;
  source: "llm" | "local";
  createdAt: number;
}

export type RunVerdict = "good" | "bad" | "mixed";

export type RunSurface = "overlay" | "studio" | "dev";

export type RunHistoryEventType = "created" | "finalized" | "commented";

export interface RunComment {
  id: string;
  text: string;
  createdAt: number;
  verdict?: RunVerdict;
}

export interface RunRecordInput {
  prompt: string;
  model: ModelId;
  level: OptLevel;
  persona?: string;
  context?: string;
  promptType?: PromptType;
  terminalContext?: boolean;
  writingType?: WritingType;
  sessionContext?: string;
  projectContext?: string;
  captureContext?: CaptureContext;
}

export interface RunRecordOutput {
  optimizedPrompt: string;
  finalPrompt?: string;
  score: number;
  baselineScore: number;
  subscores: SubScores;
  baselineSubscores: SubScores;
  adherenceLevel: OptLevel;
  notes: string[];
  source: "llm" | "local";
  packVersion: string;
}

export interface RunRecordActions {
  applied?: boolean;
  copied?: boolean;
  edited?: boolean;
}

export interface RunRecord {
  id: string;
  schemaVersion: 1;
  createdAt: number;
  surface: RunSurface;
  /** Active session at optimize time; used for auto-memory refresh after Apply/Copy. */
  sessionId?: string;
  /** True when the optimize result came from the persisted opt cache. */
  fromCache?: boolean;
  input: RunRecordInput;
  output: RunRecordOutput;
  actions?: RunRecordActions;
  comments: RunComment[];
}

/** Which context layers were attached to an optimize request (UI grounding chips). */
export interface OptimizeGrounding {
  session: boolean;
  project: boolean;
  destination?: {
    app: string;
    detail?: string;
  };
}

/** Optimize result returned to the renderer, with the persisted run id. */
export interface OptimizeWithRunId extends OptimizeResult {
  runId: string;
  /** Context layers attached to this run (UI grounding chips); UI-only, never persisted. */
  grounding?: OptimizeGrounding;
}

export interface HistoryFinalizeRequest {
  id?: string;
  finalPrompt: string;
  action: "apply" | "copy";
}

export interface HistoryAddCommentRequest {
  id: string;
  text: string;
  verdict?: RunVerdict;
}

/** One NDJSON line in userData/run-history.jsonl. */
export interface RunHistoryJsonlLine {
  event: RunHistoryEventType;
  at: number;
  run: RunRecord;
}

export type OverlayPlacement = "center" | "topLeft" | "topRight" | "bottomLeft" | "bottomRight";

export const OVERLAY_PLACEMENTS: OverlayPlacement[] = [
  "topLeft",
  "topRight",
  "center",
  "bottomLeft",
  "bottomRight",
];

export const OVERLAY_PLACEMENT_LABELS: Record<OverlayPlacement, string> = {
  center: "Center",
  topLeft: "Top left",
  topRight: "Top right",
  bottomLeft: "Bottom left",
  bottomRight: "Bottom right",
};

export function isOverlayPlacement(value: unknown): value is OverlayPlacement {
  return typeof value === "string" && (OVERLAY_PLACEMENTS as string[]).includes(value);
}

export type { ThemeId } from "./themes";
export { THEME_IDS, THEME_META, normalizeTheme, resolveOverlayTheme, applyThemeToDocument } from "./themes";

export interface AppSettings {
  hotkey: string; // e.g. "CommandOrControl+Shift+O"
  defaultModel: ModelId;
  defaultLevel: OptLevel;
  defaultPersona: string;
  contextMemory: string;
  managedEnabled: boolean;
  providerKeys: Partial<Record<Provider, boolean>>; // presence flags only (keys live in OS keychain)
  telemetry: boolean;
  theme: ThemeId;
  overlayPlacement: OverlayPlacement;
  onboardingDone: boolean;
  /** Hotkey may read active-app title/site/surrounding text to tailor rewrites; off = prompt text only. */
  screenContext: boolean;
  /** Adapt rewrite tone to the destination app category; requires screenContext. */
  styleMatching: boolean;
  /** After Apply/Copy, refresh active session standing context from recent runs. */
  autoSessionMemory: boolean;
  /** Per-category tone override; unset entries fall back to "auto". */
  styleByCategory: Partial<Record<AppCategory, CategoryStylePreset>>;
}

export const DEFAULT_SETTINGS: AppSettings = {
  hotkey: "CommandOrControl+Space",
  defaultModel: "claude-opus-4.8",
  defaultLevel: 2,
  defaultPersona: "",
  contextMemory: "",
  managedEnabled: false,
  providerKeys: {},
  telemetry: false,
  theme: "ember-forge",
  overlayPlacement: "center",
  onboardingDone: false,
  screenContext: true,
  styleMatching: true,
  autoSessionMemory: true,
  styleByCategory: {},
};

/** Result of persisting settings; `ok` is false only when the hotkey was rejected and reverted. */
export interface SettingsSetResult {
  ok: boolean;
  /** What was actually persisted â€” the hotkey may have been normalized or reverted. */
  settings: AppSettings;
  hotkeyError?: string;
  hotkeyActive: boolean;
}

export interface HotkeyStatus {
  accelerator: string;
  active: boolean;
}

export const RUBRIC_WEIGHTS: SubScores = {
  clarity: 25,
  context: 20,
  structure: 15,
  format: 15,
  examples: 10,
  persona: 10,
  verifiability: 5,
};

export const RUBRIC_KEYS: (keyof SubScores)[] = [
  "clarity",
  "context",
  "structure",
  "format",
  "examples",
  "persona",
  "verifiability",
];

// IPC channels
export const IPC = {
  OPTIMIZE: "anvyll:optimize",
  ANALYZE: "anvyll:analyze",
  CAPTURE_TRIGGER: "anvyll:capture:trigger",
  CAPTURE_INJECT: "anvyll:capture:inject",
  CAPTURE_COPY: "anvyll:capture:copy",
  SETTINGS_GET: "anvyll:settings:get",
  SETTINGS_SET: "anvyll:settings:set",
  SETTINGS_CHANGED: "anvyll:settings:changed",
  SETTINGS_THEME_PREVIEW: "anvyll:settings:theme-preview",
  HOTKEY_STATUS: "anvyll:hotkey:status",
  KEYS_SET: "anvyll:keys:set",
  KEYS_HAS: "anvyll:keys:has",
  KEYS_DELETE: "anvyll:keys:delete",
  KEYS_PROVIDERS: "anvyll:keys:providers",
  LIBRARY_LIST: "anvyll:library:list",
  LIBRARY_SAVE: "anvyll:library:save",
  LIBRARY_DELETE: "anvyll:library:delete",
  HISTORY_LIST: "anvyll:history:list",
  HISTORY_CLEAR: "anvyll:history:clear",
  HISTORY_ADD_COMMENT: "anvyll:history:add-comment",
  HISTORY_FINALIZE: "anvyll:history:finalize",
  HISTORY_ANALYSIS_PATH: "anvyll:history:analysis-path",
  SESSION_LIST: "anvyll:session:list",
  SESSION_CREATE: "anvyll:session:create",
  SESSION_SET_CONTEXT: "anvyll:session:set-context",
  SESSION_CLEAR: "anvyll:session:clear",
  SESSION_DELETE: "anvyll:session:delete",
  SESSION_SET_ACTIVE: "anvyll:session:set-active",
  SESSION_GET_ACTIVE: "anvyll:session:get-active",
  SESSION_MAYBE_TITLE_FROM_PROMPT: "anvyll:session:maybe-title-from-prompt",
  SESSION_ENSURE_ACTIVE: "anvyll:session:ensure-active",
  SESSION_MEMORY_UPDATED: "anvyll:session:memory-updated",
  PROJECT_CONTEXT_GET: "anvyll:project-context:get",
  PROJECT_CONTEXT_SET: "anvyll:project-context:set",
  PROJECT_LIST: "anvyll:project:list",
  PROJECT_UPSERT_ACTIVE: "anvyll:project:upsert-active",
  PROJECT_SET_CONTEXT_BY_ID: "anvyll:project:set-context-by-id",
  PROJECT_SET_ACTIVE: "anvyll:project:set-active",
  PROJECT_DELETE: "anvyll:project:delete",
  PROJECT_PROMOTE_FROM_SESSION: "anvyll:project:promote-from-session",
  CONTEXT_COMPACT: "anvyll:context:compact",
  OVERLAY_SHOW: "anvyll:overlay:show",
  OVERLAY_CAPTURE_PENDING: "anvyll:overlay:capture-pending",
  OVERLAY_PREPARED: "anvyll:overlay:prepared",
  OVERLAY_HIDE: "anvyll:overlay:hide",
  OVERLAY_CLEAR: "anvyll:overlay:clear",
  OVERLAY_PLACEMENT_SET: "anvyll:overlay:placement-set",
  STUDIO_SHOW: "anvyll:studio:show",
  STUDIO_SETTINGS: "anvyll:studio:settings",
  STUDIO_ROUTE: "anvyll:studio:route",
  TRAY_QUIT: "anvyll:tray:quit",
  OPTIMIZE_STREAM: "anvyll:optimize:stream",
  ONBOARDING_FINISH: "anvyll:onboarding:finish",
  SHELL_OPEN_EXTERNAL: "anvyll:shell:open-external",
  STUDIO_OPEN_WORKBENCH: "anvyll:studio:open-workbench",
  STUDIO_WORKBENCH_SEED: "anvyll:studio:workbench-seed",
} as const;

/** Payload for opening the Studio workbench pre-seeded from the overlay or a saved item. */
export interface WorkbenchSeed {
  originalText: string;
  optimizedText?: string;
  model: ModelId;
  level: OptLevel;
}
