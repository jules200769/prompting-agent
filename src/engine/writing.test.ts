import { describe, expect, it } from "vitest";
import { buildWritingMetaPrompt, writingToneLabel } from "./writing";
import {
  WRITING_TYPES,
  WRITING_LEVEL_LABELS,
  type OptLevel,
  type WritingType,
} from "../shared/types";

const LEVELS: OptLevel[] = [1, 2, 3, 4];

function build(type: WritingType, level: OptLevel, extra: Partial<Parameters<typeof buildWritingMetaPrompt>[0]> = {}) {
  return buildWritingMetaPrompt({ prompt: "hey can u send me the report", writingType: type, level, ...extra });
}

describe("buildWritingMetaPrompt", () => {
  it("produces a distinct system prompt for every type × level", () => {
    const systems = new Set<string>();
    for (const type of WRITING_TYPES) {
      for (const level of LEVELS) {
        systems.add(build(type, level).system);
      }
    }
    expect(systems.size).toBe(WRITING_TYPES.length * LEVELS.length);
  });

  it("frames the output as final text, never a prompt", () => {
    for (const type of WRITING_TYPES) {
      const { system } = build(type, 2);
      expect(system).toContain("NOT a prompt for an AI");
      expect(system).toContain("Write in the same language as the user's draft");
    }
  });

  it("wraps the draft in the user message", () => {
    const { user } = build("email", 2);
    expect(user).toContain("hey can u send me the report");
    expect(user).toMatch(/^Rewrite this draft:/);
  });

  it("email levels map to Structure/Formal/Friendly/Informal", () => {
    expect(build("email", 1).system).toContain("STRUCTURE ONLY");
    expect(build("email", 2).system).toContain("TONE — FORMAL");
    expect(build("email", 3).system).toContain("TONE — FRIENDLY");
    expect(build("email", 4).system).toContain("TONE — INFORMAL");
  });

  it("question levels map to Structure/Closed/Open/Auto", () => {
    expect(build("question", 1).system).toContain("STRUCTURE ONLY");
    expect(build("question", 2).system).toContain("CLOSED QUESTION");
    expect(build("question", 3).system).toContain("OPEN QUESTION");
    expect(build("question", 4).system).toContain("FORM — AUTO");
  });

  it("explain levels map to Structure/Simple/Technical/Step by step", () => {
    expect(build("explain", 2).system).toContain("STYLE — SIMPLE");
    expect(build("explain", 3).system).toContain("STYLE — TECHNICAL");
    expect(build("explain", 4).system).toContain("STEP BY STEP");
  });

  it("message L4 infers tone from destination", () => {
    expect(build("message", 4).system).toContain("TONE — AUTO");
  });

  it("Structure level forbids restyling", () => {
    for (const type of WRITING_TYPES) {
      expect(build(type, 1).system).toContain("does NOT restyle");
    }
  });

  it("Structure level still requires the deliverable's minimal baseline shape", () => {
    for (const type of WRITING_TYPES) {
      expect(build(type, 1).system).toContain("minimal required shape");
    }
    // Email specifically must be told not to drop greeting/sign-off at L1.
    expect(build("email", 1).system).toContain("greeting and sign-off");
  });

  it("terminalContext forces single-line output", () => {
    const { system } = build("message", 2, { terminalContext: true });
    expect(system).toContain("ONE line only");
    expect(system).toContain("single-line");
  });

  it("terminalContext overrides even the most structured cells (email L4, explain L4 step-by-step)", () => {
    const typeRuleMarker: Record<"email" | "explain", string> = {
      email: "EMAIL RULES",
      explain: "EXPLANATION RULES",
    };
    for (const type of ["email", "explain"] as const) {
      const { system } = build(type, 4, { terminalContext: true });
      const terminalIdx = system.indexOf("TERMINAL SHELL");
      expect(terminalIdx).toBeGreaterThan(-1);
      // The mandatory override text must appear after the type/level rules it overrides.
      expect(terminalIdx).toBeGreaterThan(system.indexOf(typeRuleMarker[type]));
      expect(system).toContain("overrides any structure rules above");
      expect(system).toContain("single-line ");
    }
  });

  it("includes standing context when provided", () => {
    const { system } = build("email", 2, { context: "Works at Anvyl, Dutch B2B market" });
    expect(system).toContain("Works at Anvyl, Dutch B2B market");
    expect(build("email", 2).system).not.toContain("Standing context");
  });

  it("renders destination context from capture", () => {
    const { system } = build("message", 4, {
      captureContext: {
        app: { processName: "slack", windowTitle: "Slack - #general" },
        text: { scope: "field", hasSelection: false },
      },
    });
    expect(system).toContain("Destination app: slack");
  });

  it("threads the selected passage through into the system prompt", () => {
    const { system } = build("message", 3, {
      captureContext: {
        text: {
          scope: "selection",
          hasSelection: true,
          selectedText: "the thing is mostly working",
          beforeCursor: "Thanks all. ",
          afterCursor: " More on Friday.",
        },
      },
    });
    expect(system).toContain("Selected passage being rewritten");
    expect(system).toContain("the thing is mostly working");
  });

});

describe("writingToneLabel", () => {
  it("mirrors the slider labels for every type × level", () => {
    for (const type of WRITING_TYPES) {
      for (const level of LEVELS) {
        expect(writingToneLabel(type, level)).toBe(WRITING_LEVEL_LABELS[type][level]);
      }
    }
  });
});
