import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AppSettings } from "../shared/types";
import { DEFAULT_SETTINGS } from "../shared/types";

let settings: AppSettings = { ...DEFAULT_SETTINGS };

vi.mock("./storage", () => ({
  getSettings: () => settings,
  listFileMemory: () => [],
  recordFileMemory: () => {},
}));

const { assembleCaptureContext } = await import("./contextLayer");
const { buildDestinationContextBlock } = await import("../shared/contextSignals");

const capture = (snapshot: Record<string, unknown>, uia: Record<string, unknown> | null = null) =>
  assembleCaptureContext({
    mode: "field",
    capturedText: "fix the bug",
    uia: uia as never,
    sidecar: null,
    snapshot: snapshot as never,
  });

beforeEach(() => {
  settings = { ...DEFAULT_SETTINGS };
});

// Covers the main-process wiring end to end: settings → category detection →
// directive resolution → rendered DESTINATION CONTEXT block.
describe("assembleCaptureContext style matching wiring", () => {
  it("Gmail in Chrome resolves to email + email directive, and renders", () => {
    const ctx = capture({ process: "chrome", windowTitle: "Compose - Gmail", siteUrl: "https://mail.google.com/mail/u/0", hostKind: "chromium" });
    expect(ctx?.app?.category).toBe("email");
    expect(ctx?.styleHint).toMatch(/courteous tone suited to email/);
    const block = buildDestinationContextBlock(ctx);
    expect(block).toContain("- Destination category: Email");
    expect(block).toContain("- Style for this destination:");
  });

  it("Windows Terminal resolves to terminal with no format mandate", () => {
    const ctx = capture({ process: "WindowsTerminal.exe", windowTitle: "pwsh", hostKind: "terminal" });
    expect(ctx?.app?.category).toBe("terminal");
    expect(buildDestinationContextBlock(ctx)).not.toMatch(/output format|multi-line|markdown/i);
  });

  it("Cursor chat pane is ai-chat; Cursor editor is code-editor", () => {
    expect(capture({ process: "cursor", hostKind: "native" }, { className: "aislash-editor-input" })?.app?.category).toBe("ai-chat");
    expect(capture({ process: "cursor", windowTitle: "storage.ts - Cursor", hostKind: "native" })?.app?.category).toBe("code-editor");
  });

  it("per-category preset changes the hint; 'off' removes it", () => {
    const snap = { process: "chrome", siteUrl: "https://mail.google.com", hostKind: "chromium" };
    const auto = capture(snap)?.styleHint;
    settings = { ...DEFAULT_SETTINGS, styleByCategory: { email: "casual" } };
    const casual = capture(snap)?.styleHint;
    expect(casual).toMatch(/^Casual, conversational tone\./);
    expect(casual).not.toBe(auto);

    settings = { ...DEFAULT_SETTINGS, styleByCategory: { email: "off" } };
    const ctx = capture(snap);
    expect(ctx?.styleHint).toBeUndefined();
    expect(buildDestinationContextBlock(ctx)).not.toContain("Style for this destination");
  });

  it("master toggle off leaves the category but drops the hint", () => {
    settings = { ...DEFAULT_SETTINGS, styleMatching: false };
    const ctx = capture({ process: "chrome", siteUrl: "https://mail.google.com", hostKind: "chromium" });
    expect(ctx?.app?.category).toBe("email");
    expect(ctx?.styleHint).toBeUndefined();
  });

  it("screenContext off ships no context at all", () => {
    settings = { ...DEFAULT_SETTINGS, screenContext: false };
    expect(capture({ process: "chrome", siteUrl: "https://mail.google.com" })).toBeUndefined();
  });

  it("unknown app contributes no category or style line", () => {
    const ctx = capture({ process: "notepad.exe", windowTitle: "Untitled - Notepad", hostKind: "native" });
    expect(ctx?.app?.category).toBe("other");
    expect(ctx?.styleHint).toBeUndefined();
    const block = buildDestinationContextBlock(ctx);
    expect(block).not.toContain("Destination category");
    expect(block).not.toContain("Style for this destination");
  });
});
