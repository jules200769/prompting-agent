// Shared types between main process, preload, and renderer.

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
  modelId: "gpt-4.1-mini",
  label: "GPT-4.1 mini",
  /** Fixed optimal temperature — never varies by level or user setting. */
  temperature: 0.3,
} as const;

/** Guide structure adherence labels (L1 = cool, L4 = max). */
export const LEVEL_LABELS: Record<OptLevel, string> = {
  1: "Cool",
  2: "Warm",
  3: "Hot",
  4: "Max",
};

/** Level recognition colors — identical on every surface (overlay slider label, Studio segments). */
export const LEVEL_COLORS: Record<OptLevel, string> = {
  1: "#5AC8FA",
  2: "#FFD60A",
  3: "#FF9F0A",
  4: "#FF453A",
};

export type CaptureMode = "field" | "empty" | "terminal";

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

export interface AppSettings {
  hotkey: string; // e.g. "CommandOrControl+Shift+O"
  defaultModel: ModelId;
  defaultLevel: OptLevel;
  defaultPersona: string;
  contextMemory: string;
  managedEnabled: boolean;
  providerKeys: Partial<Record<Provider, boolean>>; // presence flags only (keys live in OS keychain)
  telemetry: boolean;
  theme: "dark" | "light";
  overlayPlacement: OverlayPlacement;
  onboardingDone: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  hotkey: "CommandOrControl+Shift+O",
  defaultModel: "claude-opus-4.8",
  defaultLevel: 2,
  defaultPersona: "",
  contextMemory: "",
  managedEnabled: false,
  providerKeys: {},
  telemetry: false,
  theme: "dark",
  overlayPlacement: "center",
  onboardingDone: false,
};

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
  OPTIMIZE: "promptforge:optimize",
  ANALYZE: "promptforge:analyze",
  CAPTURE_TRIGGER: "promptforge:capture:trigger",
  CAPTURE_INJECT: "promptforge:capture:inject",
  CAPTURE_COPY: "promptforge:capture:copy",
  SETTINGS_GET: "promptforge:settings:get",
  SETTINGS_SET: "promptforge:settings:set",
  KEYS_SET: "promptforge:keys:set",
  KEYS_HAS: "promptforge:keys:has",
  KEYS_DELETE: "promptforge:keys:delete",
  KEYS_PROVIDERS: "promptforge:keys:providers",
  LIBRARY_LIST: "promptforge:library:list",
  LIBRARY_SAVE: "promptforge:library:save",
  LIBRARY_DELETE: "promptforge:library:delete",
  HISTORY_LIST: "promptforge:history:list",
  HISTORY_CLEAR: "promptforge:history:clear",
  OVERLAY_SHOW: "promptforge:overlay:show",
  OVERLAY_CAPTURE_PENDING: "promptforge:overlay:capture-pending",
  OVERLAY_PREPARED: "promptforge:overlay:prepared",
  OVERLAY_HIDE: "promptforge:overlay:hide",
  OVERLAY_CLEAR: "promptforge:overlay:clear",
  OVERLAY_PLACEMENT_SET: "promptforge:overlay:placement-set",
  STUDIO_SHOW: "promptforge:studio:show",
  STUDIO_SETTINGS: "promptforge:studio:settings",
  STUDIO_ROUTE: "promptforge:studio:route",
  TRAY_QUIT: "promptforge:tray:quit",
  OPTIMIZE_STREAM: "promptforge:optimize:stream",
  ONBOARDING_FINISH: "promptforge:onboarding:finish",
  SHELL_OPEN_EXTERNAL: "promptforge:shell:open-external",
  STUDIO_OPEN_WORKBENCH: "promptforge:studio:open-workbench",
  STUDIO_WORKBENCH_SEED: "promptforge:studio:workbench-seed",
} as const;

/** Payload for opening the Studio workbench pre-seeded from the overlay or a saved item. */
export interface WorkbenchSeed {
  originalText: string;
  optimizedText?: string;
  model: ModelId;
  level: OptLevel;
}
