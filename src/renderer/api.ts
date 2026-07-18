// Renderer-side typed accessor for the preload bridge.
import type { PromptForgeAPI } from "../preload";
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type CaptureContext,
  type CaptureMode,
  type InjectResult,
  type OverlayPlacement,
  type HistoryAddCommentRequest,
  type HistoryFinalizeRequest,
  type Provider,
  type RunRecord,
  type SettingsSetResult,
} from "../shared/types";
import { devBridgeOptimize, devBridgeSettingsGet } from "./devBridgeClient";
import type { ContextImportScope } from "../shared/contextImportPrompt";
import {
  assignProjectColor,
  clampContextText,
  deriveProjectTitle,
  deriveSessionTitle,
  deriveSessionTitleFromPrompt,
  NEW_SESSION_TITLE,
  PROJECT_CONTEXT_MAX_CHARS,
  PROJECTS_MAX,
  type ProjectContext,
  type SessionContext,
} from "../shared/session";

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
  /** ANVYL summary detected on the clipboard at delivery — drives the consent toast. */
  clipboardSummary?: { scope: ContextImportScope; text: string };
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
// Session state for the browser mock — in-memory only, per page load.
const mockSessions: SessionContext[] = [];
let mockActiveSessionId: string | null = null;
const mockProjects: ProjectContext[] = [];
let mockActiveProjectId: string | null = null;
let mockProjectContext = "";
const mockRunHistory: RunRecord[] = [];

