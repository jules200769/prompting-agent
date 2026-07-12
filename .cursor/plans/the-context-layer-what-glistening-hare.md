# Context Layer (v1) — PromptForge

## Context

Wispr Flow's biggest quality lever is a "context layer": before the model call, it folds on-screen and app signal into the request so output reads as "already right" for its destination. PromptForge already captures rich target-app signal at hotkey time — process name, window class, host kind (native/chromium/richEditor/terminal), UIA element metadata — but **discards all of it before the LLM call**; only a `terminalContext` boolean reaches the rewrite. Meanwhile an end-to-end context channel already exists and is unused on the hotkey path: `OptimizeRequest.context` → `contextLine` in `buildMetaPrompt` (`src/engine/providers.ts:39-42,142`).

This plan threads a structured `CaptureContext` from the existing capture pass into the meta-prompt so rewrites adapt to their destination (Slack message vs Cursor chat vs claude.ai vs terminal), auto-routes the target model dialect, and adds the app's first privacy gating.

**Confirmed v1 scope (user decisions):**
1. **Target-app identity** — process, host kind, window title, browser site identification.
2. **Surrounding/selected text** — selected vs whole-field vs before/after-cursor structure.
3. **Code-editor file memory** — persist file names seen in Cursor/VS Code/Windsurf; spell them exactly in rewrites.
4. **Auto model routing, overridable** — claude.ai→claude-opus-4.8, chatgpt.com→gpt-5, gemini.google.com→gemini-3, grok.com→grok-4, Cursor chat pane→composer-2.5. Overlay picker overrides per run; `defaultModel` never written.
5. **Privacy** — skip UIA password fields in ALL capture paths (not gated by toggle); new `screenContext: boolean` setting (default true) disables all context capture when off.

**Out of scope for v1:** chat conversation-history scraping, screenshots/OCR, per-app exclusion lists.

## Design decisions

- **Context assembled main-side** in a new `src/main/contextLayer.ts` during the existing hotkey pass; attached to `CaptureResult`, delivered to the overlay in the `OVERLAY_SHOW` payload, held in `captureRef` for the overlay session, and echoed back on every `OptimizeRequest.captureContext`. Rationale: user can edit + re-run Generate multiple times per session (renderer owns session state); Studio/dev-bridge paths simply never set it; cache hash sees it with no extra plumbing.
- **No new PS spawns, nothing blocks overlay show.** All new capture rides the existing `win-hotkey-snapshot.ps1` pass, which already runs after the glass shell is visible. File-memory persistence is deferred via `setImmediate`.
- **Inject correctness untouched** — prompt text and frozen inject target are exactly today's; selection info is advisory context only.
- Pre-existing bug fixed in passing: `cacheHash` (`src/main/storage.ts:228`) omits `req.context`, so Studio contextMemory is invisible to the cache today.

## Steps (ordered)

### 1. Shared types — `src/shared/types.ts`

```ts
export type ContextTextScope = "selection" | "field" | "empty";

export interface CaptureContext {
  app?: { processName?: string; windowTitle?: string; hostKind?: HostKind;
          site?: string; editorKind?: "cursor" | "vscode" | "windsurf" };
  text?: { scope: ContextTextScope; hasSelection: boolean;
           selectedText?: string; beforeCursor?: string; afterCursor?: string };
  files?: { activeFile?: string; recentFiles?: string[] };
  suggestedModel?: ModelId; // UI preselect only — never sent to the LLM block
}
```

- `OptimizeRequest` gains `captureContext?: CaptureContext`.
- `AppSettings` + `DEFAULT_SETTINGS` gain `screenContext: boolean` (default `true`; existing settings-merge backfills it).
- Caps as exported constants: selectedText 4000, beforeCursor tail 1500, afterCursor head 500, windowTitle 200, files 10.

### 2. Pure logic — new `src/shared/contextSignals.ts` (+ `contextSignals.test.ts`)

Zero Electron/Node deps (vitest-testable):
- `detectSite({processName, windowTitle, url})` — browser gate (chrome/msedge/brave/opera/vivaldi/arc/firefox, normalized like `terminalDetect.normalizeProcessName`); URL host wins (strip `www.`), else title heuristics (Claude/ChatGPT/Gemini/Grok/DeepSeek); null if not a browser.
- `SITE_MODEL_MAP` + `suggestTargetModel({site, processName, elementClassName})` — site map hit, or Cursor chat pane (process `cursor` + element class `/aislash/i`) → `composer-2.5`. Terminal-in-Cursor must NOT route.
- `isLikelyFileName(token)` — Wispr rule: contains `.`, no whitespace, starts with a letter, ≤80 chars, no `\/:*?"<>|`.
- `extractFileFromEditorTitle(title, processName)` — strip `●`/`○` dirty markers, segment before first ` - `, validate.
- `editorKindFromProcess(processName)`.
- `relevantFileMemory(prompt, memory, activeFile, max=10)` — fuzzy match basename words against prompt tokens; activeFile always first.
- `buildDestinationContextBlock(ctx): string` — renders the meta-prompt block (see step 6); returns `""` for empty context; re-applies caps defensively.

