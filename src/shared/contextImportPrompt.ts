// The prompt the user copies into their external AI chat (ChatGPT, Claude, …)
// to export that session's working context. The AI's answer is pasted back into
// the Import-context modal and becomes standing session context for refinements.

export const CONTEXT_IMPORT_PROMPT = `You are helping me export the context of this chat session so another tool (ANVYL.ai, a prompt-refinement assistant) can use it as background knowledge when improving my future prompts for this same session.

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
