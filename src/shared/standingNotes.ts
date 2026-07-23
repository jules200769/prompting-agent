// Merge Settings standing notes with per-request context (pure — vitest-testable).

/** Combine global standing notes with renderer-supplied context for the meta-prompt. */
export function mergeStandingNotes(
  settingsContextMemory: string | undefined,
  requestContext: string | undefined,
): string | undefined {
  const notes = settingsContextMemory?.trim() ?? "";
  const extra = requestContext?.trim() ?? "";
  if (notes && extra) return `${notes}\n\n${extra}`;
  return notes || extra || undefined;
}

/** True when session memory was refreshed within the recent window (ms). */
export function isRecentSessionMemoryUpdate(
  memoryUpdatedAt: number | null | undefined,
  withinMs = 30_000,
  now = Date.now(),
): boolean {
  if (!memoryUpdatedAt) return false;
  return now - memoryUpdatedAt < withinMs;
}
