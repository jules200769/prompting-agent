import { describe, expect, it } from "vitest";
import { shouldUseEarlyCaptureFastPath } from "./captureFastPath";

describe("shouldUseEarlyCaptureFastPath", () => {
  it("returns true when early text and UIA metadata are present", () => {
    expect(shouldUseEarlyCaptureFastPath("hello field", true)).toBe(true);
  });

  it("returns false when early text is empty", () => {
    expect(shouldUseEarlyCaptureFastPath("", true)).toBe(false);
    expect(shouldUseEarlyCaptureFastPath("   ", true)).toBe(false);
    expect(shouldUseEarlyCaptureFastPath(null, true)).toBe(false);
  });

  it("returns false when UIA metadata is missing", () => {
    expect(shouldUseEarlyCaptureFastPath("hello field", false)).toBe(false);
  });

  it("returns false when both are missing", () => {
    expect(shouldUseEarlyCaptureFastPath(null, false)).toBe(false);
  });
});
