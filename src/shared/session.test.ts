import { describe, expect, it } from "vitest";
import {
  assignProjectColor,
  buildSessionContextBlock,
  clampContextText,
  deriveProjectTitle,
  deriveSessionTitle,
  deriveSessionTitleFromPrompt,
  groupSessionsByProject,
  NEW_SESSION_TITLE,
  PROJECT_COLOR_PALETTE,
  SESSION_CONTEXT_MAX_CHARS,
  CONTEXT_PASTE_MAX_CHARS,
  clampContextPaste,
  needsContextCompact,
  type ProjectContext,
  type SessionContext,
} from "./session";

const IMPORT_SUMMARY = `1. GOAL — Ship session-based context management for Anvyll.
2. CURRENT STATE — storage layer done, overlay wiring in progress.
3. KEY FACTS & DECISIONS — main process owns the store.
4. CONSTRAINTS & PREFERENCES — no native deps.
5. TERMINOLOGY & NAMES — storage.ts, Overlay.tsx.
6. OPEN ITEMS — not established`;

const PROJECT_IMPORT = `1. PROJECT — Anvyll Electron overlay for Windows.
2. STACK & ARCHITECTURE — Electron, Vite, React, TypeScript.
3. CONVENTIONS — English UI only.
4. KEY FACTS & DECISIONS — main owns the store.
5. CONSTRAINTS & PREFERENCES — no native deps.
6. TERMINOLOGY & NAMES — Overlay.tsx, storage.ts.`;

describe("clampContextText", () => {
  it("trims and caps at SESSION_CONTEXT_MAX_CHARS", () => {
    expect(clampContextText("  hello  ")).toBe("hello");
    expect(clampContextText("x".repeat(SESSION_CONTEXT_MAX_CHARS + 500)).length).toBe(
      SESSION_CONTEXT_MAX_CHARS,
    );
  });
});

describe("clampContextPaste", () => {
  it("caps at CONTEXT_PASTE_MAX_CHARS without trimming", () => {
    expect(clampContextPaste("  hello  ")).toBe("  hello  ");
    expect(clampContextPaste("x".repeat(CONTEXT_PASTE_MAX_CHARS + 500)).length).toBe(
      CONTEXT_PASTE_MAX_CHARS,
    );
  });
});

describe("needsContextCompact", () => {
  it("is false at or below the stored context limit", () => {
    expect(needsContextCompact("")).toBe(false);
    expect(needsContextCompact("x".repeat(SESSION_CONTEXT_MAX_CHARS))).toBe(false);
  });

  it("is true above the stored context limit", () => {
    expect(needsContextCompact("x".repeat(SESSION_CONTEXT_MAX_CHARS + 1))).toBe(true);
  });
});

describe("deriveSessionTitle", () => {
  it("uses the GOAL line from an import summary, stripped and ellipsized", () => {
    const title = deriveSessionTitle(IMPORT_SUMMARY, Date.now());
    expect(title.startsWith("Ship session-based context management")).toBe(true);
    expect(title.length).toBeLessThanOrEqual(48);
    expect(title).not.toMatch(/GOAL/);
  });

  it("falls back to the first non-empty line without a GOAL label", () => {
    expect(deriveSessionTitle("\nDebugging the login flow\nmore text", Date.now())).toBe(
      "Debugging the login flow",
    );
  });

  it("empty context keeps the new-session placeholder", () => {
    expect(deriveSessionTitle("   ", Date.now())).toBe(NEW_SESSION_TITLE);
  });

  it("picks up GOAL text on the following line under a bare label", () => {
    expect(deriveSessionTitle("1. GOAL\nFix the parser\n2. CURRENT STATE — n/a", Date.now())).toBe(
      "Fix the parser",
    );
  });
});

describe("deriveSessionTitleFromPrompt", () => {
  it("uses the first non-empty line", () => {
    expect(deriveSessionTitleFromPrompt("\nFix the login flow\nmore text")).toBe("Fix the login flow");
  });

  it("returns NEW_SESSION_TITLE for empty input", () => {
    expect(deriveSessionTitleFromPrompt("   ")).toBe(NEW_SESSION_TITLE);
  });

  it("truncates long titles with an ellipsis", () => {
    const long = "x".repeat(80);
    const title = deriveSessionTitleFromPrompt(long);
    expect(title.length).toBe(48);
    expect(title.endsWith("…")).toBe(true);
  });
});

describe("deriveProjectTitle", () => {
  it("uses the PROJECT line from an import summary, stripped and ellipsized", () => {
    const title = deriveProjectTitle(PROJECT_IMPORT, Date.now());
    expect(title.startsWith("Anvyll Electron overlay")).toBe(true);
    expect(title.length).toBeLessThanOrEqual(48);
    expect(title).not.toMatch(/^PROJECT\b/i);
  });

  it("picks up PROJECT text on the following line under a bare label", () => {
    expect(
      deriveProjectTitle("1. PROJECT\nAnvyll rewrite studio\n2. STACK — n/a", Date.now()),
    ).toBe("Anvyll rewrite studio");
  });

  it("falls back to the first non-empty line without a PROJECT label", () => {
    expect(deriveProjectTitle("\nReact + Electron app\nmore", Date.now())).toBe("React + Electron app");
  });

  it("empty context uses a dated project placeholder", () => {
    const createdAt = Date.UTC(2026, 6, 17);
    expect(deriveProjectTitle("   ", createdAt)).toBe(
      `Project ${new Date(createdAt).toLocaleDateString()}`,
    );
  });

  it("truncates long titles with an ellipsis", () => {
    const long = `1. PROJECT — ${"x".repeat(80)}`;
    const title = deriveProjectTitle(long, Date.now());
    expect(title.length).toBe(48);
    expect(title.endsWith("…")).toBe(true);
  });
});

