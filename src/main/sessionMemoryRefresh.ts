// Debounced session auto-memory refresh after Apply/Copy — fail soft, never blocks inject.

import type { SessionContext } from "../shared/session";
import { buildSessionMemoryDelta } from "../shared/sessionMemory";
import { REWRITE_CONFIG } from "../shared/types";
import { refreshSessionMemory } from "../engine/sessionMemory";
import { keyStore } from "./keyStore";
import * as store from "./storage";

const DEBOUNCE_MS = 2000;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

let notifySessionUpdated: ((session: SessionContext) => void) | null = null;

/** Register overlay/studio broadcast for SESSION_MEMORY_UPDATED. */
export function setSessionMemoryNotifier(fn: (session: SessionContext) => void): void {
  notifySessionUpdated = fn;
}

export function scheduleSessionMemoryRefresh(sessionId: string): void {
  if (!store.getSettings().autoSessionMemory) return;
  if (!sessionId) return;

  const existing = timers.get(sessionId);
  if (existing) clearTimeout(existing);

  timers.set(
    sessionId,
    setTimeout(() => {
      timers.delete(sessionId);
      void runSessionMemoryRefresh(sessionId).catch((err) => {
        console.warn("[Anvyll] session memory refresh failed:", err);
      });
    }, DEBOUNCE_MS),
  );
}

export async function runSessionMemoryRefresh(sessionId: string): Promise<SessionContext | null> {
  if (!store.getSettings().autoSessionMemory) return null;

  const session = store.listSessions().find((s) => s.id === sessionId);
  if (!session) return null;

  const runs = store.listSessionMemoryRuns(sessionId, session.memoryUpdatedAt);
  const activityDelta = buildSessionMemoryDelta(runs);
  if (!activityDelta) return null;

  const apiKey = await keyStore.get(REWRITE_CONFIG.provider);
  if (!apiKey) {
    throw new Error("OpenAI API key not configured. Add your key in Settings.");
  }

  const refreshed = await refreshSessionMemory({
    currentContext: session.contextText,
    projectContext: store.getProjectContext().trim() || undefined,
    activityDelta,
    apiKey,
  });

  const updated = store.refreshSessionContext(sessionId, refreshed);
  if (updated) notifySessionUpdated?.(updated);
  return updated;
}

/** @internal test helper — clears pending debounce timers. */
export function clearSessionMemoryRefreshTimers(): void {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
}
