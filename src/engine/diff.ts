// Line-oriented diff with semantic tags for the Studio / overlay highlight view.
import type { DiffSegment } from "../shared/types";

function splitLines(s: string): string[] {
  return s.replace(/\r\n/g, "\n").split("\n");
}

// Classic LCS dp over lines; fine for prompt-sized inputs.
function lcs(a: string[], b: string[]): number[][] {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  return dp;
}

function classify(line: string): string | undefined {
  const s = line.trim();
  if (/^(role|persona)\s*:/i.test(s)) return "+ Role/persona";
  if (/<context>|^context\s*:/i.test(s)) return "+ Context";
  if (/<constraints>|^constraints\s*:/i.test(s)) return "+ Constraints";
  if (/<output|<output_format>|^output(\s+format)?\s*:/i.test(s)) return "+ Output format";
  if (/<example|^example\s*:|^# example/i.test(s)) return "+ Example";
  if (/<success|success\s*criteria/i.test(s)) return "+ Success criteria";
  if (/^(steps|step-by-step|think step by step)/i.test(s)) return "+ Reasoning steps";
  if (/^\d+[.)]\s/.test(s) || /^[-*]\s/.test(s)) return "+ Structure";
  return undefined;
}

export function buildDiff(original: string, optimized: string): DiffSegment[] {
  const a = splitLines(original);
  const b = splitLines(optimized);
  const dp = lcs(a, b);
  const segs: DiffSegment[] = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      segs.push({ type: "context", text: a[i] });
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      segs.push({ type: "remove", text: a[i] });
      i++;
    } else {
      segs.push({ type: "add", text: b[j], tag: classify(b[j]) });
      j++;
    }
  }
  while (i < a.length) segs.push({ type: "remove", text: a[i++] });
  while (j < b.length) segs.push({ type: "add", text: b[j++], tag: classify(b[j - 1]) });
  // Coalesce identical adjacent context lines for compactness.
  return segs;
}
