// Local fallback optimizer: guide-aware deterministic templates when no API key.

import type { DiffSegment, ModelId, OptLevel, OptimizeResult, SubScores } from "../shared/types";
import { LEVEL_LABELS } from "../shared/types";
import { getPack } from "./packs";
import { analyze, adherenceLevel } from "./rubric";
import { buildDiff } from "./diff";

function derivePersona(prompt: string): string {
  const t = prompt.toLowerCase();
  const map: { match: RegExp; role: string }[] = [
    { match: /landing|saas|conversion|marketing|copy/i, role: "a world-class SaaS conversion optimization specialist" },
    { match: /email|outbound|cold|sales/i, role: "a senior B2B SDR who has booked 500+ demos with VP-level buyers" },
    { match: /code|bug|function|debug|refactor|api/i, role: "a senior staff engineer who reviews code for correctness and clarity" },
    { match: /essay|writ(e|ing)|blog|article/i, role: "an award-winning long-form writer and editor" },
    { match: /data|analyz|chart|report|metric/i, role: "a senior data analyst who writes decision-ready analyses" },
    { match: /summar/i, role: "a strategy consultant who writes for an executive with 5 minutes" },
    { match: /expla(in|nation)|teach/i, role: "a clear technical educator who explains without dumbing down" },
    { match: /plan|strategy|roadmap|launch/i, role: "a pragmatic product strategist" },
  ];
  for (const m of map) if (m.match.test(t)) return m.role;
  return "a senior expert in the relevant field with deep, practical experience";
}

function extractIntent(prompt: string): string {
  const t = prompt.trim().replace(/^(please\s+|can you\s+|help me\s+|i want to\s+|i need to\s+)/i, "");
  const c = t.charAt(0).toUpperCase() + t.slice(1);
  return c.endsWith(".") || c.endsWith("?") ? c : `${c}.`;
}

function buildGuideOptimized(model: ModelId, level: OptLevel, original: string, persona: string): string {
  const intent = extractIntent(original);

  if (level === 1) {
    return intent;
  }

  switch (model) {
    case "claude-opus-4.8":
      return buildClaude(original, intent, persona, level);
    case "gpt-5":
      return buildGpt(intent, persona, level);
    case "gemini-3":
      return buildGemini(intent, persona, level);
    case "deepseek-v3":
      return buildDeepSeek(intent, persona, level);
    case "grok-4":
      return buildGrok(intent, persona, level);
    case "composer-2.5":
      return buildComposer(intent, persona, level);
    default:
      return intent;
  }
}

function buildClaude(original: string, intent: string, persona: string, level: OptLevel): string {
  if (level === 2) {
    return `<instructions>\nYou are ${persona}. ${intent}\n</instructions>\n<input>\n${original.trim()}\n</input>`;
  }

  const parts: string[] = [];
  parts.push(`<instructions>\nYou are ${persona}.\n</instructions>`);
  parts.push(`<task>${intent}</task>`);
  if (level >= 3) {
    parts.push(`<context>[Add relevant background and audience here.]</context>`);
    parts.push(`<constraints>[Length, tone, and what to avoid.]</constraints>`);
    parts.push(`<output_format>[Exact response shape.]</output_format>`);
  }
  if (level >= 4) {
    parts.push(`<success_criteria>[2–3 checkable criteria.]</success_criteria>`);
    parts.push(`Before finishing, verify the deliverable meets every success criterion.`);
  }
  return parts.join("\n");
}

function buildGpt(intent: string, persona: string, level: OptLevel): string {
  const parts: string[] = [];
  if (level >= 2) parts.push(`# Role\nYou are ${persona}.`);
  parts.push(`# Task\n${intent}`);
  if (level >= 3) {
    parts.push(`# Context\n[Background and audience.]`);
    parts.push(`# Constraints\n- [constraint 1]\n- [constraint 2]`);
    parts.push(`# Output format\n[Exact response shape.]`);
  }
  if (level >= 4) {
    parts.push(`# Success criteria\n[What must be true for a good answer?]`);
  }
  return parts.join("\n\n");
}

