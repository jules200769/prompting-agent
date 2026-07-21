import { describe, it, expect } from "vitest";
import {
  detectSite,
  suggestTargetModel,
  isLikelyFileName,
  isExcludedContextFileName,
  hasSourceFileExtension,
  shouldAttachFileContext,
  sanitizeEditorWindowTitle,
  extractFileFromEditorTitle,
  editorKindFromProcess,
  relevantFileMemory,
  buildDestinationContextBlock,
  detectAppCategory,
  resolveStyleDirective,
  SITE_MODEL_MAP,
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

  it("rejects workspace names and non-source extensions", () => {
    expect(isLikelyFileName("anvyll.app")).toBe(false);
    expect(isLikelyFileName("foo.bar")).toBe(false);
    expect(isLikelyFileName("project.xyz")).toBe(false);
  });
});

describe("hasSourceFileExtension", () => {
  it("accepts known source extensions and rejects others", () => {
    expect(hasSourceFileExtension("storage.ts")).toBe(true);
    expect(hasSourceFileExtension("main.py")).toBe(true);
    expect(hasSourceFileExtension("anvyll.app")).toBe(false);
    expect(hasSourceFileExtension("notes.md")).toBe(false);
    expect(hasSourceFileExtension("noext")).toBe(false);
  });
});

describe("shouldAttachFileContext", () => {
  it("only code-editor and ai-chat carry file context", () => {
    expect(shouldAttachFileContext("code-editor")).toBe(true);
    expect(shouldAttachFileContext("ai-chat")).toBe(true);
    expect(shouldAttachFileContext("terminal")).toBe(false);
    expect(shouldAttachFileContext("email")).toBe(false);
    expect(shouldAttachFileContext("chat")).toBe(false);
    expect(shouldAttachFileContext("docs-notes")).toBe(false);
    expect(shouldAttachFileContext("other")).toBe(false);
    expect(shouldAttachFileContext(undefined)).toBe(false);
  });
});

