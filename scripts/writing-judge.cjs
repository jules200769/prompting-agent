// Agent 5 — LLM judge over records that already passed deterministic checks.
// Fixed judge model + temperature 0 for reproducibility. Reads a *.checked.jsonl
// file (from writing-check.cjs), judges each deterministicPass:true record,
// writes a sibling *.judged.jsonl and an aggregated scoreboard.judged.json.
//
// PREREQUISITE: an OpenAI API key resolvable the same way writing-round.cjs
// resolves one (env, .env.local, or Electron keyStore — never printed).
//
// Run with: node scripts/writing-judge.cjs <path-to-shard.checked.jsonl> [...more]
//
// Rubric (0-10 each, per .cursor/plans/codex.agent.plan.md §2 Agent 5):
//   intentPreservation, factualFidelity, typeCompliance, levelToneFit,
//   naturalness, readinessToSend, contextFit (0 if no destination context supplied)

const { existsSync, readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const REPO_ROOT = join(__dirname, "..");
const JUDGE_MODEL = process.env.WRITING_JUDGE_MODEL ?? "gpt-4.1";
const JUDGE_TEMPERATURE = 0;

function resolveApiKey() {
  const fromEnv = process.env.OPENAI_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  const envLocal = join(REPO_ROOT, ".env.local");
  if (existsSync(envLocal)) {
    const match = readFileSync(envLocal, "utf8").match(/^OPENAI_API_KEY=(.+)$/m);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  const electronKey = spawnSync("npx", ["electron", "scripts/read-openai-key.cjs"], {
    encoding: "utf8",
    timeout: 20000,
    shell: true,
    cwd: REPO_ROOT,
  });
  const key = electronKey.stdout?.trim();
  if (key && key.startsWith("sk-")) return key;
  return undefined;
}

const RUBRIC_KEYS = [
  "intentPreservation",
  "factualFidelity",
  "typeCompliance",
  "levelToneFit",
  "naturalness",
  "readinessToSend",
  "contextFit",
];

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function judgeOne(apiKey, record, attempt = 0) {
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

  let completion;
  try {
    completion = await client.chat.completions.create({
      model: JUDGE_MODEL,
      temperature: JUDGE_TEMPERATURE,
      messages: [
        { role: "system", content: JUDGE_SYSTEM },
        { role: "user", content: userMsg },
      ],
      response_format: { type: "json_object" },
    });
  } catch (e) {
    const status = e?.status;
    if (status === 429 && attempt < 5) {
      const hinted = Number(String(e?.message ?? "").match(/try again in ([\d.]+)s/i)?.[1]);
      const waitMs = Number.isFinite(hinted) ? hinted * 1000 + 250 : 2 ** attempt * 1000;
      await sleep(waitMs);
      return judgeOne(apiKey, record, attempt + 1);
    }
    throw e;
  }
  const raw = completion.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw);
  const scores = {};
  for (const k of RUBRIC_KEYS) {
    const v = parsed?.scores?.[k];
    scores[k] = typeof v === "number" ? v : null;
  }
  return { scores, justification: parsed?.justification ?? "" };
}

function meanScore(scores) {
  const vals = RUBRIC_KEYS.map((k) => scores[k]).filter((v) => typeof v === "number");
  if (!vals.length) return null;
  return Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2));
}

function cellKey(r) {
  return [r.writingType, `L${r.level}`, r.terminalContext ? "terminal" : "normal", r.captureContextPreset ? `ctx:${r.captureContextPreset}` : "ctx:off"].join("|");
}

async function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error("Usage: node scripts/writing-judge.cjs <shard.checked.jsonl> [...more]");
    process.exit(1);
  }
  const apiKey = resolveApiKey();
  if (!apiKey) {
    console.error("[writing-judge] No API key resolvable (env / .env.local / Electron keyStore). Aborting — judge requires a real LLM call.");
    process.exit(1);
  }

  const cellStats = new Map();

  for (const file of files) {
    const isRetry = file.endsWith(".judged.jsonl");
    const records = readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
    const judged = [];
    let i = 0;
    for (const r of records) {
      i++;
      if (!r.deterministicPass) {
        judged.push(isRetry ? r : { ...r, judge: null, judgeSkippedReason: "failed deterministic checks" });
        process.stdout.write("_");
        continue;
      }
      if (isRetry && r.judge) {
        // Already judged successfully in a prior pass — keep as-is, don't re-spend.
        judged.push(r);
        const key = cellKey(r);
        const stat = cellStats.get(key) ?? { key, scores: [] };
        if (typeof r.judge.mean === "number") stat.scores.push(r.judge.mean);
        cellStats.set(key, stat);
        process.stdout.write("=");
        continue;
      }
      try {
        const { scores, justification } = await judgeOne(apiKey, r);
        const mean = meanScore(scores);
        judged.push({ ...r, judge: { model: JUDGE_MODEL, temperature: JUDGE_TEMPERATURE, scores, mean, justification } });

        const key = cellKey(r);
        const stat = cellStats.get(key) ?? { key, scores: [] };
        if (mean !== null) stat.scores.push(mean);
        cellStats.set(key, stat);
        process.stdout.write(".");
      } catch (e) {
        judged.push({ ...r, judge: null, judgeError: e instanceof Error ? e.message : String(e) });
        process.stdout.write("E");
      }
    }
    const outPath = file.replace(/\.checked\.jsonl$/, ".judged.jsonl");
    writeFileSync(outPath, judged.map((j) => JSON.stringify(j)).join("\n") + "\n", "utf8");
    console.log(`\n[writing-judge] ${file} -> ${outPath} (${judged.length} records, ${i} processed)`);
  }

  function stdev(nums, mean) {
    if (nums.length < 2) return 0;
    const variance = nums.reduce((a, n) => a + (n - mean) ** 2, 0) / (nums.length - 1);
    return Number(Math.sqrt(variance).toFixed(2));
  }

  const scoreboard = Array.from(cellStats.values())
    .map((s) => {
      const mean = s.scores.length ? Number((s.scores.reduce((a, b) => a + b, 0) / s.scores.length).toFixed(2)) : null;
      return {
        key: s.key,
        n: s.scores.length,
        meanScore: mean,
        minScore: s.scores.length ? Math.min(...s.scores) : null,
        stdev: mean !== null ? stdev(s.scores, mean) : null,
        gatePass: mean !== null && mean >= 8.5 && (s.scores.length ? Math.min(...s.scores) >= 7.5 : false) && (mean !== null ? stdev(s.scores, mean) <= 0.75 : false),
      };
    })
    .sort((a, b) => (a.meanScore ?? 0) - (b.meanScore ?? 0));

  const scoreboardPath = files[0].replace(/[^/\\]+$/, "scoreboard.judged.json");
  writeFileSync(scoreboardPath, JSON.stringify(scoreboard, null, 2), "utf8");

  console.log("\n[writing-judge] Per-cell judge scoreboard (lowest mean first):");
  for (const s of scoreboard) {
    console.log(`  mean=${s.meanScore ?? "n/a"} min=${s.minScore ?? "n/a"} sd=${s.stdev ?? "n/a"} n=${s.n} gate=${s.gatePass ? "PASS" : "FAIL"}  ${s.key}`);
  }
  console.log(`\nScoreboard written to ${scoreboardPath}`);
}

main();
