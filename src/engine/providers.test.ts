import { describe, expect, it } from "vitest";
import { buildMetaPrompt } from "./providers";
import {
  CONTEXT_CAPS,
  type CaptureContext,
} from "../shared/types";

const base = {
  prompt: "fix the login bug",
  model: "claude-opus-4.8" as const,
  level: 2 as const,
};

const ctx: CaptureContext = {
  app: { processName: "chrome", windowTitle: "Claude - Google Chrome", hostKind: "chromium", site: "claude.ai" },
  text: { scope: "field", hasSelection: false },
  files: { activeFile: "storage.ts", recentFiles: ["contextLayer.ts"] },
  suggestedModel: "claude-opus-4.8",
};

describe("buildMetaPrompt destination context", () => {
  it("omits the block when captureContext is absent", () => {
    const { system } = buildMetaPrompt(base);
    expect(system).not.toContain("DESTINATION CONTEXT");
  });

  it("renders the block when captureContext is present", () => {
    const { system } = buildMetaPrompt({ ...base, captureContext: ctx });
    expect(system).toContain("DESTINATION CONTEXT");
    expect(system).toContain("- Website: claude.ai");
    expect(system).toContain("storage.ts, contextLayer.ts");
  });

  it("never renders the suggested model into the block", () => {
    const { system } = buildMetaPrompt({ ...base, model: "gpt-5", captureContext: ctx });
    const block = system.slice(system.indexOf("DESTINATION CONTEXT"), system.indexOf("OUTPUT RULES"));
    expect(block).not.toContain("claude-opus-4.8");
  });

  it("coexists with TERMINAL SHELL — terminal rule stays intact and supreme", () => {
    const termCtx: CaptureContext = {
      app: { processName: "WindowsTerminal", hostKind: "terminal", category: "terminal" },
      text: { scope: "field", hasSelection: false },
      styleHint: "Terse, imperative shell wording. No pleasantries, no filler words.",
    };
    const { system } = buildMetaPrompt({ ...base, terminalContext: true, captureContext: termCtx });
    expect(system).toContain("TERMINAL SHELL (mandatory — overrides structure contract above)");
    expect(system).toContain("DESTINATION CONTEXT");
    // The context block must not add formatting mandates that fight the terminal rule.
    const block = system.slice(system.indexOf("DESTINATION CONTEXT"), system.indexOf("OUTPUT RULES"));
    expect(block).not.toMatch(/output format|multi-line|markdown/i);
  });

  it("enforces caps on before/after cursor text", () => {
    const bigCtx: CaptureContext = {
      app: { processName: "cursor", editorKind: "cursor" },
      text: {
        scope: "selection",
        hasSelection: true,
        selectedText: "sel",
        beforeCursor: "x".repeat(10000),
        afterCursor: "y".repeat(10000),
      },
    };
    const { system } = buildMetaPrompt({ ...base, captureContext: bigCtx });
    expect(system.match(/x{100,}/)![0].length).toBe(CONTEXT_CAPS.beforeCursor);
    expect(system.match(/y{100,}/)![0].length).toBe(CONTEXT_CAPS.afterCursor);
  });

  it("keeps standing contextMemory distinct from the destination block", () => {
    const { system } = buildMetaPrompt({ ...base, context: "audience: B2B founders", captureContext: ctx });
    expect(system).toContain("Standing context to incorporate where relevant: audience: B2B founders");
    const destIdx = system.indexOf("DESTINATION CONTEXT");
    const standingIdx = system.indexOf("Standing context to incorporate");
    expect(destIdx).toBeGreaterThan(-1);
    expect(standingIdx).toBeGreaterThan(destIdx);
  });

  it("renders the style directive inside the destination block", () => {
    const styled: CaptureContext = {
      app: { processName: "chrome", site: "mail.google.com", category: "email" },
      styleHint: "Professional, courteous tone suited to email.",
    };
    const { system } = buildMetaPrompt({ ...base, captureContext: styled });
    const block = system.slice(system.indexOf("DESTINATION CONTEXT"), system.indexOf("OUTPUT RULES"));
    expect(block).toContain("- Destination category: Email");
    expect(block).toContain("- Style for this destination: Professional, courteous tone suited to email.");
  });

  it("orders the style directive after the model rules and before standing context", () => {
    const styled: CaptureContext = {
      app: { processName: "chrome", site: "mail.google.com", category: "email" },
      styleHint: "Professional, courteous tone suited to email.",
    };
    const { system } = buildMetaPrompt({ ...base, context: "audience: B2B founders", captureContext: styled });
    const styleIdx = system.indexOf("- Style for this destination:");
    const destIdx = system.indexOf("DESTINATION CONTEXT");
    const standingIdx = system.indexOf("Standing context to incorporate");
    expect(styleIdx).toBeGreaterThan(destIdx);
    expect(standingIdx).toBeGreaterThan(styleIdx);
  });

});
