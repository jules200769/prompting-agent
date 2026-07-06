import { describe, expect, it } from "vitest";
import {
  isIntegratedTerminalHost,
  isTerminalAccessibilityNoise,
  isIdeWindowTitleNoise,
  isCaptureNoiseText,
  isTerminalCaptureContext,
  isTerminalPaneHint,
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

  it("detects Run the command hint fragments", () => {
    expect(isTerminalAccessibilityNoise("Run the command: Toggle Screen Reader")).toBe(true);
  });

  it("detects Terminal N label without line-start anchor", () => {
    expect(isTerminalAccessibilityNoise("prefix Terminal 30, powershell extra")).toBe(true);
  });
});

describe("isIdeWindowTitleNoise", () => {
  it("detects Cursor window titles", () => {
    expect(isIdeWindowTitleNoise("apply_inject_flow_hq_3ca28c90.plan.md - prompt-master - Cursor")).toBe(true);
  });

  it("returns false for normal terminal input", () => {
    expect(isIdeWindowTitleNoise("maak een app")).toBe(false);
  });
});

describe("isCaptureNoiseText", () => {
  it("combines accessibility and IDE title noise", () => {
    expect(isCaptureNoiseText("Terminal 15, powershell Run the command:")).toBe(true);
    expect(isCaptureNoiseText("readme.md - myrepo - Cursor")).toBe(true);
    expect(isCaptureNoiseText("maak een app")).toBe(false);
  });
});

describe("isTerminalPaneHint", () => {
  it("detects xterm class names", () => {
    expect(isTerminalPaneHint({ className: "xterm-rows" })).toBe(true);
  });

  it("detects Terminal N pane names", () => {
    expect(isTerminalPaneHint({ name: "Terminal 30, powershell" })).toBe(true);
  });

  it("returns false for monaco editor", () => {
    expect(isTerminalPaneHint({ className: "monaco-editor", controlType: "ControlType.Document" })).toBe(false);
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
