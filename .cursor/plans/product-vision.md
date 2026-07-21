# Anvyll — Product Vision (Perfect State)

> Authored by Claude Fable 5 · 2026-07-06 · Based on study of prompt-master repo
> (CONCEPT.md, README.md, AGENTS.md, claudes-goal.md, prompt-guide-calibration.md,
> src/main + src/engine + src/shared + scripts, prompting-guides/, all six
> `*_test_results/` calibration folders, `cursor_ai_prompt_engineering_session.md`;
> `npm test` verified green: 14 files / 128 tests)

## Executive summary

Anvyll is the fastest path from a rough prompt to a model-correct prompt on Windows: press Ctrl+Shift+O in any text field or terminal, get a rewrite shaped to the official prompting methodology of the model you're about to use, and Apply it back in place. Its two defensible bets — **model-specific engines as versioned data** and a **Windows-native capture/inject overlay** — are both built and working; no surviving competitor combines them. The perfect product is not more features: it is the current gold path made *provably* reliable (capture success, inject correctness, clipboard safety) and the rewrite quality made *provably* better than generic optimization (an eval harness gating every guide/contract change). Today the product is roughly an M2.5: the engine is calibrated across all six targets, the overlay UX is contract-hardened, but there is no eval automation, no onboarding, no packaged installer, and two known capture/inject trust gaps. This document defines the end state and maps the gap.

## North star

**One-liner:** Every prompt a Windows user sends to any AI arrives pre-shaped to that model's own published methodology — in under three seconds, without leaving the field they were typing in.

Anvyll exists because prompting techniques are not portable: Anthropic, OpenAI, Google, DeepSeek, xAI, and Cursor each publish distinct, moving guidance, and no working professional keeps up with six evolving playbooks. Anvyll internalizes that maintenance burden as versioned guide files and level contracts, and delivers it through the lowest-friction surface possible: a system-wide hotkey overlay that captures where you are and puts the result back where you were. It wins when the user stops thinking about prompt engineering entirely — the hotkey *is* their prompt engineering.

## Who this is for

- **Primary — developers and AI builders on Windows.** People who live in Cursor, VS Code, Windows Terminal, and browser-based AI chats, switching between Claude, GPT, Gemini, and Composer daily. They feel the model-specificity problem most acutely and are the hardest capture targets (integrated terminals, Chromium fields) — which is exactly why nailing them is the moat. The calibration test battery (a React perf fix and a roadmap-slip email) reflects this persona correctly.
- **Secondary — prompt-curious professionals.** Marketers, founders, analysts, writers using AI for revenue work in Word, Notion, browsers. They benefit from the same flow with zero learning curve: hotkey, Generate, Apply.
- **Later — teams.** Shared libraries, personas, consistent quality. Explicitly post-perfect (needs accounts/sync).

**Non-goals (unchanged from CONCEPT.md and still correct):** Anvyll never answers the prompt — it only shapes it. The Studio is a workbench, not a chat UI. The engine will never collapse into one model-agnostic template; that would surrender the core thesis. And it is Windows-first: the open lane is Windows, the competition is macOS/extension-first.

## The perfect user experience

### Overlay (primary surface)

The overlay is a speed instrument, and its perfect form is already specified by the as-built contract in AGENTS.md — the perfect product keeps every one of these invariants and makes them feel inevitable:

1. **Hotkey → glass, instantly.** Ctrl+Shift+O shows the glass shell *before* capture completes (`prepareCaptureTarget → showOverlayShell → hotkeySnapshot → captureSelection → deliverCaptureToOverlay`). Perceived latency is measured from glass-visible, not capture-complete. The first hotkey after boot is indistinguishable from the tenth (warmup keeps this true). No scrim, no open animation, no reopen flicker — the window is resident and revealed by opacity, never re-created.
2. **Capture fills in, from anywhere.** Within well under a second the user's text appears in the editable Original textarea — from a Chrome field, Cursor's chat box, a native Win32 control, Studio's own inputs, or a terminal pane. Empty capture is a legible state ("Select text in the terminal first…"), never a silent failure. Manual paste is a fallback the user *can* use, never the path they *must* use.
3. **Deliberate refine.** Nothing auto-optimizes on open. The user glances at the capture, optionally picks a target model (ModelPicker) and drags the L1–L4 Cool/Warm/Hot/Max slider, then presses Generate (or Enter while idle). Output streams in with the typewriter reveal, as **plain refined prompt text only** — editable after generation, so Apply/Copy always use what the user sees. Generate becomes Regenerate (cache-bypassing) for the rest of the session.
4. **Apply returns home.** Apply injects into the *frozen* capture target — the same window, the same field — then restores the pre-capture clipboard only after verified inject. On inject failure the refined text stays on the clipboard, the overlay reopens, and the pre-capture clipboard is *never* restored over the fallback copy. This clipboard contract is the single most important trust property in the product.
5. **Keyboard-first, placement-stable.** Enter applies when done, Esc dismisses, arrows drive the level slider. The overlay opens at the user's snap placement (five positions, per-monitor work area, persisted) — no free drag, no drift. **Perfect state closes today's focus gap:** after hotkey the overlay should accept keyboard input immediately, without a click — solved in a way that provably cannot steal focus from the capture target mid-flight (this is an open engineering fork, see Open questions).

**Resolved contradiction — overlay content.** CONCEPT.md §7 still describes a score ring and rubric chips in the overlay; AGENTS.md mandates plain text only. The perfect product chooses **plain text, permanently**. The overlay's job is paste-ready output at reflex speed; a score the user can't act on in two seconds is decoration that costs trust when it disagrees with their own judgment. Scores, subscores, adherence, diff, and explanations are Studio material. (CONCEPT §7 should eventually be updated to match; this doc supersedes it for product direction.)

### Studio (workbench)

Studio is where deliberate work happens, opened only on purpose (tray or overlay Settings — launch stays tray-only, no window on boot). Perfect Studio has four jobs:

- **Explain the rewrite.** Original ↔ Optimized side-by-side with the semantic diff (`+ Role/persona`, `+ Constraints`, `+ Output format`…), the 1–100 rubric score with per-dimension subscores, detected weaknesses, and the *measured* adherence level (Cool/Warm/Hot/Max via `adherenceLevel()`) next to the *requested* level — the honest "did the engine do what the knob said" readout. Each diff tag is clickable to explain why the guide recommends it: this is the learn-as-you-go layer that builds long-term trust and skill.
- **Hold the library and history.** Tagged, searchable saved prompts; history of recent optimizations; one-click re-run at a different model/level.
- **Manage personas and context memory.** Default persona and standing context, applied automatically to rewrites. Persona is a Studio concept; the overlay never asks about it.
- **Settings.** Hotkey, default model/level, snap placement, the single OpenAI API key (Credential Manager, presence-flag only in UI), theme.

What Studio is *not*: a second overlay, a chat surface, or a required stop. A user can live entirely in the overlay forever; Studio is where they go the day they ask "why did it rewrite it that way?"

### Capture & inject

Perfect capture is a matrix, and every cell has a defined behavior — no host is "unsupported, good luck":

| Host | Capture | Apply |
|---|---|---|
| Native Win32 fields (Word, Notepad, dialogs) | UIA TextPattern/ValuePattern | ValuePattern → clipboard paste → Unicode typing |
| Chromium fields (Chrome, Edge, Electron apps, Cursor/VS Code editors & chat) | UIA snapshot, fast path | Clipboard paste → Unicode, optimistic verify when UIA readback fails |
| Rich editors (Notion, contentEditable) | UIA snapshot | Same as Chromium |
| Windows Terminal / conhost | UIA `TextPattern.GetSelection()` → clipboard fallback (Ctrl+Shift+C / Ctrl+C), clipboard restored | Single focus+select+paste (right-click paste WT/conhost), frozen `terminalBounds` when UIA resolve fails |
| Cursor/VS Code integrated terminals | Pane detection (`focusedIsTerminalPane`), a11y-noise filtering | Ctrl+V paste, same unified Apply path |
| Anvyll Studio itself | Same as any field | Same as any field |
| Secure/blocked fields | Compose mode (empty capture, user types) | Copy with toast — never a silent failure |

