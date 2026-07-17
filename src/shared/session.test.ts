import { describe, expect, it } from "vitest";
import {
  buildSessionContextBlock,
  clampContextText,
  deriveProjectTitle,
  deriveSessionTitle,
  NEW_SESSION_TITLE,
  SESSION_CONTEXT_MAX_CHARS,
} from "./session";

const IMPORT_SUMMARY = `1. GOAL — Ship session-based context management for Anvyl.ai.
2. CURRENT STATE — storage layer done, overlay wiring in progress.
3. KEY FACTS & DECISIONS — main process owns the store.
4. CONSTRAINTS & PREFERENCES — no native deps.
5. TERMINOLOGY & NAMES — storage.ts, Overlay.tsx.
6. OPEN ITEMS — not established`;

const PROJECT_IMPORT = `1. PROJECT — PromptForge Electron overlay for Windows.
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

describe("deriveProjectTitle", () => {
  it("uses the PROJECT line from an import summary, stripped and ellipsized", () => {
    const title = deriveProjectTitle(PROJECT_IMPORT, Date.now());
    expect(title.startsWith("PromptForge Electron overlay")).toBe(true);
    expect(title.length).toBeLessThanOrEqual(48);
    expect(title).not.toMatch(/^PROJECT\b/i);
  });

  it("picks up PROJECT text on the following line under a bare label", () => {
    expect(
      deriveProjectTitle("1. PROJECT\nAnvyl rewrite studio\n2. STACK — n/a", Date.now()),
    ).toBe("Anvyl rewrite studio");
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
});
