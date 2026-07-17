// Shared optimize path for IPC and the browser preview dev bridge.

import type { OptimizeRequest, OptimizeResult } from "../shared/types";
import { optimize } from "../engine/orchestrator";
import * as store from "./storage";

export async function runOptimize(
  req: OptimizeRequest,
  onText: (chunk: string) => void,
): Promise<OptimizeResult> {
  // Session/project context is resolved here, main-side, for every optimize
  // surface (overlay, Studio, dev bridge) — renderer-supplied values are
  // always overwritten so the store stays the single source of truth.
  const sessionText = store.getActiveSession()?.contextText.trim();
  const projectText = store.getProjectContext().trim();
  const enriched: OptimizeRequest = {
    ...req,
    sessionContext: sessionText || undefined,
    projectContext: projectText || undefined,
  };
  const hash = store.cacheHash(enriched);
  const cached = enriched.skipCache ? null : store.getCache(hash, enriched.prompt);
  if (cached) {
    onText(cached.optimizedPrompt);
    return cached;
  }
  const result = await optimize({ request: enriched, onText });
  store.setCache(hash, result);
  store.addHistory(result, enriched.prompt);
  return result;
}
