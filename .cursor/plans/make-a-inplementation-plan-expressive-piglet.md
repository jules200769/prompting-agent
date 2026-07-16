# Style Matching — destination-app-category-aware rewrite tone

## Context

The Wispr Flow teardown (`wisprflow-teardown.html`, Spec 06) identified "Style matching" — detecting the active app's category and applying matching style settings — as the next context-layer feature for PromptForge. The context layer v1 (`contextLayer.ts` / `contextSignals.ts`, pipeline v8) already ships app identity, site detection, caret-adjacent text, and editor file memory to the rewrite API. This feature adds: classify each hotkey capture's destination into an **app category** (ai-chat, code-editor, terminal, email, chat, docs-notes, other), resolve a per-category **style directive** (tone + format conventions) in the main process, render it inside the existing DESTINATION CONTEXT block, and let the user tune it per category in Studio Settings.

User decisions: **presets only** (Auto/Formal/Neutral/Casual/Off per category, no free-text in v1) and **no visible overlay hint** (silent, like `suggestedModel`).

Core architectural choice: resolve the final directive string in `assembleCaptureContext()` (main, where `getSettings()` is already called) and ship it on `CaptureContext.styleHint`. It then rides the existing capture → overlay → optimize pipeline with **zero changes** to IPC, preload, Overlay.tsx, optimizeHandler, orchestrator, or providers.ts — and the cache key covers it naturally because the resolved text itself is hashed.

## Files to change

| File | Change |
|---|---|
| `prompt-master/src/shared/types.ts` | `AppCategory`, labels, `CategoryStylePreset`, `CaptureContext.app.category` + `CaptureContext.styleHint`, `CONTEXT_CAPS.styleHint`, `AppSettings` + `DEFAULT_SETTINGS` |
| `prompt-master/src/shared/contextSignals.ts` | `detectAppCategory()`, `resolveStyleDirective()`, render new lines in `buildDestinationContextBlock()` |
| `prompt-master/src/main/contextLayer.ts` | Wire category detection + directive resolution into `assembleCaptureContext()` |
| `prompt-master/src/shared/cacheKey.ts` | Append `category` + `styleHint` to `canonicalContextString()` |
| `prompt-master/src/engine/guideLoader.ts` | `REWRITE_PIPELINE_VERSION` 8 → 9 |
| `prompt-master/src/renderer/views/Studio.tsx` | Settings UI: master toggle + per-category preset selects |
| Tests | `contextSignals.test.ts`, `cacheKey.test.ts`, `providers.test.ts` |

No PowerShell changes — all signals (process, title, site, hostKind, editorKind, element class) already arrive via `win-hotkey-snapshot.ps1`.

## 1. Types (`src/shared/types.ts`)

```ts
export type AppCategory =
  | "ai-chat" | "code-editor" | "terminal" | "email"
  | "chat" | "docs-notes" | "other";

export const APP_CATEGORIES: AppCategory[] = ["ai-chat", "code-editor", "terminal", "email", "chat", "docs-notes", "other"];
export const APP_CATEGORY_LABELS: Record<AppCategory, string> = {
  "ai-chat": "AI chat", "code-editor": "Code editor", terminal: "Terminal",
  email: "Email", chat: "Chat & messaging", "docs-notes": "Docs & notes", other: "Other",
};

export type CategoryStylePreset = "auto" | "formal" | "neutral" | "casual" | "off";
```

- `CaptureContext.app` gains `category?: AppCategory`.
- `CaptureContext` gains top-level `styleHint?: string` — the resolved, settings-aware directive (absent when disabled/off/other). Doc-comment that it renders into the DESTINATION CONTEXT block.
- `CONTEXT_CAPS` gains `styleHint: 300`.
- `AppSettings` gains:
  ```ts
  styleMatching: boolean;                                        // master toggle
  styleByCategory: Partial<Record<AppCategory, CategoryStylePreset>>;  // unset = "auto"
  ```
