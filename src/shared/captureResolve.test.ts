import { describe, expect, it } from "vitest";
import { pickResolvedCaptureText, resolveCaptureResult } from "./captureResolve";

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

describe("pickResolvedCaptureText", () => {
  const noise =
    "Terminal 30, powershell Run the command: Toggle Screen Reader Accessibility Mode for an optimized screen reader experience";
  const title = "apply_inject_flow_hq_3ca28c90.plan.md - prompt-master - Cursor";

  it("returns field text only when mode is field", () => {
    expect(pickResolvedCaptureText({ mode: "field", text: "npm run build" }, noise)).toBe("npm run build");
  });

  it("does not fall back to raw script output when mode is empty", () => {
    expect(pickResolvedCaptureText({ mode: "empty", text: "" }, noise)).toBe("");
    expect(pickResolvedCaptureText({ mode: "empty", text: "" }, title)).toBe("");
  });

  it("does not fall back to raw script output when mode is terminal without resolved text", () => {
    expect(pickResolvedCaptureText({ mode: "terminal", text: "" }, noise)).toBe("");
  });
});
