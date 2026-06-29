// Renderer-side typed accessor for the preload bridge.
import type { PromptForgeAPI } from "../preload";
import {
  DEFAULT_SETTINGS,
  MODELS,
  type CaptureMode,
  type InjectResult,
  type OptimizeRequest,
  type OptimizeResult,
  type Provider,
  type SubScores,
} from "../shared/types";

declare global {
  interface Window {
    promptforge: PromptForgeAPI;
    /** Set true by the browser mock so previews can show a dev badge. */
    __promptforgeMock?: boolean;
  }
}

type OverlayShowPayload = {
  text: string;
  mode: CaptureMode;
  snapshot: { text: string; hasText: boolean };
};

/**
 * In a plain browser (e.g. an AI agent opening the Vite dev URL) the Electron
 * preload bridge does not exist, so `window.promptforge` is undefined and the
 * overlay would crash on first `api.settingsGet()`. This mock provides the same
 * API shape so the overlay renders and is interactive outside Electron.
 *
 * It is ONLY used when the real bridge is missing — inside Electron the real
 * preload always wins, so hotkey/capture/Apply behaviour is untouched.
 */
function createBrowserMock(): PromptForgeAPI {
  const SAMPLE_PROMPT =
    "write a function that fetches users from an api and shows them in a list";

  const overlayShowCallbacks = new Set<(p: OverlayShowPayload) => void>();
  const seed: OverlayShowPayload = {
    text: SAMPLE_PROMPT,
    mode: "field",
    snapshot: { text: SAMPLE_PROMPT, hasText: true },
  };

  const emptySubscores: SubScores = {
    clarity: 0,
    context: 0,
    structure: 0,
    format: 0,
    examples: 0,
    persona: 0,
    verifiability: 0,
  };

  function mockRefinedPrompt(req: OptimizeRequest): string {
    const label = MODELS.find((m) => m.id === req.model)?.label ?? req.model;
    return [
      `# Task`,
      `Implement a function that fetches users from a REST API and renders them in a list.`,
      ``,
      `# Context`,
      `- Target model: ${label} (guide level L${req.level})`,
      `- This is mock output from the browser preview — no real API call was made.`,
      ``,
      `# Requirements`,
      `1. Fetch users from the given endpoint with proper async/await and error handling.`,
      `2. Show a loading state while fetching and an error state on failure.`,
      `3. Render the resulting users as an accessible list.`,
      ``,
      `# Output`,
      `Return only the code, with brief inline comments for non-obvious logic.`,
    ].join("\n");
  }

  return {
    optimize: async (req, onText) => {
      const full = mockRefinedPrompt(req);
      const chunks = full.match(/.{1,24}/gs) ?? [full];
      for (const chunk of chunks) {
        await new Promise((r) => setTimeout(r, 28));
        onText(chunk);
      }
      const result: OptimizeResult = {
        optimizedPrompt: full,
        score: 86,
        baselineScore: 41,
        subscores: emptySubscores,
        baselineSubscores: emptySubscores,
        diff: [],
        personaSuggestion: "",
        notes: ["Mock result (browser preview)"],
        model: req.model,
        level: req.level,
        adherenceLevel: req.level,
        source: "local",
        packVersion: "mock",
      };
      return result;
    },
    analyze: async () => ({}),

    captureTrigger: async () => undefined,
    captureInject: async () => {
      console.info("[promptforge mock] Apply (inject) called — no-op in browser preview");
      return "injected" as InjectResult;
    },
    captureCopy: async (text: string) => {
      try {
        await navigator.clipboard?.writeText(text);
      } catch {
        /* clipboard may be unavailable in the agent browser */
      }
      return undefined;
    },

    settingsGet: async () => ({ ...DEFAULT_SETTINGS }),
    settingsSet: async () => undefined,

    keysSet: async () => undefined,
    keysHas: async (_provider: Provider) => false,
    keysDelete: async () => undefined,
    keysProviders: async () => [] as Provider[],
    keysIsSecure: async () => false,

    libraryList: async () => [],
    librarySave: async () => undefined,
    libraryDelete: async () => undefined,

    historyList: async () => [],
    historyClear: async () => undefined,

    openStudio: () => {
      window.location.hash = "#/studio";
    },
    openSettings: () => {
      window.location.hash = "#/studio/settings";
    },
    hideOverlay: () => {
      console.info("[promptforge mock] hideOverlay called — no-op in browser preview");
    },
    overlayPrepared: () => undefined,

    onStudioRoute: () => () => undefined,

    onOverlayShow: (cb) => {
      overlayShowCallbacks.add(cb);
      // Replay a seeded capture immediately so the overlay is populated.
      cb(seed);
      return () => overlayShowCallbacks.delete(cb);
    },

    onOverlayCapturePending: () => () => undefined,
    onOverlayClear: () => () => undefined,
  } satisfies PromptForgeAPI;
}

const real = (window as any).promptforge as PromptForgeAPI | undefined;

if (!real) {
  window.__promptforgeMock = true;
}

export const api: PromptForgeAPI = real ?? createBrowserMock();

/** True when running outside Electron against the mock bridge. */
export const isBrowserMock = !real;
