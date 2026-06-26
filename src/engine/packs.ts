// Engines-as-data: model-specific prompt-packs. Each pack turns the rewrite LLM
// into an expert for the target model's official prompt-engineering methodology.

import type { ModelId, OptLevel, SubScores } from "../shared/types";

export interface LevelOverride {
  add_examples: boolean;
  add_persona: boolean;
  max_tokens: number;
  self_critique?: boolean;
  passes?: number;
  depth: string;
}

export interface PackExemplar {
  before: string;
  after: string;
}

export interface PromptPack {
  pack_id: string;
  version: string;
  provider: string;
  model_id: string;
  label: string;
  system_prompt: string;
  methodology: string[]; // bullet list shown in UI
  rubric: SubScores;
  exemplars: PackExemplar[];
  output_schema_hint: string;
  level_overrides: Record<string, LevelOverride>;
}

const COMMON_SCHEMA = `Return STRICT JSON only (no prose, no markdown fences) with this shape:
{
  "optimized_prompt": string,
  "score": number (0-100, your estimate of the FINAL prompt quality),
  "subscores": { "clarity": number, "context": number, "structure": number, "format": number, "examples": number, "persona": number, "verifiability": number },
  "diff": [ { "type": "add"|"remove"|"context", "text": string, "tag"?: string } ],
  "persona_suggestion": string,
  "notes": [string]
}
The diff should be a compact line-oriented delta of ORIGINAL -> OPTIMIZED, with "tag" on add lines noting what was added (e.g. "+ Role/persona", "+ Constraints", "+ Output format", "+ Example", "Reordered for clarity").`;

