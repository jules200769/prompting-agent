import { describe, expect, it } from "vitest";
import {
  filterLibraryEntries,
  restorePromptVersion,
  clarificationContext,
  usagePercent,
  yearlyMonthlyEquivalent,
  type LibraryEntry,
  type PromptVersion,
  STUDIO_PLANS,
  STUDIO_ROUTES,
} from "./studio";

const entries: LibraryEntry[] = [
  {
    id: "1",
    title: "Code review",
    description: "Review a TypeScript change",
    originalText: "review code",
    optimizedText: "Review this TypeScript change",
    model: "gpt-5",
    level: 2,
    score: 82,
    tags: ["code"],
    category: "code",
    pinned: false,
    origin: "personal",
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: "2",
    title: "Research brief",
    description: "Create a sourced brief",
    originalText: "research",
    optimizedText: "Create a research brief",
    model: "claude-opus-4.8",
    level: 3,
    score: 91,
    tags: ["research"],
    category: "research",
    pinned: true,
    origin: "personal",
    createdAt: 2,
    updatedAt: 2,
  },
];

describe("Studio product helpers", () => {
  it("clamps finite usage and keeps unlimited at zero percent", () => {
    const now = Date.now();
    expect(usagePercent({ used: 500, limit: 1_000, periodStartedAt: now, periodEndsAt: now })).toBe(50);
    expect(usagePercent({ used: 5_000, limit: 1_000, periodStartedAt: now, periodEndsAt: now })).toBe(100);
    expect(usagePercent({ used: 500, limit: null, periodStartedAt: now, periodEndsAt: now })).toBe(0);
  });

  it("applies the displayed 20 percent yearly saving", () => {
    expect(yearlyMonthlyEquivalent(STUDIO_PLANS[1])).toBe(15.2);
  });

  it("filters library entries and orders pinned entries first", () => {
    expect(filterLibraryEntries(entries, "", "all", "all").map((entry) => entry.id)).toEqual(["2", "1"]);
    expect(filterLibraryEntries(entries, "typescript", "code", "all").map((entry) => entry.id)).toEqual(["1"]);
    expect(filterLibraryEntries(entries, "", "all", "gpt-5").map((entry) => entry.id)).toEqual(["1"]);
  });

  it("restores a version by appending a new immutable timeline entry", () => {
    const versions: PromptVersion[] = [
      { id: "v1", label: "Generated", prompt: "one", source: "generated", createdAt: 1 },
      { id: "v2", label: "Optimized", prompt: "two", source: "optimized", createdAt: 2 },
    ];
    const restored = restorePromptVersion(versions, "v1", 3);
    expect(restored).toHaveLength(3);
    expect(restored[2]).toMatchObject({ prompt: "one", source: "restored" });
    expect(versions).toHaveLength(2);
  });

  it("covers every public Studio navigation destination", () => {
    expect(STUDIO_ROUTES).toEqual([
      "generator",
      "optimizer",
      "tester",
      "library",
      "instructions",
      "history",
      "plans",
      "settings",
    ]);
  });

  it("serializes only answered clarification questions", () => {
    expect(clarificationContext([
      { id: "one", prompt: "Audience?", helper: "", options: [], answer: "Developers" },
      { id: "two", prompt: "Format?", helper: "", options: [] },
    ])).toBe("Audience?\nDevelopers");
  });
});
