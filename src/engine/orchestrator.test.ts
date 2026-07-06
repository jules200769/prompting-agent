import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OptimizeRequest } from "../shared/types";

const keyGet = vi.fn<() => Promise<string | null>>();
const optimizeStream = vi.fn();

vi.mock("../main/keyStore", () => ({
  keyStore: { get: keyGet },
}));

vi.mock("./providers", () => ({
  optimizeStream: (...args: unknown[]) => optimizeStream(...args),
}));

describe("optimize orchestrator", () => {
  beforeEach(() => {
    keyGet.mockReset();
    optimizeStream.mockReset();
  });

  const req: OptimizeRequest = {
    prompt: "fix my react app",
    model: "claude-opus-4.8",
    level: 3,
  };

  it("throws when no API key is configured", async () => {
    keyGet.mockResolvedValue(null);
    const { optimize } = await import("./orchestrator");
    await expect(optimize({ request: req, onText: () => {} })).rejects.toThrow(
      "OpenAI API key not configured",
    );
    expect(optimizeStream).not.toHaveBeenCalled();
  });

  it("throws on provider errors instead of local fallback", async () => {
    keyGet.mockResolvedValue("sk-test");
    optimizeStream.mockRejectedValue(new Error("429 rate limit"));
    const { optimize } = await import("./orchestrator");
    await expect(optimize({ request: req, onText: () => {} })).rejects.toThrow("429 rate limit");
  });

  it("throws when the API returns empty text", async () => {
    keyGet.mockResolvedValue("sk-test");
    optimizeStream.mockResolvedValue({ text: "   " });
    const { optimize } = await import("./orchestrator");
    await expect(optimize({ request: req, onText: () => {} })).rejects.toThrow("empty output");
  });

  it("returns llm result on success", async () => {
    keyGet.mockResolvedValue("sk-test");
    optimizeStream.mockImplementation(async (_params, cb) => {
      cb.onText("Refined prompt text");
      return { text: "Refined prompt text" };
    });
    const { optimize } = await import("./orchestrator");
    const res = await optimize({ request: req, onText: () => {} });
    expect(res.source).toBe("llm");
    expect(res.optimizedPrompt).toContain("Refined prompt text");
  });

  it("collapses terminal rewrite output to a single line", async () => {
    keyGet.mockResolvedValue("sk-test");
    optimizeStream.mockResolvedValue({ text: "line one\nline two" });
    const { optimize } = await import("./orchestrator");
    const res = await optimize({
      request: { ...req, terminalContext: true },
      onText: () => {},
    });
    expect(res.optimizedPrompt).toBe("line one line two");
    expect(res.optimizedPrompt).not.toMatch(/\n/);
  });
});
