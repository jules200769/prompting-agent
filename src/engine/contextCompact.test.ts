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

const { compactContext } = await import("./contextCompact");

beforeEach(() => {
  createMock.mockReset();
});

describe("compactContext", () => {
  it("throws on empty input", async () => {
    await expect(
      compactContext({ scope: "session", text: "   ", apiKey: "sk-test" }),
    ).rejects.toThrow(/Nothing to compact/);
  });

  it("returns stripped compact output clamped to 4k", async () => {
    const summary = `1. GOAL — Ship the parser fix.
2. CURRENT STATE — in progress.
3. KEY FACTS & DECISIONS — main owns storage.
4. CONSTRAINTS & PREFERENCES — not established.
5. TERMINOLOGY & NAMES — storage.ts.
6. OPEN ITEMS — wire overlay.`;

    async function* stream() {
      yield { choices: [{ delta: { content: summary } }] };
    }

    createMock.mockResolvedValue(stream());

    const result = await compactContext({
      scope: "session",
      text: "x".repeat(5000),
      apiKey: "sk-test",
    });

    expect(result).toBe(summary);
    expect(result.length).toBeLessThanOrEqual(SESSION_CONTEXT_MAX_CHARS);
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4.1",
        messages: expect.arrayContaining([
          expect.objectContaining({ role: "system" }),
          expect.objectContaining({ role: "user", content: expect.stringContaining("x".repeat(100)) }),
        ]),
      }),
    );
  });

  it("throws when the API returns empty output", async () => {
    async function* stream() {
      yield { choices: [{ delta: { content: "   " } }] };
    }
    createMock.mockResolvedValue(stream());

    await expect(
      compactContext({ scope: "session", text: "source", apiKey: "sk-test" }),
    ).rejects.toThrow(/empty output/);
  });
});
