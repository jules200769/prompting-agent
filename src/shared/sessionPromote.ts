// Heuristics for suggesting session → project memory promotion (pure module).

function sectionHasContent(text: string, label: string): boolean {
  const re = new RegExp(String.raw`\b${label}\b`, "i");
  const lines = text.split("\n");
  const idx = lines.findIndex((l) => re.test(l));
  if (idx < 0) return false;
  const line = lines[idx];
  const inline = line
    .replace(re, "")
    .replace(/^[\d.]+\s*/, "")
    .replace(/^[\w &]+[—-]\s*/, "")
    .trim();
  if (/^not established$/i.test(inline)) return false;
  if (inline.length > 12) return true;
  for (let i = idx + 1; i < lines.length; i++) {
    if (/^\d+\.\s/.test(lines[i].trim())) break;
    const extra = lines[i].trim();
    if (extra && !/^not established$/i.test(extra)) return extra.length > 3;
  }
  return false;
}

/**
 * True when the session summary has promotable KEY FACTS or TERMINOLOGY not already
 * fully reflected in the standing project context.
 */
export function shouldSuggestPromoteToProject(
  sessionText: string,
  projectText: string,
): boolean {
  const session = sessionText.trim();
  if (!session) return false;
  const hasPromotable =
    sectionHasContent(session, "KEY FACTS") ||
    sectionHasContent(session, "TERMINOLOGY");
  if (!hasPromotable) return false;
  const project = projectText.trim();
  if (!project) return true;
  const sessionSnippet = session.slice(0, Math.min(session.length, 200));
  return !project.includes(sessionSnippet);
}
