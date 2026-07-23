import { describe, expect, it } from "vitest";
import { isRecentSessionMemoryUpdate, mergeStandingNotes } from "./standingNotes";

describe("mergeStandingNotes", () => {
  it("joins settings notes and request context", () => {
    expect(mergeStandingNotes("notes", "extra")).toBe("notes\n\nextra");
  });

  it("returns whichever side is non-empty", () => {
    expect(mergeStandingNotes("notes", "")).toBe("notes");
    expect(mergeStandingNotes("", "extra")).toBe("extra");
    expect(mergeStandingNotes(undefined, undefined)).toBeUndefined();
  });
});

describe("isRecentSessionMemoryUpdate", () => {
  it("is true within the default window", () => {
    const now = 1_000_000;
    expect(isRecentSessionMemoryUpdate(now - 10_000, 30_000, now)).toBe(true);
  });

  it("is false when stale or missing", () => {
    const now = 1_000_000;
    expect(isRecentSessionMemoryUpdate(now - 60_000, 30_000, now)).toBe(false);
    expect(isRecentSessionMemoryUpdate(null)).toBe(false);
  });
});
