// Writing mode meta-prompt: rewrites the user's draft into a finished
// deliverable (email, message, question, explanation). Unlike prompting mode,
// the output is the text itself — never a prompt for another model.

import type { CaptureContext, OptLevel, WritingType } from "../shared/types";
import { WRITING_LEVEL_LABELS } from "../shared/types";
import { buildDestinationContextBlock } from "../shared/contextSignals";

export interface WritingParams {
  prompt: string;
  writingType: WritingType;
  level: OptLevel;
  /** Standing context memory from settings. */
  context?: string;
  /** Destination context from hotkey capture. */
  captureContext?: CaptureContext;
  /** Shell paste: force single-line plain output. */
  terminalContext?: boolean;
}

/** What the model is producing, per writing type. */
const DELIVERABLE: Record<WritingType, string> = {
  email: "a complete, ready-to-send email",
  message: "a short chat/DM message (Slack, WhatsApp, Teams, SMS)",
  question: "a single, clearly phrased question",
  explain: "a clear explanation of the topic in the draft",
};

/** Per-type baseline rules that apply at every level. */
const TYPE_RULES: Record<WritingType, string> = {
  email: `EMAIL RULES:
- Structure as a real email: greeting, body paragraphs, sign-off
- Include a "Subject:" first line if the draft already has one, explicitly asks for one, or the draft is delivering formal news or a one-way decision as a freestanding notice (e.g. announcing an office move, ending a contract, a policy change) — this is a narrow exception. Do NOT add one for status updates/recaps, simple requests or favors, replies, or anything conversational, even if the draft is otherwise standalone
- Use placeholders like [Name] only where the draft leaves a required detail blank — never invent names, dates, or commitments
- Keep it as short as the content allows; no filler like "I hope this email finds you well" unless the tone level calls for formality`,
  message: `MESSAGE RULES:
- This is a chat message, not a letter: no subject line, no formal greeting or sign-off unless the draft has one
- Keep it tight — one short paragraph, or a few short lines if the draft covers multiple points
- Never invent facts, names, or commitments not in the draft`,
  question: `QUESTION RULES:
- Output one primary question; include a second clarifying question only if the draft clearly asks two things
- Keep only the context needed to make the question answerable — strip everything else
- End the question with a question mark`,
  explain: `EXPLANATION RULES:
- Explain the topic or idea in the draft to a reader — do not address the reader about the draft itself
- Keep every fact from the draft; never invent statistics, sources, or examples presented as fact
- Lead with the core point, then supporting detail`,
};

/**
 * Tone/form instruction per type × level. Level meanings come from
 * WRITING_LEVEL_LABELS (email L2 = Formal, question L2 = Closed, …).
 */
const LEVEL_RULES: Record<WritingType, Record<OptLevel, string>> = {
  email: {
    1: STRUCTURE_ONLY("email"),
    2: `TONE — FORMAL:
- Professional business tone: courteous, precise, complete sentences
- No contractions, slang, or exclamation marks
- Formal greeting and sign-off (e.g. "Dear …", "Kind regards,")`,
    3: `TONE — FRIENDLY:
- Warm and personable but still professional
- Contractions are fine; positive, approachable phrasing
- Relaxed greeting and sign-off (e.g. "Hi …", "Best,")`,
    4: `TONE — INFORMAL:
- Casual, like emailing someone you know well
- Short and direct; contractions and light colloquialisms are fine
- Minimal greeting/sign-off (e.g. "Hey …", "Cheers")`,
  },
  message: {
    1: STRUCTURE_ONLY("message"),
    2: `TONE — INFORMAL:
- Casual chat tone: contractions, relaxed phrasing, brief
- Emoji only if the draft already uses them`,
    3: `TONE — FORMAL:
- Polite, professional message tone (e.g. to a manager or client)
- Complete sentences, no slang, no emoji`,
    4: `TONE — AUTO:
- Infer the best tone from the draft's content and the destination context (recipient, app)
- A message to a boss/client reads professional; to a friend/colleague reads casual`,
  },
  question: {
    1: STRUCTURE_ONLY("question"),
    2: `FORM — CLOSED QUESTION:
- Rephrase as a closed question with a specific, verifiable answer (yes/no, a number, a date, a choice between named options)
- Make the decision criteria or options explicit so a one-line answer is possible`,
    3: `FORM — OPEN QUESTION:
- Rephrase as an open-ended question that invites explanation, reasoning, or options — it must NOT be answerable by "yes"/"no" or a single word
- Begin with "how", "why", "what", or "what would…", never with "is/are/was/does/do/did/can/could/has/have/will/should"
- If the draft is a yes/no or either-or question, convert it to the open version of the same underlying intent (e.g. "is it done?" → "what's left before it's done?"; "does X work offline?" → "how does X behave offline?")
- Ask exactly one open question; if the draft raises several angles, pick the single most important one rather than chaining them with "and"/"or"`,
    4: `FORM — AUTO:
- Choose the question form (open or closed) that best fits what the draft is actually trying to find out`,
  },
  explain: {
    1: `${STRUCTURE_ONLY("explanation")}
- The draft is normally phrased as a question or a request to explain ("why does X happen", "can you explain X", "explain X", "how does X work", "leg uit …"). The finished text must BE the explanation, never the request restated — never output a question or a "Can you explain…" line; answer it directly in the draft's own wording and register
- Keep it brief and close to the draft — a sentence or two at this level. Where the draft doesn't state the cause or details, explain in general, hedged terms ("usually", "typically", "likely") and do not assert specific facts, numbers, sources, or examples the draft doesn't contain
- If the draft names a specific situation without stating its cause (e.g. "the pipeline sometimes fails," "my code gets slower"), do not invent a specific cause for that situation — hedge instead ("common causes include…", "this can happen when…") rather than asserting a definite reason. But if the draft is asking about a general mechanism or concept (e.g. "why do refresh tokens exist," "how does caching work"), answer using well-established general knowledge about that mechanism — that IS the explanation being asked for, not an invented fact`,
    2: `STYLE — SIMPLE:
- Plain language for a general audience: short sentences, no jargon
- Explain any unavoidable technical term in one clause; one everyday analogy is allowed if it genuinely helps`,
    3: `STYLE — TECHNICAL:
- Precise, domain-correct terminology for a knowledgeable audience
- No dumbing down; state mechanisms, causes, and trade-offs exactly`,
    4: `STYLE — STEP BY STEP:
- Present the explanation as a numbered sequence of steps or stages
- One idea per step, in logical or chronological order
- Start directly with the first step — no introductory or preamble line before the list`,
  },
};

