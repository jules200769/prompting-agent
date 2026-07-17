/**
 * Strip Cursor/VS Code Codicon Private Use Area glyphs from captured UI text.
 * Mention chips expose BMP PUA codepoints (U+E000–U+F8FF) that render as tofu
 * without the Codicon font — e.g. file/dismiss icons around a filename.
 *
 * Cursor often wraps those icons in ASCII quotes and puts the filename on its
 * own line: `''\uE099\ncontextLayer.ts\n\uEA76''`.
 */
const BMP_PRIVATE_USE = /[\uE000-\uF8FF]/g;
/** Quotes glued to a Codicon glyph (chip chrome), removed with the icon. */
const CHIP_ICON_WITH_QUOTES =
  /['"\u2018\u2019\u201C\u201D]{0,2}\s*[\uE000-\uF8FF]+\s*['"\u2018\u2019\u201C\u201D]{0,2}/g;
const HORIZONTAL_WS = /[ \t\u00A0]+/g;
/** Leftover quote-only lines after icon strip (not blank paragraph lines). */
const QUOTE_ONLY_LINE = /^[\s]*['"\u2018\u2019\u201C\u201D]+[\s]*$/;

/** Remove BMP PUA glyphs and collapse leftover horizontal whitespace per line. */
export function stripUiPrivateUseGlyphs(text: string): string {
  if (!text) return text;
  return text
    .replace(CHIP_ICON_WITH_QUOTES, " ")
    .replace(BMP_PRIVATE_USE, "")
    .split("\n")
    .map((line) => line.replace(HORIZONTAL_WS, " ").replace(/^ +| +$/g, ""))
    .filter((line) => !QUOTE_ONLY_LINE.test(line))
    .join("\n");
}
