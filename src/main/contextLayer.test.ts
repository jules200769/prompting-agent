import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AppSettings } from "../shared/types";
import { DEFAULT_SETTINGS } from "../shared/types";

let settings: AppSettings = { ...DEFAULT_SETTINGS };
let fileMemory: string[] = [];

vi.mock("./storage", () => ({
  getSettings: () => settings,
  listFileMemory: () => fileMemory,
  recordFileMemory: () => {},
}));

const { assembleCaptureContext } = await import("./contextLayer");
const { buildDestinationContextBlock } = await import("../shared/contextSignals");

const capture = (
  snapshot: Record<string, unknown>,
  uia: Record<string, unknown> | null = null,
  capturedText = "fix the bug",
) =>
  assembleCaptureContext({
    mode: "field",
    capturedText,
    uia: uia as never,
    sidecar: null,
    snapshot: snapshot as never,
  });

beforeEach(() => {
  settings = { ...DEFAULT_SETTINGS };
  fileMemory = [];
});

describe("assembleCaptureContext category wiring", () => {
  it("Gmail in Chrome resolves to email and renders category without styleHint", () => {
    const ctx = capture({ process: "chrome", windowTitle: "Compose - Gmail", siteUrl: "https://mail.google.com/mail/u/0", hostKind: "chromium" });
    expect(ctx?.app?.category).toBe("email");
    const block = buildDestinationContextBlock(ctx);
    expect(block).toContain("- Destination category: Email");
    expect(block).not.toContain("Style for this destination");
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

  it("does not attach agent plan tabs as activeFile", () => {
    const ctx = capture({
      process: "cursor",
      windowTitle: "terminal_classify_fix_8b45ccc5.plan.md - prompt-master - Cursor",
      hostKind: "native",
    });
    expect(ctx?.files).toBeUndefined();
    expect(buildDestinationContextBlock(ctx)).not.toContain(".plan.md");
  });
});

describe("assembleCaptureContext file-context scenarios", () => {
  // Scenario A: Cursor chat pane — window title is the workspace, never a file.
  it("A: Cursor chat with workspace title yields no activeFile", () => {
    const ctx = capture(
      { process: "cursor", windowTitle: "anvyll.app - Cursor", hostKind: "native" },
      { className: "aislash-editor-input" },
    );
    expect(ctx?.app?.category).toBe("ai-chat");
    expect(ctx?.files?.activeFile).toBeUndefined();
  });

  // Scenario B: Cursor editor — the open source file becomes activeFile.
  it("B: Cursor editor exposes the open source file", () => {
    const ctx = capture({
      process: "cursor",
      windowTitle: "storage.ts - prompt-master - Cursor",
      hostKind: "native",
    });
    expect(ctx?.app?.category).toBe("code-editor");
    expect(ctx?.files?.activeFile).toBe("storage.ts");
  });

  // Scenario F: Terminal — never carries file context; TERMINAL SHELL owns output.
  it("F: terminal carries no files block", () => {
    const ctx = capture({ process: "WindowsTerminal.exe", windowTitle: "pwsh", hostKind: "terminal" });
    expect(ctx?.app?.category).toBe("terminal");
    expect(ctx?.files).toBeUndefined();
  });

  // Scenario G/H: browser email/chat — correct category, no code-file leak.
  it("G/H: Gmail and Slack carry no files block", () => {
    const gmail = capture({
      process: "chrome",
      windowTitle: "Compose - Gmail",
      siteUrl: "https://mail.google.com/mail/u/0",
      hostKind: "chromium",
    });
    expect(gmail?.app?.category).toBe("email");
    expect(gmail?.files).toBeUndefined();

    const slack = capture({ process: "slack", windowTitle: "Slack - #general", hostKind: "chromium" });
    expect(slack?.app?.category).toBe("chat");
    expect(slack?.files).toBeUndefined();
  });

  // Scenario L: vibe-coding — chat pane, draft names a file already in memory.
  it("L: Cursor chat surfaces token-matched recentFiles without an activeFile", () => {
    fileMemory = ["contextLayer.ts", "Overlay.tsx"];
    const ctx = capture(
      { process: "cursor", windowTitle: "anvyll.app - Cursor", hostKind: "native" },
      { className: "aislash-editor-input" },
      "please update contextLayer.ts to fix the bug",
    );
    expect(ctx?.app?.category).toBe("ai-chat");
    expect(ctx?.files?.activeFile).toBeUndefined();
    expect(ctx?.files?.recentFiles).toContain("contextLayer.ts");
  });

  it("screenContext off ships no context at all", () => {
    settings = { ...DEFAULT_SETTINGS, screenContext: false };
    expect(capture({ process: "chrome", siteUrl: "https://mail.google.com" })).toBeUndefined();
  });

  it("unknown app contributes no category line", () => {
    const ctx = capture({ process: "notepad.exe", windowTitle: "Untitled - Notepad", hostKind: "native" });
    expect(ctx?.app?.category).toBe("other");
    const block = buildDestinationContextBlock(ctx);
    expect(block).not.toContain("Destination category");
    expect(block).not.toContain("Style for this destination");
  });
});
