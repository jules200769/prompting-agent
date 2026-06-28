// Heuristic 1-100 quality scorer. Same rubric for baseline (original) and
// post-optimization so the score lift is meaningful. Used by the local fallback
// engine AND emitted alongside LLM results (the LLM also scores, but we compute
// a deterministic ground-truth score so the UI never shows a fabricated number).

import type { OptLevel, SubScores } from "../shared/types";
import { RUBRIC_KEYS } from "../shared/types";

function countWords(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function hasPattern(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

const STRUCTURE_PATTERNS = [
  /^\s*#{1,6}\s/m, // markdown headers
  /^\s*[-*]\s/m, // bullets
  /^\s*\d+[.)]\s/m, // numbered lists
  /^\s*>\s/m, // blockquotes
  /<context>|<task>|<constraints>|<output|<success/i,
  /^(role|task|context|constraints|output|format|steps|example)\s*:/im,
];

const FORMAT_PATTERNS = [
  /output\s*(format)?\s*:/i,
  /format\s*:/i,
  /return\s+(as\s+)?(json|markdown|a table|a list|bullet)/i,
  /<output/i,
  /```/i,
  /\*\*subject\*\*|\*\*body\*\*/i,
];

const EXAMPLE_PATTERNS = [
  /\bexample\b/i,
  /\bfor example\b/i,
  /e\.g\./i,
  /few-?shot/i,
  /^\s*example\s*:/im,
];

const PERSONA_PATTERNS = [
  /\byou are\b/i,
  /\bact as\b/i,
  /\bpersona\b/i,
  /\brole\s*:/i,
  /\bas a\b.*\b(specialist|engineer|expert|consultant|writer|analyst|scientist|professor)\b/i,
];

const VERIFY_PATTERNS = [
  /\bsuccess\s*criteria\b/i,
  /\bverif/i,
  /\bchecklist\b/i,
  /\bif you remember\b/i,
  /\bdo not\b|\bdon't\b|\bno\b/i, // constraints imply verifiability-ish
];

const CONTEXT_PATTERNS = [
  /\bcontext\b/i,
  /\baudience\b/i,
  /\bbackground\b/i,
  /\bi (run|am|sell|work|need|manage|lead)\b/i,
  /\bfor a\b/i,
  /\breader\b/i,
];

const CLARITY_BAD = [
  /\bhelp\b/i, // vague verbs
  /\bimprove\b/i,
  /\bmake it\b/i,
  /\bfix\b(?!.)/i, // bare "fix"
  /\bstuff\b/i,
  /\bthings\b/i,
];

export interface Analysis {
  score: number;
  subscores: SubScores;
  weaknesses: string[];
}

function clamp(n: number, max: number): number {
  return Math.max(0, Math.min(max, Math.round(n)));
}

export function analyze(text: string): Analysis {
  const t = text ?? "";
  const words = countWords(t);
  const weaknesses: string[] = [];

  // Clarity (25): penalize vague verbs and too-short prompts; reward length up to a cap.
  let clarity = 8;
  if (words > 8) clarity += 6;
  if (words > 25) clarity += 6;
  if (words > 60) clarity += 5;
  const vagueHits = CLARITY_BAD.filter((p) => p.test(t)).length;
  clarity -= vagueHits * 4;
  if (vagueHits > 0) weaknesses.push("Vague verbs (help/improve/make it) — specify the exact action.");
  if (words < 12) weaknesses.push("Prompt is very short; add what specifically you want.");

  // Context (20): audience/background markers.
  let context = 4;
  if (hasPattern(t, CONTEXT_PATTERNS)) context += 12;
  if (words > 40) context += 4;
  if (!hasPattern(t, CONTEXT_PATTERNS)) weaknesses.push("No audience/context — who is this for and why?");

  // Structure (15): headers, lists, XML, labeled sections.
  let structure = 3;
  if (hasPattern(t, STRUCTURE_PATTERNS)) structure += 12;
  if (!hasPattern(t, STRUCTURE_PATTERNS)) weaknesses.push("Unstructured prose — break into labeled sections.");

  // Format (15): explicit output shape.
  let format = 2;
  if (hasPattern(t, FORMAT_PATTERNS)) format += 13;
  if (!hasPattern(t, FORMAT_PATTERNS)) weaknesses.push("Missing output format — specify the exact response shape.");

  // Examples (10): few-shot / e.g.
  let examples = 0;
  if (hasPattern(t, EXAMPLE_PATTERNS)) examples += 10;
  if (!hasPattern(t, EXAMPLE_PATTERNS)) weaknesses.push("No examples — a worked sample dramatically improves formatting.");

  // Persona (10): expert role.
  let persona = 0;
  if (hasPattern(t, PERSONA_PATTERNS)) persona += 10;
  if (!hasPattern(t, PERSONA_PATTERNS)) weaknesses.push("No expert role — set the persona first.");

  // Verifiability (5): success criteria / checks.
  let verifiability = 1;
  if (hasPattern(t, VERIFY_PATTERNS)) verifiability += 4;
  if (!hasPattern(t, VERIFY_PATTERNS)) weaknesses.push("No success criteria — how will you know it worked?");

  const subscores: SubScores = {
    clarity: clamp(clarity, 25),
    context: clamp(context, 20),
    structure: clamp(structure, 15),
    format: clamp(format, 15),
    examples: clamp(examples, 10),
    persona: clamp(persona, 10),
    verifiability: clamp(verifiability, 5),
  };

  const score = RUBRIC_KEYS.reduce((sum, k) => sum + subscores[k], 0);
  return { score, subscores, weaknesses };
}

export function emptySubscores(): SubScores {
  return { clarity: 0, context: 0, structure: 0, format: 0, examples: 0, persona: 0, verifiability: 0 };
}

/** Max points for guide-structure subscores (structure + format + examples + persona + verifiability). */
const STRUCTURE_ADHERENCE_MAX = 55;

/** Thresholds as fraction of STRUCTURE_ADHERENCE_MAX. */
const ADHERENCE_THRESHOLDS: { min: number; level: OptLevel }[] = [
  { min: 0.8, level: 4 },
  { min: 0.5, level: 3 },
  { min: 0.25, level: 2 },
  { min: 0, level: 1 },
];

/** Classify prompt guide-structure adherence as Cool/Warm/Hot/Max. */
export function adherenceLevel(subscores: SubScores): OptLevel {
  const structureScore =
    subscores.structure +
    subscores.format +
    subscores.examples +
    subscores.persona +
    subscores.verifiability;
  const ratio = structureScore / STRUCTURE_ADHERENCE_MAX;
  for (const { min, level } of ADHERENCE_THRESHOLDS) {
    if (ratio >= min) return level;
  }
  return 1;
}
