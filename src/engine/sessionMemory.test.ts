import { describe, expect, it, vi, beforeEach } from "vitest";
import { SESSION_CONTEXT_MAX_CHARS } from "../shared/session";

const createMock = vi.fn();

vi.mock("openai", () => ({
  default: class OpenAI {
    chat = {
      completions: {
        create: createMock,
      },
    };
  },
}));

const { refreshSessionMemory } = await import("./sessionMemory");

beforeEach(() => {
  createMock.mockReset();
});

describe("refreshSessionMemory", () => {
  it("throws on empty activity delta", async () => {
    await expect(
      refreshSessionMemory({
        currentContext: "",
        activityDelta: "   ",
        apiKey: "sk-test",
      }),
    ).rejects.toThrow(/Nothing to refresh/);
  });

  it("returns stripped refresh output clamped to 4k", async () => {
    const summary = `1. GOAL — Ship the parser fix.
2. CURRENT STATE — applied refined prompt.
3. KEY FACTS & DECISIONS — storage owns sessions.
4. CONSTRAINTS & PREFERENCES — not established.
5. TERMINOLOGY & NAMES — storage.ts.
6. OPEN ITEMS — verify overlay.`;

    async function* stream() {
      yield { choices: [{ delta: { content: summary } }] };
    }

    createMock.mockResolvedValue(stream());

    const result = await refreshSessionMemory({
      currentContext: "1. GOAL — Old goal.",
      activityDelta: "Run 1 (applied):\nOriginal draft: \"\"\"fix\"\"\"",
      apiKey: "sk-test",
    });

    expect(result).toBe(summary);
    expect(result.length).toBeLessThanOrEqual(SESSION_CONTEXT_MAX_CHARS);
  });

  it("throws when the API returns empty output", async () => {
    async function* stream() {
      yield { choices: [{ delta: { content: "   " } }] };
    }
    createMock.mockResolvedValue(stream());

    await expect(
      refreshSessionMemory({
        currentContext: "",
        activityDelta: "Run 1 (copied):",
        apiKey: "sk-test",
      }),
    ).rejects.toThrow(/empty output/);
  });
});
