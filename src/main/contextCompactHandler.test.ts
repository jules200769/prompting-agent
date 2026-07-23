import { describe, expect, it, beforeEach, vi } from "vitest";

const compactContext = vi.fn(async () => "1. GOAL — compacted");

vi.mock("../engine/contextCompact", () => ({
  compactContext: (...args: unknown[]) => compactContext(...args),
}));

const keyGet = vi.fn(async () => "sk-test" as string | null);

vi.mock("./keyStore", () => ({
  keyStore: {
    get: (...args: unknown[]) => keyGet(...args),
  },
}));

const { runContextCompact } = await import("./contextCompactHandler");

beforeEach(() => {
  compactContext.mockClear();
  keyGet.mockReset();
  keyGet.mockResolvedValue("sk-test");
});

describe("runContextCompact", () => {
  it("throws when the OpenAI key is missing", async () => {
    keyGet.mockResolvedValue(null);
    await expect(
      runContextCompact({ scope: "session", text: "long paste" }),
    ).rejects.toThrow(/API key not configured/);
  });

  it("returns compacted text from the engine", async () => {
    const result = await runContextCompact({ scope: "project", text: "long paste" });
    expect(result.text).toBe("1. GOAL — compacted");
    expect(compactContext).toHaveBeenCalledWith({
      scope: "project",
      text: "long paste",
      apiKey: "sk-test",
    });
  });
});
