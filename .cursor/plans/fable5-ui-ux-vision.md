# PromptForge — Fable 5 UI/UX vision (copy-paste prompt)

Use this prompt in a **Claude Fable 5** session with full repo access. Fable studies the **visual and interaction design** of PromptForge and writes the **perfect UI/UX vision** to a markdown file.

Complements [`.cursor/plans/product-vision.md`](product-vision.md) (product north star) and [`.cursor/plans/fable5-product-vision.md`](fable5-product-vision.md) (how to generate that doc).

---

## Full prompt (copy-paste)

```markdown
# PromptForge — UI/UX vision architect

You are **Claude Fable 5**, acting as a senior product designer and interaction specialist — the kind who ships Raycast-grade utility UX on Windows. Your job is **not** to write code today. It is to **study PromptForge's surfaces, components, and interaction contracts** and articulate **what perfect UI and UX looks like** for this app: visual language, layout, motion, states, keyboard flows, accessibility, and the honest gap between today's implementation and that ideal.

Repository: `c:\Users\julez\Apps\prompt-master`

## Mission

1. **Study** every user-facing surface — overlay, Studio, tray, onboarding gaps — plus the CSS/component code that implements them.
2. **Synthesize** your own **perfect UI/UX vision** — not a screenshot of CONCEPT.md §7, not a generic "dark mode SaaS" brief, but a concrete design direction grounded in what PromptForge *is* (a reflex-speed Windows overlay + optional workbench).
3. **Write** that vision to a single markdown file.

**Deliverable (mandatory):** create or overwrite

`.cursor/plans/ui-ux-vision.md`

Do not only report in chat. The vision must live in that file.

## Scope: UI/UX only

| In scope | Out of scope (reference only) |
|----------|-------------------------------|
| Visual design language (color, type, glass, density) | Rewrite engine contracts, guide calibration |
| Layout, hierarchy, component anatomy | Capture/inject PS script internals |
| Interaction design, states, feedback, errors | Business model, cloud tier |
| Motion, timing feel, reduced-motion | Eval harness architecture |
| Keyboard flows, focus model, shortcuts | API key storage implementation |
| Overlay placement, window chrome, tray | Per-model prompting methodology |
| Studio workbench IA, diff/score presentation | Packaging/signing pipeline |

You may mention engine/output constraints when they **force** UX choices (e.g. terminal single-line output, plain text in overlay).

## Design north star (starting hypothesis — validate or refine)

PromptForge UX should feel like **a premium Windows utility that disappears into muscle memory**:

- **Overlay = speed instrument.** Sparse, glass, keyboard-first, sub-150ms shell reveal. The user thinks "hotkey → better prompt → Apply" — never "open an app."
- **Studio = explain & manage.** Denser, information-rich, Linear/Raycast polish — where scores, diffs, library, personas, and settings live.
- **Two surfaces, one engine.** Never duplicate controls or contradict behavior between overlay and Studio.

Read [`.cursor/plans/product-vision.md`](.cursor/plans/product-vision.md) for product-level UX decisions already made (e.g. plain overlay output, no score ring in overlay, inject everywhere including terminals). Your UI/UX doc **implements** those choices visually and interactionally — and goes deeper on *how* they should look and feel.

## Study plan (do this before writing)

### Layer 1 — UX contract (authoritative)
- [`AGENTS.md`](AGENTS.md) — overlay invariants: hotkey order, glass shell, snap placement (no drag), footer layout, level slider, ModelPicker, terminal single-line, no scrim, no open animation, Discard color, Generate→Regenerate, editable output, etc.
- [`.cursor/plans/claudes-goal.md`](.cursor/plans/claudes-goal.md) — gold-path UX checklist

### Layer 2 — Original design intent (may be stale)
- [`CONCEPT.md`](CONCEPT.md) §7 — UI/UX design language, overlay mock description, Studio layout, accessibility notes. **Flag every conflict with AGENTS.md**; do not treat §7 overlay score ring as current truth.

### Layer 3 — As-built UI (read the code, not just docs)

| Surface | Key files |
|---------|-----------|
| Overlay layout & states | `src/renderer/views/Overlay.tsx` |
| Glass design system | `src/renderer/index.css` (`.apple-glass`, panels, pills, level slider) |
| Placement picker | `src/renderer/components/OverlayPlacementPicker.tsx` |
| Typewriter stream reveal | `src/renderer/hooks/useTypewriterReveal.ts` |
| Studio shell + workbench | `src/renderer/views/Studio.tsx` |
| Score + diff components | `src/renderer/components/Score.tsx`, `DiffView.tsx` |
| Window placement (main) | `src/main/main.ts` — `positionOverlay()`, `overlayPlacement` |
| Overlay preview (dev) | `http://localhost:5173/#/overlay-preview` if dev server available |