function STRUCTURE_ONLY(deliverable: string): string {
  return `TONE — STRUCTURE ONLY (mandatory):
- Keep the user's own wording, tone, and vocabulary — this level only cleans up, it does NOT restyle the tone. Do not upgrade casual or broken phrasing into formal phrasing
- Fix grammar, spelling, and punctuation; reorder or split sentences only where needed for a coherent ${deliverable}
- Still give it the minimal required shape of a ${deliverable} as defined in the rules above — if the type's rules call for a greeting and sign-off unconditionally, add a plain, minimal one even when the draft has none; for anything the type's own rules leave conditional (e.g. a Subject line), apply that exact condition here too — do not add it just because this level formats the piece as a complete ${deliverable}
- Beyond that structural minimum, do not add tone, embellishment, facts, or content the draft doesn't contain`;
}

export function writingToneLabel(type: WritingType, level: OptLevel): string {
  return WRITING_LEVEL_LABELS[type][level];
}

export function buildWritingMetaPrompt(params: WritingParams): { system: string; user: string } {
  const type = params.writingType;
  const deliverable = DELIVERABLE[type];
  const toneLabel = writingToneLabel(type, params.level);

  const terminalRule = params.terminalContext
    ? `
TERMINAL SHELL (mandatory — overrides any structure rules above):
- The user will paste this into a command-line prompt that accepts ONE line only
- Output a SINGLE line of plain text: NO line breaks anywhere
- Join clauses with spaces or semicolons; never press Enter between parts
- This governs line formatting only — still produce the required deliverable and writing type (an explanation stays an explanation, a question stays a question), just collapsed onto one line
- Even a full email (subject, greeting, body, sign-off) collapses into that single line — there are no structural exceptions
`
    : "";

  const contextLine = params.context?.trim()
    ? `\nStanding context about the user to draw on where relevant (never quote it verbatim): ${params.context.trim()}\n`
    : "";

  const destinationContextBlock = buildDestinationContextBlock(params.captureContext);

  const system = `You are an expert writer and editor. Rewrite the user's draft as ${deliverable}. The result is the final text the user will send or use directly — it is NOT a prompt for an AI and NOT advice about the draft.

${TYPE_RULES[type]}

${LEVEL_RULES[type][params.level]}
${terminalRule}${destinationContextBlock}${contextLine}
OUTPUT RULES (strict):
- Write in the same language as the user's draft
- Preserve the user's intent and every stated fact; never invent details about their situation
- Return ONLY the finished text as plain ${params.terminalContext ? "single-line " : ""}text
- No markdown fences, no commentary, no options, no preamble like "Here is..."
- The output must be ready to send as-is (target: ${toneLabel})`;

  const user = `Rewrite this draft:\n"""\n${params.prompt}\n"""`;
  return { system, user };
}