function mockEvictProjects(): void {
  while (mockProjects.length > PROJECTS_MAX) {
    const evictable = mockProjects
      .filter((p) => p.id !== mockActiveProjectId)
      .sort((a, b) => a.updatedAt - b.updatedAt)[0];
    if (!evictable) break;
    const idx = mockProjects.findIndex((p) => p.id === evictable.id);
    if (idx >= 0) mockProjects.splice(idx, 1);
    for (let i = mockSessions.length - 1; i >= 0; i--) {
      if (mockSessions[i].projectId === evictable.id) {
        if (mockActiveSessionId === mockSessions[i].id) mockActiveSessionId = null;
        mockSessions.splice(i, 1);
      }
    }
  }
}

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

    historyList: async () => [...mockRunHistory].sort((a, b) => b.createdAt - a.createdAt),
    historyClear: async () => {
      mockRunHistory.length = 0;
    },
    historyAddComment: async (payload: HistoryAddCommentRequest) => {
      const record = mockRunHistory.find((r) => r.id === payload.id);
      if (!record) return null;
      const text = payload.text.trim();
      if (!text && !payload.verdict) return null;
      record.comments.unshift({
        id: `mock-comment-${Date.now()}`,
        text,
        createdAt: Date.now(),
        verdict: payload.verdict,
      });
      return record;
    },
    historyFinalize: async (payload: HistoryFinalizeRequest) => {
      const record =
        mockRunHistory.find((r) => r.id === payload.id) ??
        mockRunHistory.sort((a, b) => b.createdAt - a.createdAt)[0];
      if (!record) return null;
      const finalPrompt = payload.finalPrompt.trim();
      if (!finalPrompt) return null;
      record.output.finalPrompt = finalPrompt;
      record.actions = {
        ...record.actions,
        edited: finalPrompt !== record.output.optimizedPrompt || record.actions?.edited,
        ...(payload.action === "apply" ? { applied: true } : { copied: true }),
      };
      return record;
    },
    historyAnalysisPath: async () => "(browser mock — run-history.jsonl unavailable)",

    sessionList: async () => [...mockSessions].sort((a, b) => b.updatedAt - a.updatedAt),
    sessionCreate: async (projectId?: string | null) => {
      const now = Date.now();
      const linked =
        projectId && mockProjects.some((p) => p.id === projectId) ? projectId : null;
      const session: SessionContext = {
        id: `mock-${now}-${mockSessions.length}`,
        title: NEW_SESSION_TITLE,
        contextText: "",
        projectId: linked,
        createdAt: now,
        updatedAt: now,
      };
      mockSessions.push(session);
      mockActiveSessionId = session.id;
      return session;
    },
    sessionSetContext: async (id: string, text: string) => {
      const session = mockSessions.find((s) => s.id === id);
      if (!session) return null;
      session.contextText = clampContextText(text);
      session.title = deriveSessionTitle(session.contextText, session.createdAt);
      session.updatedAt = Date.now();
      return session;
    },
    sessionClear: async (id: string) => {
      const session = mockSessions.find((s) => s.id === id);
      if (!session) return null;
      session.contextText = "";
      session.updatedAt = Date.now();
      return session;
    },
    sessionDelete: async (id: string) => {
      const idx = mockSessions.findIndex((s) => s.id === id);
      if (idx >= 0) mockSessions.splice(idx, 1);
      if (mockActiveSessionId === id) mockActiveSessionId = null;
      return idx >= 0;
    },
    sessionSetActive: async (id: string | null) => {
      if (id === null) {
        mockActiveSessionId = null;
        return null;
      }
      const session = mockSessions.find((s) => s.id === id);
      if (!session) return null;
      mockActiveSessionId = id;
      return session;
    },
    sessionGetActive: async () => mockSessions.find((s) => s.id === mockActiveSessionId) ?? null,
    sessionMaybeTitleFromPrompt: async (id: string, prompt: string) => {
      const session = mockSessions.find((s) => s.id === id);
      if (!session || session.title !== NEW_SESSION_TITLE) return session ?? null;
      const title = deriveSessionTitleFromPrompt(prompt);
      if (title === NEW_SESSION_TITLE) return session;
      session.title = title;
      session.updatedAt = Date.now();
      return session;
    },
    projectContextGet: async () => mockProjectContext,
    projectContextSet: async (text: string) => {
      mockProjectContext = clampContextText(text, PROJECT_CONTEXT_MAX_CHARS);
      return true;
    },
    projectList: async () => ({
      projects: [...mockProjects].sort((a, b) => b.updatedAt - a.updatedAt),
      activeProjectId: mockActiveProjectId,
    }),
    projectUpsertActive: async (text: string) => {
      const clamped = clampContextText(text, PROJECT_CONTEXT_MAX_CHARS);
      const now = Date.now();
      let project = mockActiveProjectId
        ? mockProjects.find((p) => p.id === mockActiveProjectId)
        : undefined;
      if (project) {
        project.contextText = clamped;
        project.title = deriveProjectTitle(project.contextText, project.createdAt);
        project.updatedAt = now;
        if (!project.color) {
          project.color = assignProjectColor(mockProjects.map((p) => p.color).filter(Boolean));
        }
      } else {
        project = {
          id: `mock-proj-${now}-${mockProjects.length}`,
          title: deriveProjectTitle(clamped, now),
          contextText: clamped,
          color: assignProjectColor(mockProjects.map((p) => p.color).filter(Boolean)),
          createdAt: now,
          updatedAt: now,
        };
        mockProjects.push(project);
        mockActiveProjectId = project.id;
      }
      mockProjectContext = clamped;
      mockEvictProjects();
      return project;
    },
    projectSetContextById: async (id: string, text: string) => {
      const project = mockProjects.find((p) => p.id === id);
      if (!project) return null;
      project.contextText = clampContextText(text, PROJECT_CONTEXT_MAX_CHARS);
      const defaultTitle = `Project ${new Date(project.createdAt).toLocaleDateString()}`;
      if (!project.title.trim() || project.title === defaultTitle) {
        project.title = deriveProjectTitle(project.contextText, project.createdAt);
      }
      project.updatedAt = Date.now();
      if (mockActiveProjectId === id) mockProjectContext = project.contextText;
      return project;
    },
    projectSetActive: async (id: string | null) => {
      if (id === null) {
        mockActiveProjectId = null;
        mockProjectContext = "";
        return null;
      }
      const project = mockProjects.find((p) => p.id === id);
      if (!project) return null;
      mockActiveProjectId = id;
      project.updatedAt = Date.now();
      mockProjectContext = project.contextText;
      return project;
    },
    projectDelete: async (id: string) => {
      const idx = mockProjects.findIndex((p) => p.id === id);
      if (idx < 0) return false;
      mockProjects.splice(idx, 1);
      for (let i = mockSessions.length - 1; i >= 0; i--) {
        if (mockSessions[i].projectId === id) {
          if (mockActiveSessionId === mockSessions[i].id) mockActiveSessionId = null;
          mockSessions.splice(i, 1);
        }
      }
      if (mockActiveProjectId === id) {
        mockActiveProjectId = null;
        mockProjectContext = "";
      }
      return true;
    },

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