describe("isExcludedContextFileName", () => {
  it("rejects Cursor agent plan tabs", () => {
    expect(isExcludedContextFileName("terminal_classify_fix_8b45ccc5.plan.md")).toBe(true);
    expect(isExcludedContextFileName("fable5.agent.plan.md")).toBe(true);
  });

  it("rejects markdown docs and status notes", () => {
    expect(isExcludedContextFileName("cursor_context_awareness_project_status.md")).toBe(true);
    expect(isExcludedContextFileName("the-context-layer-what-glistening-hare.md")).toBe(true);
    expect(isExcludedContextFileName("README.md")).toBe(true);
  });

  it("allows normal source files", () => {
    expect(isExcludedContextFileName("storage.ts")).toBe(false);
    expect(isExcludedContextFileName("Overlay.test.tsx")).toBe(false);
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

  it("ignores Cursor agent plan tabs", () => {
    expect(
      extractFileFromEditorTitle(
        "terminal_classify_fix_8b45ccc5.plan.md - prompt-master - Cursor",
        "cursor",
      ),
    ).toBeNull();
  });

  it("ignores workspace names that are not source files", () => {
    expect(extractFileFromEditorTitle("anvyll.app - Cursor", "cursor")).toBeNull();
  });
});

describe("sanitizeEditorWindowTitle", () => {
  it("strips agent plan filenames from editor titles", () => {
    expect(
      sanitizeEditorWindowTitle(
        "terminal_classify_fix_8b45ccc5.plan.md - prompt-master - Cursor",
        "cursor",
      ),
    ).toBe("prompt-master - Cursor");
  });

  it("strips markdown plan/doc filenames from editor titles", () => {
    expect(
      sanitizeEditorWindowTitle(
        "the-context-layer-what-glistening-hare.md - prompt-master - Cursor",
        "cursor",
      ),
    ).toBe("prompt-master - Cursor");
  });

  it("leaves normal source file titles intact", () => {
    expect(sanitizeEditorWindowTitle("storage.ts - prompt-master - Cursor", "cursor")).toBe(
      "storage.ts - prompt-master - Cursor",
    );
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

  it("skips markdown docs in memory", () => {
    const memory = [
      "storage.ts",
      "cursor_context_awareness_project_status.md",
      "the-context-layer-what-glistening-hare.md",
    ];
    expect(relevantFileMemory("update storage.ts", memory)).toEqual(["storage.ts"]);
  });

  it("skips agent plan files in memory", () => {
    const memory = ["storage.ts", "terminal_classify_fix_8b45ccc5.plan.md"];
    expect(relevantFileMemory("update storage.ts", memory)).toEqual(["storage.ts"]);
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

  it("includes scope-discipline and file-vs-title rules", () => {
    const block = buildDestinationContextBlock({
      app: { processName: "cursor", editorKind: "cursor", windowTitle: "anvyll.app - Cursor" },
      text: { scope: "field", hasSelection: false },
    });
    expect(block).toContain('Treat only the names under "Known project file names" as files');
    expect(block).toContain("Stay within the scope the draft and destination imply");
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
    // The selected passage must be rendered (regression: it was captured, capped,
    // and hashed into the cache key but silently dropped from the block).
    expect(block).toContain("Selected passage being rewritten");
    expect(block).toContain("middle sentence");
    // Spatial order: before -> selection -> after.
    expect(block.indexOf("before the cursor")).toBeLessThan(block.indexOf("Selected passage"));
    expect(block.indexOf("Selected passage")).toBeLessThan(block.indexOf("after the cursor"));
  });

  it("renders selectedText even without surrounding cursor text and caps it", () => {
    const block = buildDestinationContextBlock({
      text: { scope: "selection", hasSelection: true, selectedText: "s".repeat(6000) },
    });
    expect(block).toContain("Selected passage being rewritten");
    const sel = block.match(/Selected passage being rewritten[^"]*"""(s+)"""/)?.[1] ?? "";
    expect(sel.length).toBe(CONTEXT_CAPS.selectedText);
  });

  it("omits the selected-passage line when there is no selection", () => {
    const block = buildDestinationContextBlock({
      app: { processName: "chrome", site: "mail.google.com", category: "email" },
      text: { scope: "field", hasSelection: false },
    });
    expect(block).not.toContain("Selected passage being rewritten");
  });

  it("contains no formatting mandates (terminal rule stays supreme)", () => {
    const block = buildDestinationContextBlock({
      app: { processName: "WindowsTerminal", hostKind: "terminal", category: "terminal" },
      text: { scope: "field", hasSelection: false },
    });
    expect(block).not.toMatch(/output format|markdown|xml/i);
  });

  it("renders the category line without a style directive", () => {
    const block = buildDestinationContextBlock({
      app: { processName: "chrome", site: "mail.google.com", category: "email" },
    });
    expect(block).toContain("- Destination category: Email");
    expect(block).not.toContain("Style for this destination");
  });

  it("renders no category line for the 'other' category", () => {
    const block = buildDestinationContextBlock({
      app: { processName: "notepad", category: "other" },
    });
    expect(block).not.toContain("Destination category");
  });
});

describe("detectAppCategory", () => {
  it("terminal host beats editor identity (Cursor terminal panes)", () => {
    expect(
      detectAppCategory({ processName: "cursor", editorKind: "cursor", hostKind: "terminal" }),
    ).toBe("terminal");
  });

  it("routes the Cursor AI pane to ai-chat and the editor to code-editor", () => {
    expect(
      detectAppCategory({ processName: "cursor", editorKind: "cursor", elementClassName: "aislash-editor-input" }),
    ).toBe("ai-chat");
    expect(detectAppCategory({ processName: "cursor", editorKind: "cursor" })).toBe("code-editor");
    expect(detectAppCategory({ processName: "code", editorKind: "vscode" })).toBe("code-editor");
    expect(detectAppCategory({ processName: "windsurf", editorKind: "windsurf" })).toBe("code-editor");
  });

  it("treats every model-routed site as ai-chat", () => {
    for (const site of Object.keys(SITE_MODEL_MAP)) {
      expect(detectAppCategory({ processName: "chrome", site })).toBe("ai-chat");
    }
    expect(detectAppCategory({ processName: "chrome", site: "perplexity.ai" })).toBe("ai-chat");
    expect(detectAppCategory({ processName: "chrome", site: "copilot.microsoft.com" })).toBe("ai-chat");
    expect(detectAppCategory({ processName: "chrome", site: "aistudio.google.com" })).toBe("ai-chat");
  });

  it("categorizes known sites", () => {
    expect(detectAppCategory({ processName: "chrome", site: "mail.google.com" })).toBe("email");
    expect(detectAppCategory({ processName: "chrome", site: "web.whatsapp.com" })).toBe("chat");
    expect(detectAppCategory({ processName: "chrome", site: "notion.so" })).toBe("docs-notes");
    expect(detectAppCategory({ processName: "chrome", site: "docs.google.com" })).toBe("docs-notes");
  });

  it("categorizes processes regardless of .exe suffix or case", () => {
    expect(detectAppCategory({ processName: "OUTLOOK.EXE" })).toBe("email");
    expect(detectAppCategory({ processName: "slack" })).toBe("chat");
    expect(detectAppCategory({ processName: "obsidian" })).toBe("docs-notes");
    expect(detectAppCategory({ processName: "WindowsTerminal" })).toBe("terminal");
  });

  it("falls back to other for unknown or empty input", () => {
    expect(detectAppCategory({})).toBe("other");
    expect(detectAppCategory({ processName: "chrome", site: "example.com" })).toBe("other");
  });
});

describe("resolveStyleDirective", () => {
  it("returns undefined when disabled, off, or category other", () => {
    expect(resolveStyleDirective({ category: "email", enabled: false })).toBeUndefined();
    expect(resolveStyleDirective({ category: "email", enabled: true, preset: "off" })).toBeUndefined();
    expect(resolveStyleDirective({ category: "other", enabled: true })).toBeUndefined();
  });

  it("auto returns the category default tone", () => {
    expect(resolveStyleDirective({ category: "email", enabled: true })).toMatch(/courteous tone suited to email/);
    expect(resolveStyleDirective({ category: "email", enabled: true, preset: "auto" })).toBe(
      resolveStyleDirective({ category: "email", enabled: true }),
    );
  });

  it("presets swap only the tone sentence, keeping the category format sentence", () => {
    const format = "Contractions are fine; no formal greetings or sign-offs.";
    expect(resolveStyleDirective({ category: "chat", enabled: true, preset: "formal" })).toBe(
      `Formal, professional tone. ${format}`,
    );
    expect(resolveStyleDirective({ category: "chat", enabled: true, preset: "casual" })).toBe(
      `Casual, conversational tone. ${format}`,
    );
    expect(resolveStyleDirective({ category: "chat", enabled: true, preset: "neutral" })).toBe(
      `Neutral, plain tone. ${format}`,
    );
  });

  it("no terminal preset ever mandates an output format", () => {
    for (const preset of ["auto", "formal", "neutral", "casual"] as const) {
      expect(resolveStyleDirective({ category: "terminal", enabled: true, preset })).not.toMatch(
        /output format|multi-line|markdown/i,
      );
    }
  });
});
