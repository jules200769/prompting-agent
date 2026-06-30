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
    expect(max).toContain("<examples>");
    expect(max).toContain("<success_criteria>");
    expect(max).toContain("<constraints>");
    expect(max).toContain("<output_format>");
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

  it("adds examples and success criteria at level 4 for Claude", async () => {
    const { optimizeLocal } = await import("./localOptimizer");
    const res = optimizeLocal({
      prompt: "please help me write a cold email",
      model: "claude-opus-4.8",
      level: 4,
    });
    expect(res.optimizedPrompt).toContain("<examples>");
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
