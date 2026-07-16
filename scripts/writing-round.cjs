// Writing-mode test/optimization round runner — generalizes calibration-round.mts,
// but requires the compiled dist/ output (CommonJS) instead of raw .mts source,
// since Node's native ESM/TS-stripping resolver can't follow this repo's
// extensionless relative imports. Direct API calls only (in-process optimizeStream,
// or dev-bridge fallback); no overlay/Studio UI involved.
//
// PREREQUISITE: run `npm run build:main` first (and after any writing.ts /
// contextSignals.ts change) so dist/ reflects current source.
//
// Run with: node scripts/writing-round.cjs [flags]
//
// Flags (all optional, key=value):
//   --round=<id>            round identifier, e.g. round-0 (default: auto-incremented under test.results/Writing_test_results/rounds/)
//   --shard=<name>          output file name segment so agents don't clobber each other (default: "default")
//   --types=email,message   comma list of WritingType (default: all 4)
//   --levels=1,2,3,4        comma list of OptLevel (default: all 4)
//   --partition=tuning      "tuning" | "holdout" (default: tuning)
//   --repeats=3             repeats per cell (default: 3)
//   --terminal=true|false   set terminalContext (default: false)
//   --context=<string>      standing-context string, or "none" (default: none)
//   --captureContext=<name> preset name from parameter-matrix.json contextAwareness.presets, or "off" (default: off)
//   --tags=short,typo       only run corpus drafts that include at least one of these tags (default: all)
//   --transport=inprocess|bridge (default: inprocess, auto-falls back to bridge if no API key)
//   --model=gpt-5           ModelId compatibility field (default: gpt-5; writing mode ignores it by construction)

