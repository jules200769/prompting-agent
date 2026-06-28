// Loads per-model prompting guides from prompting-guides/ with level-based excerpts.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ModelId, OptLevel } from "../shared/types";
import { LEVEL_LABELS } from "../shared/types";

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
    1: `Level 1 (Cool — ${label} guide structure): Minimal rewrite. Fix typos and ambiguity only. Keep the user's sentences and order. Apply only the lightest guide formatting if clearly beneficial.`,
    2: `Level 2 (Warm — ${label} guide structure): Light model-native structure (e.g. XML tags for Claude, markdown headers for GPT). Preserve all user content; reorganize slightly for clarity.`,
    3: `Level 3 (Hot — ${label} guide structure): Full guide-compliant structure — context, task, constraints, and output format sections as the guide prescribes. Do not invent facts; use brief placeholders only where the user left gaps.`,
    4: `Level 4 (Max — ${label} guide structure): Apply the complete guide methodology including examples, verification/success criteria, and advanced patterns from the guide where relevant. Still preserve user intent.`,
  };
  return lines[level];
}

/** Clear cache (for tests). */
export function clearGuideCache(): void {
  fullCache.clear();
}
