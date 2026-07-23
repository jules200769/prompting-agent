import { describe, expect, it, beforeEach, vi } from "vitest";
import type { OptimizeRequest, OptimizeResult } from "../shared/types";
import type { SessionContext } from "../shared/session";

let activeSession: SessionContext | null = null;
let projectContext = "";
let settingsContextMemory = "";
const cacheHash = vi.fn(() => "hash");
const getCache = vi.fn(() => null);
const setCache = vi.fn();
const addRunRecord = vi.fn(() => "run-123");

vi.mock("./storage", () => ({
  getActiveSession: () => activeSession,
  getProjectContext: () => projectContext,
  getSettings: () => ({ contextMemory: settingsContextMemory }),
  cacheHash: (req: OptimizeRequest) => cacheHash(req),
  getCache: (...args: unknown[]) => getCache(...(args as [])),
  setCache: (...args: unknown[]) => setCache(...(args as [])),
  addRunRecord: (...args: unknown[]) => addRunRecord(...(args as [])),
}));

const optimize = vi.fn(async (ctx: { request: OptimizeRequest }): Promise<OptimizeResult> => ({
  optimizedPrompt: "refined",
  score: 80,
  baselineScore: 40,
  subscores: {} as OptimizeResult["subscores"],
  baselineSubscores: {} as OptimizeResult["subscores"],
  diff: [],
  personaSuggestion: "",
  notes: [],
  model: ctx.request.model,
  level: ctx.request.level,
  adherenceLevel: 2,
  source: "llm",
  packVersion: "1",
}));

vi.mock("../engine/orchestrator", () => ({
  optimize: (ctx: { request: OptimizeRequest }) => optimize(ctx),
}));

const { runOptimize } = await import("./optimizeHandler");

const baseReq: OptimizeRequest = { prompt: "fix the bug", model: "gpt-5", level: 2 };

function session(contextText: string): SessionContext {
  const now = Date.now();
  return {
    id: "s1",
    title: "t",
    contextText,
    projectId: null,
    memoryUpdatedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

const cachedResult: OptimizeResult = {
  optimizedPrompt: "cached refined",
  score: 90,
  baselineScore: 50,
  subscores: {} as OptimizeResult["subscores"],
  baselineSubscores: {} as OptimizeResult["subscores"],
  diff: [],
  personaSuggestion: "",
  notes: [],
  model: "gpt-5",
  level: 2,
  adherenceLevel: 2,
  source: "llm",
  packVersion: "1",
};

beforeEach(() => {
  activeSession = null;
  projectContext = "";
  settingsContextMemory = "";
  getCache.mockReturnValue(null);
  vi.clearAllMocks();
  addRunRecord.mockReturnValue("run-123");
});

describe("runOptimize session enrichment", () => {
  it("attaches the active session and project context to the engine request", async () => {
    activeSession = session("session facts");
    projectContext = "project facts";
    await runOptimize(baseReq, () => {}, "studio");
    const sent = optimize.mock.calls[0][0].request;
    expect(sent.sessionContext).toBe("session facts");
    expect(sent.projectContext).toBe("project facts");
  });

  it("overwrites renderer-supplied context values", async () => {
    activeSession = session("real session context");
    await runOptimize({ ...baseReq, sessionContext: "spoofed", projectContext: "spoofed" }, () => {}, "overlay");
    const sent = optimize.mock.calls[0][0].request;
    expect(sent.sessionContext).toBe("real session context");
    expect(sent.projectContext).toBeUndefined();
  });

  it("hashes the enriched request so the cache is session-isolated", async () => {
    activeSession = session("session facts");
    await runOptimize(baseReq, () => {}, "studio");
    expect(cacheHash).toHaveBeenCalledWith(
      expect.objectContaining({ sessionContext: "session facts" }),
    );
  });

  it("sends undefined when no session is active or context is empty", async () => {
    await runOptimize(baseReq, () => {}, "studio");
    let sent = optimize.mock.calls[0][0].request;
    expect(sent.sessionContext).toBeUndefined();
    expect(sent.projectContext).toBeUndefined();

    activeSession = session("   ");
    await runOptimize(baseReq, () => {}, "studio");
    sent = optimize.mock.calls[1][0].request;
    expect(sent.sessionContext).toBeUndefined();
  });

  it("merges settings.contextMemory with renderer context on every surface", async () => {
    settingsContextMemory = "global standing notes";
    await runOptimize({ ...baseReq, context: "extra instruction" }, () => {}, "overlay");
    const sent = optimize.mock.calls[0][0].request;
    expect(sent.context).toBe("global standing notes\n\nextra instruction");
  });

  it("uses settings.contextMemory alone when renderer context is empty", async () => {
    settingsContextMemory = "sticky notes only";
    await runOptimize(baseReq, () => {}, "studio");
    const sent = optimize.mock.calls[0][0].request;
    expect(sent.context).toBe("sticky notes only");
  });
});

describe("runOptimize run recording", () => {
  it("returns runId and records a fresh optimize", async () => {
    const res = await runOptimize(baseReq, () => {}, "studio");
    expect(res.runId).toBe("run-123");
    expect(setCache).toHaveBeenCalled();
    expect(addRunRecord).toHaveBeenCalledWith(
      expect.objectContaining({ optimizedPrompt: "refined" }),
      expect.objectContaining({ prompt: "fix the bug" }),
      "studio",
      false,
    );
  });

  it("records cache hits with fromCache=true and skips optimize", async () => {
    getCache.mockReturnValue(cachedResult);
    const res = await runOptimize(baseReq, () => {}, "overlay");
    expect(res.runId).toBe("run-123");
    expect(optimize).not.toHaveBeenCalled();
    expect(addRunRecord).toHaveBeenCalledWith(
      cachedResult,
      expect.objectContaining({ prompt: "fix the bug" }),
      "overlay",
      true,
    );
  });
});
