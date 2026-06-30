// Loads per-model prompting guides from prompting-guides/ with level-based excerpts.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ModelId, OptLevel } from "../shared/types";
import { LEVEL_LABELS } from "../shared/types";

/** Bump when meta-prompt / structure contract changes — invalidates persisted opt cache. */
export const REWRITE_PIPELINE_VERSION = 2;

const GUIDE_FILES: Record<ModelId, string> = {
  "claude-opus-4.8": "opus4.8.md",
  "gpt-5": "gpt5.5.md",
  "gemini-3": "gemini.3.pro.md",
  "deepseek-v3": "deepseek.V3.md",
  "grok-4": "grok4.md",
  "composer-2.5": "composer2.5.md",
};

/** Max characters of guide text injected per level (token budget). */
const LEVEL_CHAR_LIMIT: Record<OptLevel, number> = {
  1: 3000,
  2: 6000,
  3: 9000,
  4: 12000,
};

const fullCache = new Map<ModelId, string>();

function guidesDir(): string {
  const candidates = [
    join(process.cwd(), "prompting-guides"),
    join(__dirname, "..", "..", "prompting-guides"),
    ...(process.resourcesPath ? [join(process.resourcesPath, "prompting-guides")] : []),
  ];
  for (const d of candidates) {
    if (existsSync(d)) return d;
  }
  return join(process.cwd(), "prompting-guides");
}

export function loadGuideFull(model: ModelId): string {
  const cached = fullCache.get(model);
  if (cached !== undefined) return cached;

  const file = GUIDE_FILES[model];
  const path = join(guidesDir(), file);
  if (!existsSync(path)) {
    throw new Error(`Prompting guide not found: ${path}`);
  }
  const text = readFileSync(path, "utf-8");
  fullCache.set(model, text);
  return text;
}

/** Prefer sections whose headings match level-relevant keywords, then fill budget. */
export function getGuideExcerpt(model: ModelId, level: OptLevel): string {
  const full = loadGuideFull(model);
  const limit = LEVEL_CHAR_LIMIT[level];

  if (full.length <= limit) return full;

  const sections = splitSections(full);
  if (sections.length <= 1) return full.slice(0, limit);

  const keywords = levelKeywords(level);
  const picked: string[] = [];
  let size = 0;

  const score = (heading: string): number => {
    const h = heading.toLowerCase();
    let s = 0;
    for (const kw of keywords) {
      if (h.includes(kw)) s += 10;
    }
    if (level >= 2 && (h.includes("example") || h.includes("template"))) s += 5;
    if (level >= 3 && (h.includes("strateg") || h.includes("technique") || h.includes("pattern"))) s += 4;
    if (level >= 4 && (h.includes("advanced") || h.includes("maximum") || h.includes("critique"))) s += 3;
    return s;
  };

  const ranked = [...sections].sort((a, b) => score(b.heading) - score(a.heading));

  // Always include the intro (first section) for model context.
  const intro = sections[0];
  picked.push(intro.body);
  size += intro.body.length;

  for (const sec of ranked) {
    if (sec === intro) continue;
    if (size + sec.body.length > limit) continue;
    picked.push(sec.body);
    size += sec.body.length;
  }

  let excerpt = picked.join("\n\n");
  if (excerpt.length < limit * 0.5) {
    excerpt = full.slice(0, limit);
  } else if (excerpt.length > limit) {
    excerpt = excerpt.slice(0, limit);
  }
  return excerpt.trim();
}

