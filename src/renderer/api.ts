// Renderer-side typed accessor for the preload bridge.
import type { AnvyllAPI } from "../preload";
import { normalizeTheme, applyThemeToDocument, type ThemeId } from "../shared/themes";
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type CaptureContext,
  type CaptureMode,
  type InjectResult,
  type OverlayPlacement,
  type ContextCompactRequest,
  type HistoryAddCommentRequest,
  type HistoryFinalizeRequest,
  type Provider,
  type RunRecord,
  type SettingsSetResult,
} from "../shared/types";
import { devBridgeOptimize, devBridgeSettingsGet, devBridgeContextCompact } from "./devBridgeClient";
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
    anvyll: AnvyllAPI;
    /** Set true by the browser mock so previews can show a dev badge. */
    __anvyllMock?: boolean;
  }
}

type OverlayShowPayload = {
  text: string;
  mode: CaptureMode;
  snapshot: { text: string; hasText: boolean };
  terminalContext?: boolean;
  cursorTerminalContext?: boolean;
  /** Dev bridge / browser mock never seed destination context. */
  context?: CaptureContext;
  /** True when capture froze a focused text field for Apply injection. */
  canInject?: boolean;
  /** Anvyll summary detected on the clipboard at delivery — drives the consent toast. */
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

const mockSettingsChangedCallbacks = new Set<(theme: ThemeId) => void>();

function createBrowserMock(): AnvyllAPI {
  const SAMPLE_PROMPT =
    "write a function that fetches users from an api and shows them in a list";

  const overlayShowCallbacks = new Set<(p: OverlayShowPayload) => void>();
  const seed: OverlayShowPayload = {
    text: SAMPLE_PROMPT,
    mode: "field",
    snapshot: { text: SAMPLE_PROMPT, hasText: true },
    canInject: true,
  };

  return {
    optimize: (req, onText) => devBridgeOptimize(req, onText),
    analyze: async () => ({}),

    captureTrigger: async () => undefined,
    captureInject: async () => {
      console.info("[anvyll mock] Apply (inject) called — no-op in browser preview");
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
        const s = await devBridgeSettingsGet();
        return { ...s, theme: normalizeTheme(s.theme) };
      } catch {
        return { ...DEFAULT_SETTINGS };
      }
    },
    settingsSet: async (s: AppSettings): Promise<SettingsSetResult> => ({
      ok: true,
      settings: s,
      hotkeyActive: false,
    }),
    previewTheme: (theme: ThemeId) => {
      applyThemeToDocument(theme);
      for (const cb of mockSettingsChangedCallbacks) cb(theme);
    },
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
        memoryUpdatedAt: null,
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
    sessionEnsureActive: async (projectId?: string | null) => {
      const existing = mockSessions.find((s) => s.id === mockActiveSessionId);
      if (existing) return existing;
      const now = Date.now();
      const linked =
        projectId && mockProjects.some((p) => p.id === projectId) ? projectId : null;
      const session: SessionContext = {
        id: `mock-${now}-${mockSessions.length}`,
        title: NEW_SESSION_TITLE,
        contextText: "",
        projectId: linked,
        memoryUpdatedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      mockSessions.push(session);
      mockActiveSessionId = session.id;
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
    projectPromoteFromSession: async (sessionId: string) => {
      const session = mockSessions.find((s) => s.id === sessionId);
      if (!session?.contextText.trim()) throw new Error("Session has no context to promote.");
      const projectId = session.projectId ?? mockActiveProjectId;
      if (!projectId) throw new Error("Link the session to a project before promoting context.");
      const project = mockProjects.find((p) => p.id === projectId);
      if (!project) throw new Error("Project not found.");
      project.contextText = clampContextText(
        `${project.contextText}\n\n${session.contextText}`.trim(),
        PROJECT_CONTEXT_MAX_CHARS,
      );
      project.updatedAt = Date.now();
      if (mockActiveProjectId === projectId) mockProjectContext = project.contextText;
      return project.contextText;
    },
    contextCompact: async (req: ContextCompactRequest) => {
      try {
        return await devBridgeContextCompact(req);
      } catch {
        const firstLine = req.text.trim().split("\n").map((l) => l.trim()).find(Boolean) ?? "not established";
        const goal = firstLine.slice(0, 200);
        const stub =
          req.scope === "session"
            ? `1. GOAL — ${goal}
2. CURRENT STATE — not established
3. KEY FACTS & DECISIONS — not established
4. CONSTRAINTS & PREFERENCES — not established
5. TERMINOLOGY & NAMES — not established
6. OPEN ITEMS — not established`
            : `1. PROJECT — ${goal}
2. STACK & ARCHITECTURE — not established
3. CONVENTIONS — not established
4. KEY FACTS & DECISIONS — not established
5. CONSTRAINTS & PREFERENCES — not established
6. TERMINOLOGY & NAMES — not established`;
        return { text: clampContextText(stub, PROJECT_CONTEXT_MAX_CHARS) };
      }
    },

    openStudio: () => {
      window.location.hash = "#/studio";
    },
    openSettings: () => {
      window.location.hash = "#/studio/settings";
    },
    finishOnboarding: () => {
      console.info("[anvyll mock] finishOnboarding called — no-op in browser preview");
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
      console.info("[anvyll mock] hideOverlay called — no-op in browser preview");
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
    onSessionMemoryUpdated: () => () => undefined,
    onSettingsChanged: (cb) => {
      mockSettingsChangedCallbacks.add(cb);
      return () => mockSettingsChangedCallbacks.delete(cb);
    },
  } satisfies AnvyllAPI;
}

const real = (window as any).anvyll as AnvyllAPI | undefined;

if (!real) {
  window.__anvyllMock = true;
}

export const api: AnvyllAPI = real ?? createBrowserMock();

/** True when running outside Electron against the mock bridge. */
export const isBrowserMock = !real;
