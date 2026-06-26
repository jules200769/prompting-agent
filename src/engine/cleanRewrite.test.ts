import { describe, expect, it } from "vitest";
import { stripResponseArtifacts } from "./cleanRewrite";

describe("stripResponseArtifacts", () => {
  it("returns plain text as-is", () => {
    expect(stripResponseArtifacts("Clean prompt text.")).toBe("Clean prompt text.");
  });

  it("strips markdown fences", () => {
    expect(stripResponseArtifacts("```\nHello world\n```")).toBe("Hello world");
  });

  it("strips common preamble", () => {
    expect(stripResponseArtifacts("Here is the refined prompt:\n\nDo the task.")).toBe("Do the task.");
  });

  it("extracts optimized_prompt from accidental JSON", () => {
    const raw = '{"optimized_prompt":"The cleaned prompt.","score":80}';
    expect(stripResponseArtifacts(raw)).toBe("The cleaned prompt.");
  });
});
