import { describe, expect, it, beforeEach, vi } from "vitest";
import type { OptimizeRequest, OptimizeResult } from "../shared/types";
import type { SessionContext } from "../shared/session";

let activeSession: SessionContext | null = null;
let projectContext = "";
const cacheHash = vi.fn(() => "hash");
const getCache = vi.fn(() => null);
const setCache = vi.fn();
const addHistory = vi.fn();

vi.mock("./storage", () => ({
  getActiveSession: () => activeSession,
  getProjectContext: () => projectContext,
  cacheHash: (req: OptimizeRequest) => cacheHash(req),
  getCache: (...args: unknown[]) => getCache(...(args as [])),
  setCache: (...args: unknown[]) => setCache(...(args as [])),
  addHistory: (...args: unknown[]) => addHistory(...(args as [])),
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
  return { id: "s1", title: "t", contextText, projectId: null, createdAt: now, updatedAt: now };
}

beforeEach(() => {
  activeSession = null;
  projectContext = "";
  vi.clearAllMocks();
});

describe("runOptimize session enrichment", () => {
  it("attaches the active session and project context to the engine request", async () => {
    activeSession = session("session facts");
    projectContext = "project facts";
    await runOptimize(baseReq, () => {});
    const sent = optimize.mock.calls[0][0].request;
    expect(sent.sessionContext).toBe("session facts");
    expect(sent.projectContext).toBe("project facts");
  });

  it("overwrites renderer-supplied context values", async () => {
    activeSession = session("real session context");
    await runOptimize({ ...baseReq, sessionContext: "spoofed", projectContext: "spoofed" }, () => {});
    const sent = optimize.mock.calls[0][0].request;
    expect(sent.sessionContext).toBe("real session context");
    expect(sent.projectContext).toBeUndefined();
  });

  it("hashes the enriched request so the cache is session-isolated", async () => {
    activeSession = session("session facts");
    await runOptimize(baseReq, () => {});
    expect(cacheHash).toHaveBeenCalledWith(
      expect.objectContaining({ sessionContext: "session facts" }),
    );
  });

  it("sends undefined when no session is active or context is empty", async () => {
    await runOptimize(baseReq, () => {});
    let sent = optimize.mock.calls[0][0].request;
    expect(sent.sessionContext).toBeUndefined();
    expect(sent.projectContext).toBeUndefined();

    activeSession = session("   ");
    await runOptimize(baseReq, () => {});
    sent = optimize.mock.calls[1][0].request;
    expect(sent.sessionContext).toBeUndefined();
  });
});
