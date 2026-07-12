// Provider layer: always calls OpenAI GPT-4.1 mini for rewrites. The target
// model's prompting guide supplies the prompt-engineering methodology.

import OpenAI from "openai";
import type { CaptureContext, ModelId, OptLevel, PromptType } from "../shared/types";
import { REWRITE_CONFIG } from "../shared/types";
import { buildDestinationContextBlock } from "../shared/contextSignals";
import { getPack } from "./packs";
import { getGuideExcerpt, getLevelRewriteInstruction, getLevelStructureContract } from "./guideLoader";

export interface OptimizeParams {
  prompt: string;
  model: ModelId;
  level: OptLevel;
  persona?: string;
  context?: string;
  apiKey: string;
  /** Shell/terminal paste: force single-line plain output. */
  terminalContext?: boolean;
  /** Overlay type hint; "auto"/undefined adds nothing. */
  promptType?: PromptType;
  /** Destination context from hotkey capture; renders the DESTINATION CONTEXT block. */
  captureContext?: CaptureContext;
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
  const structureContract = getLevelStructureContract(params.model, params.level);
  const personaLine = params.persona?.trim()
    ? `Use this persona/role if appropriate for the guide structure: ${params.persona.trim()}`
    : "";
  const contextLine = params.context?.trim()
    ? `Standing context to incorporate where relevant: ${params.context.trim()}`
    : "";
  const PROMPT_TYPE_RULES: Partial<Record<PromptType, string>> = {
    question: `
PROMPT TYPE — QUESTION (user-selected):
- The user's text is a question for the AI. Keep the refined prompt in question form — sharp, answerable, with the needed context
- Do not convert it into a task briefing or deliverable request
`,
    prompt: `
PROMPT TYPE — TASK PROMPT (user-selected):
- The user's text is a task prompt. Refine it as a direct, actionable instruction with a clear deliverable
`,
    letter: `
PROMPT TYPE — WRITTEN MESSAGE (user-selected):
- The deliverable is a written message (email, letter, or reply). The refined prompt must instruct the model to write that message
- Preserve the user's stated facts, audience, and tone constraints exactly
`,
  };
  const promptTypeRule =
    params.promptType && params.promptType !== "auto" ? (PROMPT_TYPE_RULES[params.promptType] ?? "") : "";
  const actionLanguageRule =
    params.level >= 2
      ? `
ACTION & DELIVERABLE LANGUAGE (when applicable):
- If the user asks to fix, implement, change, build, or write a deliverable, use imperative language (e.g. "Implement…", "Write…") — not "suggest", "recommend", or "provide a solution"
- Preserve the user's exact factual phrases; do not soften or euphemize (e.g. keep "vendor delay", not "vendor-related issue" or "vendor issue")
`
      : "";
  const constraintFramingRule =
    params.level >= 3
      ? `
CONSTRAINT FRAMING (Level 3+):
- Reframe each "don't / do not X" user constraint as positive guidance where possible (e.g. "don't blame" → "use neutral, forward-looking language without assigning fault")
`
      : "";
  const gptOutcomeFirstRule =
    params.model === "gpt-5" && params.level >= 2 && !params.terminalContext
      ? `
GPT-5.5 OUTCOME-FIRST (mandatory):
- Shorter, outcome-oriented paste prompts — no legacy process stacks
- Never add # Personality, # Collaboration, Role:, # Goal, or # Stop rules blocks to the refined prompt
- Level 2–3: no phased workflows, success criteria, or examples unless Level 4 explicitly requires them
`
      : "";
  const composerStructureRule =
    params.model === "composer-2.5" && !params.terminalContext
      ? `
COMPOSER 2.5 (mandatory):
- Level 2: Goal + Context + Input only — never Process, Constraints, Output format, Examples, or Success criteria
- Level 3: Goal, Context, Constraints, Output format — no Examples or Success criteria
- Level 4: all Level 3 blocks plus Examples and Success criteria
- When the user says fix/implement/build: Goal must demand direct implementation, not "propose a plan and wait for approval" on simple tasks
- Include React/TypeScript stack hints in Context when the user mentioned them; never invent file paths or component names
`
      : "";
  const grokStructureRule =
    params.model === "grok-4" && !params.terminalContext
      ? `
GROK 4 (mandatory):
- Use GOAL / CONTEXT / OUTPUT FORMAT / QUALITY BAR (ALL CAPS labels) — never XML tags for grok-4
- Do not invent X posts, URLs, or live search results unless the user explicitly requested real-time search
- QUALITY BAR is required on Level 3 and Level 4
- No model name or version padding in the refined prompt body
`
      : "";
  const geminiStructureRule =
    params.model === "gemini-3" && !params.terminalContext
      ? `
GEMINI 3 (mandatory):
- Level 2: Persona (optional one line) + Task + Input only
- Level 3+: block order is Context → Task → Output → Constraints (Constraints MUST be last)
- Never use blanket "do not infer" / "do not guess" — use positive grounding instructions instead
- Level 3: no Examples or Success criteria; those are Level 4 only
`
      : "";

  const terminalOutputRule = params.terminalContext
    ? `
TERMINAL SHELL (mandatory — overrides structure contract above):
- The user will paste this into a command-line prompt that accepts ONE line only
- Output a SINGLE line of plain text: NO line breaks, NO newlines, NO XML tags, NO markdown headers
- Join clauses with spaces or semicolons; never press Enter between parts
- Intensity (Cool–Max) affects clarity and wording only — never multi-line or tagged structure
`
    : "";

  const structureBlock = params.terminalContext
    ? "STRUCTURE CONTRACT (mandatory):\n- Single line of plain prose only (see TERMINAL SHELL above)"
    : structureContract;

  // Destination context (hotkey capture) sits after the model rule group and before
  // persona/standing context so standing contextMemory stays a distinct signal.
  const destinationContextBlock = buildDestinationContextBlock(params.captureContext);

  const system = `You are an expert prompt engineer specializing in ${pack.label}.

Your job: refine the user's prompt following the official prompting guide below. The refined prompt is what the user will paste into ${pack.label}.

--- PROMPTING GUIDE (${pack.label}) ---
${guide}
--- END GUIDE ---

${levelLine}

${structureBlock}
${terminalOutputRule}${promptTypeRule}${actionLanguageRule}${constraintFramingRule}${gptOutcomeFirstRule}${composerStructureRule}${grokStructureRule}${geminiStructureRule}${destinationContextBlock}
${personaLine}${personaLine ? "\n" : ""}${contextLine}

OUTPUT RULES (strict):
- Preserve the user's intent and facts; do not invent details about their situation
${params.terminalContext ? "- ONE line only — no \\n or paragraph breaks anywhere in the output" : "- Follow the STRUCTURE CONTRACT exactly for this level — Cool must stay plain prose; Max must keep all Level 3 section tags plus examples and success criteria"}
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
