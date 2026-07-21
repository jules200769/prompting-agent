import { describe, expect, it } from "vitest";
import { detectContextSummary } from "./contextSummaryDetect";
import { CONTEXT_IMPORT_PROMPT, PROJECT_CONTEXT_IMPORT_PROMPT } from "./contextImportPrompt";

const SESSION_SUMMARY = `1. GOAL — Ship the session/context UX redesign.
2. CURRENT STATE — Wave NOW landed; panel in progress.
3. KEY FACTS & DECISIONS — main owns the store; grounding is UI-only.
4. CONSTRAINTS & PREFERENCES — no native deps; English UI only.
5. TERMINOLOGY & NAMES — Overlay.tsx, ContextPanel.tsx, storage.ts.
6. OPEN ITEMS — wire the clipboard toast.`;

const PROJECT_SUMMARY = `1. PROJECT — Anvyll overlay for Windows.
2. STACK & ARCHITECTURE — Electron, Vite, React, TypeScript.
3. CONVENTIONS — English UI only; local JSON store.
4. KEY FACTS & DECISIONS — main process owns the store.
5. CONSTRAINTS & PREFERENCES — no native deps.
6. TERMINOLOGY & NAMES — Overlay.tsx, storage.ts.`;

describe("detectContextSummary", () => {
  it("detects a valid session summary", () => {
    expect(detectContextSummary(SESSION_SUMMARY)).toBe("session");
  });

  it("detects a valid project summary", () => {
    expect(detectContextSummary(PROJECT_SUMMARY)).toBe("project");
  });

  it("detects summaries with 'not established' bodies", () => {
    const sparse = `1. GOAL — not established
2. CURRENT STATE — not established
3. KEY FACTS & DECISIONS — not established
4. CONSTRAINTS & PREFERENCES — not established
5. TERMINOLOGY & NAMES — not established
6. OPEN ITEMS — not established`;
    expect(detectContextSummary(sparse)).toBe("session");
  });

  it("rejects the literal export prompts (false-positive regression pin)", () => {
    expect(detectContextSummary(CONTEXT_IMPORT_PROMPT)).toBeNull();
    expect(detectContextSummary(PROJECT_CONTEXT_IMPORT_PROMPT)).toBeNull();
  });

  it("rejects a summary missing one label (5 of 6)", () => {
    const missing = `1. GOAL — do the thing
2. CURRENT STATE — halfway
3. KEY FACTS & DECISIONS — some
4. CONSTRAINTS & PREFERENCES — none
5. TERMINOLOGY & NAMES — names`;
    expect(detectContextSummary(missing)).toBeNull();
  });

  it("rejects labels that are out of order", () => {
    const reordered = `1. CURRENT STATE — halfway
2. GOAL — do the thing
3. KEY FACTS & DECISIONS — some
4. CONSTRAINTS & PREFERENCES — none
5. TERMINOLOGY & NAMES — names
6. OPEN ITEMS — next`;
    expect(detectContextSummary(reordered)).toBeNull();
  });

  it("rejects oversized clipboards cheaply", () => {
    expect(detectContextSummary(`${SESSION_SUMMARY}\n${"x".repeat(9000)}`)).toBeNull();
  });

  it("rejects labels that are not line-anchored (mid-sentence)", () => {
    const inline =
      "Here is a recap: 1. GOAL was to ship, then 2. CURRENT STATE progressed, " +
      "3. KEY FACTS & DECISIONS noted, 4. CONSTRAINTS & PREFERENCES set, " +
      "5. TERMINOLOGY & NAMES listed, 6. OPEN ITEMS remain.";
    expect(detectContextSummary(inline)).toBeNull();
  });

  it("rejects too-short text", () => {
    expect(detectContextSummary("1. GOAL — x")).toBeNull();
  });
});
