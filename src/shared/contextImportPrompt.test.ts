import { describe, expect, it } from "vitest";
import {
  CONTEXT_IMPORT_PROMPT,
  PROJECT_CONTEXT_IMPORT_PROMPT,
  contextImportPromptFor,
} from "./contextImportPrompt";

describe("contextImportPrompt", () => {
  it("returns the session prompt by default scope", () => {
    expect(contextImportPromptFor("session")).toBe(CONTEXT_IMPORT_PROMPT);
  });

  it("returns a distinct project prompt", () => {
    expect(contextImportPromptFor("project")).toBe(PROJECT_CONTEXT_IMPORT_PROMPT);
    expect(PROJECT_CONTEXT_IMPORT_PROMPT).not.toBe(CONTEXT_IMPORT_PROMPT);
    expect(PROJECT_CONTEXT_IMPORT_PROMPT).toMatch(/this project/i);
    expect(PROJECT_CONTEXT_IMPORT_PROMPT).toMatch(/STACK & ARCHITECTURE/);
    expect(CONTEXT_IMPORT_PROMPT).toMatch(/this chat session/i);
    expect(CONTEXT_IMPORT_PROMPT).toMatch(/CURRENT STATE/);
  });
});
