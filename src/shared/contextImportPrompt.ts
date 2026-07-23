// The prompt the user copies into their external AI chat (ChatGPT, Claude, …)
// to export that session's working context. The AI's answer is pasted back into
// the Import-context modal and becomes standing session context for refinements.

export type ContextImportScope = "session" | "project";

/**
 * The six numbered section labels each import prompt asks the external AI to
 * emit, in order. Single source of truth — mirrored by the prompt bodies below
 * and consumed by contextSummaryDetect to recognize a pasted-back summary.
 */
export const SESSION_SUMMARY_LABELS = [
  "GOAL",
  "CURRENT STATE",
  "KEY FACTS & DECISIONS",
  "CONSTRAINTS & PREFERENCES",
  "TERMINOLOGY & NAMES",
  "OPEN ITEMS",
] as const;

export const PROJECT_SUMMARY_LABELS = [
  "PROJECT",
  "STACK & ARCHITECTURE",
  "CONVENTIONS",
  "KEY FACTS & DECISIONS",
  "CONSTRAINTS & PREFERENCES",
  "TERMINOLOGY & NAMES",
] as const;

export const CONTEXT_IMPORT_PROMPT = `You are helping me export the context of this chat session so another tool (Anvyll at anvyll.app, a prompt-refinement assistant) can use it as background knowledge when improving my future prompts for this same session.

Summarize the working context of this conversation. Follow these rules exactly.

ACCURACY
- Use only information that actually appears in this conversation. Do not invent, assume, or embellish anything.
- If a section below was never discussed, write "not established" for it.
- Preserve the exact spelling of names, file names, function names, product names, versions, and technical terms.

WHAT TO INCLUDE
1. GOAL — what I am ultimately trying to achieve in this session, in 1-2 sentences.
2. CURRENT STATE — where the work stands right now: what is done, what is in progress, what just happened.
3. KEY FACTS & DECISIONS — important facts, choices already made, and approaches that were agreed on.
4. CONSTRAINTS & PREFERENCES — requirements, limits, tone or style preferences, and anything I said to avoid.
5. TERMINOLOGY & NAMES — exact names of files, functions, components, tools, libraries, versions, or people that were mentioned.
6. OPEN ITEMS — unresolved questions or the agreed next step.

FORMAT
- Plain text only. Use the six numbered section labels above; no other headers, no markdown, no code fences.
- Under each label write compact, factual sentences or short dash lines — no filler, no explanation of what you are doing.
- Keep the entire output under 250 words.
- Output only the summary itself: no preamble like "Here is...", and no closing remarks.`;

// Same export flow as CONTEXT_IMPORT_PROMPT, but for standing project knowledge
// that should survive across sessions (stack, conventions, architecture).

export const PROJECT_CONTEXT_IMPORT_PROMPT = `You are helping me export the context of this project so another tool (Anvyll at anvyll.app, a prompt-refinement assistant) can use it as background knowledge when improving my future prompts for this same project.

Summarize the lasting project context from this conversation and any project materials discussed. Follow these rules exactly.

ACCURACY
- Use only information that actually appears in this conversation or was clearly stated about the project. Do not invent, assume, or embellish anything.
- If a section below was never established, write "not established" for it.
- Preserve the exact spelling of names, file names, function names, product names, versions, and technical terms.

WHAT TO INCLUDE
1. PROJECT — what this project is and its purpose, in 1-2 sentences.
2. STACK & ARCHITECTURE — languages, frameworks, services, repo layout, and how major pieces fit together.
3. CONVENTIONS — coding style, patterns, naming, tooling, and workflows that should be followed.
4. KEY FACTS & DECISIONS — important product or technical facts, choices already made, and approaches that were agreed on for the project.
5. CONSTRAINTS & PREFERENCES — requirements, limits, tone or style preferences, and anything I said to avoid.
6. TERMINOLOGY & NAMES — exact names of modules, packages, APIs, environments, products, or people that matter for this project.

FORMAT
- Plain text only. Use the six numbered section labels above; no other headers, no markdown, no code fences.
- Under each label write compact, factual sentences or short dash lines — no filler, no explanation of what you are doing.
- Keep the entire output under 250 words.
- Output only the summary itself: no preamble like "Here is...", and no closing remarks.`;

