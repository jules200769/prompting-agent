import { describe, expect, it, beforeEach, vi } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { OptimizeRequest, OptimizeResult } from "../shared/types";

const tmpDir = mkdtempSync(join(tmpdir(), "pf-run-history-test-"));
vi.mock("electron", () => ({ app: { getPath: () => tmpDir } }));

const storeFile = () => join(tmpDir, "anvyll.store.json");
const jsonlPath = () => join(tmpDir, "run-history.jsonl");

let store: typeof import("./storage");

beforeEach(async () => {
  if (existsSync(storeFile())) unlinkSync(storeFile());
  if (existsSync(jsonlPath())) unlinkSync(jsonlPath());
  vi.resetModules();
  store = await import("./storage");
});

function sampleResult(overrides: Partial<OptimizeResult> = {}): OptimizeResult {
  return {
    optimizedPrompt: "refined output",
    score: 82,
    baselineScore: 40,
    subscores: {
      clarity: 80,
      context: 70,
      structure: 75,
      format: 70,
      examples: 60,
      persona: 65,
      verifiability: 55,
    },
    baselineSubscores: {
      clarity: 40,
      context: 35,
      structure: 30,
      format: 35,
      examples: 25,
      persona: 30,
      verifiability: 20,
    },
    diff: [],
    personaSuggestion: "",
    notes: ["note one"],
    model: "gpt-5",
    level: 2,
    adherenceLevel: 2,
    source: "llm",
    packVersion: "13",
    ...overrides,
  };
}

const baseReq: OptimizeRequest = {
  prompt: "fix the bug",
  model: "gpt-5",
  level: 2,
  promptType: "prompt",
  terminalContext: true,
};

describe("run ledger storage", () => {
  it("migrates legacy HistoryItem rows on load", async () => {
    writeFileSync(
      storeFile(),
      JSON.stringify({
        history: [
          {
            id: "legacy-1",
            originalText: "old in",
            optimizedText: "old out",
            model: "gpt-5",
            level: 3,
            score: 70,
            source: "llm",
            createdAt: 1000,
          },
        ],
      }),
      "utf8",
    );
    vi.resetModules();
    const freshStore = await import("./storage");

    const items = freshStore.listHistory();
    expect(items).toHaveLength(1);
    expect(items[0].schemaVersion).toBe(1);
    expect(items[0].input.prompt).toBe("old in");
    expect(items[0].output.optimizedPrompt).toBe("old out");
    expect(items[0].comments).toEqual([]);
  });

  it("addRunRecord persists full input/output and appends created JSONL", () => {
    const id = store.addRunRecord(sampleResult(), baseReq, "overlay", false);
    expect(id).toBeTruthy();

    const onDisk = JSON.parse(readFileSync(storeFile(), "utf8"));
    expect(onDisk.history[0].id).toBe(id);
    expect(onDisk.history[0].surface).toBe("overlay");
    expect(onDisk.history[0].input.promptType).toBe("prompt");
    expect(onDisk.history[0].output.notes).toEqual(["note one"]);

    const lines = readFileSync(jsonlPath(), "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
    const line = JSON.parse(lines[0]);
    expect(line.event).toBe("created");
    expect(line.run.id).toBe(id);
  });

  it("addRunComment rejects empty comment without verdict", () => {
    const id = store.addRunRecord(sampleResult(), baseReq, "studio");
    expect(store.addRunComment({ id, text: "   " })).toBeNull();
  });

  it("addRunComment stores text and verdict and appends commented JSONL", () => {
    const id = store.addRunRecord(sampleResult(), baseReq, "studio");
    const updated = store.addRunComment({ id, text: "Too verbose", verdict: "bad" });
    expect(updated?.comments[0].text).toBe("Too verbose");
    expect(updated?.comments[0].verdict).toBe("bad");

    const lines = readFileSync(jsonlPath(), "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[1]).event).toBe("commented");
  });

  it("finalizeRun records final prompt, action flags, and JSONL finalized event", () => {
    const id = store.addRunRecord(sampleResult(), baseReq, "studio");
    const updated = store.finalizeRun({
      id,
      finalPrompt: "user edited output",
      action: "apply",
    });
    expect(updated?.output.finalPrompt).toBe("user edited output");
    expect(updated?.actions?.applied).toBe(true);
    expect(updated?.actions?.edited).toBe(true);

    const lines = readFileSync(jsonlPath(), "utf8").trim().split("\n");
    expect(JSON.parse(lines[lines.length - 1]).event).toBe("finalized");
  });

  it("addRunRecord stamps sessionId from the active session", () => {
    const session = store.createSession();
    const id = store.addRunRecord(sampleResult(), baseReq, "overlay");
    const record = store.listHistory().find((r) => r.id === id);
    expect(record?.sessionId).toBe(session.id);
  });

  it("listSessionMemoryRuns returns only finalized runs after memoryUpdatedAt", () => {
    const session = store.createSession();
    const id = store.addRunRecord(sampleResult(), baseReq, "overlay");
    store.finalizeRun({ id, finalPrompt: "applied text", action: "apply" });
    expect(store.listSessionMemoryRuns(session.id, null)).toHaveLength(1);
    const refreshed = store.refreshSessionContext(session.id, "1. GOAL — refreshed.");
    expect(store.listSessionMemoryRuns(session.id, refreshed!.memoryUpdatedAt)).toHaveLength(0);
  });

  it("clearHistory clears UI store but keeps JSONL append-only file", () => {
    store.addRunRecord(sampleResult(), baseReq, "studio");
    store.clearHistory();
    expect(store.listHistory()).toHaveLength(0);
    expect(readFileSync(jsonlPath(), "utf8").trim().split("\n")).toHaveLength(1);
  });
});
