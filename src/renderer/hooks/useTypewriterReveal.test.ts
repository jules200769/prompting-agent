// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BASE_CHARS_PER_FRAME,
  CATCHUP_CHARS_PER_FRAME,
  MAX_LAG_CHARS,
  charsForFrame,
  useTypewriterReveal,
} from "./useTypewriterReveal";

describe("charsForFrame", () => {
  it("uses base speed when lag is within threshold", () => {
    expect(charsForFrame(1)).toBe(BASE_CHARS_PER_FRAME);
    expect(charsForFrame(MAX_LAG_CHARS)).toBe(BASE_CHARS_PER_FRAME);
  });

  it("accelerates when lag exceeds threshold", () => {
    expect(charsForFrame(MAX_LAG_CHARS + 1)).toBe(CATCHUP_CHARS_PER_FRAME);
  });
});

describe("useTypewriterReveal", () => {
  let rafCallbacks: FrameRequestCallback[];
  let rafId: number;

  beforeEach(() => {
    rafCallbacks = [];
    rafId = 0;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      rafCallbacks.push(cb);
      rafId += 1;
      return rafId;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {
      rafCallbacks = [];
    });
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function flushFrames(count: number): void {
    for (let i = 0; i < count; i++) {
      const pending = [...rafCallbacks];
      rafCallbacks = [];
      for (const cb of pending) cb(performance.now());
    }
  }

  it("reveals appended text character-by-character over frames", async () => {
    const { result } = renderHook(() => useTypewriterReveal());

    act(() => {
      result.current.appendTarget("hello");
    });

    expect(result.current.displayed).toBe("");
    expect(result.current.isRevealing).toBe(true);

    act(() => flushFrames(1));
    expect(result.current.displayed.length).toBeGreaterThan(0);
    expect(result.current.displayed.length).toBeLessThanOrEqual(5);

    act(() => flushFrames(10));
    await waitFor(() => {
      expect(result.current.displayed).toBe("hello");
      expect(result.current.isRevealing).toBe(false);
    });
  });

  it("setTarget replaces buffer with authoritative final text", async () => {
    const { result } = renderHook(() => useTypewriterReveal());

    act(() => {
      result.current.appendTarget("partial");
      flushFrames(1);
    });

    act(() => {
      result.current.setTarget("final prompt");
    });

    act(() => flushFrames(20));
    await waitFor(() => {
      expect(result.current.displayed).toBe("final prompt");
    });
  });

  it("reset clears displayed and target state", () => {
    const { result } = renderHook(() => useTypewriterReveal());

    act(() => {
      result.current.appendTarget("hello");
      flushFrames(5);
      result.current.reset();
    });

    expect(result.current.displayed).toBe("");
    expect(result.current.isRevealing).toBe(false);

    act(() => {
      result.current.appendTarget("world");
      flushFrames(10);
    });

    expect(result.current.displayed).toBe("world");
  });

  it("flush instantly shows full target", () => {
    const { result } = renderHook(() => useTypewriterReveal());

    act(() => {
      result.current.appendTarget("instant");
      result.current.flush();
    });

    expect(result.current.displayed).toBe("instant");
    expect(result.current.isRevealing).toBe(false);
  });

  it("reveals instantly when prefers-reduced-motion is set", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("reduce"),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );

    const { result } = renderHook(() => useTypewriterReveal());

    act(() => {
      result.current.appendTarget("no animation");
    });

    expect(result.current.displayed).toBe("no animation");
    expect(result.current.isRevealing).toBe(false);
  });

  it("waitUntilRevealed resolves when catch-up completes", async () => {
    const { result } = renderHook(() => useTypewriterReveal());

    act(() => {
      result.current.setTarget("done");
    });

    const revealed = result.current.waitUntilRevealed();
    act(() => flushFrames(20));

    await expect(revealed).resolves.toBeUndefined();
    expect(result.current.displayed).toBe("done");
  });
});
