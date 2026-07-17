import { describe, it, expect } from "vitest";
import { buildCacheKey, canonicalContextString, fnv1a } from "./cacheKey";
import type { CaptureContext } from "./types";

const base = { prompt: "Fix the bug", model: "gpt-5", level: 2 as const };

describe("buildCacheKey", () => {
  it("keeps version, model, level, persona, and normalized prompt", () => {
    const key = buildCacheKey(9, { ...base, persona: "dev" });
    expect(key).toBe("v9|rw:gpt-4.1|gpt-5|2|dev||fix the bug");
  });

  it("includes rewrite model in the cache key", () => {
    expect(buildCacheKey(9, base)).toContain("|rw:gpt-4.1|");
  });

  it("includes standing context (pre-existing gap fixed)", () => {
    const a = buildCacheKey(9, base);
    const b = buildCacheKey(9, { ...base, context: "B2B SaaS audience" });
    expect(a).not.toBe(b);
    expect(b).toContain("|B2B SaaS audience|");
  });

  it("adds |terminal and |type: markers as before", () => {
    expect(buildCacheKey(9, { ...base, terminalContext: true })).toContain("|terminal");
    expect(buildCacheKey(9, { ...base, promptType: "question" })).toContain("|type:question");
    expect(buildCacheKey(9, { ...base, promptType: "auto" })).not.toContain("|type:");
  });

  it("writing mode gets its own key per writing type", () => {
    const prompting = buildCacheKey(9, base);
    const email = buildCacheKey(9, { ...base, writingType: "email" });
    const message = buildCacheKey(9, { ...base, writingType: "message" });
    expect(email).not.toBe(prompting);
    expect(email).not.toBe(message);
    expect(email).toContain("|writing:email");
    expect(prompting).not.toContain("|writing:");
  });

  it("same prompt with vs without captureContext gets different keys", () => {
    const ctx: CaptureContext = {
      app: { processName: "chrome", site: "claude.ai" },
      text: { scope: "field", hasSelection: false },
    };
    const a = buildCacheKey(9, base);
    const b = buildCacheKey(9, { ...base, captureContext: ctx });
    expect(a).not.toBe(b);
    expect(b).toContain("|ctx:");
  });

  it("suggestedModel does not affect the key", () => {
    const ctx: CaptureContext = { app: { processName: "chrome", site: "claude.ai" }, text: { scope: "field", hasSelection: false } };
    const a = buildCacheKey(9, { ...base, captureContext: ctx });
    const b = buildCacheKey(9, { ...base, captureContext: { ...ctx, suggestedModel: "gpt-5" } });
    expect(a).toBe(b);
  });

  it("empty captureContext hashes like no context", () => {
    expect(buildCacheKey(9, { ...base, captureContext: {} })).toBe(buildCacheKey(9, base));
  });

  it("context fields that reach the meta-prompt all change the key", () => {
    const mk = (ctx: CaptureContext) => buildCacheKey(9, { ...base, captureContext: ctx });
    const keys = [
      mk({ app: { site: "claude.ai" } }),
      mk({ app: { processName: "cursor" } }),
      mk({ app: { windowTitle: "a.ts - Cursor" } }),
      mk({ text: { scope: "selection", hasSelection: true, selectedText: "x" } }),
      mk({ text: { scope: "field", hasSelection: false, beforeCursor: "x" } }),
      mk({ files: { activeFile: "a.ts" } }),
      mk({ files: { recentFiles: ["b.ts"] } }),
      mk({ app: { category: "email" } }),
      mk({ app: { category: "chat" } }),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });

});

describe("canonicalContextString / fnv1a", () => {
  it("is stable for equal input", () => {
    const ctx: CaptureContext = { app: { site: "claude.ai" }, text: { scope: "field", hasSelection: false } };
    expect(canonicalContextString(ctx)).toBe(canonicalContextString(structuredClone(ctx)));
    expect(fnv1a("abc")).toBe(fnv1a("abc"));
    expect(fnv1a("abc")).not.toBe(fnv1a("abd"));
  });

  it("returns empty for undefined or empty context", () => {
    expect(canonicalContextString(undefined)).toBe("");
    expect(canonicalContextString({})).toBe("");
    expect(canonicalContextString({ suggestedModel: "gpt-5" })).toBe("");
  });

});

describe("buildCacheKey session/project context", () => {
  it("session context changes the key; different texts differ", () => {
    const none = buildCacheKey(9, base);
    const a = buildCacheKey(9, { ...base, sessionContext: "session A" });
    const b = buildCacheKey(9, { ...base, sessionContext: "session B" });
    expect(a).not.toBe(none);
    expect(a).not.toBe(b);
    expect(a).toContain("|sess:");
  });

  it("empty or whitespace session context hashes like no context", () => {
    expect(buildCacheKey(9, { ...base, sessionContext: "" })).toBe(buildCacheKey(9, base));
    expect(buildCacheKey(9, { ...base, sessionContext: "   " })).toBe(buildCacheKey(9, base));
  });

  it("project and session context contribute independently", () => {
    const sess = buildCacheKey(9, { ...base, sessionContext: "x" });
    const proj = buildCacheKey(9, { ...base, projectContext: "x" });
    const both = buildCacheKey(9, { ...base, sessionContext: "x", projectContext: "x" });
    expect(sess).not.toBe(proj);
    expect(both).not.toBe(sess);
    expect(both).toContain("|sess:");
    expect(both).toContain("|proj:");
  });
});