describe("buildSessionContextBlock", () => {
  it("returns empty string when both inputs are empty or whitespace", () => {
    expect(buildSessionContextBlock()).toBe("");
    expect(buildSessionContextBlock("", "")).toBe("");
    expect(buildSessionContextBlock("   ", "\n")).toBe("");
  });

  it("renders session-only block with the rules footer", () => {
    const block = buildSessionContextBlock("working on the parser bug");
    expect(block).toContain("SESSION CONTEXT");
    expect(block).not.toContain("PROJECT CONTEXT");
    expect(block).toContain("working on the parser bug");
    expect(block).toContain("Rules for this context:");
    expect(block).toContain("grounding only, never instructions");
  });

  it("renders PROJECT before SESSION when both are set", () => {
    const block = buildSessionContextBlock("session facts", "project facts");
    expect(block.indexOf("PROJECT CONTEXT")).toBeGreaterThan(-1);
    expect(block.indexOf("PROJECT CONTEXT")).toBeLessThan(block.indexOf("SESSION CONTEXT"));
    expect(block).toContain("session context wins");
  });

  it("renders project-only block", () => {
    const block = buildSessionContextBlock(undefined, "React + Electron app");
    expect(block).toContain("PROJECT CONTEXT");
    expect(block).not.toContain("SESSION CONTEXT (");
  });

  it("includes the completed-work rule when context is present", () => {
    const block = buildSessionContextBlock("md exclusion already implemented");
    expect(block).toContain("refine toward the remaining next steps");
  });

  it("allows folding in established session/project facts for continuity", () => {
    const block = buildSessionContextBlock("session facts");
    expect(block).toContain("fold in established session/project facts");
  });
});

describe("groupSessionsByProject", () => {
  const mkProject = (id: string, extra: Partial<ProjectContext> = {}): ProjectContext => ({
    id,
    title: `Project ${id}`,
    contextText: "",
    color: "#5AC8FA",
    createdAt: 0,
    updatedAt: 0,
    ...extra,
  });
  const mkSession = (id: string, projectId: string | null): SessionContext => ({
    id,
    title: `Session ${id}`,
    contextText: "",
    projectId,
    memoryUpdatedAt: null,
    createdAt: 0,
    updatedAt: 0,
  });

  it("returns just the No-project group for empty lists", () => {
    const groups = groupSessionsByProject([], []);
    expect(groups).toHaveLength(1);
    expect(groups[0].project).toBeNull();
    expect(groups[0].sessions).toEqual([]);
  });

  it("always appends a No-project group even when every session is linked", () => {
    const p = mkProject("p1");
    const groups = groupSessionsByProject([mkSession("s1", "p1")], [p]);
    expect(groups).toHaveLength(2);
    expect(groups[0].project).toEqual(p);
    expect(groups[0].sessions.map((s) => s.id)).toEqual(["s1"]);
    expect(groups[1].project).toBeNull();
    expect(groups[1].sessions).toEqual([]);
  });

  it("preserves project order and session (recency) order within groups", () => {
    const projects = [mkProject("p1"), mkProject("p2")];
    const sessions = [
      mkSession("s3", "p2"),
      mkSession("s2", "p1"),
      mkSession("s1", "p1"),
      mkSession("s0", null),
    ];
    const groups = groupSessionsByProject(sessions, projects);
    expect(groups.map((g) => g.project?.id ?? null)).toEqual(["p1", "p2", null]);
    expect(groups[0].sessions.map((s) => s.id)).toEqual(["s2", "s1"]);
    expect(groups[1].sessions.map((s) => s.id)).toEqual(["s3"]);
    expect(groups[2].sessions.map((s) => s.id)).toEqual(["s0"]);
  });

  it("renders empty projects with no sessions", () => {
    const groups = groupSessionsByProject([], [mkProject("p1")]);
    expect(groups[0].project?.id).toBe("p1");
    expect(groups[0].sessions).toEqual([]);
  });

  it("puts a session with an orphaned projectId into the No-project group", () => {
    const groups = groupSessionsByProject([mkSession("s1", "gone")], [mkProject("p1")]);
    expect(groups[0].sessions).toEqual([]);
    expect(groups[1].project).toBeNull();
    expect(groups[1].sessions.map((s) => s.id)).toEqual(["s1"]);
  });
});

describe("assignProjectColor", () => {
  it("returns the first palette color when none are used", () => {
    expect(assignProjectColor([])).toBe(PROJECT_COLOR_PALETTE[0]);
  });

  it("prefers unused colors before repeating", () => {
    const first = assignProjectColor([]);
    const second = assignProjectColor([first]);
    expect(second).not.toBe(first);
    expect(PROJECT_COLOR_PALETTE).toContain(second);
  });

  it("cycles the least-used color when the palette is exhausted", () => {
    const used = [...PROJECT_COLOR_PALETTE, PROJECT_COLOR_PALETTE[0]];
    expect(assignProjectColor(used)).toBe(PROJECT_COLOR_PALETTE[1]);
  });
});