Non-negotiable mechanics behind the matrix (all as-built, all load-bearing): the frozen inject target from capture time — Apply must *never* resolve "whatever is focused now" (today's `win-inject.ps1` focused-element fallback without a window-ownership check is a known wrong-window risk and the top capture/inject fix); blur-hide skipped while `hotkeyInFlight`; `terminal-io.ps1` sole owner of the shared `WinFg` type; PS scripts read fresh per hotkey so capture fixes ship without rebuilds; clipboard snapshot/restore semantics exactly as stated in the overlay section; terminal rewrites always single-line (`toTerminalSingleLine`, Enter blocked in the output textarea) because a pasted newline executes in a shell.

**Resolved contradiction — terminals.** CONCEPT.md and README.md describe terminals as copy-only. AGENTS.md and the code inject into terminals through the same Apply path as fields. The perfect product **injects everywhere**, with copy as the universal failure fallback. "Apply" means the same thing on every host; a mode where the primary button silently means "copy" is a trust leak.

## The perfect rewrite engine

### Model-specific methodology

The engine's architecture is right and should be kept: **guides as data** (`prompting-guides/*.md`, level-budgeted excerpts of 3k–12k chars via keyword-scored section selection), **contracts as code** (`getLevelStructureContract()` fixing the exact output shape per model × level), and **one meta-prompt assembly point** (`buildMetaPrompt()` layering guide + level instruction + contract + action-language, constraint-framing, and per-model rules). A single rewrite model (GPT-4.1 mini, temperature 0.3) executes every rewrite; the target picker selects methodology, never routing. `REWRITE_PIPELINE_VERSION` invalidates the cache on contract changes.

The level knob is the product's central quality contract — a **guide-structure adherence scale**, not a call-count dial:

- **L1 Cool** — plain prose, always, for every model. Typos, capitalization, one-line disambiguation. The user's sentences and order survive. No tags, no headers, no persona. A user who wants "just clean it up" gets exactly that.
- **L2 Warm (default)** — the lightest model-native frame: instructions/input split (XML for Claude, `## Instructions`/`## Input` for GPT, Goal/Context/Input for Composer, etc.), with the user's prompt **verbatim** in the input block and never duplicated into the instructions. This is the level most rewrites live at; its perfection is restraint.
- **L3 Hot** — full guide structure (context, task, constraints, output format in the model's dialect), for *every* task type, with `[detail TBD]` placeholders where the user left gaps — never invented facts — and negative constraints reframed as positive guidance.
- **L4 Max** — L3 fully retained (collapse into a single instructions block is the canonical failure) plus examples, 2–3 measurable success criteria, and a closing verification line.

Universal quality bars at every level: intent preserved; the user's exact factual phrases kept ("vendor delay" never euphemized); action verbs matched to the ask ("fix it" → "Implement…", never "suggest a solution"); zero preamble, JSON, commentary, or rubric in the output; ready to paste. Levels must be *visibly distinct* — a flat scale where Warm ≈ Hot ≈ Max means the knob is broken.

**The missing half of the perfect engine is proof.** Calibration today is rigorous but manual: two shared prompts × four levels × two rounds per model, human-scored against per-model red-flag lists. The perfect engine has an **automated eval harness**: the same battery (grown to ~10–20 prompts spanning coding/writing/analysis) run headlessly against every `guideLoader.ts`/`providers.ts`/guide-file change, scored mechanically for contract compliance (tag presence/absence per level, verbatim-input check, forbidden-pattern scan for preambles/euphemisms/invented facts) plus periodic downstream lift checks (optimized vs original prompt fed to the real target model, outputs judged). No contract change ships on vibes. This is also the answer to the thesis-level risk CONCEPT §12 names: *prove* model-specific beats generic, don't assert it.

### Per-model nuances

What "perfect" output looks like per target (distilled from the calibration plans, contracts, and test artifacts):

- **Claude Opus 4.8** (`opus4.8.md`, XML) — the reference implementation. Warm: `<instructions>` + `<input>`. Hot: `<context>/<task>/<constraints>/<output_format>`. Max: all six tags including `<examples>` and `<success_criteria>` plus a verification line — validated end-to-end (`max_l4_validation_email.txt` passes the contract exactly). Richest guide (57KB), so excerpt selection matters most here.
- **GPT-5.5** (`gpt5.5.md`, markdown `##` headers) — the discipline model: outcome-first, *shorter* than instinct says. Never `# Personality`, `# Collaboration`, `Role:`, `# Goal`, or `# Stop rules` blocks; no phased workflows on simple tasks. Perfect GPT-5.5 output is defined as much by what it omits as what it adds.
- **Gemini 3 Pro** (`gemini.3.pro.md`) — Context → Task → Output → Constraints with **constraints last** (the guide's signature rule); optional one-line persona at Warm; no blanket "do not infer" negatives. Thinnest guide (6KB) → highest level-flattening risk; contracts carry more of the load here.
- **DeepSeek V3** (`deepseek.V3.md`) — the four-part Task/Context/Constraints/Output-format pattern with strong action verbs; the sanity check that the level scale generalizes beyond the big-three dialects.
- **Grok 4** (`grok4.md`) — ALL-CAPS GOAL/CONTEXT/OUTPUT FORMAT/QUALITY BAR blocks (never XML — the early `structureFormat` xml-default mismatch was the known risk and is fixed with a dedicated `grok` format); QUALITY BAR with Include/Avoid/If-uncertain required at Hot+; never invent X posts or citations.
- **Composer 2.5** (`composer2.5.md`) — Cursor-native, highest strategic value for the primary persona: Goal/Context/Constraints/Output format; implement/fix imperatives on coding asks (no "propose a plan and wait" on simple fixes); stack hints the user gave surfaced in Context; never invented file paths.
- **Terminal override (all models)** — `terminalContext` supersedes every contract: one line, plain text, no tags, level affects wording only. A structure contract that would break a shell paste is a bug, not a feature.

### Trust, privacy, errors

- **Only the prompt text leaves the machine**, over HTTPS to the one rewrite API. UIA metadata (window handles, bounds, runtime IDs) exists solely to bring Apply home and never leaves the device.
- **One key, stored right.** A single OpenAI API key in the Windows Credential Manager via `keyStore`; the UI sees presence flags only.
- **No silent substitution — ever.** Missing key, provider error, or empty rewrite throws a clear, human-readable error in the overlay and Studio (`orchestrator.ts` enforces this today). The old `optimizeLocal` template fallback stays dead in product (unit-test fixture only). **Resolved contradiction:** README.md still advertises "works with zero config" via the local fallback; the user explicitly rejected that. A mock rewrite presented as a real one is the fastest way to destroy the only thing the product sells — rewrite quality. Perfect first-run instead makes key setup a 30-second guided step.
- **The clipboard contract** (never destroy the refined text; never restore over the fallback copy) is a trust property, covered by tests, and treated as unbreakable.
- **Telemetry is opt-in, transparent, and local-first** — and in the perfect product it exists (it currently doesn't), because the success criteria below are unmeasurable without it.

## Differentiation & moat

- **Model-specific vs. everyone.** PromptAI is explicitly model-agnostic; PromptItIn runs one shared framework. Anvyll maintains six calibrated methodology engines with per-level structure contracts and (in perfect state) eval-gated updates. The artifact that proves it — six models × four visibly distinct levels on shared benchmarks — is something no competitor can screenshot.
- **Windows-native inject vs. macOS/extension-first.** The competitive field clusters on macOS and Chrome extensions. System-wide capture *and inject* across native, Chromium, rich editors, and four terminal flavors on Windows is brutally hard (the `scripts/` + AGENTS.md scar tissue is the evidence) and correspondingly hard to fast-follow.
- **Speed as a feature.** Instant glass, capture-after-shell, resident window, warmed PS bridge: the overlay competes with the user's own reflexes, not with a web dashboard round-trip.
- **Compounding data moat (earned, not automatic):** guide files + contracts + eval benchmarks form an updatable quality pipeline — when a provider revises its guidance, Anvyll ships the update as a data change in days, eval-verified. Switching costs (library, personas, history) accrue on top. Timing tailwind: PromptPerfect's Sept 2026 shutdown leaves a migrating user base (per CONCEPT.md's market research).

## Gap map: today → perfect

| Area | Perfect | Current | Priority | Notes |
|------|---------|---------|----------|-------|
| Eval harness | Automated contract-compliance battery gating every engine/guide change + periodic downstream-lift evals | Manual two-round calibration done for all 6 models; green unit tests assert contract *text*, not output behavior | **P0** | The thesis ("model-specific is better") is asserted, not proven; also the safety net for every future engine tweak |
| Inject correctness | Apply targets the frozen capture window or fails to clipboard — wrong-window inject impossible | `win-inject.ps1` falls back to the currently focused element with no window-ownership check (known risk, in memory notes) | **P0** | Injecting into the wrong app is the worst trust failure the product can have |
| Packaging & distribution | Signed NSIS installer, auto-update, tray icon (real, not empty `nativeImage`), first-hotkey-fast on cold boot | Dev-mode only; `npx electron-builder` untested as a product; no signing/auto-update | **P0** | Nothing else matters commercially until it installs |
| Overlay keyboard focus | Keyboard works immediately after hotkey, without clicking, without breaking capture | Overlay deliberately unfocused after hotkey (`showInactive`); shortcuts need a click first | P1 | The gold path is keyboard-first; today it isn't, by one click |
| Onboarding & key setup | 3-step first run: hotkey demo on a sample prompt, model thesis, guided API-key entry; clear error → settings deep-link | No onboarding; key errors are clear but user must find Settings themselves | P1 | Activation gate for every non-technical user |
| Telemetry & latency metrics | Opt-in metrics: shell-visible ms, capture ms/success-rate per host, inject success/fallback rate, rewrites per level | Dev-mode console timings only | P1 | Success criteria below are unmeasurable without it |
| Studio explain layer | Clickable diff tags with guide rationale; requested-vs-measured adherence surfaced; polished analysis panel | Diff, rubric score, adherence computed and shown; explanations and polish partial | P2 | The learn-as-you-go trust builder; overlay stays clean because this exists |
| Guide freshness workflow | Guides carry version/date; documented refresh checklist per provider; eval re-run on refresh (pre-AI-Research-Mode) | Static markdown snapshots, no dating or refresh process | P2 | The moat decays silently without it; full AI Research Mode stays deferred |
| Model id hygiene | Ids match reality (`gpt-5.5`), labels match picker, one source of truth | `gpt-5` id → `gpt5.5.md` guide, label "GPT-5"; unused `rewriteModel` fields; stale README/CONCEPT UX claims | P2 | Cheap; prevents drift-driven bugs and doc confusion |
| Personas & context memory | Default persona + standing context managed in Studio, applied automatically, visible in meta-prompt | Types/settings fields and meta-prompt plumbing exist; management UX thin, auto-persona (CONCEPT §7) unbuilt | P2 | Retention feature, not activation; keep out of overlay |
| Rewrite model ceiling | Rewrite model chosen by eval evidence (mini vs stronger vs per-provider routing), cost-aware | GPT-4.1 mini fixed for all targets/levels; ceiling unmeasured | P3 | Decide with eval data, not intuition; single-model simplicity is a feature until proven insufficient |
| Cloud (accounts, sync, billing, teams) | Post-perfect: managed tier per CONCEPT §9–11 | Nothing (deliberate) | P3 | v1-perfect is a local BYOK utility that earns the right to a cloud tier |

## Roadmap shape (not a task list)

- **Now — make the promise safe (P0).** Close the wrong-window inject risk; build the eval harness v1 (contract-compliance battery over the existing two-prompt × six-model × four-level matrix, runnable headless via the dev bridge); produce a signed installer with auto-update and verify cold-boot hotkey latency. Exit test: a stranger installs Anvyll, and nothing they can do loses text or injects into the wrong app.
- **Next — make it land (P1).** Onboarding + guided key setup; overlay keyboard focus resolved; opt-in telemetry wired to the success criteria; host-matrix capture/inject verification runs as a manual release checklist. Exit test: activation (install → first successful Apply) is a minutes-long, unassisted path, and we can see the funnel.
- **Later — make it compound (P2→P3).** Studio explain layer and library polish; guide freshness workflow with dated versions; persona/context UX; model-id and doc hygiene (update CONCEPT §7 / README to match reality); then re-evaluate rewrite-model routing with eval data. Cloud tier, teams, AI Research Mode, macOS remain post-perfect and gated on the local product's retention numbers.

## Success criteria

**Speed & feel** (p95, mid-range Windows laptop, measured by telemetry not vibes):
- Hotkey → glass shell visible: **< 150 ms** (including first hotkey after boot).
- Hotkey → captured text delivered: **< 900 ms** fast path; < 2 s worst-case fallback path.
- Refine round-trip (L2, typical prompt): first streamed token < 1.5 s; complete < 6 s.
- Apply → text verified in target: < 1 s after overlay hide. Zero double-popup/reopen flicker reports.

**Capture & inject reliability** (per-host, from telemetry + release checklist):
- Capture success ≥ **98%** across the seven-row host matrix; empty-capture always yields the legible compose/terminal-hint state.
- Inject success ≥ **95%**; the remaining ≤5% end in the clipboard-fallback state with the refined text present **100%** of the time; **zero** wrong-window injections.

**Rewrite quality** (eval harness, gating):
- Contract compliance: **8/8** level-contract passes per model on the shared battery (48/48 across six models), including Cool-stays-prose and Max-retains-L3.
- Zero red-flag hits per run: no invented facts, no euphemized user phrasing, no suggest-instead-of-implement, no preamble/JSON/commentary.
- Level distinctness: measured `adherenceLevel` monotonically non-decreasing L1→L4 on every battery prompt.
- Downstream lift (quarterly): optimized prompts beat originals in blind pairwise judgment on ≥ **65%** of battery tasks per model — the thesis-proof number.

**Business (assumptions inherited from CONCEPT.md §10, to validate once telemetry exists):** activation (install → first Apply) ≥ 60%; D7 retention ≥ 25% of activated users; free→paid ≥ 3% if/when a paid tier ships.

## Open questions

1. **Overlay focus fork:** should the overlay take keyboard focus immediately after hotkey (best UX) given the risk that focusing it interferes with capture/inject of the frozen target — or keep click-to-focus (current, deliberate)? Needs a spike proving focus-after-deliver is safe; the repo records the risk but not a decision.
2. **Rewrite-model ceiling:** is GPT-4.1 mini sufficient for L3/L4 quality across all six dialects long-term, or does Max-level quality justify a stronger (or per-provider) rewrite model at higher cost? Only the eval harness can answer; no data in the repo either way.
3. **Guide refresh ownership:** who watches the six providers' prompting docs and refreshes `prompting-guides/*.md` between now and AI Research Mode, and on what cadence? The moat's decay rate depends on this and it is specified nowhere.
4. **Go-to-market timing:** CONCEPT.md's monetization plan is anchored to the PromptPerfect shutdown window (Sept 2026, ~2 months out). Is v1 still aiming at that window as a paid product, or shipping free/BYOK first and monetizing later? This changes the priority of packaging vs. cloud work.
5. **Persona scope:** CONCEPT §7's auto-persona-generation is unbuilt and its interaction with the minimal-overlay principle is unresolved — is persona strictly a Studio/settings concept in the perfect product, or does the engine ever propose one inline?
