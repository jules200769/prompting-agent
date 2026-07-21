# Anvyll UX Test Scenarios

Run scenarios against the **Electron global-hotkey overlay only**. Launch per [SKILL.md](SKILL.md) and [verify](../../.claude/skills/verify/SKILL.md).

**Do not use** `http://localhost:5173/#/overlay-preview` for any scenario below — capture/inject are no-op there and there is no global hotkey.

## Host matrix

| ID | Scenario | Host setup | Pass when | Fail signals |
|----|----------|------------|-----------|--------------|
| F1 | Field capture | Chrome or Notepad — type a short prompt in a text field | Global hotkey opens Electron overlay; draft auto-fills; Apply replaces field text | Browser preview used; empty draft when text exists; manual paste required |
| C1 | Cursor composer | Cursor chat **input** (not transcript) — type prompt | Hotkey overlay; capture + Apply inject into composer | Hotkey on transcript; ~30s stall; empty capture |
| T1 | Integrated terminal | Cursor or VS Code integrated terminal — type one-line command/prompt | Hotkey overlay; draft captures prompt line; single-line output; Apply pastes back | Window-title/a11y noise; multiline output; copy-only footer |
| T2 | Windows Terminal / conhost | Native terminal — type one-line prompt | Same as T1 | Keyboard Ctrl+C injected into dev shell; capture timeout |
| E1 | Empty compose | Empty field or no selection in editor | Hotkey opens empty compose; no yellow warn; no caret auto-focus | Selection fills draft; warn banner; dim/double popup |
| S1 | Selection (non-terminal) | Highlight text in Monaco/editor (not terminal) | Hotkey opens empty compose — selection must **not** fill draft | Highlighted text appears in Original |
| H1 | Second hotkey | Repeat F1 or E1 immediately after close | Reopen as fast as first; no flicker/double popup | Shell dims and reappears; slower second open |
| K1 | Overlay keys | Electron overlay open, focus outside textareas | `1`–`4` change level; Enter Generate/Apply; Esc dismiss hierarchy | Testing keys in browser preview instead of Electron window |
| I1 | Inject failure | Reproducible only (e.g. target closed before Apply) | Refined text on clipboard; overlay session usable | Pre-capture clipboard restored over refined text |

## Keyboard checklist (Electron overlay open)

Focus the overlay chrome (click backdrop or tab out of textareas) before key tests. Must be the **Electron** overlay window triggered by global hotkey.

```
Level keys
- [ ] 1 → Cool (L1)
- [ ] 2 → Warm (L2)
- [ ] 3 → Hot (L3)
- [ ] 4 → Max (L4)

Generate / Apply
- [ ] Enter (idle) → Generate
- [ ] Enter (done, field mode) → Apply
- [ ] Enter (done, empty compose) → Copy

Dismiss
- [ ] Esc with import modal open → modal closes, overlay stays
- [ ] Esc with context panel open → panel closes
- [ ] Esc otherwise → overlay hides

Level slider (focus slider track first)
- [ ] ArrowLeft/Down → lower level
- [ ] ArrowRight/Up → higher level

Textarea behavior
- [ ] Enter in Original → newline, not Refine
- [ ] Enter in terminal output → blocked (no newline)
```

## Do not test (in this skill)

- `http://localhost:5173/#/overlay-preview` — separate dev mock; not valid UX proof
- Hotkey while Cursor **chat transcript** is focused
- Password fields (UIA must never read them)
- Writing-quality evals (`test.results/`, calibration JSONL) — separate workflow

## Suggested run order

1. Confirm Electron running (tray or dev) — **not** browser preview
2. **E1** — empty compose baseline (fast, catches flicker regressions)
3. **F1** — simplest field capture via hotkey
4. **K1** — overlay keyboard in Electron window
5. **C1** — Cursor composer (core user path)
6. **T1** or **T2** — terminal (single-line + Apply)
7. **S1** — selection must not fill
8. **H1** — second hotkey timing
9. **I1** — only if failure path is safely reproducible

## Evidence to capture

| Signal | Where |
|--------|-------|
| Electron running | `electron.exe` process with repo in command line |
| Hotkey fired | Dev log: `[Anvyll] hotkey total: Nms` |
| Real overlay | Separate always-on-top window (not browser tab) |
| Capture delivered | Dev log: `deliver`, timing lines |
| Apply result | Field/terminal content changed, or clipboard after fallback |
| Visual regression | Note dim, double popup, scrim, or slow shell |

If you cannot run Electron + global hotkey on Windows, mark every scenario **BLOCKED** — do not substitute browser preview results.
