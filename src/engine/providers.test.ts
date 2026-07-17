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
    expect(system).toContain(
      "Standing context to fold into the STRUCTURE CONTRACT where relevant (does not change Cool/Warm/Hot/Max shape): audience: B2B founders",
    );
    const destIdx = system.indexOf("DESTINATION CONTEXT");
    const standingIdx = system.indexOf("Standing context to fold into the STRUCTURE CONTRACT");
    expect(destIdx).toBeGreaterThan(-1);
    expect(standingIdx).toBeGreaterThan(destIdx);
  });

  it("renders destination category without a style directive", () => {
    const styled: CaptureContext = {
      app: { processName: "chrome", site: "mail.google.com", category: "email" },
    };
    const { system } = buildMetaPrompt({ ...base, captureContext: styled });
    const block = system.slice(system.indexOf("DESTINATION CONTEXT"), system.indexOf("OUTPUT RULES"));
    expect(block).toContain("- Destination category: Email");
    expect(block).not.toContain("Style for this destination");
  });

  it("orders destination context before standing context", () => {
    const styled: CaptureContext = {
      app: { processName: "chrome", site: "mail.google.com", category: "email" },
    };
    const { system } = buildMetaPrompt({ ...base, context: "audience: B2B founders", captureContext: styled });
    const destIdx = system.indexOf("DESTINATION CONTEXT");
    const standingIdx = system.indexOf("Standing context to fold into the STRUCTURE CONTRACT");
    expect(destIdx).toBeGreaterThan(-1);
    expect(standingIdx).toBeGreaterThan(destIdx);
  });

  it("keeps Opus Hot structure contract mandatory when destination context is present", () => {
    const { system } = buildMetaPrompt({
      prompt: "fix the login bug",
      model: "claude-opus-4.8",
      level: 3,
      captureContext: ctx,
      context: "audience: B2B founders",
    });
    expect(system).toContain("<context>, <task>, <constraints>, <output_format>");
    expect(system).toContain("DESTINATION CONTEXT (grounding only — fold into the mandatory rules already stated above");
    expect(system).toContain("sparse or rich context never relaxes, replaces, or skips those rules");
    expect(system).toContain(
      "never drop, soften, or swap the selected Claude Opus 4.8 guide rules because context is missing or abundant",
    );
    // Structure contract must appear before destination grounding.
    expect(system.indexOf("STRUCTURE CONTRACT")).toBeLessThan(system.indexOf("DESTINATION CONTEXT"));
  });

});

describe("buildMetaPrompt session/project context", () => {
  it("omits the block when neither is set", () => {
    const { system } = buildMetaPrompt(base);
    expect(system).not.toContain("SESSION CONTEXT");
    expect(system).not.toContain("PROJECT CONTEXT");
  });

  it("renders SESSION CONTEXT when set, with the grounding rules", () => {
    const { system } = buildMetaPrompt({ ...base, sessionContext: "working on the parser bug" });
    expect(system).toContain("SESSION CONTEXT");
    expect(system).toContain("working on the parser bug");
    expect(system).toContain("The user's current draft always wins over this context");
  });

  it("renders PROJECT before SESSION and after the destination block", () => {
    const { system } = buildMetaPrompt({
      ...base,
      captureContext: ctx,
      sessionContext: "session facts",
      projectContext: "project facts",
    });
    expect(system.indexOf("DESTINATION CONTEXT")).toBeLessThan(system.indexOf("PROJECT CONTEXT"));
    expect(system.indexOf("PROJECT CONTEXT")).toBeLessThan(system.indexOf("SESSION CONTEXT"));
  });

  it("whitespace-only context renders nothing", () => {
    const { system } = buildMetaPrompt({ ...base, sessionContext: "   ", projectContext: "\n" });
    expect(system).not.toContain("SESSION CONTEXT");
  });
});
