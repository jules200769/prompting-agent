// Preload: exposes a tight allowlist IPC API to the renderer. No Node globals leak.
import { contextBridge, ipcRenderer } from "electron";
import { IPC, type OptimizeRequest, type AppSettings, type CaptureMode, type Provider } from "../shared/types";

type OverlayShowPayload = {
  text: string;
  mode: CaptureMode;
  snapshot: { text: string; hasText: boolean };
};

const overlayShowCallbacks = new Set<(payload: OverlayShowPayload) => void>();
const overlayCapturePendingCallbacks = new Set<() => void>();
let lastOverlayShow: OverlayShowPayload | null = null;
let lastOverlayCapturePending = false;

function deliverOverlayShow(payload: OverlayShowPayload): void {
  lastOverlayShow = payload;
  lastOverlayCapturePending = false;
  window.dispatchEvent(new CustomEvent("promptforge:capture", { detail: payload }));
  for (const cb of overlayShowCallbacks) cb(payload);
}

function deliverOverlayCapturePending(): void {
  lastOverlayCapturePending = true;
  window.dispatchEvent(new CustomEvent("promptforge:capture:pending"));
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
    ipcRenderer.invoke(IPC.CAPTURE_INJECT, text, snapshot),
  captureCopy: (text: string) => ipcRenderer.invoke(IPC.CAPTURE_COPY, text),

  settingsGet: () => ipcRenderer.invoke(IPC.SETTINGS_GET) as Promise<AppSettings>,
  settingsSet: (s: AppSettings) => ipcRenderer.invoke(IPC.SETTINGS_SET, s),

  keysSet: (provider: Provider, key: string) => ipcRenderer.invoke(IPC.KEYS_SET, provider, key),
  keysHas: (provider: Provider) => ipcRenderer.invoke(IPC.KEYS_HAS, provider) as Promise<boolean>,
  keysDelete: (provider: Provider) => ipcRenderer.invoke(IPC.KEYS_DELETE, provider),
  keysProviders: () => ipcRenderer.invoke(IPC.KEYS_PROVIDERS) as Promise<Provider[]>,
  keysIsSecure: () => ipcRenderer.invoke("promptforge:keys:secure") as Promise<boolean>,

  libraryList: () => ipcRenderer.invoke(IPC.LIBRARY_LIST),
  librarySave: (input: any) => ipcRenderer.invoke(IPC.LIBRARY_SAVE, input),
  libraryDelete: (id: string) => ipcRenderer.invoke(IPC.LIBRARY_DELETE, id),

  historyList: () => ipcRenderer.invoke(IPC.HISTORY_LIST),
  historyClear: () => ipcRenderer.invoke(IPC.HISTORY_CLEAR),

  openStudio: () => ipcRenderer.send(IPC.STUDIO_SHOW),
  openSettings: () => ipcRenderer.send(IPC.STUDIO_SETTINGS),
  hideOverlay: () => ipcRenderer.send(IPC.OVERLAY_HIDE),

  onStudioRoute: (cb: (route: string) => void) => {
    const l = (_e: unknown, route: string) => {
      window.dispatchEvent(new CustomEvent("promptforge:studio:route", { detail: route }));
      cb(route);
    };
    ipcRenderer.on(IPC.STUDIO_ROUTE, l);
    return () => ipcRenderer.removeListener(IPC.STUDIO_ROUTE, l);
  },

  onOverlayShow: (cb: (payload: OverlayShowPayload) => void) => {
    overlayShowCallbacks.add(cb);
    if (lastOverlayShow) cb(lastOverlayShow);
    return () => overlayShowCallbacks.delete(cb);
  },

  onOverlayCapturePending: (cb: () => void) => {
    overlayCapturePendingCallbacks.add(cb);
    if (lastOverlayCapturePending) cb();
    return () => overlayCapturePendingCallbacks.delete(cb);
  },
};

contextBridge.exposeInMainWorld("promptforge", api);

export type PromptForgeAPI = typeof api;