const { existsSync, mkdirSync, readFileSync, appendFileSync, readdirSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const REPO_ROOT = join(__dirname, "..");
const RESULTS_ROOT = join(REPO_ROOT, "..", "test.results", "Writing_test_results");

const { optimizeStream } = require(join(REPO_ROOT, "dist", "engine", "providers.js"));
const { buildWritingMetaPrompt } = require(join(REPO_ROOT, "dist", "engine", "writing.js"));

// ---------- flags ----------

function parseFlags(argv) {
  const out = {};
  for (const arg of argv) {
    const m = arg.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}
const flags = parseFlags(process.argv.slice(2));
const list = (v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined);

const shard = flags.shard ?? "default";
const partition = flags.partition === "holdout" ? "holdout" : "tuning";
const types = list(flags.types) ?? ["email", "message", "question", "explain"];
const levels = (list(flags.levels)?.map(Number)) ?? [1, 2, 3, 4];
const repeats = Number(flags.repeats ?? 3);
const terminalContext = flags.terminal === "true";
const standingContext = flags.context && flags.context !== "none" ? flags.context : undefined;
const tagFilter = list(flags.tags);
const transportPreference = flags.transport === "bridge" ? "bridge" : "inprocess";
const model = flags.model ?? "gpt-5";

// ---------- round id (auto-increment if not given) ----------

function nextRoundId() {
  mkdirSync(join(RESULTS_ROOT, "rounds"), { recursive: true });
  const existing = readdirSync(join(RESULTS_ROOT, "rounds"), { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^round-\d+$/.test(d.name))
    .map((d) => Number(d.name.replace("round-", "")));
  const n = existing.length ? Math.max(...existing) + 1 : 0;
  return `round-${n}`;
}
const roundId = flags.round ?? nextRoundId();
const roundDir = join(RESULTS_ROOT, "rounds", roundId);
mkdirSync(roundDir, { recursive: true });
const outFile = join(roundDir, `${shard}.jsonl`);

// ---------- corpus + capture-context presets ----------

const corpus = JSON.parse(readFileSync(join(RESULTS_ROOT, "corpus.json"), "utf8"));
const matrix = JSON.parse(readFileSync(join(RESULTS_ROOT, "parameter-matrix.json"), "utf8"));

function resolveCaptureContext() {
  const name = flags.captureContext;
  if (!name || name === "off") return undefined;
  const preset = matrix.contextAwareness.presets[name];
  if (preset === undefined) throw new Error(`Unknown captureContext preset: ${name}`);
  return preset ?? undefined;
}
const captureContext = resolveCaptureContext();

function draftsFor(type) {
  const all = corpus[partition][type] ?? [];
  if (!tagFilter) return all;
  return all.filter((d) => d.tags.some((t) => tagFilter.includes(t)));
}

// ---------- API key resolution (never printed — see AGENTS.md credential rule) ----------

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

async function runViaBridge(body) {
  const http = require("node:http");
  const json = JSON.stringify({ ...body, skipCache: true });
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: Number(process.env.PROMPTFORGE_DEV_BRIDGE_PORT ?? 5174),
        path: "/api/optimize",
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(json) },
      },
      (res) => {
        let buf = "";
        res.on("data", (chunk) => (buf += chunk));
        res.on("end", () => {
          try {
            const lines = buf.trim().split("\n");
            const last = JSON.parse(lines[lines.length - 1]);
            if (last.type === "done" && last.data) resolve({ text: last.data.optimizedPrompt, result: last.data });
            else reject(new Error(last.error ?? buf.slice(0, 400)));
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on("error", reject);
    req.write(json);
    req.end();
  });
}

// ---------- round execution ----------

async function main() {
  const apiKey = resolveApiKey();
  const transport = apiKey && transportPreference === "inprocess" ? "inprocess" : "bridge";
  console.log(
    `[writing-round] round=${roundId} shard=${shard} partition=${partition} types=${types.join(",")} levels=${levels.join(",")} repeats=${repeats} terminal=${terminalContext} context=${standingContext ? "set" : "none"} captureContext=${flags.captureContext ?? "off"} transport=${transport}`,
  );
  if (transport === "bridge") {
    console.warn("[writing-round] No API key resolved in-process — using dev bridge at 127.0.0.1:5174 (requires `npm run dev` running).");
  }

  let calls = 0;
  let failures = 0;

  for (const type of types) {
    for (const level of levels) {
      const drafts = draftsFor(type);
      for (const draft of drafts) {
        for (let repeatIndex = 0; repeatIndex < repeats; repeatIndex++) {
          const requestBase = {
            prompt: draft.text,
            model,
            level,
            writingType: type,
            terminalContext,
            context: standingContext,
            captureContext,
            skipCache: true,
          };
          const { system, user } = buildWritingMetaPrompt({
            prompt: draft.text,
            writingType: type,
            level,
            terminalContext,
            context: standingContext,
            captureContext,
          });

          const started = Date.now();
          let rawOutput = "";
          let error;
          try {
            if (transport === "inprocess" && apiKey) {
              const res = await optimizeStream(
                { prompt: draft.text, model, level, apiKey, terminalContext, context: standingContext, writingType: type, captureContext },
                { onText: () => {} },
              );
              rawOutput = res.text;
            } else {
              const res = await runViaBridge(requestBase);
              rawOutput = res.text;
            }
          } catch (e) {
            error = e instanceof Error ? e.message : String(e);
            failures++;
          }
          const latencyMs = Date.now() - started;
          calls++;

          const record = {
            roundId,
            shard,
            timestamp: new Date().toISOString(),
            draftId: draft.id,
            draftTags: draft.tags,
            writingType: type,
            level,
            repeatIndex,
            terminalContext,
            standingContext,
            captureContextPreset: flags.captureContext,
            request: requestBase,
            systemPrompt: system,
            userPrompt: user,
            rawOutput,
            latencyMs,
            transport,
            error,
          };
          appendFileSync(outFile, JSON.stringify(record) + "\n", "utf8");
          process.stdout.write(error ? "E" : ".");
        }
      }
    }
  }

  console.log(`\n[writing-round] done: ${calls} calls, ${failures} failures. Output: ${outFile}`);
}

main().catch((e) => {
  console.error("[writing-round] fatal:", e);
  process.exit(1);
});
