// Compacts long Import-context pastes into Anvyll's six-label standing summary.

import OpenAI from "openai";
import type { ContextImportScope } from "../shared/contextImportPrompt";
import { buildContextCompactPrompt } from "../shared/contextImportPrompt";
import { clampContextText, PROJECT_CONTEXT_MAX_CHARS, SESSION_CONTEXT_MAX_CHARS } from "../shared/session";
import { REWRITE_CONFIG } from "../shared/types";
import { stripResponseArtifacts } from "./cleanRewrite";

export interface CompactContextParams {
  scope: ContextImportScope;
  text: string;
  apiKey: string;
}

function compactError(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error(String(err));
}

export async function compactContext(params: CompactContextParams): Promise<string> {
  const trimmed = params.text.trim();
  if (!trimmed) {
    throw new Error("Nothing to compact — paste context first.");
  }

  const max =
    params.scope === "project" ? PROJECT_CONTEXT_MAX_CHARS : SESSION_CONTEXT_MAX_CHARS;
  const { system, user } = buildContextCompactPrompt(params.scope, trimmed);

  const client = new OpenAI({ apiKey: params.apiKey });
  let full = "";
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
    const delta = chunk.choices?.[0]?.delta?.content;
    if (delta) full += delta;
  }

  const compacted = clampContextText(stripResponseArtifacts(full), max);
  if (!compacted) {
    throw new Error("Compact API returned empty output.");
  }
  return compacted;
}

export { compactError };
