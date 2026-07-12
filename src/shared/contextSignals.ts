// Pure destination-context signal logic (no Electron/Node deps — vitest-testable).
// Site detection, target-model routing, editor file-name heuristics, and the
// DESTINATION CONTEXT meta-prompt block renderer.

import type { CaptureContext, ModelId } from "./types";
import { CONTEXT_CAPS } from "./types";

/** Browser processes whose window may identify a target site (lowercase, no .exe). */
const BROWSER_PROCESS_NAMES = new Set([
  "chrome",
  "msedge",
  "brave",
  "opera",
  "vivaldi",
  "arc",
  "firefox",
]);

/** Desktop AI apps — normalized process name → site host (same keys as SITE_MODEL_MAP). */
const DESKTOP_APP_SITE_MAP: Record<string, string> = {
  claude: "claude.ai",
  chatgpt: "chatgpt.com",
  "chatgpt classic": "chatgpt.com",
};

function normalizeProcessName(processName: string | undefined): string {
  return (processName ?? "").trim().toLowerCase().replace(/\.exe$/, "");
}

/** Site host → target model routing (browser destinations). */
export const SITE_MODEL_MAP: Record<string, ModelId> = {
  "claude.ai": "claude-opus-4.8",
  "chatgpt.com": "gpt-5",
  "gemini.google.com": "gemini-3",
  "grok.com": "grok-4",
  "chat.deepseek.com": "deepseek-v3",
};

/** Title fragments that identify a site when no URL is available. */
const TITLE_SITE_HINTS: [RegExp, string][] = [
  [/\bclaude\b/i, "claude.ai"],
  [/\bchatgpt\b/i, "chatgpt.com"],
  [/\bgemini\b/i, "gemini.google.com"],
  [/\bgrok\b/i, "grok.com"],
  [/\bdeepseek\b/i, "chat.deepseek.com"],
];

/**
 * Identify the destination site from browser tabs or known desktop AI apps.
 * URL host wins in browsers (www. stripped); title heuristics are the browser fallback.
 * Desktop apps (Claude, ChatGPT, …) map directly from process name.
 */
