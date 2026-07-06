import { describe, expect, it } from "vitest";
import {
  buildInjectMetaPayload,
  classifyHostKind,
  classifyInjectHostKind,
  isRichEditorElement,
  terminalUsesConhostCopy,
} from "./injectStrategy";

describe("isRichEditorElement", () => {
  it("detects monaco and ProseMirror class names", () => {
    expect(isRichEditorElement("monaco-editor", "")).toBe(true);
    expect(isRichEditorElement("ProseMirror", "")).toBe(true);
  });

  it("detects ControlType.Document", () => {
    expect(isRichEditorElement("Editor", "ControlType.Document")).toBe(true);
  });

  it("returns false for plain edit controls", () => {
    expect(isRichEditorElement("Edit", "ControlType.Edit")).toBe(false);
  });
});

describe("classifyHostKind", () => {
  it("classifies Chromium top-level windows", () => {
    expect(
      classifyHostKind({
        topClassName: "Chrome_WidgetWin_1",
        elementClassName: "Edit",
        controlType: "ControlType.Edit",
      }),
    ).toBe("chromium");
  });

  it("prefers richEditor over chromium when element is a code editor", () => {
    expect(
      classifyHostKind({
        topClassName: "Chrome_WidgetWin_1",
        elementClassName: "monaco-editor",
        controlType: "ControlType.Document",
      }),
    ).toBe("richEditor");
  });

  it("classifies native Win32 hosts", () => {
    expect(
      classifyHostKind({
        topClassName: "Notepad",
        elementClassName: "Edit",
        controlType: "ControlType.Edit",
      }),
    ).toBe("native");
  });

  it("classifies Word-style document hosts as richEditor", () => {
    expect(
      classifyHostKind({
        topClassName: "OpusApp",
        elementClassName: "_WwG",
        controlType: "ControlType.Document",
      }),
    ).toBe("richEditor");
  });
});

describe("classifyInjectHostKind", () => {
  it("classifies native terminal windows as terminal", () => {
    expect(
      classifyInjectHostKind({
        topClassName: "CASCADIA_HOSTING_WINDOW_CLASS",
        processName: "WindowsTerminal",
      }),
    ).toBe("terminal");
  });

  it("classifies Cursor integrated terminal panes as terminal", () => {
    expect(
      classifyInjectHostKind({
        topClassName: "Chrome_WidgetWin_1",
        processName: "Cursor",
        focusedIsTerminalPane: true,
      }),
    ).toBe("terminal");
  });

  it("keeps Cursor editor fields as chromium", () => {
    expect(
      classifyInjectHostKind({
        topClassName: "Chrome_WidgetWin_1",
        processName: "Cursor",
        focusedIsTerminalPane: false,
        elementClassName: "monaco-editor",
        controlType: "ControlType.Document",
      }),
    ).toBe("richEditor");
  });
});

describe("terminalUsesConhostCopy", () => {
  it("is true only for ConsoleWindowClass", () => {
    expect(terminalUsesConhostCopy("ConsoleWindowClass")).toBe(true);
    expect(terminalUsesConhostCopy("CASCADIA_HOSTING_WINDOW_CLASS")).toBe(false);
  });
});

describe("buildInjectMetaPayload", () => {
  it("routes terminal Apply through win-inject.ps1 with frozen bounds", () => {
    const bounds = { left: 10, top: 20, right: 800, bottom: 600 };
    const payload = buildInjectMetaPayload({
      uia: null,
      hostKind: "terminal",
      topClassName: "CASCADIA_HOSTING_WINDOW_CLASS",
      processName: "WindowsTerminal",
      terminalUseConhostCopy: false,
      terminalBounds: bounds,
    });
    expect(payload.hostKind).toBe("terminal");
    expect(payload.processName).toBe("WindowsTerminal");
    expect(payload.terminalUseConhostCopy).toBe(false);
    expect(payload.terminalBounds).toEqual(bounds);
    expect(payload.bounds).toEqual(bounds);
  });

  it("marks conhost terminal inject for Home+Shift+End line select", () => {
    const payload = buildInjectMetaPayload({
      uia: null,
      hostKind: "terminal",
      topClassName: "ConsoleWindowClass",
      processName: "powershell",
      terminalUseConhostCopy: true,
    });
    expect(payload.hostKind).toBe("terminal");
    expect(payload.terminalUseConhostCopy).toBe(true);
    expect(payload.terminalBounds).toBeUndefined();
  });

  it("preserves UIA fields for field inject without terminal bounds", () => {
    const payload = buildInjectMetaPayload({
      uia: {
        runtimeId: [42, 7, 3],
        className: "Edit",
        controlType: "ControlType.Edit",
      },
      hostKind: "native",
      topClassName: "Notepad",
      processName: "Notepad",
    });
    expect(payload.hostKind).toBe("native");
    expect(payload.runtimeId).toEqual([42, 7, 3]);
    expect(payload.className).toBe("Edit");
    expect(payload.terminalBounds).toBeUndefined();
  });
});

/**
 * Manual Apply/inject test matrix (Electron build required):
 *
 * | App                 | Field            | Expected primary   |
 * |---------------------|------------------|--------------------|
 * | Notepad             | plain textarea   | valuePattern       |
 * | Cursor              | chat input       | clipboardPaste     |
 * | Chrome              | textarea         | clipboardPaste     |
 * | VS Code             | editor           | clipboardPaste     |
 * | Word                | document         | clipboardPaste     |
 * | Elevated PowerShell | prompt           | terminalPaste      |
 */
