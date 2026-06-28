import { describe, expect, it } from "vitest";
import { adherenceLevel, analyze } from "./rubric";
import { REWRITE_CONFIG } from "../shared/types";

describe("adherenceLevel", () => {
  it("classifies empty prompt as Cool (L1)", () => {
    const { subscores } = analyze("");
    expect(adherenceLevel(subscores)).toBe(1);
  });

  it("classifies fully structured prompt as Max (L4)", () => {
    const structured = `# Role
You are a senior staff engineer who reviews code for correctness and clarity.

# Task
Refactor the authentication module to use JWT tokens.

# Context
- Audience: backend team
- Background: legacy session cookies

# Constraints
- Do not break existing API contracts
- No new dependencies

# Output format
Return a markdown summary with bullet points.

# Success criteria
- All tests pass
- Migration guide included

Example:
Input: session cookie auth
Output: JWT with refresh tokens`;

    const { subscores } = analyze(structured);
    expect(adherenceLevel(subscores)).toBe(4);
  });

  it("classifies partial structure as Warm or Hot", () => {
    const partial = `You are a senior engineer.

Task: Fix the login bug.

Output format: bullet list`;

    const { subscores } = analyze(partial);
    const level = adherenceLevel(subscores);
    expect(level).toBeGreaterThanOrEqual(2);
    expect(level).toBeLessThanOrEqual(3);
  });
});

describe("REWRITE_CONFIG", () => {
  it("uses fixed optimal temperature of 0.3", () => {
    expect(REWRITE_CONFIG.temperature).toBe(0.3);
  });
});