Trace these **interaction states** in Overlay.tsx:
- idle → capturing → idle (text filled)
- idle → optimizing (stream + typewriter) → done / error
- captureFailed / terminal empty hint
- Apply notice, inject fallback messaging
- menu (⋮): placement, Settings, Dismiss

### Layer 4 — Product context
- [`.cursor/plans/product-vision.md`](.cursor/plans/product-vision.md) — resolved UX contradictions, gap map items tagged P1 for overlay keyboard focus and onboarding

### Layer 5 — Optional visual audit
If dev server is running, open overlay preview and note layout proportions, contrast, focus rings, and whether the glass reads as "instant premium" or "heavy/slow."

## What to produce in your vision

Your perfect UI/UX vision must cover **both surfaces** and **the system between them**.

### 1. Design language
- Aesthetic target (reference apps: Raycast, Linear, Apple utility panels — justify the fit for Windows Electron).
- Color: dark-first palette, accent usage, level colors (Cool `#5AC8FA` → Max `#FF453A`), semantic colors (warn, muted, Discard at `white/45`).
- Typography: Inter 15px overlay body, hierarchy rules, monospace where (output only? diff only?).
- Glass system: `.apple-glass` shell vs panel vs pill vs menu — opacity hierarchy, why no Windows acrylic on the window, simulated frost via gradients.
- Density: overlay sparse vs Studio dense — specific spacing/radius tokens (34px shell, 26px panels, pill buttons).

### 2. Overlay — perfect anatomy
Describe the **ideal overlay** as a annotated layout (ASCII or structured bullets):

- **Shell:** max width, padding, snap placement on work area (five positions), no scrim, resident window reveal.
- **Content grid:** Original textarea (editable, Enter = newline) | Output textarea (editable after generate, terminal = single line, Enter blocked).
- **Control row:** Generate/Regenerate pill + LevelSlider (track, spring snap, color label Cool/Warm/Hot/Max).
- **Footer:** ModelPicker (chevron ~7px from measured label) → status/notice → Discard | Apply | Copy.
- **⋮ menu:** OverlayPlacementPicker skeleton, Settings deep-link, Dismiss.

For each control: default state, disabled state, busy state, error state, hover/focus/active.

### 3. Motion & timing
- What animates vs what must **never** animate (shell reveal = instant; no open animation).
- Typewriter reveal during Generate (~3 chars/frame, catch-up, `prefers-reduced-motion` = instant full text).
- Level slider spring (`cubic-bezier(0.34, 1.56, 0.64, 1)`).
- Pill press (`scale(0.98)`).
- Apply success: overlay hide timing vs user perception of "it went home."
- Explicit **anti-patterns:** black scrim, capture spinner path, double-popup flicker, laggy reopen.

### 4. Keyboard & focus model
This is a first-class section — product-vision flags overlay keyboard focus as an open fork.

Specify the **perfect** behavior:
- Shortcuts: Esc dismiss, Enter when idle (Refine? or Apply? — read current code and recommend the gold standard), 1–4 for levels if desired, Tab order.
- Focus after hotkey: click-to-focus today vs immediate keyboard — **recommend one** with UX rationale and capture-safe constraints.
- Focus during capture/refine: what is focusable, what is readOnly, screen reader announcements for phase changes.

### 5. Feedback, errors, trust UX
- Capture failure copy (field vs terminal).
- API error presentation in overlay (no silent fallback).
- Apply failure → clipboard fallback messaging (overlay stays, notice text).
- Streaming: cursor block, Refining… placeholder, Regenerate label change.
- Empty states, loading states — never dead UI.

### 6. Studio — perfect workbench
CONCEPT §7 describes an ideal Studio; code in `Studio.tsx` is partial. Vision the **perfect** Studio:

- **IA:** left rail tabs (Workbench, Library, History, Settings) — keep or refine?
- **Workbench:** Original | Optimized split, DiffView semantic tags, ScoreRing + RubricChips, requested vs measured adherence, persona/context fields.
- **Library / History:** search, tags, re-run at new model/level.
- **Settings:** hotkey, defaults, overlay placement mirror, API key entry, theme.
- Visual relationship to overlay (shared ModelPicker/LevelSlider patterns or deliberately different?).
- "Open in Studio" path from overlay — if missing today, specify it.

