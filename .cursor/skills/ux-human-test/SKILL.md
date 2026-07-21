---
name: ux-human-test
description: Acts as a human Windows UX tester for Anvyll using the real Electron global-hotkey overlay — not the localhost browser preview. Tests overlay shell timing, OS capture, Refine, Apply/Copy, and host-specific flows. Use when UX-testing Anvyll, hotkey-testing the overlay modal, running gold-path smoke tests, or verifying the app like a real user.
---

# Anvyll Human UX Test

## Role

Behave as a careful human tester, not a code reviewer.

1. Launch the **Electron tray app** (not a browser tab).
2. Focus a real host (browser field, Cursor composer, terminal, Notepad).
3. Press the **actual** configured global hotkey to open the **real overlay window**.
4. Watch shell timing, capture fill, and visual regressions.
5. Exercise overlay keyboard shortcuts.
6. Run Generate → Apply (or Copy) and confirm the target changed.
7. Record pass/fail with evidence.

`npm test` and code review are prerequisites, not substitutes for UX proof. State honestly when a scenario is code-verified only vs observed on Windows.

## Real overlay only — not browser preview

**All UX tests must use the Electron global-hotkey overlay.** Do not substitute `http://localhost:5173/#/overlay-preview` or any Vite browser route.

| Surface | Capture/inject | Global hotkey | Valid for this skill |
|---------|----------------|---------------|----------------------|
| Electron overlay (tray app + hotkey) | Real OS PS scripts | Yes | **Yes — required** |
| Browser `#/overlay-preview` | No-op stubs | No | **No — never counts as UX pass** |

The browser preview is a dev mock: capture and inject are stubbed, there is no frameless transparent window, no tray, no `globalShortcut`. Passing browser preview does **not** prove hotkey, capture, or Apply work.

**Before first scenario, confirm Electron is running:**

```powershell
Get-CimInstance Win32_Process -Filter "Name='electron.exe'" |
  Where-Object { $_.CommandLine -match 'anvyll|Anvyll' }
```

Launch via [verify](../../.claude/skills/verify/SKILL.md): `npm run dev` (background) or detached `electron.exe .` from the repo. After hotkey, the overlay is a separate always-on-top Electron window — not a Chrome/Edge tab.

## Prerequisites

Before any scenario:

1. Follow [`.claude/skills/verify/SKILL.md`](../../.claude/skills/verify/SKILL.md) — build, launch **Electron**, unset `ELECTRON_RUN_AS_NODE`, stop existing tray instance, cleanup.
2. Treat [`AGENTS.md`](../../AGENTS.md) as the UX contract. Do not re-derive invariants from memory.
3. Run `npm test` when TS changed; PS script edits apply on next hotkey without rebuild.
4. **Do not open `#/overlay-preview`** for hotkey, capture, Apply, or overlay-timing tests.

## Resolve the hotkey first

Never assume Ctrl+Space or Ctrl+Shift+O. The code default is `CommandOrControl+Space` (`src/shared/types.ts`); stored settings and docs may differ.

**Read the binding:**

```powershell
# From store (app stopped or read-only)
(Get-Content "$env:APPDATA\anvyll\anvyll.store.json" -Raw | ConvertFrom-Json).settings.hotkey

# Dev bridge (app running in dev)
Invoke-RestMethod http://127.0.0.1:5174/api/settings | Select-Object -ExpandProperty hotkey
```

**Map Electron accelerator → SendKeys** (`^`=Ctrl, `+`=Shift, `%`=Alt):

| Accelerator | SendKeys |
|-------------|----------|
| `CommandOrControl+Space` | `^{SPACE}` |
| `CommandOrControl+Shift+O` | `^+o` |
| `CommandOrControl+Shift+Space` | `^+{SPACE}` |
| `Alt+F9` | `%{F9}` |

```powershell
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait("^+o")  # replace with resolved combo
```

Dev-mode evidence of a successful fire: log line `[Anvyll] hotkey total: Nms`. Hotkey toggles overlay — send again to close.

## Human-tester rules (non-negotiable)

- **Focus target before hotkey** — Notepad, Chrome text field, Cursor **composer input**, integrated terminal, Windows Terminal. Never hotkey on Cursor **chat transcript** (stalls ~30s, empty capture).
- **Shell instantly, fill shortly after** — glass visible before capture completes. Fail on dim/double-popup or capture-before-shell lag.
- **Empty capture** — normal empty compose; no yellow warn banner; no auto-focus caret in Original textarea.
- **Selection in non-terminal editor** — highlighted text must **not** fill draft; open empty compose.
- **Refine on demand** — Generate button or Enter when idle/error only; overlay must not auto-optimize on open.
- **Apply injects to same target** — on failure, refined text stays on clipboard; never restore pre-capture clipboard over fallback copy.
- **Terminal sessions** — output stays single line; Enter blocked in output textarea; Apply injects (not copy-only footer).
- **Do not steal focus** — no detached DevTools; follow verify gotchas for `ELECTRON_RUN_AS_NODE` and tray instance.

## Core loop

Copy this checklist per scenario (details in [scenarios.md](scenarios.md)):

```
Scenario: _______________
Host focused: ___________
Hotkey used: ___________
Surface: Electron overlay (not browser preview)

- [ ] Electron running — tray resident or dev instance confirmed
- [ ] Prep — typed/selected test content in host (or left empty for empty-compose test)
- [ ] Hotkey — real global hotkey opened glass overlay (not browser tab)
- [ ] Capture — draft filled correctly (or empty compose as expected)
- [ ] Visual — no dim flicker, no double popup, capture glow OK if visible
- [ ] Keys — 1–4 levels, Enter, Esc behave correctly
- [ ] Generate — Refine ran only on button/Enter; output plain text
- [ ] Apply/Copy — target updated or clipboard correct
- [ ] Second hotkey — reopen as fast as first
- [ ] Result — PASS / FAIL
- [ ] Evidence — log line, observation, or blocker
```

## Overlay keyboard to exercise

When overlay is open and focus is **not** in a textarea/input/select:

| Key | Expected |
|-----|----------|
| `1`–`4` | Set level Cool/Warm/Hot/Max |
| `Enter` (idle/error) | Generate / Regenerate |
| `Enter` (done, field/terminal) | Apply |
| `Enter` (done, empty compose) | Copy |
| `Esc` | Close import modal → context panel → hide overlay |
| Arrow keys on level slider | Step L1–L4 when slider focused |

In Original textarea: Enter inserts newline (does not Refine). In terminal output: Enter blocked.

## Reporting

When done (or blocked), return:

| Scenario | Host | Result | Evidence | Blocker |
|----------|------|--------|----------|---------|
| Field capture | Chrome | PASS | draft filled, Apply replaced field | |
| … | … | … | … | … |

Add a one-line **Outcome** (goal reached / partial / blocked) and list items needing manual confirmation if you could not run Windows UI.

## Scope

**In scope:** Electron global-hotkey overlay, gold-path UX, OS capture/apply hosts, overlay keyboard, timing/flicker, clipboard fallback.

**Out of scope:** `#/overlay-preview` and any browser-only overlay route; writing/calibration evals under `test.results/`.

If blocked from running Electron (no Windows, no display), report **BLOCKED — requires Electron hotkey overlay**; do not claim pass from browser preview or unit tests alone.

## Additional resources

- Host matrix and pass criteria: [scenarios.md](scenarios.md)
- Build/launch/SendKeys: [`.claude/skills/verify/SKILL.md`](../../.claude/skills/verify/SKILL.md)
- UX invariants: [`AGENTS.md`](../../AGENTS.md)
