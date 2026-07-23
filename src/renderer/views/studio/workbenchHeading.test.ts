import { describe, expect, it } from "vitest";
import type { ProjectContext, SessionContext } from "../../../shared/session";
import { sessionTitlebarLabel, workbenchHeading } from "./workbenchHeading";

const project: ProjectContext = {
  id: "p1",
  title: "Anvyll App",
  contextText: "project context",
  color: "#aabbcc",
  createdAt: 1,
  updatedAt: 1,
};

const session: SessionContext = {
  id: "s1",
  title: "Auth refactor",
  contextText: "session context",
  projectId: "p1",
  memoryUpdatedAt: null,
  createdAt: 2,
  updatedAt: 2,
};

describe("workbenchHeading", () => {
  it("returns fixed BUILD titles for generator", () => {
    expect(workbenchHeading("generator")).toEqual({
      eyebrow: "Create",
      title: "Craft a model-ready prompt",
      description:
        "Start with an idea, choose its purpose, and build a prompt for the model you use.",
    });
  });

  it("returns fixed BUILD titles for optimizer even when a session is active", () => {
    expect(workbenchHeading("optimizer")).toEqual({
      eyebrow: "Improve",
      title: "Optimize your existing prompt",
      description:
        "Paste a prompt you already use. Anvyll can ask three focused questions before rebuilding it.",
    });
  });
});

describe("sessionTitlebarLabel", () => {
  it("returns path when session-bound", () => {
    expect(sessionTitlebarLabel(true, project, session)).toBe("Anvyll App / Auth refactor");
  });

  it("returns null when not session-bound", () => {
    expect(sessionTitlebarLabel(false, project, session)).toBeNull();
  });

  it("uses No project when session has no linked project", () => {
    const orphan: SessionContext = { ...session, projectId: null };
    expect(sessionTitlebarLabel(true, null, orphan)).toBe("No project / Auth refactor");
  });
});
