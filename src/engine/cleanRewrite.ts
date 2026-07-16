// Response artifact stripping for plain-text refined prompts.

/** Strip fences, quotes, or accidental JSON from LLM output. */
export function stripResponseArtifacts(raw: string): string {
  let t = raw.trim();

  // Remove common preamble lines.
  // Requires the trailing colon so genuine content starting with e.g.
  // "Here is the explanation" is never eaten.
  t = t.replace(
    /^(here(?:'s| is) (?:the |your |a )?(?:refined |optimized |improved |rewritten |revised )?(?:prompt|email|message|question|explanation|draft|version|text):\s*)/i,
    "",
  );

  const fence = t.match(/^```(?:\w*\n)?([\s\S]*?)```$/);
  if (fence) t = fence[1].trim();

  if (
    (t.startsWith('"') && t.endsWith('"') && t.length > 1) ||
    (t.startsWith("'") && t.endsWith("'") && t.length > 1)
  ) {
    t = t.slice(1, -1).trim();
  }

  if (t.startsWith("{")) {
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (end > start) {
      try {
        const parsed = JSON.parse(t.slice(start, end + 1)) as { optimized_prompt?: string };
        if (typeof parsed.optimized_prompt === "string" && parsed.optimized_prompt.trim()) {
          return parsed.optimized_prompt.trim();
        }
      } catch {
        // fall through
      }
    }
  }

  return t.trim();
}
