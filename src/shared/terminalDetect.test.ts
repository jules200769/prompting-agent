import { describe, expect, it } from "vitest";
import {
  isIntegratedTerminalHost,
  isTerminalAccessibilityNoise,
  isTerminalCaptureContext,
  isTerminalWindow,
} from "./terminalDetect";

describe("isTerminalWindow", () => {
  it("detects Windows Terminal by class name", () => {
    expect(isTerminalWindow("CASCADIA_HOSTING_WINDOW_CLASS", undefined)).toBe(true);
  });

  it("detects conhost by class name", () => {
    expect(isTerminalWindow("ConsoleWindowClass", undefined)).toBe(true);
  });

  it("detects mintty by class name", () => {
    expect(isTerminalWindow("mintty", undefined)).toBe(true);
  });

  it("detects terminal processes", () => {
    expect(isTerminalWindow(undefined, "WindowsTerminal.exe")).toBe(true);
    expect(isTerminalWindow(undefined, "conhost")).toBe(true);
    expect(isTerminalWindow(undefined, "cmd.exe")).toBe(true);
    expect(isTerminalWindow(undefined, "powershell")).toBe(true);
    expect(isTerminalWindow(undefined, "pwsh.exe")).toBe(true);
  });

  it("returns false for non-terminal windows", () => {
    expect(isTerminalWindow("Chrome_WidgetWin_1", "chrome")).toBe(false);
    expect(isTerminalWindow("Chrome_RenderWidgetHostHWND", "Cursor")).toBe(false);
    expect(isTerminalWindow(undefined, undefined)).toBe(false);
    expect(isTerminalWindow("", "")).toBe(false);
  });
});

describe("isIntegratedTerminalHost", () => {
  it("detects Cursor and VS Code", () => {
    expect(isIntegratedTerminalHost("Cursor")).toBe(true);
    expect(isIntegratedTerminalHost("Code")).toBe(true);
    expect(isIntegratedTerminalHost("code.exe")).toBe(true);
  });

  it("returns false for other apps", () => {
    expect(isIntegratedTerminalHost("chrome")).toBe(false);
    expect(isIntegratedTerminalHost("WindowsTerminal")).toBe(false);
  });
});

describe("isTerminalAccessibilityNoise", () => {
  it("detects Cursor/VS Code terminal screen-reader hints", () => {
    const sample =
      "Terminal 15, powershell Run the command: Toggle Screen Reader Accessibility Mode for an optimized screen reader experience Use Alt+F1 for terminal accessibility help";
    expect(isTerminalAccessibilityNoise(sample)).toBe(true);
  });

  it("returns false for normal user text", () => {
    expect(isTerminalAccessibilityNoise("npm run build")).toBe(false);
    expect(isTerminalAccessibilityNoise("git status")).toBe(false);
  });
});

describe("isTerminalCaptureContext", () => {
  it("detects native terminal windows", () => {
    expect(isTerminalCaptureContext("CASCADIA_HOSTING_WINDOW_CLASS", "WindowsTerminal")).toBe(true);
  });

  it("detects integrated terminal panes in Cursor", () => {
    expect(isTerminalCaptureContext("Chrome_WidgetWin_1", "Cursor", true)).toBe(true);
  });

  it("does not treat Cursor editor as terminal", () => {
    expect(isTerminalCaptureContext("Chrome_WidgetWin_1", "Cursor", false)).toBe(false);
  });
});
