// One-off calibration runner — reads OPENAI_API_KEY from env or .env.local; never commit keys.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import type { IncomingMessage } from "node:http";
import type { ModelId, OptLevel } from "../src/shared/types";
import { optimizeStream } from "../src/engine/providers";

function resolveApiKey(): string | undefined {
  const fromEnv = process.env.OPENAI_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  const envLocal = join(process.cwd(), ".env.local");
  if (existsSync(envLocal)) {
    const match = readFileSync(envLocal, "utf8").match(/^OPENAI_API_KEY=(.+)$/m);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  const electronKey = spawnSync("npx", ["electron", "scripts/read-openai-key.cjs"], {
    encoding: "utf8",
    timeout: 20000,
    shell: true,
    cwd: process.cwd(),
  });
  const key = electronKey.stdout?.trim();
  if (key && key.startsWith("sk-")) return key;
  return undefined;
}

const apiKey = resolveApiKey();
if (!apiKey) {
  console.warn("No API key — falling back to dev bridge (may use stale Electron engine until restart).");
}

const model = (process.argv[2] ?? "gpt-5") as ModelId;
const roundDir = process.argv[3] ?? "GPT5.5_test_results/second_round_after_change";
const slug = process.argv[4] ?? "gpt5.5";
const layout = process.argv[5] ?? "second"; // "first" | "second"

const subdirs =
  layout === "first"
    ? { a: join(roundDir, "first_test"), b: join(roundDir, "second_test") }
    : { a: join(roundDir, "first_prompt_results"), b: join(roundDir, "second_prompt_results") };
const PROMPT_A =
  "my react app lags when users type in the search box. the list has around 500 items. probably a rerender issue? fix it but dont change the ui or break filtering. typescript.";
const PROMPT_B =
  "write an email to my team about our Q3 roadmap slipping by 3 weeks because of a vendor delay. keep it professional but not too corporate or stiff. dont blame the vendor or anyone on the team. mention we have a mitigation plan but i havent finalized the details yet. they need to know whats changing and what stays the same.";

const dirs = subdirs;
for (const d of Object.values(dirs)) mkdirSync(d, { recursive: true });
writeFileSync(join(dirs.a, "input_prompt"), PROMPT_A);
writeFileSync(join(dirs.b, "input_prompt2"), PROMPT_B);

const levels = [1, 2, 3, 4] as const;
const names: Record<OptLevel, string> = { 1: "cool", 2: "warm", 3: "hot", 4: "max" };

async function runViaBridge(prompt: string, level: OptLevel): Promise<string> {
  const http = await import("node:http");
  const body = JSON.stringify({ prompt, model, level, skipCache: true });
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: Number(process.env.PROMPTFORGE_DEV_BRIDGE_PORT ?? 5174),
        path: "/api/optimize",
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      },
      (res: IncomingMessage) => {
        let buf = "";
        res.on("data", (chunk: Buffer) => (buf += chunk));
        res.on("end", () => {
          try {
            const lines = buf.trim().split("\n");
            const last = JSON.parse(lines[lines.length - 1]!) as { type: string; data?: { optimizedPrompt: string }; error?: string };
            if (last.type === "done" && last.data) resolve(last.data.optimizedPrompt);
            else reject(new Error(last.error ?? buf.slice(0, 400)));
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function run(prompt: string, level: OptLevel): Promise<string> {
  if (apiKey) {
    const res = await optimizeStream({ prompt, model, level, apiKey }, { onText: () => {} });
    return res.text;
  }
  return runViaBridge(prompt, level);
}

for (const level of levels) {
  const n = names[level];
  process.stdout.write(`Prompt A L${level}... `);
  writeFileSync(join(dirs.a, `${slug}-${n}`), await run(PROMPT_A, level));
  console.log("ok");
  process.stdout.write(`Prompt B L${level}... `);
  writeFileSync(join(dirs.b, `${slug}-${n}2`), await run(PROMPT_B, level));
  console.log("ok");
}
console.log("DONE");