export function contextImportPromptFor(scope: ContextImportScope): string {
  return scope === "project" ? PROJECT_CONTEXT_IMPORT_PROMPT : CONTEXT_IMPORT_PROMPT;
}

function formatLabelList(labels: readonly string[]): string {
  return labels.map((label, i) => `${i + 1}. ${label} — …`).join("\n");
}

/**
 * Meta-prompt for compacting a long pasted import into Anvyll's six-label summary.
 * Output must stay compatible with detectContextSummary and deriveSessionTitle.
 */
export function buildContextCompactPrompt(
  scope: ContextImportScope,
  rawText: string,
): { system: string; user: string } {
  const labels = scope === "project" ? PROJECT_SUMMARY_LABELS : SESSION_SUMMARY_LABELS;
  const scopeNoun = scope === "project" ? "project" : "session";
  const labelBlock = formatLabelList(labels);

  const system = `You compress raw working notes or chat history into a standing ${scopeNoun} context summary for Anvyll (anvyll.app), a prompt-refinement assistant.

ACCURACY
- Use only information that actually appears in the source text. Do not invent, assume, or embellish anything.
- If a section was never discussed, write "not established" for it.
- Preserve the exact spelling of names, file names, function names, product names, versions, and technical terms.

FORMAT (mandatory)
- Plain text only. Use exactly these six numbered section labels in this order:
${labelBlock}
- Under each label write compact, factual sentences or short dash lines — no filler, no explanation of what you are doing.
- Keep the entire output under 250 words and under 4000 characters.
- Output only the summary itself: no preamble like "Here is...", and no closing remarks.`;

  const user = `Compact this source material into the ${scopeNoun} context summary:\n"""\n${rawText.trim()}\n"""`;

  return { system, user };
}

export interface SessionMemoryRefreshInput {
  currentContext: string;
  projectContext?: string;
  activityDelta: string;
}

/**
 * Meta-prompt for refreshing session standing context after Apply/Copy activity.
 * Output stays compatible with detectContextSummary and deriveSessionTitle.
 */
export function buildSessionMemoryRefreshPrompt(
  input: SessionMemoryRefreshInput,
): { system: string; user: string } {
  const labelBlock = formatLabelList(SESSION_SUMMARY_LABELS);
  const current = input.currentContext.trim();
  const project = input.projectContext?.trim() ?? "";

  const system = `You maintain a standing session context summary for Anvyll (anvyll.app), a prompt-refinement assistant.

Your job: merge new Apply/Copy activity into the session summary. Distill decisions and state — do NOT paste refined prompts verbatim into the summary.

ACCURACY
- Use only information from the existing session context, optional project background, and the activity delta. Do not invent, assume, or embellish anything.
- If a section was never discussed, write "not established" for it.
- Preserve the exact spelling of names, file names, function names, product names, versions, and technical terms.
- Prefer updating CURRENT STATE, KEY FACTS & DECISIONS, and OPEN ITEMS from the activity delta.
- Keep GOAL stable unless the activity clearly changes what the user is trying to achieve.
- Project background (if provided) is read-only reference — never merge it into project storage; session context wins over project on conflict.

FORMAT (mandatory)
- Plain text only. Use exactly these six numbered section labels in this order:
${labelBlock}
- Under each label write compact, factual sentences or short dash lines — no filler, no explanation of what you are doing.
- Keep the entire output under 250 words and under 4000 characters.
- Output only the summary itself: no preamble like "Here is...", and no closing remarks.`;

  const parts: string[] = [];
  if (current) {
    parts.push(`EXISTING SESSION CONTEXT:\n"""\n${current}\n"""`);
  } else {
    parts.push("EXISTING SESSION CONTEXT: (empty — bootstrap from the activity delta)");
  }
  if (project) {
    parts.push(`PROJECT BACKGROUND (read-only, do not copy verbatim):\n"""\n${project}\n"""`);
  }
  parts.push(`NEW ACTIVITY (Apply/Copy since last refresh — distill, do not copy refined text verbatim):\n"""\n${input.activityDelta.trim()}\n"""`);

  const user = parts.join("\n\n");

  return { system, user };
}
