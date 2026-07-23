// Preload: exposes a tight allowlist IPC API to the renderer. No Node globals leak.
import { contextBridge, ipcRenderer } from "electron";
import { IPC, type OptimizeRequest, type AppSettings, type CaptureContext, type CaptureMode, type ContextCompactRequest, type ContextCompactResult, type HistoryAddCommentRequest, type HistoryFinalizeRequest, type HotkeyStatus, type InjectResult, type OverlayPlacement, type Provider, type RunRecord, type SettingsSetResult, type WorkbenchSeed } from "../shared/types";
import type { ThemeId } from "../shared/themes";
import type { ContextImportScope } from "../shared/contextImportPrompt";
import type { ProjectContext, SessionContext } from "../shared/session";

type OverlayShowPayload = {
  text: string;
  mode: CaptureMode;
  snapshot: { text: string; hasText: boolean };
  terminalContext?: boolean;
  cursorTerminalContext?: boolean;
  context?: CaptureContext;
  /** True when capture froze a focused text field for Apply injection. */
  canInject?: boolean;
  /** Anvyll summary detected on the clipboard at delivery — drives the consent toast. */
  clipboardSummary?: { scope: ContextImportScope; text: string };
};

const overlayShowCallbacks = new Set<(payload: OverlayShowPayload) => void>();
const overlayCapturePendingCallbacks = new Set<() => void>();
const overlayClearCallbacks = new Set<() => void>();
let lastOverlayShow: OverlayShowPayload | null = null;
let lastOverlayCapturePending = false;

function deliverOverlayShow(payload: OverlayShowPayload): void {
  lastOverlayShow = payload;
  lastOverlayCapturePending = false;
  window.dispatchEvent(new CustomEvent("anvyll:capture", { detail: payload }));
  for (const cb of overlayShowCallbacks) cb(payload);
}

function deliverOverlayCapturePending(): void {
  lastOverlayCapturePending = true;
  window.dispatchEvent(new CustomEvent("anvyll:capture:pending"));
  for (const cb of overlayCapturePendingCallbacks) cb();
}

// Register before React mounts so the first hotkey IPC is not dropped.
ipcRenderer.on(IPC.OVERLAY_SHOW, (_e, payload: OverlayShowPayload) => {
  deliverOverlayShow(payload);
});

ipcRenderer.on(IPC.OVERLAY_CAPTURE_PENDING, () => {
  deliverOverlayCapturePending();
});

ipcRenderer.on(IPC.OVERLAY_CLEAR, () => {
  lastOverlayShow = null;
  lastOverlayCapturePending = false;
  for (const cb of overlayClearCallbacks) cb();
});

// Workbench seed can arrive before the lazy Studio view mounts — cache and replay.
const workbenchSeedCallbacks = new Set<(seed: WorkbenchSeed) => void>();
let lastWorkbenchSeed: WorkbenchSeed | null = null;
ipcRenderer.on(IPC.STUDIO_WORKBENCH_SEED, (_e, seed: WorkbenchSeed) => {
  lastWorkbenchSeed = seed;
  for (const cb of workbenchSeedCallbacks) cb(seed);
});

const settingsChangedCallbacks = new Set<(theme: ThemeId) => void>();
ipcRenderer.on(IPC.SETTINGS_CHANGED, (_e, payload: { theme: ThemeId }) => {
  window.dispatchEvent(new CustomEvent("anvyll:settings:changed", { detail: payload }));
  for (const cb of settingsChangedCallbacks) cb(payload.theme);
});