- `DEFAULT_SETTINGS`: `styleMatching: true, styleByCategory: {}`. The `{ ...DEFAULT_SETTINGS, ...s }` spread in `storage.ts getSettings()` (lines 148–152) auto-backfills existing stores — **no migration needed** (same pattern as `screenContext`).

## 2. Detection — `detectAppCategory()` (`src/shared/contextSignals.ts`)

Pure function, reuses `normalizeProcessName` and `CURSOR_CHAT_ELEMENT_RE`:

```ts
export function detectAppCategory(opts: {
  processName?: string;
  site?: string | null;        // output of detectSite() — title heuristics already folded in
  hostKind?: HostKind;
  editorKind?: "cursor" | "vscode" | "windsurf";
  elementClassName?: string;
}): AppCategory
```

**Precedence (first hit wins):**
1. `hostKind === "terminal"` → `terminal` (mirrors existing "Cursor terminal panes must not route" rule).
2. `editorKind` + `CURSOR_CHAT_ELEMENT_RE.test(elementClassName)` → `ai-chat` (consistent with `suggestTargetModel` composer routing).
3. `editorKind` set → `code-editor`.
4. `site` in AI-chat set → `ai-chat`. Set = `Object.keys(SITE_MODEL_MAP)` (claude.ai, chatgpt.com, gemini.google.com, grok.com, chat.deepseek.com; desktop Claude/ChatGPT already normalize here via `DESKTOP_APP_SITE_MAP`) + `perplexity.ai`, `copilot.microsoft.com`, `aistudio.google.com`.
5. `site` in `SITE_CATEGORY_MAP`:
   - email: `mail.google.com`, `outlook.live.com`, `outlook.office.com`, `mail.proton.me`
   - chat: `web.whatsapp.com`, `discord.com`, `slack.com`, `app.slack.com`, `teams.microsoft.com`, `teams.live.com`, `web.telegram.org`
   - docs-notes: `notion.so`, `docs.google.com`, `keep.google.com`
6. Normalized `processName` in `PROCESS_CATEGORY_MAP`:
   - email: `outlook`, `olk`, `thunderbird`
   - chat: `slack`, `discord`, `teams`, `ms-teams`, `msteams`, `whatsapp`, `telegram`, `signal`
   - docs-notes: `notion`, `obsidian`, `winword`, `onenote`, `logseq`, `typora`, `evernote`
   - terminal (fallback if hostKind missed): `windowsterminal`, `wt`, `powershell`, `pwsh`, `cmd`, `conhost`, `mintty`, `alacritty`, `wezterm-gui`, `hyper`
7. Otherwise → `other`.

