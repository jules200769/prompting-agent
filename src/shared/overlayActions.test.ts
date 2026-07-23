import { describe, expect, it } from "vitest";
import { isCursorProcessName, overlayCompletionAction, overlayFooterActions } from "./overlayActions";

describe("overlayFooterActions", () => {
  it("shows a single Copy action for Cursor terminal sessions", () => {
    expect(overlayFooterActions(true, true)).toEqual(["copy"]);
  });

  it("shows a single Copy action when no text field can receive injection", () => {
    expect(overlayFooterActions(false, false)).toEqual(["copy"]);
  });

  it("keeps Apply and Copy when a focused text field can receive injection", () => {
    expect(overlayFooterActions(false, true)).toEqual(["apply", "copy"]);
  });
});

describe("overlayCompletionAction", () => {
  it("routes Cursor-terminal Enter to Copy and never Apply", () => {
    expect(overlayCompletionAction(true, true)).toBe("copy");
  });

  it("copies when no inject target and applies when a text field is injectable", () => {
    expect(overlayCompletionAction(false, false)).toBe("copy");
    expect(overlayCompletionAction(false, true)).toBe("apply");
  });
});

describe("isCursorProcessName", () => {
  it("matches Cursor case-insensitively with or without the executable suffix", () => {
    expect(isCursorProcessName("Cursor")).toBe(true);
    expect(isCursorProcessName("cursor.exe")).toBe(true);
    expect(isCursorProcessName(" CURSOR.EXE ")).toBe(true);
  });

  it("does not match VS Code or similar process names", () => {
    expect(isCursorProcessName("Code.exe")).toBe(false);
    expect(isCursorProcessName("Cursor Helper")).toBe(false);
    expect(isCursorProcessName()).toBe(false);
  });
});
