import { describe, expect, it } from "vitest";
import { THEME_IDS } from "../../shared/themes";
import { THEME_PREVIEW_URLS } from "./themePreviews";

describe("themePreviews", () => {
  it("maps every forge theme to an overlay screenshot", () => {
    expect(Object.keys(THEME_PREVIEW_URLS).sort()).toEqual([...THEME_IDS].sort());
  });

  it("provides a bundled URL for each mapped theme", () => {
    for (const id of THEME_IDS) {
      expect(typeof THEME_PREVIEW_URLS[id]).toBe("string");
      expect(THEME_PREVIEW_URLS[id]).toBeTruthy();
    }
  });
});
