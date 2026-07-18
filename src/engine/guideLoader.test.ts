import { describe, expect, it, beforeEach } from "vitest";
import { clearGuideCache, getGuideExcerpt, getLevelRewriteInstruction, getLevelStructureContract, loadGuideFull } from "./guideLoader";
import { REWRITE_CONFIG } from "../shared/types";

describe("guideLoader", () => {
  beforeEach(() => {
    clearGuideCache();
  });

  it("loads opus guide for claude-opus-4.8", () => {
    const text = loadGuideFull("claude-opus-4.8");
    expect(text).toContain("Claude Opus 4.8");
  });

  it("maps gpt-5 to gpt5.5 guide", () => {
    const text = loadGuideFull("gpt-5");
    expect(text.toLowerCase()).toContain("gpt-5.5");
  });

  it("loads composer2.5 guide for composer-2.5", () => {
    const text = loadGuideFull("composer-2.5");
    expect(text).toContain("Composer 2.5");
  });

  it("returns shorter excerpts for lower levels", () => {
    const l1 = getGuideExcerpt("grok-4", 1);
    const l4 = getGuideExcerpt("grok-4", 4);
    expect(l1.length).toBeLessThanOrEqual(3000);
    expect(l4.length).toBeGreaterThan(l1.length);
    expect(l4.length).toBeLessThanOrEqual(12000);
  });

  it("level rewrite instructions describe guide structure, not temperature", () => {
    for (const level of [1, 2, 3, 4] as const) {
      const instruction = getLevelRewriteInstruction(level);
      expect(instruction.toLowerCase()).not.toContain("temperature");
      expect(instruction).toContain("guide structure");
    }
    expect(getLevelStructureContract("claude-opus-4.8", 4).length).toBeGreaterThan(
      getLevelStructureContract("claude-opus-4.8", 1).length,
    );
    expect(getLevelRewriteInstruction(1).toLowerCase()).toContain("no xml");
  });

  it("structure contracts enforce level differentiation for Claude", () => {
    const cool = getLevelStructureContract("claude-opus-4.8", 1);
    const warm = getLevelStructureContract("claude-opus-4.8", 2);
    const hot = getLevelStructureContract("claude-opus-4.8", 3);
    const max = getLevelStructureContract("claude-opus-4.8", 4);

    expect(cool.toLowerCase()).toContain("plain prose");
    expect(warm).toContain("<instructions>");
    expect(warm).toContain("<input>");
    expect(hot).toContain("<output_format>");
    expect(max).toContain("<success_criteria>");
    expect(max.toLowerCase()).toContain("do not add <examples>");
    expect(max).not.toMatch(/REQUIRED tags.*<examples>/);
    expect(max).toContain("<constraints>");
    expect(max).toContain("<output_format>");
  });

  it("GPT-5 markdown contracts forbid personality blocks and enforce level scale", () => {
    const warm = getLevelStructureContract("gpt-5", 2);
    const hot = getLevelStructureContract("gpt-5", 3);
    const max = getLevelStructureContract("gpt-5", 4);

    expect(warm).toContain("## Instructions");
    expect(warm.toLowerCase()).toContain("personality");
    expect(hot).toContain("## Output format");
    expect(hot.toLowerCase()).toContain("do not add ## examples");
    expect(max).toContain("## Success criteria");
    expect(max.toLowerCase()).toContain("do not add ## examples");
    expect(max).not.toMatch(/REQUIRED headers.*## Examples/);
    expect(max.toLowerCase()).toContain("do not add # personality");
  });

  it("Composer contracts enforce level differentiation", () => {
    const warm = getLevelStructureContract("composer-2.5", 2);
    const hot = getLevelStructureContract("composer-2.5", 3);
    const max = getLevelStructureContract("composer-2.5", 4);

    expect(warm.toLowerCase()).toContain("goal");
    expect(warm.toLowerCase()).toContain("input");
    expect(warm.toLowerCase()).toContain("do not add process");
    expect(hot.toLowerCase()).toContain("output format");
    expect(hot.toLowerCase()).toContain("do not add examples");
    expect(max.toLowerCase()).toContain("success criteria");
    expect(max.toLowerCase()).toContain("do not add examples");
  });

  it("DeepSeek contracts enforce level differentiation", () => {
    const warm = getLevelStructureContract("deepseek-v3", 2);
    const hot = getLevelStructureContract("deepseek-v3", 3);
    const max = getLevelStructureContract("deepseek-v3", 4);

    expect(warm.toLowerCase()).toContain("role:");
    expect(warm.toLowerCase()).toContain("input:");
    expect(warm.toLowerCase()).toContain("do not add context");
    expect(hot.toLowerCase()).toContain("output format");
    expect(hot.toLowerCase()).toContain("do not add examples");
    expect(max.toLowerCase()).toContain("verification");
  });

  it("Grok contracts use 4-part formula not XML", () => {
    const warm = getLevelStructureContract("grok-4", 2);
    const hot = getLevelStructureContract("grok-4", 3);
    const max = getLevelStructureContract("grok-4", 4);

    expect(warm).toContain("GOAL:");
    expect(warm.toLowerCase()).toContain("no xml");
    expect(hot).toContain("QUALITY BAR");
    expect(max).toContain("SUCCESS CRITERIA");
    expect(max.toLowerCase()).toContain("do not add examples");
  });

  it("Gemini contracts put constraints last and enforce level scale", () => {
    const warm = getLevelStructureContract("gemini-3", 2);
    const hot = getLevelStructureContract("gemini-3", 3);
    const max = getLevelStructureContract("gemini-3", 4);

    expect(warm.toLowerCase()).toContain("input:");
    expect(hot.toLowerCase()).toContain("constraints must be the final");
    expect(hot.toLowerCase()).toContain("do not add examples");
    expect(max.toLowerCase()).toContain("verification");
  });

  it("rewrite API uses fixed temperature", () => {
    expect(REWRITE_CONFIG.temperature).toBe(0.3);
  });
});

describe("buildMetaPrompt", () => {
  it("includes guide excerpt and plain-text output rules", async () => {
    const { buildMetaPrompt } = await import("./providers");
    const { system, user } = buildMetaPrompt({
      prompt: "write a cold email",
      model: "claude-opus-4.8",
      level: 3,
    });
    expect(system).toContain("PROMPTING GUIDE");
    expect(system).toContain("Claude Opus 4.8");
    expect(system).toContain("STRUCTURE CONTRACT");
    expect(system).toContain("plain text");
    expect(user).toContain("write a cold email");
  });

  it("includes action language rules from level 2 upward", async () => {
    const { buildMetaPrompt } = await import("./providers");
    const l1 = buildMetaPrompt({ prompt: "fix my app", model: "claude-opus-4.8", level: 1 });
    const l3 = buildMetaPrompt({ prompt: "fix my app", model: "claude-opus-4.8", level: 3 });
    expect(l1.system).not.toContain("ACTION & DELIVERABLE LANGUAGE");
    expect(l3.system).toContain("ACTION & DELIVERABLE LANGUAGE");
    expect(l3.system).toContain("CONSTRAINT FRAMING");
    expect(l3.system).toContain("Implement");
  });

  it("includes GPT-5.5 outcome-first rule from level 2 upward", async () => {
    const { buildMetaPrompt } = await import("./providers");
    const warm = buildMetaPrompt({ prompt: "fix my app", model: "gpt-5", level: 2 });
    const cool = buildMetaPrompt({ prompt: "fix my app", model: "gpt-5", level: 1 });
    expect(warm.system).toContain("GPT-5.5 OUTCOME-FIRST");
    expect(cool.system).not.toContain("GPT-5.5 OUTCOME-FIRST");
  });

  it("includes Composer 2.5 structure rules", async () => {
    const { buildMetaPrompt } = await import("./providers");
    const warm = buildMetaPrompt({ prompt: "fix my react app", model: "composer-2.5", level: 2 });
    expect(warm.system).toContain("COMPOSER 2.5");
    expect(warm.system.toLowerCase()).toContain("goal + context + input only");
  });

  it("includes Grok 4 structure rules", async () => {
    const { buildMetaPrompt } = await import("./providers");
    const hot = buildMetaPrompt({ prompt: "fix my app", model: "grok-4", level: 3 });
    expect(hot.system).toContain("GROK 4");
    expect(hot.system).toContain("QUALITY BAR");
    expect(hot.system.toLowerCase()).toContain("never xml");
  });

  it("adds the prompt-type rule only for explicit non-auto types", async () => {
    const { buildMetaPrompt } = await import("./providers");
    const base = { prompt: "tell my team the roadmap slips", model: "claude-opus-4.8" as const, level: 2 as const };
    const auto = buildMetaPrompt({ ...base, promptType: "auto" });
    const none = buildMetaPrompt(base);
    const letter = buildMetaPrompt({ ...base, promptType: "letter" });
    const question = buildMetaPrompt({ ...base, promptType: "question" });
    expect(auto.system).not.toContain("PROMPT TYPE");
    expect(none.system).not.toContain("PROMPT TYPE");
    expect(auto.system).toBe(none.system);
    expect(letter.system).toContain("PROMPT TYPE — WRITTEN MESSAGE");
    expect(question.system).toContain("PROMPT TYPE — QUESTION");
  });

  it("keeps the terminal single-line rule with an explicit prompt type", async () => {
    const { buildMetaPrompt } = await import("./providers");
    const { system } = buildMetaPrompt({
      prompt: "find big files",
      model: "claude-opus-4.8",
      level: 3,
      terminalContext: true,
      promptType: "question",
    });
    expect(system).toContain("TERMINAL SHELL");
    expect(system).toContain("SINGLE line");
    expect(system).toContain("PROMPT TYPE — QUESTION");
  });
});

describe("optimizeLocal", () => {
  it("applies model guide structure at level 3", async () => {
    const { optimizeLocal } = await import("./localOptimizer");
    const res = optimizeLocal({
      prompt: "please help me write a cold email",
      model: "claude-opus-4.8",
      level: 3,
    });
    expect(res.optimizedPrompt).toContain("<task>");
    expect(res.optimizedPrompt).toContain("<constraints>");
    expect(res.optimizedPrompt).toContain("<output_format>");
    expect(res.source).toBe("local");
    expect(res.adherenceLevel).toBeGreaterThanOrEqual(1);
  });

  it("uses instructions and input at level 2 for Claude", async () => {
    const { optimizeLocal } = await import("./localOptimizer");
    const res = optimizeLocal({
      prompt: "please help me write a cold email",
      model: "claude-opus-4.8",
      level: 2,
    });
    expect(res.optimizedPrompt).toContain("<instructions>");
    expect(res.optimizedPrompt).toContain("<input>");
    expect(res.optimizedPrompt).toContain("cold email");
  });

  it("forbids examples in buildMetaPrompt output rules", async () => {
    const { buildMetaPrompt } = await import("./providers");
    const max = buildMetaPrompt({ prompt: "write a cold email", model: "claude-opus-4.8", level: 4 });
    expect(max.system.toLowerCase()).toContain("never add examples");
    expect(max.system).not.toContain("plus examples and success criteria");
  });

  it("adds success criteria without examples at level 4 for Claude", async () => {
    const { optimizeLocal } = await import("./localOptimizer");
    const res = optimizeLocal({
      prompt: "please help me write a cold email",
      model: "claude-opus-4.8",
      level: 4,
    });
    expect(res.optimizedPrompt).not.toContain("<examples>");
    expect(res.optimizedPrompt).toContain("<success_criteria>");
  });

  it("keeps minimal output at level 1", async () => {
    const { optimizeLocal } = await import("./localOptimizer");
    const res = optimizeLocal({
      prompt: "please help me write a cold email",
      model: "grok-4",
      level: 1,
    });
    expect(res.optimizedPrompt).not.toContain("GOAL:");
    expect(res.optimizedPrompt.toLowerCase()).toContain("cold email");
  });
});
