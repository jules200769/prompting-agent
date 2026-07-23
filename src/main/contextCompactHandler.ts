// Shared context-compact path for IPC and the browser preview dev bridge.

import type { ContextCompactRequest, ContextCompactResult } from "../shared/types";
import { REWRITE_CONFIG } from "../shared/types";
import { compactContext } from "../engine/contextCompact";
import { keyStore } from "./keyStore";

export async function runContextCompact(req: ContextCompactRequest): Promise<ContextCompactResult> {
  const apiKey = await keyStore.get(REWRITE_CONFIG.provider);
  if (!apiKey) {
    throw new Error("OpenAI API key not configured. Add your key in Settings.");
  }
  const text = await compactContext({
    scope: req.scope,
    text: req.text,
    apiKey,
  });
  return { text };
}
