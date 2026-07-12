import { describe, it, expect } from "vitest";
import {
  detectSite,
  suggestTargetModel,
  isLikelyFileName,
  extractFileFromEditorTitle,
  editorKindFromProcess,
  relevantFileMemory,
  buildDestinationContextBlock,
} from "./contextSignals";
import { CONTEXT_CAPS, type CaptureContext } from "./types";

describe("detectSite", () => {
  it("returns null for unrelated processes even when the title looks like a site", () => {
    expect(detectSite({ processName: "cursor", windowTitle: "Claude" })).toBeNull();
    expect(detectSite({ processName: "slack", windowTitle: "Claude" })).toBeNull();
    expect(detectSite({ processName: undefined })).toBeNull();
  });

  it("maps known desktop AI apps by process name", () => {
    expect(detectSite({ processName: "claude", windowTitle: "Claude" })).toBe("claude.ai");
    expect(detectSite({ processName: "ChatGPT", windowTitle: "ChatGPT" })).toBe("chatgpt.com");
    expect(detectSite({ processName: "ChatGPT Classic", windowTitle: "ChatGPT Classic" })).toBe(
      "chatgpt.com",
    );
  });

  it("prefers URL host and strips www.", () => {
    expect(detectSite({ processName: "chrome.exe", url: "https://www.claude.ai/chat/abc" })).toBe("claude.ai");
    expect(detectSite({ processName: "msedge", url: "chatgpt.com/c/123" })).toBe("chatgpt.com");
  });

  it("falls back to title heuristics per browser", () => {
    expect(detectSite({ processName: "chrome", windowTitle: "Claude - Google Chrome" })).toBe("claude.ai");
    expect(detectSite({ processName: "firefox", windowTitle: "ChatGPT — Mozilla Firefox" })).toBe("chatgpt.com");
    expect(detectSite({ processName: "brave", windowTitle: "Gemini" })).toBe("gemini.google.com");
    expect(detectSite({ processName: "opera", windowTitle: "Grok / X" })).toBe("grok.com");
    expect(detectSite({ processName: "vivaldi", windowTitle: "DeepSeek chat" })).toBe("chat.deepseek.com");
  });

  it("returns null for a browser with no recognizable site", () => {
    expect(detectSite({ processName: "chrome", windowTitle: "GitHub - Google Chrome" })).toBeNull();
  });
});

describe("suggestTargetModel", () => {
  it("maps known sites to models", () => {
    expect(suggestTargetModel({ site: "claude.ai" })).toBe("claude-opus-4.8");
    expect(suggestTargetModel({ site: "chatgpt.com" })).toBe("gpt-5");
    expect(suggestTargetModel({ site: "gemini.google.com" })).toBe("gemini-3");
    expect(suggestTargetModel({ site: "grok.com" })).toBe("grok-4");
  });

  it("routes the Cursor chat pane to composer-2.5", () => {
    expect(
      suggestTargetModel({ processName: "Cursor.exe", elementClassName: "aislash-editor-input" }),
    ).toBe("composer-2.5");
  });

  it("does NOT route Cursor terminal panes or plain editors", () => {
    expect(suggestTargetModel({ processName: "cursor", elementClassName: "xterm-helper-textarea" })).toBeUndefined();
    expect(suggestTargetModel({ processName: "cursor", elementClassName: "monaco-editor" })).toBeUndefined();
    expect(suggestTargetModel({ processName: "cursor" })).toBeUndefined();
  });

  it("routes desktop AI apps via site detection", () => {
    expect(suggestTargetModel({ site: detectSite({ processName: "claude", windowTitle: "Claude" }) })).toBe(
      "claude-opus-4.8",
    );
    expect(
      suggestTargetModel({ site: detectSite({ processName: "ChatGPT", windowTitle: "ChatGPT" }) }),
    ).toBe("gpt-5");
    expect(
      suggestTargetModel({
        site: detectSite({ processName: "ChatGPT Classic", windowTitle: "ChatGPT Classic" }),
      }),
    ).toBe("gpt-5");
  });

  it("returns undefined for unknown sites", () => {
    expect(suggestTargetModel({ site: "github.com" })).toBeUndefined();
  });
});

describe("isLikelyFileName", () => {
  it("accepts plausible file names", () => {
    expect(isLikelyFileName("storage.ts")).toBe(true);
    expect(isLikelyFileName("win-hotkey-snapshot.ps1")).toBe(true);
    expect(isLikelyFileName("Overlay.test.tsx")).toBe(true);
  });

  it("rejects non-files", () => {
    expect(isLikelyFileName("no dots here")).toBe(false);
    expect(isLikelyFileName("nodot")).toBe(false);
    expect(isLikelyFileName(".env")).toBe(false); // must start with a letter
    expect(isLikelyFileName("path/to/file.ts")).toBe(false);
    expect(isLikelyFileName("what?.ts")).toBe(false);
    expect(isLikelyFileName("a".repeat(80) + ".ts")).toBe(false);
  });
});

