// Refreshes session standing context from Apply/Copy activity via GPT-4.1.

import OpenAI from "openai";
import { buildSessionMemoryRefreshPrompt } from "../shared/contextImportPrompt";
import { clampContextText, SESSION_CONTEXT_MAX_CHARS } from "../shared/session";
import { REWRITE_CONFIG } from "../shared/types";
import { stripResponseArtifacts } from "./cleanRewrite";

export interface RefreshSessionMemoryParams {
  currentContext: string;
  projectContext?: string;
  activityDelta: string;
  apiKey: string;
}

function sessionMemoryError(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error(String(err));
}

export async function refreshSessionMemory(params: RefreshSessionMemoryParams): Promise<string> {
  const delta = params.activityDelta.trim();
  if (!delta) {
    throw new Error("Nothing to refresh — no Apply/Copy activity.");
  }

  const { system, user } = buildSessionMemoryRefreshPrompt({
    currentContext: params.currentContext,
    projectContext: params.projectContext,
    activityDelta: delta,
  });

  const client = new OpenAI({ apiKey: params.apiKey });
  let full = "";
  try {
    const stream = await client.chat.completions.create({
      model: REWRITE_CONFIG.modelId,
      stream: true,
      temperature: REWRITE_CONFIG.temperature,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    for await (const chunk of stream) {
      const content = chunk.choices?.[0]?.delta?.content;
      if (content) full += content;
    }
  } catch (err) {
    throw sessionMemoryError(err);
  }

  const refreshed = clampContextText(stripResponseArtifacts(full), SESSION_CONTEXT_MAX_CHARS);
  if (!refreshed) {
    throw new Error("Session memory refresh returned empty output.");
  }
  return refreshed;
}

export { sessionMemoryError };
