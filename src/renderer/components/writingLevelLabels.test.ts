import { describe, expect, it } from "vitest";
import { WRITING_LEVEL_LABELS, writingLevelLabels } from "./WritingTypePicker";

describe("writingLevelLabels", () => {
  it("maps each writing type to four level labels", () => {
    expect(writingLevelLabels("email")).toEqual({
      1: "Structure",
      2: "Formal",
      3: "Friendly",
      4: "Informal",
    });
    expect(writingLevelLabels("question")).toEqual({
      1: "Structure",
      2: "Closed",
      3: "Open",
      4: "Auto",
    });
    expect(writingLevelLabels("explain")).toEqual({
      1: "Structure",
      2: "Simple",
      3: "Technical",
      4: "Step by step",
    });
    expect(writingLevelLabels("message")).toEqual({
      1: "Structure",
      2: "Informal",
      3: "Formal",
      4: "Auto",
    });
  });

  it("covers every writing type", () => {
    expect(Object.keys(WRITING_LEVEL_LABELS).sort()).toEqual(["email", "explain", "message", "question"]);
  });
});