export function detectSite(opts: {
  processName?: string;
  windowTitle?: string;
  url?: string;
}): string | null {
  const proc = normalizeProcessName(opts.processName);
  if (!proc) return null;

  const desktopSite = DESKTOP_APP_SITE_MAP[proc];
  if (desktopSite) return desktopSite;

  if (!BROWSER_PROCESS_NAMES.has(proc)) return null;

  const url = opts.url?.trim();
  if (url) {
    try {
      const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`;
      const host = new URL(withScheme).hostname.replace(/^www\./i, "").toLowerCase();
      if (host) return host;
    } catch {
      /* fall through to title heuristics */
    }
  }

  const title = opts.windowTitle ?? "";
  for (const [re, site] of TITLE_SITE_HINTS) {
    if (re.test(title)) return site;
  }
  return null;
}

/** Cursor AI chat pane elements carry an "aislash" editor class. */
const CURSOR_CHAT_ELEMENT_RE = /aislash/i;

/**
 * Suggested target model for the destination — site map hit, or the Cursor chat
 * pane routes to composer-2.5. Terminal panes in Cursor must NOT route.
 */
export function suggestTargetModel(opts: {
  site?: string | null;
  processName?: string;
  elementClassName?: string;
}): ModelId | undefined {
  if (opts.site && SITE_MODEL_MAP[opts.site]) return SITE_MODEL_MAP[opts.site];
  const proc = normalizeProcessName(opts.processName);
  if (proc === "cursor" && CURSOR_CHAT_ELEMENT_RE.test(opts.elementClassName ?? "")) {
    return "composer-2.5";
  }
  return undefined;
}

/** Wispr rule: contains a dot, no whitespace, starts with a letter, ≤80 chars, no path chars. */
export function isLikelyFileName(token: string): boolean {
  const t = token.trim();
  if (!t || t.length > 80) return false;
  if (!t.includes(".")) return false;
  if (/\s/.test(t)) return false;
  if (!/^[a-zA-Z]/.test(t)) return false;
  if (/[\\/:*?"<>|]/.test(t)) return false;
  return true;
}

export function editorKindFromProcess(
  processName: string | undefined,
): "cursor" | "vscode" | "windsurf" | undefined {
  const proc = normalizeProcessName(processName);
  if (proc === "cursor") return "cursor";
  if (proc === "code" || proc === "code - insiders") return "vscode";
  if (proc === "windsurf") return "windsurf";
  return undefined;
}

/**
 * Active file from a code-editor window title: strip dirty markers (●/○),
 * take the segment before the first " - ", validate as a file name.
 */
export function extractFileFromEditorTitle(
  title: string | undefined,
  processName: string | undefined,
): string | null {
  if (!editorKindFromProcess(processName)) return null;
  const cleaned = (title ?? "").replace(/[●○]/g, "").trim();
  if (!cleaned) return null;
  const first = cleaned.split(" - ")[0].trim();
  return isLikelyFileName(first) ? first : null;
}

function fileMatchesPrompt(name: string, promptTokens: Set<string>): boolean {
  const base = name.toLowerCase().replace(/\.[^.]+$/, "");
  const words = base.split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
  if (promptTokens.has(name.toLowerCase()) || promptTokens.has(base)) return true;
  return words.some((w) => promptTokens.has(w));
}

/**
 * File-memory names relevant to this prompt — fuzzy match of basename words
 * against prompt tokens; activeFile always first.
 */
export function relevantFileMemory(
  prompt: string,
  memory: string[],
  activeFile?: string,
  max = CONTEXT_CAPS.files,
): string[] {
  const tokens = new Set(
    prompt
      .toLowerCase()
      .split(/[^a-z0-9.]+/)
      .filter((t) => t.length >= 3),
  );
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (name: string) => {
    const key = name.toLowerCase();
    if (!seen.has(key) && out.length < max) {
      seen.add(key);
      out.push(name);
    }
  };
  if (activeFile) push(activeFile);
  for (const name of memory) {
    if (out.length >= max) break;
    if (fileMatchesPrompt(name, tokens)) push(name);
  }
  return out;
}

function cap(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

function capTail(text: string, max: number): string {
  return text.length > max ? text.slice(-max) : text;
}

/**
 * Render the DESTINATION CONTEXT meta-prompt block. Returns "" for empty
 * context. Caps re-applied defensively; suggestedModel never rendered.
 */
export function buildDestinationContextBlock(ctx: CaptureContext | undefined): string {
  if (!ctx) return "";
  const lines: string[] = [];

  const app = ctx.app;
  if (app?.processName || app?.editorKind || app?.hostKind) {
    const appLabel =
      app.editorKind === "cursor"
        ? "Cursor"
        : app.editorKind === "vscode"
          ? "VS Code"
          : app.editorKind === "windsurf"
            ? "Windsurf"
            : app.processName;
    if (appLabel) {
      lines.push(`- Destination app: ${appLabel}`);
    }
  }
  if (app?.windowTitle?.trim()) {
    lines.push(`- Window title: "${cap(app.windowTitle.trim(), CONTEXT_CAPS.windowTitle)}"`);
  }
  if (app?.site) {
    lines.push(`- Website: ${app.site}`);
  }

  const text = ctx.text;
  if (text) {
    const scopeLabel =
      text.scope === "selection"
        ? "selection of a larger draft"
        : text.scope === "field"
          ? "whole draft"
          : "empty field (user is composing from scratch)";
    lines.push(`- Text scope: ${scopeLabel}`);
    if (text.beforeCursor?.trim()) {
      lines.push(
        `- Text before the cursor (context only — NEVER repeat or rewrite it in the output): """${capTail(text.beforeCursor, CONTEXT_CAPS.beforeCursor)}"""`,
      );
    }
    if (text.afterCursor?.trim()) {
      lines.push(
        `- Text after the cursor (context only — NEVER repeat it): """${cap(text.afterCursor, CONTEXT_CAPS.afterCursor)}"""`,
      );
    }
  }

  const files = ctx.files;
  const fileNames = [
    ...(files?.activeFile ? [files.activeFile] : []),
    ...(files?.recentFiles ?? []),
  ];
  const dedupedFiles: string[] = [];
  const seen = new Set<string>();
  for (const f of fileNames) {
    const key = f.toLowerCase();
    if (!seen.has(key) && dedupedFiles.length < CONTEXT_CAPS.files) {
      seen.add(key);
      dedupedFiles.push(f);
    }
  }
  if (dedupedFiles.length > 0) {
    lines.push(`- Known project file names (spell exactly as shown when referenced): ${dedupedFiles.join(", ")}`);
  }

  if (lines.length === 0) return "";

  return `
DESTINATION CONTEXT (where the user will paste the refined prompt — adapt fit, do not override intent):
${lines.join("\n")}
Rules for this context:
- Use it only to match tone, formatting conventions, and exact file-name spelling for the destination
- Do not add facts, goals, or constraints the user's prompt does not imply
- The refined prompt is FOR the AI behind the destination — never address the destination app itself
`;
}
