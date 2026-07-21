import { describe, expect, it } from "vitest";
import {
  THEME_IDS,
  THEME_META,
  normalizeTheme,
  resolveOverlayTheme,
} from "./themes";

describe("themes", () => {
  it("lists exactly eight forge templates with matching meta", () => {
    expect(THEME_IDS).toHaveLength(8);
    expect(THEME_META.map((t) => t.id)).toEqual([...THEME_IDS]);
  });

  it("migrates legacy dark/light values", () => {
    expect(normalizeTheme("dark")).toBe("ember-forge");
    expect(normalizeTheme("light")).toBe("ash-paper");
  });

  it("falls back to ember-forge for unknown values", () => {
    expect(normalizeTheme(undefined)).toBe("ember-forge");
    expect(normalizeTheme("not-a-theme")).toBe("ember-forge");
  });

  it("passes through valid theme ids", () => {
    for (const id of THEME_IDS) {
      expect(normalizeTheme(id)).toBe(id);
    }
  });

  it("keeps overlay dark when ash-paper is selected", () => {
    expect(resolveOverlayTheme("ash-paper")).toBe("ember-forge");
    expect(resolveOverlayTheme("cool-temper")).toBe("cool-temper");
  });
});
