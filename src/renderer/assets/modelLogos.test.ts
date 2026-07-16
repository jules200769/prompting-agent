import { describe, expect, it } from "vitest";
import { MODELS } from "../../shared/types";
import { MODEL_LOGO_URLS } from "./modelLogos";

describe("MODEL_LOGO_URLS", () => {
  it("maps every ModelId to a non-empty bundled URL", () => {
    for (const m of MODELS) {
      expect(MODEL_LOGO_URLS[m.id], m.id).toBeTruthy();
      expect(typeof MODEL_LOGO_URLS[m.id]).toBe("string");
    }
    expect(Object.keys(MODEL_LOGO_URLS)).toHaveLength(MODELS.length);
  });
});
