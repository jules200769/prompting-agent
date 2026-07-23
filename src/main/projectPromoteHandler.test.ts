import { describe, expect, it, beforeEach, vi } from "vitest";

const compactContext = vi.fn(async () => "merged project memory");
vi.mock("../engine/contextCompact", () => ({ compactContext: (...args: unknown[]) => compactContext(...args) }));

const getKey = vi.fn(async () => "sk-test");
vi.mock("./keyStore", () => ({
  keyStore: { get: () => getKey() },
}));

const listSessions = vi.fn(() => [] as ReturnType<typeof import("./storage").listSessions>);
const listProjects = vi.fn(() => [] as ReturnType<typeof import("./storage").listProjects>);
const getActiveProjectId = vi.fn(() => null as string | null);
const getProjectContext = vi.fn(() => "");
const setProjectContextById = vi.fn(() => null as ReturnType<typeof import("./storage").setProjectContextById>);
const setProjectContext = vi.fn();

vi.mock("./storage", () => ({
  listSessions: () => listSessions(),
  listProjects: () => listProjects(),
  getActiveProjectId: () => getActiveProjectId(),
  getProjectContext: () => getProjectContext(),
  setProjectContextById: (...args: unknown[]) => setProjectContextById(...args),
  setProjectContext: (...args: unknown[]) => setProjectContext(...args),
}));

const { runPromoteSessionToProject } = await import("./projectPromoteHandler");

beforeEach(() => {
  vi.clearAllMocks();
  getKey.mockResolvedValue("sk-test");
  compactContext.mockResolvedValue("merged project memory");
  listSessions.mockReturnValue([]);
  listProjects.mockReturnValue([]);
  getActiveProjectId.mockReturnValue(null);
  getProjectContext.mockReturnValue("");
  setProjectContextById.mockReturnValue({
    id: "p1",
    title: "Project",
    contextText: "merged project memory",
    color: "#fff",
    createdAt: 1,
    updatedAt: 2,
  });
});

describe("runPromoteSessionToProject", () => {
  it("throws when session has no context", async () => {
    listSessions.mockReturnValue([
      {
        id: "s1",
        title: "t",
        contextText: "",
        projectId: "p1",
        memoryUpdatedAt: null,
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    await expect(runPromoteSessionToProject("s1")).rejects.toThrow(/no context/i);
  });

  it("compacts session facts into project memory", async () => {
    listSessions.mockReturnValue([
      {
        id: "s1",
        title: "t",
        contextText: "3. KEY FACTS — Electron overlay.",
        projectId: "p1",
        memoryUpdatedAt: null,
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    listProjects.mockReturnValue([
      {
        id: "p1",
        title: "Project",
        contextText: "1. PROJECT — Anvyll.",
        color: "#fff",
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    getActiveProjectId.mockReturnValue("p1");

    const result = await runPromoteSessionToProject("s1");
    expect(compactContext).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "project", apiKey: "sk-test" }),
    );
    expect(setProjectContextById).toHaveBeenCalledWith("p1", "merged project memory");
    expect(result).toBe("merged project memory");
  });
});
