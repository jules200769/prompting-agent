// Renderer-side typed accessor for the preload bridge.
import type { PromptForgeAPI } from "../preload";
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type CaptureContext,
  type CaptureMode,
  type InjectResult,
  type OverlayPlacement,
  type Provider,
  type SettingsSetResult,
} from "../shared/types";
import { devBridgeOptimize, devBridgeSettingsGet } from "./devBridgeClient";

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
  terminalContext?: boolean;
  /** Dev bridge / browser mock never seed destination context. */
  context?: CaptureContext;
};

/**
 * In a plain browser (e.g. an AI agent opening the Vite dev URL) the Electron
 * preload bridge does not exist. This mock keeps capture/inject as no-ops but
 * routes optimize + settings through the Electron dev bridge (Vite proxies
 * /api → localhost:5174) so refinement matches the hotkey overlay.
 *
 * Requires `npm run dev` (Vite + Electron). Inside Electron the real preload
 * always wins.
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

  return {
    optimize: (req, onText) => devBridgeOptimize(req, onText),
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

    settingsGet: async () => {
      try {
        return await devBridgeSettingsGet();
      } catch {
        return { ...DEFAULT_SETTINGS };
      }
    },
    settingsSet: async (s: AppSettings): Promise<SettingsSetResult> => ({
      ok: true,
      settings: s,
      hotkeyActive: false,
    }),
    hotkeyStatus: async () => ({ accelerator: DEFAULT_SETTINGS.hotkey, active: false }),

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
    finishOnboarding: () => {
      console.info("[promptforge mock] finishOnboarding called — no-op in browser preview");
    },
    openExternal: async (url: string) => {
      window.open(url, "_blank", "noopener");
      return true;
    },
    openStudioWorkbench: () => {
      window.location.hash = "#/studio";
    },
    onStudioWorkbench: () => () => undefined,
    hideOverlay: () => {
      console.info("[promptforge mock] hideOverlay called — no-op in browser preview");
    },
    overlayPrepared: () => undefined,
    setOverlayPlacement: async (_placement: OverlayPlacement) => true,

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