describe("extractFileFromEditorTitle", () => {
  it("extracts the file segment from editor titles", () => {
    expect(extractFileFromEditorTitle("storage.ts - prompt-master - Cursor", "cursor")).toBe("storage.ts");
    expect(extractFileFromEditorTitle("● main.ts - app - Visual Studio Code", "Code.exe")).toBe("main.ts");
  });

  it("returns null for non-editors and non-file titles", () => {
    expect(extractFileFromEditorTitle("storage.ts - x - Cursor", "chrome")).toBeNull();
    expect(extractFileFromEditorTitle("Welcome - Cursor", "cursor")).toBeNull();
    expect(extractFileFromEditorTitle("", "cursor")).toBeNull();
  });
});

describe("editorKindFromProcess", () => {
  it("classifies editors", () => {
    expect(editorKindFromProcess("Cursor.exe")).toBe("cursor");
    expect(editorKindFromProcess("code")).toBe("vscode");
    expect(editorKindFromProcess("windsurf")).toBe("windsurf");
    expect(editorKindFromProcess("chrome")).toBeUndefined();
  });
});

describe("relevantFileMemory", () => {
  const memory = ["storage.ts", "contextLayer.ts", "Overlay.tsx", "readme.md"];

  it("puts activeFile first and matches basename words", () => {
    const out = relevantFileMemory("update the storage ts file", memory, "main.ts");
    expect(out[0]).toBe("main.ts");
    expect(out).toContain("storage.ts");
    expect(out).not.toContain("readme.md");
  });

  it("matches exact file-name tokens", () => {
    expect(relevantFileMemory("fix overlay.tsx please", memory)).toContain("Overlay.tsx");
  });

  it("caps output and dedupes the active file", () => {
    const big = Array.from({ length: 30 }, (_, i) => `storage${i}.ts`);
    const out = relevantFileMemory("storage0 storage1 storage2 storage3 storage4 storage5 storage6 storage7 storage8 storage9 storage10", big, "storage0.ts");
    expect(out.length).toBeLessThanOrEqual(CONTEXT_CAPS.files);
    expect(out.filter((f) => f === "storage0.ts").length).toBe(1);
  });
});

describe("buildDestinationContextBlock", () => {
  it("returns empty string for missing/empty context", () => {
    expect(buildDestinationContextBlock(undefined)).toBe("");
    expect(buildDestinationContextBlock({})).toBe("");
  });

  it("renders app identity, site, scope, and files", () => {
    const ctx: CaptureContext = {
      app: { processName: "chrome", windowTitle: "Claude - Google Chrome", hostKind: "chromium", site: "claude.ai" },
      text: { scope: "field", hasSelection: false },
      files: { activeFile: "storage.ts", recentFiles: ["contextLayer.ts"] },
      suggestedModel: "claude-opus-4.8",
    };
    const block = buildDestinationContextBlock(ctx);
    expect(block).toContain("DESTINATION CONTEXT");
    expect(block).toContain("- Destination app: chrome");
    expect(block).toContain('- Window title: "Claude - Google Chrome"');
    expect(block).toContain("- Website: claude.ai");
    expect(block).toContain("- Text scope: whole draft");
    expect(block).toContain("storage.ts, contextLayer.ts");
    expect(block).not.toContain("claude-opus-4.8"); // suggestedModel never rendered
  });

  it("labels editors and renders before/after cursor with caps", () => {
    const ctx: CaptureContext = {
      app: { processName: "cursor", editorKind: "cursor", windowTitle: "storage.ts - prompt-master - Cursor" },
      text: {
        scope: "selection",
        hasSelection: true,
        selectedText: "middle sentence",
        beforeCursor: "x".repeat(5000),
        afterCursor: "y".repeat(5000),
      },
    };
    const block = buildDestinationContextBlock(ctx);
    expect(block).toContain("- Destination app: Cursor");
    expect(block).toContain("selection of a larger draft");
    const before = block.match(/before the cursor[^"]*"""(x+)"""/)?.[1] ?? "";
    const after = block.match(/after the cursor[^"]*"""(y+)"""/)?.[1] ?? "";
    expect(before.length).toBe(CONTEXT_CAPS.beforeCursor);
    expect(after.length).toBe(CONTEXT_CAPS.afterCursor);
  });

  it("contains no formatting mandates (terminal rule stays supreme)", () => {
    const block = buildDestinationContextBlock({
      app: { processName: "WindowsTerminal", hostKind: "terminal" },
      text: { scope: "field", hasSelection: false },
    });
    expect(block).not.toMatch(/output format|markdown|xml/i);
  });
});