const api = {
  optimize: (req: OptimizeRequest, onText: (chunk: string) => void) => {
    const listener = (_e: unknown, chunk: string) => onText(chunk);
    ipcRenderer.on(IPC.OPTIMIZE_STREAM, listener);
    return ipcRenderer.invoke(IPC.OPTIMIZE, req).finally(() => {
      ipcRenderer.removeListener(IPC.OPTIMIZE_STREAM, listener);
    });
  },
  analyze: (prompt: string) => ipcRenderer.invoke(IPC.ANALYZE, prompt),

  captureTrigger: () => ipcRenderer.invoke(IPC.CAPTURE_TRIGGER),
  captureInject: (text: string, snapshot: { text: string; hasText: boolean }) =>
    ipcRenderer.invoke(IPC.CAPTURE_INJECT, text, snapshot) as Promise<InjectResult>,
  captureCopy: (text: string) => ipcRenderer.invoke(IPC.CAPTURE_COPY, text),

  settingsGet: () => ipcRenderer.invoke(IPC.SETTINGS_GET) as Promise<AppSettings>,
  settingsSet: (s: AppSettings) => ipcRenderer.invoke(IPC.SETTINGS_SET, s) as Promise<SettingsSetResult>,
  previewTheme: (theme: ThemeId) => ipcRenderer.send(IPC.SETTINGS_THEME_PREVIEW, theme),
  hotkeyStatus: () => ipcRenderer.invoke(IPC.HOTKEY_STATUS) as Promise<HotkeyStatus>,

  keysSet: (provider: Provider, key: string) => ipcRenderer.invoke(IPC.KEYS_SET, provider, key),
  keysHas: (provider: Provider) => ipcRenderer.invoke(IPC.KEYS_HAS, provider) as Promise<boolean>,
  keysDelete: (provider: Provider) => ipcRenderer.invoke(IPC.KEYS_DELETE, provider),
  keysProviders: () => ipcRenderer.invoke(IPC.KEYS_PROVIDERS) as Promise<Provider[]>,
  keysIsSecure: () => ipcRenderer.invoke("anvyll:keys:secure") as Promise<boolean>,

  libraryList: () => ipcRenderer.invoke(IPC.LIBRARY_LIST),
  librarySave: (input: any) => ipcRenderer.invoke(IPC.LIBRARY_SAVE, input),
  libraryDelete: (id: string) => ipcRenderer.invoke(IPC.LIBRARY_DELETE, id),

  historyList: () => ipcRenderer.invoke(IPC.HISTORY_LIST) as Promise<RunRecord[]>,
  historyClear: () => ipcRenderer.invoke(IPC.HISTORY_CLEAR),
  historyAddComment: (payload: HistoryAddCommentRequest) =>
    ipcRenderer.invoke(IPC.HISTORY_ADD_COMMENT, payload) as Promise<RunRecord | null>,
  historyFinalize: (payload: HistoryFinalizeRequest) =>
    ipcRenderer.invoke(IPC.HISTORY_FINALIZE, payload) as Promise<RunRecord | null>,
  historyAnalysisPath: () => ipcRenderer.invoke(IPC.HISTORY_ANALYSIS_PATH) as Promise<string>,

  sessionList: () => ipcRenderer.invoke(IPC.SESSION_LIST) as Promise<SessionContext[]>,
  sessionCreate: (projectId?: string | null) =>
    ipcRenderer.invoke(IPC.SESSION_CREATE, projectId ?? null) as Promise<SessionContext>,
  sessionSetContext: (id: string, text: string) =>
    ipcRenderer.invoke(IPC.SESSION_SET_CONTEXT, id, text) as Promise<SessionContext | null>,
  sessionClear: (id: string) => ipcRenderer.invoke(IPC.SESSION_CLEAR, id) as Promise<SessionContext | null>,
  sessionDelete: (id: string) => ipcRenderer.invoke(IPC.SESSION_DELETE, id) as Promise<boolean>,
  sessionSetActive: (id: string | null) =>
    ipcRenderer.invoke(IPC.SESSION_SET_ACTIVE, id) as Promise<SessionContext | null>,
  sessionGetActive: () => ipcRenderer.invoke(IPC.SESSION_GET_ACTIVE) as Promise<SessionContext | null>,
  sessionMaybeTitleFromPrompt: (id: string, prompt: string) =>
    ipcRenderer.invoke(IPC.SESSION_MAYBE_TITLE_FROM_PROMPT, id, prompt) as Promise<SessionContext | null>,
  sessionEnsureActive: (projectId?: string | null) =>
    ipcRenderer.invoke(IPC.SESSION_ENSURE_ACTIVE, projectId ?? null) as Promise<SessionContext>,
  onSessionMemoryUpdated: (cb: (session: SessionContext) => void): (() => void) => {
    const listener = (_e: unknown, session: SessionContext) => cb(session);
    ipcRenderer.on(IPC.SESSION_MEMORY_UPDATED, listener);
    return () => {
      ipcRenderer.removeListener(IPC.SESSION_MEMORY_UPDATED, listener);
    };
  },
  projectContextGet: () => ipcRenderer.invoke(IPC.PROJECT_CONTEXT_GET) as Promise<string>,
  projectContextSet: (text: string) => ipcRenderer.invoke(IPC.PROJECT_CONTEXT_SET, text) as Promise<boolean>,
  projectList: () =>
    ipcRenderer.invoke(IPC.PROJECT_LIST) as Promise<{
      projects: ProjectContext[];
      activeProjectId: string | null;
    }>,
  projectUpsertActive: (text: string) =>
    ipcRenderer.invoke(IPC.PROJECT_UPSERT_ACTIVE, text) as Promise<ProjectContext>,
  projectSetContextById: (id: string, text: string) =>
    ipcRenderer.invoke(IPC.PROJECT_SET_CONTEXT_BY_ID, id, text) as Promise<ProjectContext | null>,
  projectSetActive: (id: string | null) =>
    ipcRenderer.invoke(IPC.PROJECT_SET_ACTIVE, id) as Promise<ProjectContext | null>,
  projectDelete: (id: string) => ipcRenderer.invoke(IPC.PROJECT_DELETE, id) as Promise<boolean>,
  projectPromoteFromSession: (sessionId: string) =>
    ipcRenderer.invoke(IPC.PROJECT_PROMOTE_FROM_SESSION, sessionId) as Promise<string>,
  contextCompact: (req: ContextCompactRequest) =>
    ipcRenderer.invoke(IPC.CONTEXT_COMPACT, req) as Promise<ContextCompactResult>,

  openStudio: () => ipcRenderer.send(IPC.STUDIO_SHOW),
  openSettings: () => ipcRenderer.send(IPC.STUDIO_SETTINGS),
  finishOnboarding: () => ipcRenderer.send(IPC.ONBOARDING_FINISH),
  openExternal: (url: string) => ipcRenderer.invoke(IPC.SHELL_OPEN_EXTERNAL, url) as Promise<boolean>,
  openStudioWorkbench: (seed: WorkbenchSeed) => ipcRenderer.send(IPC.STUDIO_OPEN_WORKBENCH, seed),
  onStudioWorkbench: (cb: (seed: WorkbenchSeed) => void): (() => void) => {
    workbenchSeedCallbacks.add(cb);
    if (lastWorkbenchSeed) cb(lastWorkbenchSeed);
    return () => {
      workbenchSeedCallbacks.delete(cb);
    };
  },
  hideOverlay: () => ipcRenderer.send(IPC.OVERLAY_HIDE),
  overlayPrepared: () => ipcRenderer.send(IPC.OVERLAY_PREPARED),
  setOverlayPlacement: (placement: OverlayPlacement) =>
    ipcRenderer.invoke(IPC.OVERLAY_PLACEMENT_SET, placement) as Promise<boolean>,

  onStudioRoute: (cb: (route: string) => void): (() => void) => {
    const l = (_e: unknown, route: string) => {
      window.dispatchEvent(new CustomEvent("anvyll:studio:route", { detail: route }));
      cb(route);
    };
    ipcRenderer.on(IPC.STUDIO_ROUTE, l);
    return () => {
      ipcRenderer.removeListener(IPC.STUDIO_ROUTE, l);
    };
  },

  onOverlayShow: (cb: (payload: OverlayShowPayload) => void): (() => void) => {
    overlayShowCallbacks.add(cb);
    if (lastOverlayShow) cb(lastOverlayShow);
    return () => {
      overlayShowCallbacks.delete(cb);
    };
  },

  onOverlayCapturePending: (cb: () => void): (() => void) => {
    overlayCapturePendingCallbacks.add(cb);
    if (lastOverlayCapturePending) cb();
    return () => {
      overlayCapturePendingCallbacks.delete(cb);
    };
  },

  onOverlayClear: (cb: () => void): (() => void) => {
    overlayClearCallbacks.add(cb);
    return () => {
      overlayClearCallbacks.delete(cb);
    };
  },

  onSettingsChanged: (cb: (theme: ThemeId) => void): (() => void) => {
    settingsChangedCallbacks.add(cb);
    return () => {
      settingsChangedCallbacks.delete(cb);
    };
  },
};

contextBridge.exposeInMainWorld("anvyll", api);

export type AnvyllAPI = typeof api;
