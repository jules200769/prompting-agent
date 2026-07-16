// One-off closeout-confirmation helper: manually judge specific records
// regardless of deterministicPass, for drafts (email-h1/h3) that are EXPECTED
// to fail the hard subjectLineConditional checker by design (the checker can't
// distinguish justified standalone-notice subjects from invented ones — see
// FINAL_SCOREBOARD.md §4.1). The automated writing-judge.cjs pipeline
// structurally skips deterministicPass:false records to save cost, so this
// fills that gap for a small, targeted sample.
//
// Run: node scripts/writing-judge-manual.cjs <in.checked.jsonl> <out.json> <draftId> [...moreDraftIds]

const { readFileSync, writeFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const REPO_ROOT = join(__dirname, "..");

function resolveApiKey() {
  const fromEnv = process.env.OPENAI_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  const envLocal = join(REPO_ROOT, ".env.local");
  if (existsSync(envLocal)) {
    const match = readFileSync(envLocal, "utf8").match(/^OPENAI_API_KEY=(.+)$/m);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  const electronKey = spawnSync("npx", ["electron", "scripts/read-openai-key.cjs"], {
    encoding: "utf8", timeout: 20000, shell: true, cwd: REPO_ROOT,
  });
  const key = electronKey.stdout?.trim();
  if (key && key.startsWith("sk-")) return key;
  return undefined;
}

const RUBRIC_KEYS = ["intentPreservation","factualFidelity","typeCompliance","levelToneFit","naturalness","readinessToSend","contextFit"];
const JUDGE_SYSTEM = `You are a strict, consistent quality judge for a "writing mode" AI feature. Given a user's rough draft and the AI's rewritten deliverable, score the rewrite 0-10 on each dimension. Be skeptical: a 9-10 means the output is genuinely ready to send/use as-is with no edits. Penalize invented facts, wrong tone/level for the target, leftover draft artifacts, and any preamble/commentary.

Dimensions (each 0-10, integer):
- intentPreservation: does the output accomplish what the draft was trying to do?
- factualFidelity: no invented or altered facts, names, dates, numbers, commitments (0 if any invention).
- typeCompliance: matches the required deliverable type's structural rules (email/message/question/explain).
- levelToneFit: matches the named tone/form target for the level exactly (not over- or under-shot).
- naturalness: reads like a human wrote it, not like an AI restating the draft.
- readinessToSend: could be sent/used with zero further edits.
- contextFit: if destination context was provided, output fits it (tone/terminology/continuity) without adding unsupported facts; score 10 if no context was provided (not applicable).

Respond with ONLY a JSON object: {"scores": {"intentPreservation": n, "factualFidelity": n, "typeCompliance": n, "levelToneFit": n, "naturalness": n, "readinessToSend": n, "contextFit": n}, "justification": "one or two sentences"}`;

async function judgeOne(apiKey, record) {
  const OpenAI = require("openai").default ?? require("openai");
  const client = new OpenAI({ apiKey });
  const userMsg = `WRITING TYPE: ${record.writingType}
LEVEL: ${record.level} (target tone/form is encoded in the system prompt the rewriter received)
TERMINAL MODE: ${record.terminalContext}
DESTINATION CONTEXT PROVIDED: ${record.captureContextPreset ? `yes (${record.captureContextPreset})` : "no"}

ORIGINAL DRAFT:
"""
${record.request?.prompt ?? ""}
"""

REWRITER'S SYSTEM PROMPT (for reference on what it was told to do):
"""
${record.systemPrompt}
"""

AI'S REWRITTEN OUTPUT:
"""
${record.rawOutput}
"""`;
  const completion = await client.chat.completions.create({
    model: "gpt-4.1", temperature: 0,
    messages: [{ role: "system", content: JUDGE_SYSTEM }, { role: "user", content: userMsg }],
    response_format: { type: "json_object" },
  });
  const raw = completion.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw);
  const scores = {};
  for (const k of RUBRIC_KEYS) { const v = parsed?.scores?.[k]; scores[k] = typeof v === "number" ? v : null; }
  const vals = RUBRIC_KEYS.map((k) => scores[k]).filter((v) => typeof v === "number");
  const mean = vals.length ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)) : null;
  return { scores, mean, justification: parsed?.justification ?? "" };
}

async function main() {
  const [inFile, outFile, ...draftIds] = process.argv.slice(2);
  const apiKey = resolveApiKey();
  if (!apiKey) { console.error("No API key"); process.exit(1); }
  const records = readFileSync(inFile, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const targets = records.filter((r) => draftIds.includes(r.draftId));
  const results = [];
  for (const r of targets) {
    const { scores, mean, justification } = await judgeOne(apiKey, r);
    results.push({ draftId: r.draftId, level: r.level, terminalContext: r.terminalContext, captureContextPreset: r.captureContextPreset, repeatIndex: r.repeatIndex, rawOutput: r.rawOutput, checks: r.checks, scores, mean, justification });
    process.stdout.write(".");
  }
  writeFileSync(outFile, JSON.stringify(results, null, 2), "utf8");
  console.log(`\nWrote ${results.length} manual judgments to ${outFile}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
