import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";

const refreshSessionMemory = vi.fn(async () => "1. GOAL — refreshed");
const getSettings = vi.fn(() => ({ autoSessionMemory: true }));
const listSessions = vi.fn(() => [] as import("../shared/session").SessionContext[]);
const listSessionMemoryRuns = vi.fn(() => [] as import("../shared/types").RunRecord[]);
const refreshSessionContext = vi.fn(() => null);
const getProjectContext = vi.fn(() => "");
const keyGet = vi.fn(async () => "sk-test");

vi.mock("../engine/sessionMemory", () => ({
  refreshSessionMemory: (...args: unknown[]) => refreshSessionMemory(...args),
}));

vi.mock("./keyStore", () => ({
  keyStore: {
    get: (...args: unknown[]) => keyGet(...args),
  },
}));

vi.mock("./storage", () => ({
  getSettings: () => getSettings(),
  listSessions: () => listSessions(),
  listSessionMemoryRuns: (...args: unknown[]) => listSessionMemoryRuns(...args),
  refreshSessionContext: (...args: unknown[]) => refreshSessionContext(...args),
  getProjectContext: () => getProjectContext(),
}));

const {
  scheduleSessionMemoryRefresh,
  runSessionMemoryRefresh,
  clearSessionMemoryRefreshTimers,
  setSessionMemoryNotifier,
} = await import("./sessionMemoryRefresh");

beforeEach(() => {
  vi.useFakeTimers();
  refreshSessionMemory.mockClear();
  getSettings.mockReturnValue({ autoSessionMemory: true });
  listSessions.mockReturnValue([]);
  listSessionMemoryRuns.mockReturnValue([]);
  refreshSessionContext.mockReturnValue(null);
  clearSessionMemoryRefreshTimers();
});

afterEach(() => {
  clearSessionMemoryRefreshTimers();
  vi.useRealTimers();
});

describe("scheduleSessionMemoryRefresh", () => {
  it("no-ops when autoSessionMemory is off", async () => {
    getSettings.mockReturnValue({ autoSessionMemory: false });
    scheduleSessionMemoryRefresh("s1");
    await vi.advanceTimersByTimeAsync(2500);
    expect(refreshSessionMemory).not.toHaveBeenCalled();
  });

  it("debounces multiple schedules into one refresh", async () => {
    listSessions.mockReturnValue([
      {
        id: "s1",
        title: "t",
        contextText: "",
        projectId: null,
        memoryUpdatedAt: null,
        createdAt: 0,
        updatedAt: 0,
      },
    ]);
    listSessionMemoryRuns.mockReturnValue([
      {
        id: "r1",
        schemaVersion: 1,
        createdAt: 1,
        surface: "overlay",
        sessionId: "s1",
        input: { prompt: "draft", model: "gpt-5", level: 2 },
        output: {
          optimizedPrompt: "refined",
          score: 80,
          baselineScore: 40,
          subscores: {} as any,
          baselineSubscores: {} as any,
          adherenceLevel: 2,
          notes: [],
          source: "llm",
          packVersion: "1",
        },
        actions: { applied: true },
        comments: [],
      },
    ]);
    refreshSessionContext.mockReturnValue({
      id: "s1",
      title: "t",
      contextText: "1. GOAL — refreshed",
      projectId: null,
      memoryUpdatedAt: 100,
      createdAt: 0,
      updatedAt: 100,
    });

    scheduleSessionMemoryRefresh("s1");
    scheduleSessionMemoryRefresh("s1");
    await vi.advanceTimersByTimeAsync(1999);
    expect(refreshSessionMemory).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(refreshSessionMemory).toHaveBeenCalledTimes(1);
  });
});

describe("runSessionMemoryRefresh", () => {
  it("notifies listeners when refresh succeeds", async () => {
    const updated = {
      id: "s1",
      title: "Named session",
      contextText: "1. GOAL — refreshed",
      projectId: null,
      memoryUpdatedAt: 100,
      createdAt: 0,
      updatedAt: 100,
    };
    listSessions.mockReturnValue([
      {
        id: "s1",
        title: "Named session",
        contextText: "old",
        projectId: null,
        memoryUpdatedAt: null,
        createdAt: 0,
        updatedAt: 0,
      },
    ]);
    listSessionMemoryRuns.mockReturnValue([
      {
        id: "r1",
        schemaVersion: 1,
        createdAt: 1,
        surface: "overlay",
        sessionId: "s1",
        input: { prompt: "draft", model: "gpt-5", level: 2 },
        output: {
          optimizedPrompt: "refined",
          score: 80,
          baselineScore: 40,
          subscores: {} as any,
          baselineSubscores: {} as any,
          adherenceLevel: 2,
          notes: [],
          source: "llm",
          packVersion: "1",
        },
        actions: { copied: true },
        comments: [],
      },
    ]);
    refreshSessionContext.mockReturnValue(updated);

    const notified: unknown[] = [];
    setSessionMemoryNotifier((session) => notified.push(session));

    const result = await runSessionMemoryRefresh("s1");
    expect(result).toEqual(updated);
    expect(notified).toEqual([updated]);
  });

  it("returns null when there is no new activity", async () => {
    listSessions.mockReturnValue([
      {
        id: "s1",
        title: "t",
        contextText: "",
        projectId: null,
        memoryUpdatedAt: null,
        createdAt: 0,
        updatedAt: 0,
      },
    ]);
    listSessionMemoryRuns.mockReturnValue([]);
    expect(await runSessionMemoryRefresh("s1")).toBeNull();
  });
});
