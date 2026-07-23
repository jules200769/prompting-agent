import { describe, expect, it } from "vitest";
import {
  buildContextCompactPrompt,
  buildSessionMemoryRefreshPrompt,
  PROJECT_SUMMARY_LABELS,
  SESSION_SUMMARY_LABELS,
} from "./contextImportPrompt";

describe("buildContextCompactPrompt", () => {
  it("includes all session labels for session scope", () => {
    const { system, user } = buildContextCompactPrompt("session", "long chat dump");
    for (const label of SESSION_SUMMARY_LABELS) {
      expect(system).toContain(label);
    }
    expect(system).toContain("4000 characters");
    expect(user).toContain("long chat dump");
  });

  it("includes all project labels for project scope", () => {
    const { system } = buildContextCompactPrompt("project", "repo notes");
    for (const label of PROJECT_SUMMARY_LABELS) {
      expect(system).toContain(label);
    }
    expect(system).toContain("project context summary");
  });
});

describe("buildSessionMemoryRefreshPrompt", () => {
  it("includes session labels and activity delta", () => {
    const { system, user } = buildSessionMemoryRefreshPrompt({
      currentContext: "1. GOAL — Ship parser fix.",
      activityDelta: "Run 1 (applied):\nOriginal draft: \"\"\"fix bug\"\"\"",
    });
    for (const label of SESSION_SUMMARY_LABELS) {
      expect(system).toContain(label);
    }
    expect(system).toContain("do NOT paste refined prompts verbatim");
    expect(user).toContain("EXISTING SESSION CONTEXT");
    expect(user).toContain("Ship parser fix");
    expect(user).toContain("NEW ACTIVITY");
  });

  it("marks empty session context as bootstrap", () => {
    const { user } = buildSessionMemoryRefreshPrompt({
      currentContext: "",
      projectContext: "React + Electron",
      activityDelta: "Run 1 (copied):",
    });
    expect(user).toContain("empty — bootstrap");
    expect(user).toContain("PROJECT BACKGROUND");
    expect(user).toContain("React + Electron");
  });
});