Deliberately **no new window-title regexes** (misdetection vector; titles already feed in through `detectSite()`'s `TITLE_SITE_HINTS`). Unknown → `other` → contributes nothing, matching the "empty context adds nothing" philosophy.

## 3. Style directives — `resolveStyleDirective()` (`src/shared/contextSignals.ts`)

```ts
export function resolveStyleDirective(opts: {
  category: AppCategory;
  enabled: boolean;                 // settings.styleMatching
  preset?: CategoryStylePreset;     // settings.styleByCategory[category] ?? "auto"
}): string | undefined
```

Returns `undefined` when disabled, preset `"off"`, or category `"other"`.

Directive = tone sentence + category format sentence. `"auto"` uses the category's default tone; `formal`/`neutral`/`casual` swap only the tone sentence ("Formal, professional tone." / "Neutral, plain tone." / "Casual, conversational tone.").

Default (`auto`) directives:
- **ai-chat**: "Direct, neutral wording aimed at an AI assistant. Full sentences; structure follows the contract above."
- **code-editor**: "Technical and precise. Keep identifiers, file names, and error text verbatim; no pleasantries or filler."
- **terminal**: "Terse, imperative shell wording; no pleasantries, no filler words."
- **email**: "Professional, courteous tone suited to email. Complete sentences; follow normal greeting and sign-off conventions when the text is a message."
- **chat**: "Casual, brief tone suited to instant messaging. Contractions are fine; no formal greetings or sign-offs."
- **docs-notes**: "Clear, well-organized prose suited to a document. Headings and bullet lists are acceptable when they aid structure."

**Hard constraint:** the terminal directive must never match `/output format|multi-line|markdown/i` — `providers.test.ts` asserts the destination block stays clear of that under terminal context, and the TERMINAL SHELL contract in `buildMetaPrompt` must retain authority.

## 4. Rendering — `buildDestinationContextBlock()` (`contextSignals.ts:192`)

Add two lines after the app lines (Destination app / Window title / Website), before the text-scope lines:

```
- Destination category: Email
- Style for this destination: Professional, courteous tone suited to email. ...
```

- Category line renders whenever `ctx.app?.category && category !== "other"`; style line whenever `ctx.styleHint` is set (cap re-applied defensively with `CONTEXT_CAPS.styleHint`).
- A context whose only content is `styleHint` must still render the block (the `lines.length === 0` early return handles this automatically since the lines array grows).
- **No providers.ts change needed**: the block already sits after all model rule groups, before persona/standing context (`providers.ts:151`), with the right guardrail footer ("adapt fit, do not override intent… never address the destination app itself"). `buildWritingMetaPrompt` (`writing.ts:136`) also calls it, so writing mode (e.g. Gmail compose) gets style matching for free — verified.

## 5. Main wiring — `contextLayer.ts assembleCaptureContext()`

After the existing `site`/`editorKind` derivation (~line 62):

```ts
const category = detectAppCategory({
  processName, site,
  hostKind: opts.snapshot.hostKind,
  editorKind,
  elementClassName: opts.uia?.className,
});
```

- Include `category` in `ctx.app` (the app block condition already triggers on other fields; category `"other"` alone shouldn't force an app block — include it when the block is built).
- Resolve and attach the hint (reuse one `getSettings()` call — the function already calls it at the top for `screenContext`; hoist to a local):

```ts
const settings = getSettings();          // replaces the bare screenContext check
// ... existing early returns use settings.screenContext
const styleHint = resolveStyleDirective({
  category,
  enabled: settings.styleMatching,
  preset: settings.styleByCategory[category] ?? "auto",
});
if (styleHint) ctx.styleHint = capHead(styleHint, CONTEXT_CAPS.styleHint);
```

Nothing else in the pipeline changes — `capture.ts`, `main.ts`, preload, `Overlay.tsx` (context already round-trips via `captureRef` into `api.optimize`), `optimizeHandler.ts`, `orchestrator.ts` are untouched.

## 6. Cache correctness — `cacheKey.ts` + version bump

- `canonicalContextString()`: **append** two entries at the end of the `fields` array (appending preserves the `fields.slice(0, 5)` / `hasSelection` splice at line 48):
  ```ts
  ctx.app?.category ?? "",
  ctx.styleHint ?? "",
  ```
  Keying the *resolved text* means future directive-text edits and user preset changes self-invalidate — no further version bumps needed for tuning.
- `src/engine/guideLoader.ts:9`: `REWRITE_PIPELINE_VERSION = 9` (block format changed for all context-bearing requests).

## 7. Settings UI — `Studio.tsx Settings()` (insert below the screenContext toggle, lines 511–514)

Follow existing patterns (`update(patch)` + `save()`, `Field` helper, checkbox + select styling):

```tsx
<label className="flex items-center gap-2 text-sm">
  <input type="checkbox" checked={s.styleMatching}
         onChange={(e) => update({ styleMatching: e.target.checked })} />
  Style matching — adapt tone to the destination app category (email, chat, code, terminal…)
</label>
{s.styleMatching && (
  <div className="grid grid-cols-2 gap-2 pl-6">
    {APP_CATEGORIES.filter((c) => c !== "other").map((c) => (
      <Field key={c} label={APP_CATEGORY_LABELS[c]}>
        <select value={s.styleByCategory[c] ?? "auto"}
                onChange={(e) => update({ styleByCategory: { ...s.styleByCategory, [c]: e.target.value as CategoryStylePreset } })}>
          {/* Auto / Formal / Neutral / Casual / Off */}
        </select>
      </Field>
    ))}
  </div>
)}
```

- Show a small muted note when `!s.screenContext`: "Requires Screen context." (style matching is context-derived; when screenContext is off no context ships, so the feature is silently inert — the note explains why).
- English-only UI text (AGENTS.md).
- **No overlay UI** (user decision): style applies silently, same precedent as `suggestedModel`'s invisible preselect.

## 8. Tests

**`contextSignals.test.ts`** — new describes:
- `detectAppCategory`: terminal hostKind beats Cursor editorKind; Cursor+aislash → ai-chat, Cursor without → code-editor, vscode/windsurf → code-editor; each SITE_MODEL_MAP host → ai-chat; `mail.google.com` → email, `web.whatsapp.com` → chat, `notion.so`/`docs.google.com` → docs-notes; process rows with `.exe` and mixed case (`OUTLOOK.EXE` → email, `slack` → chat, `obsidian` → docs-notes, `WindowsTerminal` → terminal); unknown site / empty input → other.
- `resolveStyleDirective`: disabled → undefined; `"off"` → undefined; `"other"` → undefined; `"auto"` returns category default; `formal`/`casual` swap tone sentence only; terminal directive never matches `/output format|multi-line|markdown/i`.
- `buildDestinationContextBlock`: renders both new lines; styleHint-only ctx still renders block; cap enforced; category `"other"` renders no category line.

**`cacheKey.test.ts`**: update every hard-coded `v8`/version-8 assertion to 9 (e.g. exact key `"v9|gpt-5|2|dev||fix the bug"`); extend the Set-size "every field changes the key" test with `app.category` and `styleHint` variants; assert `styleHint: undefined` ≡ absent.

**`providers.test.ts`** (`buildMetaPrompt destination context` describe): style line renders between `DESTINATION CONTEXT` and `OUTPUT RULES`; ordering — after model rule groups, before "Standing context" (reuse the existing indexOf-comparison pattern); terminal ctx with terminal styleHint keeps the existing negative regex assertion green.

## 9. Verification

1. `npm test` (vitest) and `npm run lint` in `prompt-master/` — all suites green, including the updated v9 cache-key assertions.
2. Runtime check via the `prompt-master:verify` skill (build + launch tray app):
   - Hotkey in a Gmail compose window (Chrome) → dev log (`logCaptureContextDev`) shows `category: "email"` and the styleHint; Generate → refined output reads email-appropriate.
   - Hotkey in Windows Terminal → category `terminal`, output still single-line (TERMINAL SHELL contract intact).
   - Hotkey in Cursor chat pane → `ai-chat`; Cursor editor → `code-editor`.
   - Studio Settings → set Email to "Casual", regenerate same prompt in Gmail → different cache key (fresh API call) and casual tone; set Email to "Off" → no style line in the block.
   - Toggle Screen context off → feature inert, no context in requests (unchanged v1 behavior).

## Risks

- **Misdetection**: unknown apps/sites fall to `other` (adds nothing — safe). Detection tables are conservative; per-category "Off" and the master toggle are escape hatches.
- **Terminal contract**: guarded by directive wording constraint + existing test assertion; TERMINAL SHELL rule keeps authority.
- **Writing-mode tone overlap** (styleHint tone vs chosen writing level): acceptable in v1 — the block footer subordinates it ("adapt fit, do not override intent"). If noisy, follow-up: suppress the tone sentence when `writingType` is set.
- Cache bump invalidates the existing opt-cache — intended and cheap (LRU of 100 entries).