export const PACKS: Record<ModelId, PromptPack> = {
  "claude-opus-4.8": {
    pack_id: "claude-opus-4.8",
    version: "1.3.0",
    provider: "anthropic",
    model_id: "claude-opus-4-8",
    label: "Claude Opus 4.8",
    methodology: [
      "XML-tagged sections: <context>, <task>, <constraints>, <output_format>, <examples>",
      "Explicit expert role up front",
      "Step-by-step thinking cues; clear, separable instructions",
      "Concrete success criteria / verification steps",
    ],
    rubric: { clarity: 25, context: 20, structure: 15, format: 15, examples: 10, persona: 10, verifiability: 5 },
    exemplars: [
      {
        before: "Help me improve my SaaS landing page.",
        after: `<context>I run a B2B SaaS that sells an analytics dashboard to mid-market product teams. Current landing page converts at 1.8%.</context>
<task>Act as a world-class SaaS conversion optimization specialist. Audit my landing page copy and structure, then propose 5 specific, prioritized changes to lift sign-ups. For each change give: the problem, the proposed rewrite, and the expected impact.</task>
<constraints>Assume a technical-but-not-engineer reader. Keep each change under 80 words. No generic advice ("make it pop"); be specific to the page above.</constraints>
<output_format>Markdown table: Change | Problem | Proposed rewrite | Expected impact.</output_format>
<success_criteria>A designer could implement each change without follow-up questions.</success_criteria>`,
      },
    ],
    output_schema_hint: COMMON_SCHEMA,
    system_prompt: `You are an Anthropic prompt-engineering specialist. Rewrite the user's prompt for Claude Opus 4.8 applying Anthropic's published best practices: an explicit expert role, XML-tagged sections (<context>, <task>, <constraints>, <output_format>, <examples>, <success_criteria>), clear step-by-step instructions, and concrete success criteria. Preserve the user's intent; do not invent facts about their situation — if context is missing, write a placeholder like <context>...</context> with a one-line cue for them to fill. Keep it tight; longer is not better. ${COMMON_SCHEMA}`,
    level_overrides: {
      "1": { add_examples: false, add_persona: false, max_tokens: 1200, depth: "Light cleanup: clarity, structure, remove ambiguity. No new sections beyond task + constraints." },
      "2": { add_examples: false, add_persona: true, max_tokens: 2400, depth: "Professional: add role, context, constraints, output_format. XML-tagged." },
      "3": { add_examples: true, add_persona: true, max_tokens: 6000, self_critique: false, depth: "Expert: full XML structure + 1 concrete worked example + success criteria." },
      "4": { add_examples: true, add_persona: true, max_tokens: 12000, self_critique: true, passes: 3, depth: "Maximum: full structure + examples + self-critique loop (write, critique, refine) + advanced thinking priming." },
    },
  },

  "gpt-5": {
    pack_id: "gpt-5",
    version: "1.2.0",
    provider: "openai",
    model_id: "gpt-5",
    label: "GPT-5",
    methodology: [
      "Clear system/role + explicit task separation",
      "Structured markdown with headers, not XML",
      "Few-shot examples for non-obvious formatting",
      "Step-by-step reasoning cues; explicit output contract",
    ],
    rubric: { clarity: 25, context: 20, structure: 15, format: 15, examples: 10, persona: 10, verifiability: 5 },
    exemplars: [
      {
        before: "Write a cold outbound email.",
        after: `# Role
You are a senior B2B SDR who has booked 500+ demos with VP-level buyers.

# Task
Write a 90-word cold email to a VP of Engineering at a 200-person fintech.

# Context
- We sell an AI code-review tool that cuts review time 40%.
- Trigger: they just posted a job for staff engineer, platform.

# Constraints
- One clear CTA (15-min call).
- No buzzword soup. Plain prose. No "I hope this email finds you well".
- Subject line under 45 chars.

# Output format
**Subject:** ...
**Body:** ...

# Example
**Subject:** Review time vs. your platform team
**Body:** [one tight, specific paragraph]`,
      },
    ],
    output_schema_hint: COMMON_SCHEMA,
    system_prompt: `You are an OpenAI prompt-engineering specialist. Rewrite the user's prompt for GPT-5 applying OpenAI's published best practices: a clear role header, explicit task separation, structured markdown with headers (not XML), few-shot examples where formatting is non-obvious, and an explicit output contract. Preserve intent; do not invent facts — use [bracketed placeholders] for missing specifics. ${COMMON_SCHEMA}`,
    level_overrides: {
      "1": { add_examples: false, add_persona: false, max_tokens: 1200, depth: "Light cleanup only. Markdown headers, clear task." },
      "2": { add_examples: false, add_persona: true, max_tokens: 2400, depth: "Role + context + task + constraints + output format, markdown-structured." },
      "3": { add_examples: true, add_persona: true, max_tokens: 6000, self_critique: false, depth: "Add 1 worked example + step-by-step reasoning cues + verification." },
      "4": { add_examples: true, add_persona: true, max_tokens: 12000, self_critique: true, passes: 3, depth: "Multi-pass: draft, critique against rubric, refine. Reasoning maximized." },
    },
  },

  "gemini-3": {
    pack_id: "gemini-3",
    version: "1.1.0",
    provider: "google",
    model_id: "gemini-3-pro",
    label: "Gemini 3 Pro",
    methodology: [
      "Explicit persona + task framing first",
      "'Show your work' patterns: ask the model to reason then answer",
      "Numbered step lists; clear delimiter between reasoning and final answer",
      "Rich context welcome (Gemini has large context window) — load relevant background",
    ],
    rubric: { clarity: 25, context: 20, structure: 15, format: 15, examples: 10, persona: 10, verifiability: 5 },
    exemplars: [
      {
        before: "Summarize this report.",
        after: `Persona: You are a strategy consultant who writes for a CEO with 5 minutes.

Task: Summarize the attached 40-page market report into a decision brief.

Steps (think through these, then produce the brief):
1. Identify the 3 findings that would change a go/no-go decision.
2. Note the strongest counter-evidence for each.
3. Flag any data gaps that should block a decision.

Context: Reader is deciding whether to enter the European market this quarter.

Output:
- **Decision:** [recommendation in one sentence]
- **Why:** [3 bullets, each with a number]
- **Risks:** [2 bullets]
- **What we don't know:** [1-2 bullets]

Format: Plain markdown. No preamble. Separate your reasoning (## Reasoning) from the brief (## Brief).`,
      },
    ],
    output_schema_hint: COMMON_SCHEMA,
    system_prompt: `You are a Google prompt-engineering specialist. Rewrite the user's prompt for Gemini 3 Pro applying Google's published best practices: explicit persona and task framing first, "show your work" patterns (ask the model to reason then answer), numbered step lists, a clear delimiter between reasoning and the final answer, and rich context (Gemini has a large context window — load relevant background). Preserve intent; use [bracketed placeholders] for missing specifics. ${COMMON_SCHEMA}`,
    level_overrides: {
      "1": { add_examples: false, add_persona: false, max_tokens: 1200, depth: "Light: clear task + numbered steps." },
      "2": { add_examples: false, add_persona: true, max_tokens: 2400, depth: "Persona + task + steps + output format, reasoning/answer split." },
      "3": { add_examples: true, add_persona: true, max_tokens: 6000, self_critique: false, depth: "Add worked example + explicit 'show your work' section + verification." },
      "4": { add_examples: true, add_persona: true, max_tokens: 12000, self_critique: true, passes: 3, depth: "Maximum reasoning load, self-critique, full structure." },
    },
  },

  "deepseek-v3": {
    pack_id: "deepseek-v3",
    version: "1.0.0",
    provider: "deepseek",
    model_id: "deepseek-chat",
    label: "DeepSeek V3",
    methodology: [
      "Concise, explicit instructions; minimal preamble",
      "Chain-of-thought cues for reasoning tasks ('think step by step')",
      "Clear input/output contract; few-shot for format",
      "Explicit constraints to avoid rambling",
    ],
    rubric: { clarity: 25, context: 20, structure: 15, format: 15, examples: 10, persona: 10, verifiability: 5 },
    exemplars: [
      {
        before: "Debug this function.",
        after: `Role: Senior engineer reviewing a PR.

Task: Find bugs in the function below and propose fixes. Think step by step before answering.

Constraints:
- Output only the fixed function plus a bullet list of what changed and why.
- No general programming lectures.

Function:
\`\`\`
[paste function]
\`\`\`

Output format:
\`\`\`[fixed function]\`\`\`
- **Bug 1:** ... → **Fix:** ...
- **Bug 2:** ... → **Fix:** ...`,
      },
    ],
    output_schema_hint: COMMON_SCHEMA,
    system_prompt: `You are a DeepSeek prompt-engineering specialist. Rewrite the user's prompt for DeepSeek V3 applying its strengths: concise explicit instructions with minimal preamble, chain-of-thought cues ("think step by step") for reasoning tasks, a clear input/output contract, few-shot examples for formatting, and explicit constraints to prevent rambling. Preserve intent; use [bracketed placeholders] for missing specifics. ${COMMON_SCHEMA}`,
    level_overrides: {
      "1": { add_examples: false, add_persona: false, max_tokens: 1000, depth: "Tight cleanup; explicit task + constraints." },
      "2": { add_examples: false, add_persona: true, max_tokens: 2000, depth: "Role + task + constraints + output contract; add CoT cue if reasoning task." },
      "3": { add_examples: true, add_persona: true, max_tokens: 5000, self_critique: false, depth: "Few-shot example + step-by-step + verification." },
      "4": { add_examples: true, add_persona: true, max_tokens: 10000, self_critique: true, passes: 3, depth: "Self-critique loop, maximum structure." },
    },
  },

  "grok-4": {
    pack_id: "grok-4",
    version: "1.0.0",
    provider: "xai",
    model_id: "grok-4",
    label: "Grok 4",
    methodology: [
      "Direct, conversational, low-ceremony instructions",
      "Explicit constraints to keep it grounded and avoid filler",
      "Few-shot for tone/format; specify the desired voice",
      "Ask for citations/sources when factual claims are needed",
    ],
    rubric: { clarity: 25, context: 20, structure: 15, format: 15, examples: 10, persona: 10, verifiability: 5 },
    exemplars: [
      {
        before: "Explain quantum computing.",
        after: `You're a physics professor who explains without dumbing down.

Explain quantum computing to a senior software engineer in ~200 words.

Constraints:
- No hype words ("revolutionary", "game-changing").
- One concrete analogy grounded in something a coder already knows.
- Name one real limitation of current hardware.

Cite sources for any specific claim (links or paper titles).

Format: 3 short paragraphs. End with a one-line "if you remember one thing".`,
      },
    ],
    output_schema_hint: COMMON_SCHEMA,
    system_prompt: `You are an xAI prompt-engineering specialist. Rewrite the user's prompt for Grok 4 applying its strengths: direct, conversational, low-ceremony instructions, explicit constraints to keep it grounded and avoid filler, few-shot examples for tone/format, a specified voice, and explicit requests for citations/sources when factual claims are needed. Preserve intent; use [bracketed placeholders] for missing specifics. ${COMMON_SCHEMA}`,
    level_overrides: {
      "1": { add_examples: false, add_persona: false, max_tokens: 1000, depth: "Direct cleanup; clear ask + constraints." },
      "2": { add_examples: false, add_persona: true, max_tokens: 2000, depth: "Voice + task + constraints + format; cite if factual." },
      "3": { add_examples: true, add_persona: true, max_tokens: 5000, self_critique: false, depth: "Tone example + verification + sources." },
      "4": { add_examples: true, add_persona: true, max_tokens: 10000, self_critique: true, passes: 3, depth: "Self-critique on grounding + concision; full structure." },
    },
  },

  "composer-2.5": {
    pack_id: "composer-2.5",
    version: "1.0.0",
    provider: "cursor",
    model_id: "composer-2.5",
    label: "Composer 2.5",
    methodology: [
      "One-sentence goal first, then repo context (stack, files, patterns)",
      "Constraints before implementation — scope, coding rules, no-new-deps",
      "Phased workflow: inspect → summarize → plan → approve → implement → verify",
      "Explicit output format (headings, diffs, checklists) and success criteria",
    ],
    rubric: { clarity: 25, context: 20, structure: 15, format: 15, examples: 10, persona: 10, verifiability: 5 },
    exemplars: [
      {
        before: "Add offline caching to the feed screen.",
        after: `Goal
- Add offline caching and 30-second cache invalidation to the activity feed.

Context
- Stack: React Native + Expo + Supabase
- Relevant files:
  - app/screens/FeedScreen.tsx
  - hooks/useFeed.ts
  - services/feedService.ts
- Existing pattern: all data access goes through services

Constraints
- Do not add dependencies.
- No direct Supabase calls in UI components.
- Preserve current loading and error UI behavior.

Process
1. Inspect the relevant files.
2. Explain the current data flow in up to 8 bullets.
3. Propose a plan.
4. Wait for my OK.
5. Implement in small steps and show diffs only.
6. End with tests and edge cases.

Output format
- Use headings.
- Show unified diffs only.
- End with a checklist of tests and edge cases.

Success criteria
- Feed works offline with stale-while-revalidate behavior.
- No regressions in loading/error states.`,
      },
    ],
    output_schema_hint: COMMON_SCHEMA,
    system_prompt: `You are a Cursor prompt-engineering specialist. Rewrite the user's prompt for Composer 2.5 applying its published best practices: a one-sentence goal first, repo context early (stack, key files, existing patterns), constraints stated before work, a phased workflow (inspect, summarize, plan, wait, implement, verify), explicit output format, and success criteria. Preserve intent; use [bracketed placeholders] for missing specifics. ${COMMON_SCHEMA}`,
    level_overrides: {
      "1": { add_examples: false, add_persona: false, max_tokens: 1200, depth: "Light cleanup: clear goal + minimal context. Fix ambiguity only." },
      "2": { add_examples: false, add_persona: true, max_tokens: 2400, depth: "Goal + context (stack, files, patterns) + constraints." },
      "3": { add_examples: true, add_persona: true, max_tokens: 6000, self_critique: false, depth: "Full six-block structure: goal, context, constraints, process, output format, success criteria." },
      "4": { add_examples: true, add_persona: true, max_tokens: 12000, self_critique: true, passes: 3, depth: "Complete guide methodology + worked example + verification checklist." },
    },
  },
};

export function getPack(model: ModelId): PromptPack {
  return PACKS[model];
}

export function getLevelOverride(model: ModelId, level: OptLevel): LevelOverride {
  return PACKS[model].level_overrides[String(level)];
}
