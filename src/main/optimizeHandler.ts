// Shared optimize path for IPC and the browser preview dev bridge.

import type { OptimizeRequest, OptimizeResult } from "../shared/types";
import { optimize } from "../engine/orchestrator";
import * as store from "./storage";

export async function runOptimize(
  req: OptimizeRequest,
  onText: (chunk: string) => void,
): Promise<OptimizeResult> {
  const hash = store.cacheHash(req);
  const cached = req.skipCache ? null : store.getCache(hash, req.prompt);
  if (cached) {
    onText(cached.optimizedPrompt);
    return cached;
  }
  const result = await optimize({ request: req, onText });
  store.setCache(hash, result);
  store.addHistory(result, req.prompt);
  return result;
}