### 3. Cache key — new `src/shared/cacheKey.ts`, `src/main/storage.ts`, `src/engine/guideLoader.ts`

- Extract hash-string building from `storage.ts` (imports `electron`, untestable) to `buildCacheKey(version, req)`. Keep existing parts; **add** `|${req.context}` (pre-existing gap) and `|ctx:${fnv1a(canonicalContextString)}` covering exactly the fields that reach the meta-prompt (site|process|hostKind|title|scope|hasSelection|selected|before|after|activeFile|recentFiles). `suggestedModel` excluded (UI-only).
- `storage.ts:cacheHash` delegates to it.
- `REWRITE_PIPELINE_VERSION` 7 → 8 in `src/engine/guideLoader.ts` (invalidates all pre-context cache entries).
- Tests: `src/shared/cacheKey.test.ts`.

### 4. PowerShell — `scripts/win-hotkey-snapshot.ps1`, `scripts/win-capture.ps1`

`win-hotkey-snapshot.ps1` (read fresh per hotkey, no rebuild):
- New param `-ContextPath` (JSON sidecar path).
- New **guarded** C# class `PfCtx` with `GetWindowText` P/Invoke — do NOT extend `WinFg` (owned by `terminal-io.ps1`). `Get-WindowTitle($hwnd)`, called once.
- **Password check** right after the focused element resolves (both branches): `try { $isPassword = [bool]$focusedEl.Current.IsPassword } catch {}`. If true: skip all text/meta/context writes, emit summary with `isPassword=true`, exit 1.
- **Selection structure** (field branch, only when `-ContextPath` set): from the TextPattern already fetched — `GetSelection()` + `DocumentRange.Clone()` + `MoveEndpointByRange` to derive selectedText (≤4000), beforeCursor (tail 1500), afterCursor (head 500); caret-only works via the same clone trick. Write UTF-8-no-BOM JSON sidecar; whole block in one `try/catch` so failures never break capture.
- **Chromium URL** best effort, only when `$className -match 'Chrome_WidgetWin'` and not password: `FromHandle` → `FindFirst(Descendants, ControlType.Document)` → `ValuePattern.Current.Value`. Single attempt, try/catch, no retries; title parsing is the fallback.
- Summary JSON gains `windowTitle`, `isPassword`, `siteUrl?`.

`win-capture.ps1`:
- `Test-FocusedIsPassword` → `exit 1` immediately after focus resolution, **before** the Ctrl+A/Ctrl+C keyboard-copy fallbacks (today those are a real password-exfiltration path).
- Belt-and-braces: text-read helpers return `$null` for password elements.

### 5. Main process — new `src/main/contextLayer.ts`, `src/main/capture.ts`, `src/main/storage.ts`

`storage.ts`: `StoreShape` gains `fileMemory: {name, lastSeen, hits}[]`; `recordFileMemory(names)` (case-insensitive dedupe, LRU, cap 200), `listFileMemory(limit=50)`.

`contextLayer.ts`:
- `assembleCaptureContext({signals, mode, capturedText, uia, snapshotCtx, hostKind}): CaptureContext | undefined` — returns `undefined` when `screenContext` is off or `isPassword`. Builds `app` (+ `detectSite`, `editorKind`), `text` (scope from mode/sidecar), `files` (activeFile from title + `relevantFileMemory`), `suggestedModel`.
- `harvestFileMemory(title, process)` — parse + `recordFileMemory`; no-op when toggle off.

`capture.ts`:
- `HotkeySnapshotJson` gains `windowTitle?`, `isPassword?`, `siteUrl?`. `hotkeySnapshot()` passes `-ContextPath` (tmp file, `unlink` in `finally`) only when `screenContext` on; reads sidecar into module state `pendingContextSignals`.
- `pendingIsPassword`: forces `pendingCaptureText/pendingUiaMeta = null`.
- `captureSelection()`: if password → return `{text: "", mode: "empty", context: undefined}` **without** running `captureViaScript` (win-capture guard is defense in depth). All success paths attach `context: assembleCaptureContext(...)`; empty-capture still gets app identity + suggestion. After return decided: `setImmediate(() => harvestFileMemory(...))`.

### 6. Delivery + engine — `src/main/main.ts`, `src/preload/index.ts`, `src/renderer/api.ts`, `src/renderer/views/Overlay.tsx`, `src/engine/orchestrator.ts`, `src/engine/providers.ts`

