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

  it("passes every theme through to the overlay, including ash-paper", () => {
    expect(resolveOverlayTheme("ash-paper")).toBe("ash-paper");
    expect(resolveOverlayTheme("ember-forge")).toBe("ember-forge");
    expect(resolveOverlayTheme("cool-temper")).toBe("cool-temper");
  });

  it("defines display and body fonts for every forge template", () => {
    const expected: Record<string, { fontDisplay: string; fontSans: string }> = {
      "ember-forge": { fontDisplay: "Bahnschrift", fontSans: "IBM Plex Sans" },
      "forged-steel": { fontDisplay: "Barlow Condensed", fontSans: "IBM Plex Sans" },
      "white-hot": { fontDisplay: "Oswald", fontSans: "IBM Plex Sans" },
      "ash-paper": { fontDisplay: "Instrument Serif", fontSans: "DM Sans" },
      "cool-temper": { fontDisplay: "Space Grotesk", fontSans: "IBM Plex Sans" },
      "midnight-anvil": { fontDisplay: "Bahnschrift", fontSans: "IBM Plex Sans" },
      "crimson-shop": { fontDisplay: "Oswald", fontSans: "IBM Plex Sans" },
      "tempered-green": { fontDisplay: "Outfit", fontSans: "Outfit" },
    };

    for (const meta of THEME_META) {
      expect(meta.fontDisplay).toBe(expected[meta.id].fontDisplay);
      expect(meta.fontSans).toBe(expected[meta.id].fontSans);
    }
  });
});
