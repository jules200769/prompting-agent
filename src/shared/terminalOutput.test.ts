import { describe, expect, it } from "vitest";
import { stripTerminalStreamChunk, toTerminalSingleLine } from "./terminalOutput";

describe("toTerminalSingleLine", () => {
  it("collapses newlines to spaces", () => {
    expect(toTerminalSingleLine("npm run build\n&& npm test")).toBe("npm run build && npm test");
  });

  it("collapses repeated whitespace", () => {
    expect(toTerminalSingleLine("hello   \n  world")).toBe("hello world");
  });

  it("trims ends", () => {
    expect(toTerminalSingleLine("  one line  ")).toBe("one line");
  });
});

describe("stripTerminalStreamChunk", () => {
  it("replaces newlines in a chunk with spaces", () => {
    expect(stripTerminalStreamChunk("line\nmore")).toBe("line more");
  });
});
