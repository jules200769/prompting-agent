# AGENTS.md

## Learned User Preferences

- Dutch-speaking user; respond in Dutch when they write in Dutch.
- Target model picker selects prompt-pack/guide methodology only; one rewrite model (OpenAI GPT-4.1 mini) handles all generation — no need to call Opus/GPT-5/etc.
- Settings should expose a single OpenAI API key, not multiple per-provider keys.
- Ctrl+Shift+O overlay must auto-populate from the active Windows text field — including when typing inside PromptForge Studio, not only external apps like Cursor/Chrome; manual paste is not acceptable.
- Overlay does not auto-optimize on open; Refine button (or Enter when idle) triggers the rewrite API.
- Rejected clean-only conservative rewrite; refinement must follow model-specific prompting-guides/.
- Overlay output should be plain refined prompt text only — no JSON, no rubric/score UI in the overlay.
- PromptForge optimizes prompts for the target LLM; launch is overlay/tray-only until user opens Studio via Settings or tray.
- RAM/geheugenoptimalisatie mag UX niet wijzigen — overlay hotkey, capture, Refine en Apply blijven identiek.
- Windows-only desktop app (PromptForge Electron MVP).
- Overlay sits at top-center "notch" position with no black scrim/backdrop and must appear instantly (no open animation) — speed and a subtle, modern look are prioritized.
- Overlay must be freely draggable like a native Windows window (no movement restrictions) and remember its position across reopens.

## Learned Workspace Facts

- PromptForge: Electron + Vite + React/TypeScript; npm scripts `dev`, `build`, `test` (vitest), `lint`; architecture in `src/main`, `src/renderer`, `src/engine`, `src/shared`. Dev bundler: `vite.config.mts` with `@vitejs/plugin-react-swc`, `css.devSourcemap: false`, `hmr.overlay: false`; Studio lazy-loaded in `router.tsx` (separate chunk).
- Rewrite always uses `REWRITE_CONFIG` (OpenAI `gpt-4.1-mini`); target model picker selects which `prompting-guides/` file `guideLoader` loads.
- `prompting-guides/` source of truth per ModelId: `opus4.8.md`, `gpt5.5.md`, `gemini.3.pro.md`, `deepseek.V3.md`, `grok4.md`, `composer2.5.md`.
- L1–L4 = `LEVEL_TEMPERATURE` (0.2, 0.5, 0.75, 1.0) with labels Cool/Warm/Hot/Max; scales guide excerpt size and rewrite API temperature.
- Launch: tray-only — no Studio window on dev/launch (removed `ensureStudio()` from startup and `app.on("activate")`); overlay on Ctrl+Shift+O; Studio opens only via the overlay Settings button or tray, both routed through `STUDIO_SETTINGS`/`ensureStudio("settings")` (tray Settings was previously broken — `webContents.send` lacked a preload bridge).
- Hotkey flow (fast-path refactor): `hotkeySnapshot()` (replaces `snapshotUiaTarget()`) spawns one combined `scripts/win-hotkey-snapshot.ps1` (merges old `win-snapshot-uia.ps1` + `get-foreground.ps1`) that prints compact JSON `{hwnd, uia, chars}` and writes UIA meta + early text to temp files; it sets `lastTrackedForegroundHwnd`/`lastForegroundHwnd` directly (no separate `get-foreground.ps1` spawn on hotkey path) and exposes `canUseEarlyCaptureFastPath()`. `triggerHotkey()` shows the overlay immediately in a loading state (`IPC.OVERLAY_CAPTURE_PENDING`) BEFORE capture; text fills in async via `OVERLAY_SHOW`; `hideForCapture()` runs only when not on the fast path. `pickCaptureText()` prefers longer early text vs `win-capture` result; UIA metadata local only for Apply.
- Capture/inject via PS scripts (`win-capture.ps1`, `win-hotkey-snapshot.ps1`, `win-inject.ps1`); foreground HWND polled every 150ms via koffi `src/main/win32.ts` (`GetForegroundWindow`, not `get-foreground.ps1` per tick); `pollInFlight` mutex; `ps-warmup.ps1` + `warmCaptureBridge()` at launch reduce first-hotkey PS/UIA cold start.
- Apply: `injectText()` replaces field text using saved UIA metadata; overlay button label is "Apply" (not "Inject"). Overlay "Original" is an editable `<textarea>` bound to `prompt`; readOnly while busy or during `"capturing"`; Enter inserts newline (does not trigger Refine). Preload registers `OVERLAY_SHOW` and `onOverlayCapturePending` before React mount, each with replay; `IPC.OVERLAY_CLEAR` on hide clears replay buffers; overlay created hidden at startup; `showOverlayWithCapture` waits for `did-finish-load`. Overlay shows instantly via `showInactive()` with no open animation — the fade/animate IPC (`OVERLAY_PREPARED`/`OVERLAY_ANIMATE`/`OVERLAY_RESET`) was removed because speed is prioritized.
- Memory hygiene: `optCache` LRU cap 100 with slim entries (no persisted `diff`; rebuilt via `buildDiff` on read); BrowserWindow `spellcheck: false`, `backgroundThrottling: true`; Studio window nulled on `closed`; React StrictMode removed in dev renderer.
- Dev gotchas: do not auto-open detached DevTools (steals focus, breaks capture); the app runs only inside Electron — opening the Vite dev URL (`localhost:5173`) in a plain browser crashes because the `window.promptforge` preload bridge is missing (overlay calls `api.settingsGet()` on `undefined`).
- API keys stored encrypted via OS Credential Manager (`keyStore`); without key `localOptimizer` uses simplified per-model templates; overlay output is plain refined prompt text (`stripResponseArtifacts`). UIA snapshot metadata (`runtimeId`/`className`/`bounds`) stays local for Apply and is never sent to the LLM — only the prompt text goes to the rewrite API.
- Overlay window geometry: pinned to top-center "notch" via `positionOverlayTopCenter()` (uses `screen`, display under cursor); black scrim removed by deleting `bg-bg-950` from `index.html` `<body>` and setting `body { background: transparent }` in `index.css` so the transparent window stays see-through. Draggable like a native window — `-webkit-app-region: drag` is unreliable on transparent frameless Windows windows, so use IPC pointer-drag (`OVERLAY_DRAG_START`/`OVERLAY_DRAG_END`) with the main process polling `screen.getCursorScreenPoint()` (~8–16ms) to track the OS cursor and avoid renderer `screenX/Y` coordinate feedback-loop drift; skip `clampOverlayToWorkArea` and disable blur-hide during drag; position persisted via `storage.ts` `overlayPosition` and restored on show.
