import { describe, expect, it } from "vitest";
import { stripUiPrivateUseGlyphs } from "./captureTextSanitize";

describe("stripUiPrivateUseGlyphs", () => {
  it("strips Codicon mention-chip glyphs around a filename", () => {
    expect(stripUiPrivateUseGlyphs("\uE060 claudes-goal.md \uEA76").trim()).toBe("claudes-goal.md");
  });

  it("keeps surrounding prose after stripping icons", () => {
    expect(stripUiPrivateUseGlyphs("fix \uE060 claudes-goal.md \uEA76 please").trim()).toBe(
      "fix claudes-goal.md please",
    );
  });

  it("leaves real @paths alone", () => {
    expect(stripUiPrivateUseGlyphs("see @foo/bar.md")).toBe("see @foo/bar.md");
  });

  it("preserves newlines while collapsing horizontal whitespace", () => {
    expect(stripUiPrivateUseGlyphs("a\uE060  b\nc\uEA76  d")).toBe("a b\nc d");
  });

  it("returns empty for PUA-only input", () => {
    expect(stripUiPrivateUseGlyphs("\uE060\uEA76").trim()).toBe("");
  });

  it("returns empty string unchanged", () => {
    expect(stripUiPrivateUseGlyphs("")).toBe("");
  });

  it("strips multiline Cursor mention chip with quote wrappers", () => {
    const raw = "''\uE099\ncontextLayer.ts\n\uEA76''";
    expect(stripUiPrivateUseGlyphs(raw).trim()).toBe("contextLayer.ts");
  });

  it("strips inline Cursor mention chip with quote wrappers", () => {
    const raw = "''\uE099 contextLayer.ts \uEA76''";
    expect(stripUiPrivateUseGlyphs(raw).trim()).toBe("contextLayer.ts");
  });

  it("strips beforeCursor-style chip without outer quotes", () => {
    const raw = "\uE099\ncontextLayer.ts\n\uEA76 ";
    expect(stripUiPrivateUseGlyphs(raw).trim()).toBe("contextLayer.ts");
  });

  it("preserves intentional blank lines in prose", () => {
    expect(stripUiPrivateUseGlyphs("one\n\ntwo")).toBe("one\n\ntwo");
  });

  it("leaves code quotes without PUA alone", () => {
    expect(stripUiPrivateUseGlyphs("const x = ''")).toBe("const x = ''");
  });
});
