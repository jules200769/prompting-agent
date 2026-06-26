import { describe, expect, it, beforeEach } from "vitest";
import { clearGuideCache, getGuideExcerpt, loadGuideFull } from "./guideLoader";
import { LEVEL_TEMPERATURE } from "../shared/types";

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

  it("level temperature mapping matches plan", () => {
    expect(LEVEL_TEMPERATURE[1]).toBe(0.2);
    expect(LEVEL_TEMPERATURE[2]).toBe(0.5);
    expect(LEVEL_TEMPERATURE[3]).toBe(0.75);
    expect(LEVEL_TEMPERATURE[4]).toBe(1.0);
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
    expect(system).toContain("plain text");
    expect(user).toContain("write a cold email");
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
    expect(res.source).toBe("local");
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