function buildGemini(intent: string, persona: string, level: OptLevel): string {
  const parts: string[] = [];
  if (level >= 2) parts.push(`Persona: You are ${persona}.`);
  parts.push(`Task: ${intent}`);
  if (level >= 3) {
    parts.push(`Steps:\n1. [Analyze the request]\n2. [Apply constraints]\n3. [Produce the deliverable]`);
    parts.push(`Output:\n- [Specify exact format]`);
  }
  if (level >= 4) {
    parts.push(`Separate reasoning (## Reasoning) from the final answer (## Answer).`);
  }
  return parts.join("\n\n");
}

function buildDeepSeek(intent: string, persona: string, level: OptLevel): string {
  const parts: string[] = [`Task: ${intent}`];
  if (level >= 2) parts.unshift(`Role: ${persona}`);
  if (level >= 3) {
    parts.push(`Context:\n- [Background]\n- [Audience]`);
    parts.push(`Constraints:\n- [Length and tone]\n- [What to avoid]`);
    parts.push(`Output format:\n- [Bullet list, table, code, etc.]`);
  }
  if (level >= 4) {
    parts.push(`Think step by step before answering.`);
  }
  return parts.join("\n\n");
}

function buildComposer(intent: string, persona: string, level: OptLevel): string {
  const parts = [`Goal\n- ${intent}`];
  if (level >= 2) {
    parts.push(`Context\n- Role: ${persona}\n- Stack: [tech stack]\n- Relevant files: [key paths]\n- Existing patterns: [conventions to follow]`);
  }
  if (level >= 3) {
    parts.push(`Constraints\n- [Scope boundaries]\n- [Coding rules]\n- [What to avoid]`);
    parts.push(`Process\n1. Inspect relevant files\n2. Summarize understanding\n3. Propose a plan\n4. Wait for approval\n5. Implement in small steps\n6. Verify`);
  }
  if (level >= 4) {
    parts.push(`Output format\n- Use headings\n- Show diffs only\n- End with tests and edge cases`);
    parts.push(`Success criteria\n- [How to tell the work is done]`);
  }
  return parts.join("\n\n");
}

function buildGrok(intent: string, persona: string, level: OptLevel): string {
  if (level === 2) {
    return `GOAL:\n${intent}\n\nCONTEXT:\n- Audience: [who this is for]`;
  }
  const parts = [
    `GOAL:\n${intent}`,
    `CONTEXT:\n- Audience: [who this is for]\n- Role: ${persona}`,
  ];
  if (level >= 3) {
    parts.push(`OUTPUT FORMAT:\n- [Exact structure required]`);
    parts.push(`QUALITY BAR:\n- Include: [must-have points]\n- Avoid: [filler, unsupported claims]`);
  }
  if (level >= 4) {
    parts.push(`If uncertain about facts, say so. Cite sources for specific claims.`);
  }
  return parts.join("\n\n");
}

export function optimizeLocal(req: {
  prompt: string;
  model: ModelId;
  level: OptLevel;
  persona?: string;
}): OptimizeResult {
  const baseline = analyze(req.prompt);
  const pack = getPack(req.model);
  const persona = (req.persona && req.persona.trim()) || derivePersona(req.prompt);
  const optimized = buildGuideOptimized(req.model, req.level, req.prompt, persona);
  const post = analyze(optimized);
  const measuredAdherence = adherenceLevel(post.subscores);
  const adherenceLabel = LEVEL_LABELS[measuredAdherence];
  const diff: DiffSegment[] = buildDiff(req.prompt, optimized);
  const subscores: SubScores = post.subscores;
  const levelLabel = LEVEL_LABELS[req.level];

  return {
    optimizedPrompt: optimized,
    score: post.score,
    baselineScore: baseline.score,
    subscores,
    baselineSubscores: baseline.subscores,
    diff,
    personaSuggestion: req.level >= 2 ? persona : "",
    notes: [
      `Applied ${pack.label} prompting guide (L${req.level} ${levelLabel} target).`,
      `Guide-structuur: ${adherenceLabel} (L${measuredAdherence}).`,
      "Local optimizer (no API key). Add OpenAI key in Settings for LLM refinement.",
    ],
    model: req.model,
    level: req.level,
    adherenceLevel: measuredAdherence,
    source: "local",
    packVersion: pack.version,
  };
}
