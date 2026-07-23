import { describe, expect, it } from "vitest";
import { shouldSuggestPromoteToProject } from "./sessionPromote";

const SESSION_WITH_FACTS = `1. GOAL — Ship overlay polish.
2. CURRENT STATE — wiring promote UI.
3. KEY FACTS — Anvyll uses Electron + Vite.
4. TERMINOLOGY — Overlay.tsx, storage.ts.
5. OPEN ITEMS — not established`;

describe("shouldSuggestPromoteToProject", () => {
  it("is false when session has no promotable sections", () => {
    expect(shouldSuggestPromoteToProject("", "project")).toBe(false);
    expect(shouldSuggestPromoteToProject("1. GOAL — only goal", "project")).toBe(false);
  });

  it("is true when session has KEY FACTS and project is empty", () => {
    expect(shouldSuggestPromoteToProject(SESSION_WITH_FACTS, "")).toBe(true);
  });

  it("is false when project already contains the session snippet", () => {
    expect(shouldSuggestPromoteToProject(SESSION_WITH_FACTS, SESSION_WITH_FACTS)).toBe(false);
  });
});