- Thread `context?: CaptureContext` through `pendingCapture` / `deliverCaptureToOverlay` / `OVERLAY_SHOW` payload / preload / `OverlayShowPayload` (dev-bridge/browser-mock seeds `undefined`).
- `Overlay.tsx`: `captureRef` stores context; `applyCapture` preselects `setModel(context?.suggestedModel ?? defaultModelRef.current)`; `runOptimize()` (~line 434) adds `captureContext: captureRef.current?.context`. Small "auto" hint beside the ModelPicker while current value equals the suggestion. ⚠ Behavior note: this resets the picker per session (today the last manual pick is sticky) — if unwanted, only `setModel` when a suggestion exists.
- `providers.ts`: `OptimizeParams` gains `captureContext`; `orchestrator.optimize` forwards it. In `buildMetaPrompt`, insert `buildDestinationContextBlock(params.captureContext)` after the model-specific rule group, before `personaLine`/`contextLine` (line ~141-142) so standing contextMemory stays distinct.

**Meta-prompt block sketch** (lines omitted when absent):

```
DESTINATION CONTEXT (where the user will paste the refined prompt — adapt fit, do not override intent):
- Destination app: Cursor (AI chat pane)
- Window title: "storage.ts - prompt-master - Cursor"
- Website: claude.ai
- Text scope: <whole draft | selection of a larger draft | cursor mid-draft>
- Text before the cursor (context only — NEVER repeat or rewrite it in the output): """…"""
- Text after the cursor (context only — NEVER repeat it): """…"""
- Known project file names (spell exactly as shown when referenced): storage.ts, contextLayer.ts
Rules for this context:
- Use it only to match tone, formatting conventions, and exact file-name spelling for the destination
- Do not add facts, goals, or constraints the user's prompt does not imply
- The refined prompt is FOR the AI behind the destination — never address the destination app itself
```

`terminalOutputRule` stays supreme (block contains no formatting mandates); structure contracts unaffected.

- Tests `src/engine/providers.test.ts`: block present iff `captureContext`; terminal + context coexist with TERMINAL SHELL intact; caps enforced; standing contextLine and destination block render distinctly.

### 7. Settings UI — `src/renderer/views/Studio.tsx`

One checkbox in Settings (~line 524, next to telemetry): `screenContext` — "Screen context — let the hotkey read the active app's title, site, and surrounding text to tailor rewrites (off = prompt text only)". Existing `settingsSet` path; main reads fresh per hotkey.

### 8. Docs — `AGENTS.md`

- Replace the boundary sentence ("UIA snapshot metadata stays local for Apply — only prompt text goes to the rewrite API", ~line 31) with the new contract: screenContext on ⇒ destination context (identity, capped selection structure, matched file names) goes to the rewrite API; password fields never read anywhere; toggle off restores prompt-text-only; suggested model preselects per session, never writes `defaultModel`; `captureContext` in the cache hash; `REWRITE_PIPELINE_VERSION = 8`.
- Add `PfCtx` to the PS shared-types/guard-discipline bullet.

## Verification

Automated: `npm test` (new: contextSignals, cacheKey, providers block tests), `npm run lint`, `npm run build:main` (tsc catches plumbing end-to-end).

Manual via `npm run dev` (PS scripts hot-reload per hotkey; TS needs restart):
1. **Slack**: hotkey on a draft → context logged; Generate/Apply work as before.
2. **Chrome on claude.ai**: picker preselects Opus 4.8 with "auto" hint; manual pick of GPT-5 wins for the run; next hotkey re-suggests. Repeat chatgpt.com/gemini/grok. If UIA URL fails, title fallback still routes.
3. **Cursor**: chat pane suggests composer-2.5; integrated terminal stays `mode:"terminal"`, single-line, no routing; editor grows `fileMemory` in `promptforge.store.json`; "update the storage ts file" pulls `storage.ts` into the block.
4. **Selection**: select a middle sentence → scope "selection" with before/after; no selection → scope "field".
5. **Password field**: hotkey opens empty overlay, nothing captured, no context, clipboard untouched, win-capture keyboard fallback never fires.
6. **Toggle off**: behaves exactly as today — no context in request, no fileMemory writes, default model.
7. **Cache**: same prompt with/without context → separate entries; no stale hits.
8. **Latency**: overlay-shell timing unchanged; snapshot delta < ~100ms in Chrome (worst case). If >150ms, drop the UIA URL read to title-fallback-only.
9. **Dev bridge** (`#/overlay-preview` in browser): optimize works, no context, no errors.

## Risks & mitigations

- **PS fragility**: new P/Invoke in a new guarded class (`PfCtx`), never touching `WinFg`; every new read in its own try/catch; sidecar optional — capture is byte-identical when context steps throw.
- **UIA slowness in Chrome**: single bounded attempt behind the visible shell; title-based routing is the guaranteed fallback for all five targets.
- **Cache staleness**: context hashed into the key + version bump 7→8. Cost: lower hit rate from volatile titles — acceptable.
- **Privacy surface widening** (deliberate): window title/surrounding text now leave the machine. Mitigations: `screenContext` kill switch, hard caps, password exclusion in all paths, no conversation scraping, AGENTS.md contract updated.
- **Model preselect surprise**: hint shows "auto"; user picker wins per run; `defaultModel` untouched; sticky-pick change flagged in step 6 and trivially revertible.