### 7. Tray, launch, onboarding UI
- Tray-only launch — no Studio on boot. Perfect tray menu contents and icon treatment.
- First-run onboarding (3 slides + try-it-now): wireframes in prose.
- Settings entry points: overlay ⋮, tray — consistent?

### 8. Accessibility
- Keyboard navigation complete path.
- `aria-*` on slider, model picker, phase status.
- Color-not-only for level and score.
- `prefers-reduced-motion`, Windows scaling, min touch targets.
- Screen reader flow for hotkey → capture → refine → apply.

### 9. Platform constraints (Windows Electron)
- Transparent frameless window — white-flash guard (opacity 0 → showInactive → rAF ack → opacity 1): UX implication (not a "loading animation").
- `backdrop-filter` cannot blur desktop through transparent window — design for simulated glass, not true acrylic blur.
- `-webkit-app-region` drag regions if any (today: no free drag — snap only).

## Synthesis rules

1. **Be specific.** "Modern and clean" is useless. Name px, colors, component states, and user-visible copy patterns.
2. **Resolve conflicts** with a clear decision + rationale (overlay plain text vs CONCEPT score ring; placement snap vs drag).
3. **Gap map required:** `{ area | perfect UX | current UX | priority | file(s) }` — grounded in code review.
4. **Include wireframe-level ASCII** for overlay and Studio workbench (one each minimum).
5. **Include a component inventory:** list every UI primitive and its perfect spec (GlassPill, LevelSlider, ModelPicker, OverlayPlacementPicker, etc.).
6. **Do not redesign for redesign's sake.** Respect AGENTS.md invariants; propose improvements only where they serve speed, clarity, or trust.
7. **English for all user-facing copy** in examples (app UI is English-only).

## Output file structure

Write `.cursor/plans/ui-ux-vision.md` with exactly these sections:

```markdown
# PromptForge — UI/UX Vision (Perfect State)

> Authored by Claude Fable 5 · [date] · Based on study of prompt-master repo

## Executive summary
(3–5 sentences: the UX in one breath)

## Design north star
(How it should *feel*; reference apps; what we refuse to be)

## Design language
(Color, type, glass hierarchy, radius/spacing tokens, icon style)

## Component system
(Table or bullets: component → anatomy → states → notes)

## Overlay — perfect experience

### Layout (annotated)
(ASCII wireframe + dimension notes)

### Interaction flows
(Hotkey open → capture fill → refine → apply/dismiss; error paths)

### Motion & timing
(What moves, what doesn't, ms budgets tied to feel)

### Keyboard & focus
(Shortcut table; focus model recommendation)

## Studio — perfect experience

### Information architecture
(Rail, tabs, deep links from overlay)

### Workbench layout
(ASCII wireframe; diff, score, adherence)

### Library, history, settings
(Perfect patterns for each)

## System surfaces
(Tray, onboarding, placement picker, dev preview)

## Accessibility
(Checklist with concrete requirements)

## Responsive & platform notes
(Multi-monitor placement, DPI scaling, transparent window constraints)

## Gap map: today's UI → perfect UI
| Area | Perfect | Current | Priority | Files |

## Anti-patterns (never ship)
(Bullet list — scrim, spinner on hotkey, score in overlay, etc.)

## Open questions
(Max 5 — only unresolved UX forks)
```

## Scope guards

```
Do NOT implement UI changes in this session unless required to write the vision file.
Do NOT edit AGENTS.md, CONCEPT.md, or component code.
Do NOT reproduce the full product-vision.md — link to it for product context; go deeper on visual/interaction design here.
Do NOT propose features that break AGENTS.md invariants (e.g. score ring in overlay, free drag, acrylic window, auto-refine on open).
Do NOT stop at analysis in chat — the file is the deliverable.
```

## Autonomy

When you have enough information, write the file. Ask the user only if:
- A fundamental visual direction fork is ambiguous (e.g. overlay single-column vs current two-column Original|Output)
- You cannot write `.cursor/plans/ui-ux-vision.md`

Default to **AGENTS.md + product-vision.md** for decisions already made; your job is to make them *design-real* and fill gaps (Studio polish, onboarding, focus model, component specs).

## Final response (after writing the file)

Return briefly:
1. Path to the UI/UX vision file
2. One sentence: how perfect PromptForge should *feel*
3. Top 3 UI/UX gaps vs today
4. Your recommendation on overlay keyboard focus (the open fork)
```

---

## Usage notes

- Run in Agent mode with repo read/write access.
- Best run **after** `product-vision.md` exists so Fable can align UX with product decisions.
- Pairs with `claudes-goal.md` when implementing UX fixes from the gap map.
