import { describe, expect, it } from "vitest";
import { rewriteProviderForTarget } from "./rewrite";
import { REWRITE_CONFIG } from "./types";

describe("rewriteProviderForTarget", () => {
  it("always uses the OpenAI rewrite provider regardless of target model", () => {
    expect(rewriteProviderForTarget("claude-opus-4.8")).toBe("openai");
    expect(rewriteProviderForTarget("gpt-5")).toBe("openai");
    expect(rewriteProviderForTarget("gemini-3")).toBe("openai");
    expect(rewriteProviderForTarget("deepseek-v3")).toBe("openai");
    expect(rewriteProviderForTarget("grok-4")).toBe("openai");
    expect(rewriteProviderForTarget("composer-2.5")).toBe("openai");
    expect(rewriteProviderForTarget("claude-opus-4.8")).toBe(REWRITE_CONFIG.provider);
  });
});
