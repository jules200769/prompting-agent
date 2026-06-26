import { describe, expect, it, afterEach } from "vitest";
import { getForegroundHwnd, normalizeHwnd, setForegroundReader } from "./win32";

describe("win32", () => {
  afterEach(() => {
    setForegroundReader(null);
  });

  it("normalizeHwnd rejects invalid values", () => {
    expect(normalizeHwnd(0)).toBe(0);
    expect(normalizeHwnd(-1)).toBe(0);
    expect(normalizeHwnd(NaN)).toBe(0);
  });

  it("normalizeHwnd coerces to unsigned 32-bit", () => {
    expect(normalizeHwnd(65536)).toBe(65536);
  });

  it("getForegroundHwnd uses injected reader in tests", () => {
    setForegroundReader(() => 12345);
    expect(getForegroundHwnd()).toBe(12345);
  });
});