function splitSections(md: string): { heading: string; body: string }[] {
  const lines = md.split("\n");
  const sections: { heading: string; body: string }[] = [];
  let current: string[] = [];
  let heading = "";

  for (const line of lines) {
    if (/^#{1,3}\s+/.test(line)) {
      if (current.length) {
        sections.push({ heading, body: current.join("\n").trim() });
      }
      heading = line.replace(/^#+\s+/, "");
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length) {
    sections.push({ heading, body: current.join("\n").trim() });
  }
  return sections.length ? sections : [{ heading: "", body: md }];
}

function levelKeywords(level: OptLevel): string[] {
  const base = ["prompt", "formula", "structure", "best", "guide", "key", "takeaway"];
  if (level >= 2) base.push("format", "role", "persona", "task", "context");
  if (level >= 3) base.push("constraint", "output", "verification", "reasoning");
  if (level >= 4) base.push("example", "critique", "effort", "thinking", "advanced");
  return base;
}

export function getLevelRewriteInstruction(level: OptLevel): string {
  const label = LEVEL_LABELS[level];
  const lines: Record<OptLevel, string> = {
    1: `Level 1 (Cool — ${label} guide structure): Minimal rewrite only. Fix typos, capitalization, punctuation, and one-line ambiguities. Keep the user's sentences and order. No XML, no markdown headers, no role/persona, no new sections.`,
    2: `Level 2 (Warm — ${label} guide structure): Light model-native structure per the STRUCTURE CONTRACT below. Preserve all user facts; a short role plus imperative task summary only in the instructions section — never duplicate the full prompt there.`,
    3: `Level 3 (Hot — ${label} guide structure): Full guide-compliant structure per the STRUCTURE CONTRACT — for every task type (coding, writing, analysis). Do not invent facts; use brief placeholders only where the user left gaps.`,
    4: `Level 4 (Max — ${label} guide structure): Everything in Level 3 plus examples and measurable success criteria per the STRUCTURE CONTRACT. Still preserve user intent and exact factual phrases.`,
  };
  return lines[level];
}

type StructureFormat = "xml" | "markdown" | "gemini" | "composer" | "deepseek";

function structureFormat(model: ModelId): StructureFormat {
  switch (model) {
    case "gpt-5":
      return "markdown";
    case "gemini-3":
      return "gemini";
    case "composer-2.5":
      return "composer";
    case "deepseek-v3":
      return "deepseek";
    default:
      return "xml";
  }
}

/** Mandatory output shape per target model and level — enforced in buildMetaPrompt. */
export function getLevelStructureContract(model: ModelId, level: OptLevel): string {
  if (level === 1) {
    return `STRUCTURE CONTRACT (mandatory):
- Output plain prose only: NO XML tags, NO markdown section headers, NO role/persona block
- Keep the user's sentence order; edit in place (typos, capitalization, punctuation, one-line clarifications only)
- Do NOT paraphrase the full prompt or restructure into sections`;
  }

  const fmt = structureFormat(model);

  if (fmt === "xml") {
    if (level === 2) {
      return `STRUCTURE CONTRACT (mandatory):
- Use exactly two XML sections: <instructions> and <input>
- <instructions>: one short expert role (if helpful) + imperative task summary — do NOT paste the full user prompt here
- <input>: the user's prompt verbatim (light typo fixes only); this is the source-of-truth text
- Do NOT duplicate the same content across both tags`;
    }
    if (level === 3) {
      return `STRUCTURE CONTRACT (mandatory):
- Use separate XML sections: <context>, <task>, <constraints>, <output_format> (optional brief <instructions> for role only)
- Apply to ALL task types (coding, writing, analysis) — not only code tasks
- <output_format>: specify the exact deliverable shape (e.g. email with Subject line; code plus brief change notes)
- Use brief placeholders like [detail TBD] where the user left gaps; do not invent facts
- Reframe negative constraints ("don't blame") as positive guidance where possible`;
    }
    return `STRUCTURE CONTRACT (mandatory):
- Level 4 is Level 3 expanded — do NOT replace or collapse Level 3 sections into <instructions> alone
- REQUIRED tags (all mandatory): <context>, <task>, <constraints>, <output_format>, <examples>, <success_criteria>
- Optional: brief <instructions> for role only — never paste the full user prompt there
- <examples>: at least one brief pattern showing desired tone, format, or answer structure (no invented facts)
- <success_criteria>: 2–3 concrete, checkable criteria the final answer must satisfy
- End with a brief verification line: confirm the deliverable meets every success criterion before finishing`;
  }

  if (fmt === "markdown") {
    if (level === 2) {
      return `STRUCTURE CONTRACT (mandatory):
- Use markdown headers: ## Instructions and ## Input
- ## Instructions: short role + imperative task summary — do NOT paste the full user prompt here
- ## Input: user prompt verbatim (light typo fixes only)
- Do NOT duplicate content between sections`;
    }
    if (level === 3) {
      return `STRUCTURE CONTRACT (mandatory):
- Use ## Context, ## Task, ## Constraints, ## Output format (optional ## Instructions for role)
- Apply to ALL task types; specify exact deliverable shape in Output format
- Use [detail TBD] placeholders for gaps; reframe negatives as positive guidance`;
    }
    return `STRUCTURE CONTRACT (mandatory):
- Level 4 is Level 3 expanded — keep every Level 3 header; do not collapse into Instructions alone
- REQUIRED: ## Context, ## Task, ## Constraints, ## Output format, ## Examples, ## Success criteria
- End with a brief verification line before finishing`;
  }

  if (fmt === "gemini") {
    if (level === 2) {
      return `STRUCTURE CONTRACT (mandatory):
- Persona: one line. Task: imperative summary. Input: user prompt verbatim on its own line — no duplication`;
    }
    if (level === 3) {
      return `STRUCTURE CONTRACT (mandatory):
- Separate Context, Task, Constraints, and Output blocks for all task types`;
    }
    return `STRUCTURE CONTRACT (mandatory):
- Level 4 expands Level 3 — keep Context, Task, Constraints, and Output blocks; add Examples and Success criteria (2–3 checkable items)`;
  }

  if (fmt === "composer") {
    if (level === 2) {
      return `STRUCTURE CONTRACT (mandatory):
- Goal: imperative summary. Context: role only. Input: user prompt verbatim — no duplication`;
    }
    if (level === 3) {
      return `STRUCTURE CONTRACT (mandatory):
- Goal, Context, Constraints, and Output format sections for all task types`;
    }
    return `STRUCTURE CONTRACT (mandatory):
- Level 4 expands Level 3 — keep Goal, Context, Constraints, and Output format; add Examples and Success criteria (2–3 checkable items)`;
  }

  // deepseek
  if (level === 2) {
    return `STRUCTURE CONTRACT (mandatory):
- Role + Task summary, then Input with user prompt verbatim — no duplication`;
  }
  if (level === 3) {
    return `STRUCTURE CONTRACT (mandatory):
- Context, Task, Constraints, and Output format for all task types`;
  }
  return `STRUCTURE CONTRACT (mandatory):
- Level 4 expands Level 3 — keep Context, Task, Constraints, and Output format; add Examples and Success criteria (2–3 checkable items)`;
}

/** Clear cache (for tests). */
export function clearGuideCache(): void {
  fullCache.clear();
}
