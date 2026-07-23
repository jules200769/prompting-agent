import { describe, expect, it } from "vitest";
import type { RunRecord } from "./types";
import { buildSessionMemoryDelta, SESSION_MEMORY_MAX_RUNS } from "./sessionMemory";

function mkRun(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id: "r1",
    schemaVersion: 1,
    createdAt: Date.now(),
    surface: "overlay",
    input: { prompt: "fix the bug", model: "gpt-5", level: 2 },
    output: {
      optimizedPrompt: "Please fix the parser bug in storage.ts",
      score: 80,
      baselineScore: 40,
      subscores: {} as RunRecord["output"]["subscores"],
      baselineSubscores: {} as RunRecord["output"]["baselineSubscores"],
      adherenceLevel: 2,
      notes: [],
      source: "llm",
      packVersion: "1",
    },
    comments: [],
    ...overrides,
  };
}

describe("buildSessionMemoryDelta", () => {
  it("returns empty string when no finalized runs", () => {
    expect(buildSessionMemoryDelta([mkRun()])).toBe("");
  });

  it("includes applied runs and prefers finalPrompt", () => {
    const delta = buildSessionMemoryDelta([
      mkRun({
        actions: { applied: true },
        output: {
          ...mkRun().output,
          optimizedPrompt: "model output",
          finalPrompt: "user edited final",
        },
      }),
    ]);
    expect(delta).toContain("(applied)");
    expect(delta).toContain("fix the bug");
    expect(delta).toContain("user edited final");
    expect(delta).not.toContain("model output");
  });

  it("caps at SESSION_MEMORY_MAX_RUNS newest finalized runs", () => {
    const runs = Array.from({ length: 8 }, (_, i) =>
      mkRun({
        id: `r${i}`,
        createdAt: i,
        actions: { copied: true },
        input: { prompt: `prompt ${i}`, model: "gpt-5", level: 2 },
      }),
    );
    const delta = buildSessionMemoryDelta(runs);
    const runLines = delta.match(/^Run \d+ /gm) ?? [];
    expect(runLines.length).toBe(SESSION_MEMORY_MAX_RUNS);
    expect(delta).toContain("prompt 7");
    expect(delta).not.toContain("prompt 2");
  });

  it("includes destination hint and studio verdict when present", () => {
    const delta = buildSessionMemoryDelta([
      mkRun({
        actions: { applied: true },
        input: {
          prompt: "fix bug",
          model: "gpt-5",
          level: 2,
          captureContext: {
            app: { site: "cursor", processName: "Cursor", windowTitle: "file.ts", hostKind: "desktop" },
            files: { activeFile: "storage.ts", recentFiles: [] },
          },
        },
        comments: [{ id: "c1", createdAt: 1, text: "too verbose", verdict: "bad" }],
      }),
    ]);
    expect(delta).toContain("Destination: site: cursor, file: storage.ts");
    expect(delta).toContain("User feedback (bad): too verbose");
  });
});
