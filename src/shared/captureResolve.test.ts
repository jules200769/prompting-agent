import { describe, expect, it } from "vitest";
import { resolveCaptureResult } from "./captureResolve";

describe("resolveCaptureResult", () => {
  it("prefers Ctrl+C selection when clipboard changed", () => {
    const result = resolveCaptureResult({
      snapshotText: "old clip",
      afterCopy: "selected text",
      afterSelectAllCopy: "full field",
    });
    expect(result).toEqual({ text: "selected text", mode: "field" });
  });

  it("falls back to Ctrl+A+Ctrl+C when copy unchanged", () => {
    const result = resolveCaptureResult({
      snapshotText: "old clip",
      afterCopy: "old clip",
      afterSelectAllCopy: "entire text field",
    });
    expect(result).toEqual({ text: "entire text field", mode: "field" });
  });

  it("returns empty when nothing new was copied", () => {
    const result = resolveCaptureResult({
      snapshotText: "same",
      afterCopy: "same",
      afterSelectAllCopy: "same",
    });
    expect(result).toEqual({ text: "", mode: "empty" });
  });

  it("returns empty when all reads are blank", () => {
    const result = resolveCaptureResult({
      snapshotText: "",
      afterCopy: "",
      afterSelectAllCopy: "",
    });
    expect(result).toEqual({ text: "", mode: "empty" });
  });
});
