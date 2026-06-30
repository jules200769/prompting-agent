import { describe, expect, it } from "vitest";
import {
  extractTerminalInput,
  isLikelyFullConsoleBuffer,
  isTerminalBufferDump,
  resolveCaptureFromPossibleTerminal,
  resolveTerminalCaptureMode,
} from "./terminalCapture";

describe("resolveTerminalCaptureMode", () => {
  it("returns terminal when selection text is present", () => {
    expect(resolveTerminalCaptureMode("npm run build")).toBe("terminal");
  });

  it("returns empty when selection is blank", () => {
    expect(resolveTerminalCaptureMode("")).toBe("empty");
    expect(resolveTerminalCaptureMode("   ")).toBe("empty");
    expect(resolveTerminalCaptureMode(null)).toBe("empty");
    expect(resolveTerminalCaptureMode(undefined)).toBe("empty");
  });
});

describe("isTerminalBufferDump", () => {
  it("detects Windows PowerShell startup banner", () => {
    const sample = `Windows PowerShell
Copyright (C) Microsoft Corporation. All rights reserved.

Install the latest PowerShell for new features and improvements! https://aka.ms/PSWindows`;
    expect(isTerminalBufferDump(sample)).toBe(true);
  });
});

describe("extractTerminalInput", () => {
  it("extracts typed input from a full PowerShell buffer read", () => {
    const sample = `Windows PowerShell                                                                                                      
Copyright (C) Microsoft Corporation. All rights reserved.                                                               
                                                                                                                        
Install the latest PowerShell for new features and improvements! https://aka.ms/PSWindows                               
                                                                                                                        
PS C:\\Users\\julez> kijk maar, hier is het bewijs...`;
    expect(extractTerminalInput(sample)).toBe("kijk maar, hier is het bewijs...");
  });

  it("returns a plain single-line selection unchanged", () => {
    expect(extractTerminalInput("npm run build")).toBe("npm run build");
  });

  it("returns a multi-line script selection unchanged", () => {
    const script = "function foo() {\n  return 1;\n}";
    expect(extractTerminalInput(script)).toBe(script);
  });

  it("returns null for buffer dump with empty prompt line", () => {
    const sample = `Windows PowerShell
Copyright (C) Microsoft Corporation. All rights reserved.
PS C:\\Users\\julez> `;
    expect(extractTerminalInput(sample)).toBeNull();
  });
});

describe("resolveCaptureFromPossibleTerminal", () => {
  const buffer = `Windows PowerShell
Copyright (C) Microsoft Corporation. All rights reserved.
PS C:\\Users\\julez> mijn prompt hier`;

  it("extracts from buffer even when snapshot missed terminal flag (field-path fallback)", () => {
    const res = resolveCaptureFromPossibleTerminal(buffer, {
      className: "ConsoleWindowClass",
      process: "powershell",
    });
    expect(res.mode).toBe("terminal");
    expect(res.text).toBe("mijn prompt hier");
    expect(res.terminalContext).toBe(true);
  });

  it("detects buffer dump without explicit terminal context", () => {
    const res = resolveCaptureFromPossibleTerminal(buffer);
    expect(res.mode).toBe("terminal");
    expect(res.text).toBe("mijn prompt hier");
  });

  it("keeps normal field text unchanged", () => {
    const res = resolveCaptureFromPossibleTerminal("hello from a text field", {
      className: "Chrome_WidgetWin_1",
      process: "chrome",
    });
    expect(res).toEqual({ text: "hello from a text field", mode: "field", terminalContext: false });
  });
});

describe("isLikelyFullConsoleBuffer", () => {
  it("flags multi-line padded console reads", () => {
    const padded = Array.from({ length: 5 }, (_, i) => `line ${i + 1} `.padEnd(60, " ")).join("\n");
    expect(isLikelyFullConsoleBuffer(padded)).toBe(true);
  });
});
