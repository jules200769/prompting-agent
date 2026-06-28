// Provider layer: always calls OpenAI GPT-4.1 mini for rewrites. The target
// model's prompting guide supplies the prompt-engineering methodology.

import OpenAI from "openai";
import type { ModelId, OptLevel } from "../shared/types";
import { REWRITE_CONFIG } from "../shared/types";
import { getPack } from "./packs";
import { getGuideExcerpt, getLevelRewriteInstruction } from "./guideLoader";

export interface OptimizeParams {
  prompt: string;
  model: ModelId;
  level: OptLevel;
  persona?: string;
  context?: string;
  apiKey: string;
}

export interface StreamCallbacks {
  onText: (chunk: string) => void;
}

interface RawResult {
  text: string;
}

export function buildMetaPrompt(params: Omit<OptimizeParams, "apiKey">): { system: string; user: string } {
  const pack = getPack(params.model);
  const guide = getGuideExcerpt(params.model, params.level);
  const levelLine = getLevelRewriteInstruction(params.level);
  const personaLine = params.persona?.trim()
    ? `Use this persona/role if appropriate for the guide structure: ${params.persona.trim()}`
    : "";
  const contextLine = params.context?.trim()
    ? `Standing context to incorporate where relevant: ${params.context.trim()}`
    : "";

  const system = `You are an expert prompt engineer specializing in ${pack.label}.

Your job: refine the user's prompt following the official prompting guide below. The refined prompt is what the user will paste into ${pack.label}.

--- PROMPTING GUIDE (${pack.label}) ---
${guide}
--- END GUIDE ---

${levelLine}
${personaLine}${personaLine ? "\n" : ""}${contextLine}

OUTPUT RULES (strict):
- Preserve the user's intent and facts; do not invent details about their situation
- Return ONLY the refined prompt as plain text
- No JSON, no markdown fences, no commentary, no scores, no preamble like "Here is..."
- The output must be ready to copy-paste directly into ${pack.label}`;

  const user = `Refine this prompt:\n"""\n${params.prompt}\n"""`;
  return { system, user };
}

export async function optimizeStream(params: OptimizeParams, cb: StreamCallbacks): Promise<RawResult> {
  const client = new OpenAI({ apiKey: params.apiKey });
  const { system, user } = buildMetaPrompt(params);
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
    if (delta) {
      full += delta;
      cb.onText(delta);
    }
  }
  return { text: full };
}
