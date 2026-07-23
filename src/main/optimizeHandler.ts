// Shared optimize path for IPC and the browser preview dev bridge.

import type { OptimizeRequest, OptimizeWithRunId, RunSurface } from "../shared/types";
import { optimize } from "../engine/orchestrator";
import { computeGrounding } from "../shared/grounding";
import { mergeStandingNotes } from "../shared/standingNotes";
import * as store from "./storage";

export async function runOptimize(
  req: OptimizeRequest,
  onText: (chunk: string) => void,
  surface: RunSurface = "dev",
): Promise<OptimizeWithRunId> {
  // Session/project context is resolved here, main-side, for every optimize
  // surface (overlay, Studio, dev bridge) — renderer-supplied values are
  // always overwritten so the store stays the single source of truth.
  const sessionText = store.getActiveSession()?.contextText.trim();
  const projectText = store.getProjectContext().trim();
  const settings = store.getSettings();
  const context = mergeStandingNotes(settings.contextMemory, req.context);
  const enriched: OptimizeRequest = {
    ...req,
    context,
    sessionContext: sessionText || undefined,
    projectContext: projectText || undefined,
  };
  // Computed per-request from the live store (before the cache lookup) so a
  // fromCache run's chips reflect this run's context, not the run that filled it.
  const grounding = computeGrounding(Boolean(sessionText), Boolean(projectText), req.captureContext);
  const hash = store.cacheHash(enriched);
  const cached = enriched.skipCache ? null : store.getCache(hash, enriched.prompt);
  if (cached) {
    onText(cached.optimizedPrompt);
    const runId = store.addRunRecord(cached, enriched, surface, true);
    return { ...cached, runId, grounding };
  }
  const result = await optimize({ request: enriched, onText });
  store.setCache(hash, result);
  const runId = store.addRunRecord(result, enriched, surface, false);
  return { ...result, runId, grounding };
}
