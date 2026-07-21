# Anvyll — UI/UX Vision (Perfect State)

> Authored by Claude Fable 5 · 2026-07-06 · Based on study of prompt-master repo
> (AGENTS.md UX contract, CONCEPT.md §7, `.cursor/plans/product-vision.md`,
> `Overlay.tsx`, `index.css`, `Studio.tsx`, `Score.tsx`, `DiffView.tsx`,
> `OverlayPlacementPicker.tsx`, `useTypewriterReveal.ts`, `main.ts` window
> lifecycle, `tailwind.config.cjs`). Product-level decisions live in
> [product-vision.md](product-vision.md); this doc makes them design-real.

## Executive summary

Anvyll's UX is two instruments sharing one engine: a glass **overlay** that
must feel like a Windows reflex — hotkey, refined prompt, Apply, gone in
seconds, keyboard all the way — and a dense **Studio** workbench where scores,
diffs, library, and settings explain what the overlay deliberately hides. The
overlay's as-built design language (simulated frost, pill controls, spring
level slider, typewriter stream) is already the right direction and close to
perfect; the gaps are keyboard focus after hotkey, a dead-end capture-failure
state, and missing polish states (toasts, focus rings, error recovery). Studio
is structurally right (rail + four tabs) but a full visual tier below the
overlay: it needs the same token system, English-only copy, real feedback
surfaces instead of `alert()`, and workbench flows that close the loop
(re-run, open-in-Studio, explainable diff tags). Nothing in this vision adds
chrome to the overlay — every improvement serves speed, clarity, or trust.

## Design north star

**A premium Windows utility that disappears into muscle memory.** Reference
points: Raycast's command-bar economy (every pixel earns its place, keyboard
never waits for mouse), Linear's density discipline (information-rich without
noise), Apple's HUD panels (frost, restraint, physics-true motion). On Windows
this translates to: respect Segoe UI and the work area, never fight the
foreground app for attention, and make the one animated thing (the stream
reveal) feel like the product working — not decoration.

What we refuse to be:

- **A dashboard in a popup.** No scores, rings, badges, or meters in the
  overlay — ever. Plain refined text is the product.
- **A "dark mode SaaS" skin.** No gradient buttons, no marketing glassmorphism
  layered on everything. Frost is reserved for the overlay shell; Studio is
  matte and quiet.
- **An app you "open."** The user thinks *hotkey → better prompt → Apply*.
  Studio exists for the 5% of sessions that need explanation or management.

## Design language

### Color

Dark-first, single accent, level colors as the only saturated system.

| Token | Value | Use |
|---|---|---|
| `bg-950…700` | `#0a0b0f` → `#232636` | Studio surfaces (matte, no frost) |
| `line` | `#2a2e3f` | Studio hairlines |
| `accent` | `#7c6cff` (soft `#9d92ff`, dim `#4a3fb0`) | Primary actions, selection — Studio only |
| `ok / warn / bad` | `#3fcf8e / #f0b429 / #f0606b` | Score, diff add/remove, notices |
| `muted` | `#8a90a6` | Secondary text (Studio) |
| Level 1–4 | `#5AC8FA / #FFD60A / #FF9F0A / #FF453A` | Cool→Max, identical on both surfaces |
| Overlay text | `white`, `white/50` placeholder, `white/45` Discard | On-glass hierarchy |

Rules: the accent never appears in the overlay (the overlay is monochrome glass
plus level color); level colors never appear at partial opacity (they are
recognition anchors); `warn` is the only notice color in the overlay
(capture-fail, apply-fallback, error ring). **Fix:** `OverlayPlacementPicker`'s
selected zone uses raw indigo (`rgba(99,102,241,…)`) — retoken to `accent`.

### Typography

- **Overlay: system stack** (`-apple-system, "Segoe UI", system-ui`) — this is
  deliberate and should stay. A native-feeling HUD reads as part of Windows;
  Inter here would read as "a web app appeared."
- **Studio: Inter** for UI, **JetBrains Mono / Cascadia Code** for prompt text,
  diff, and code — monospace only where the user compares characters (Original,
  Optimized, DiffView). Overlay text stays proportional 15px/relaxed — prompts
  in the overlay are read, not audited.
- Scale: overlay body 15px; overlay micro-labels 13px (slider label, notices),
  10px uppercase-tracked section labels (menu "Position"). Studio: 14px body,
  12px table/meta, 10–11px uppercase-tracked labels. Nothing below 10px.

### Glass hierarchy (overlay only)

Four layers, each one step less transparent than its parent — depth without
blur of the desktop (impossible through a transparent Electron window):

1. **`.apple-glass` shell** — layered 145° gradient `rgba(52,52,62,.92)` →
   `rgba(22,22,28,.94)` over `rgb(32,32,38)`, 1px `white/28` border, deep drop
   shadow + inset top highlight, `::before` diagonal sheen, `::after` bottom
   shade. Radius **34px**.
2. **`.apple-glass-panel`** (text wells) — `black/58`, 1px `white/10`, inset
   shadow. Radius **26px**. Reads as "carved into" the shell.
3. **`.apple-glass-pill`** (actions) — `white/52`, brighter than shell (per
   AGENTS: pills less transparent than shell), hover `white/62`, radius full.
4. **`.apple-glass-menu`** — `rgba(30,30,35,.93)` + real backdrop-blur (works
   here: it blurs overlay content beneath it, not the desktop), radius 12px.

Never: Windows acrylic/`setBackgroundMaterial` on the window (white-box bug),
`GlassSurface` or any WebGL frost, frost in Studio.

### Spacing & radius tokens

| Token | Value | Where |
|---|---|---|
| Shell radius / panel radius / menu radius | 34 / 26 / 12px | Overlay |
| Shell padding | 16px (`p-4`) | Overlay |
| Panel text inset | 14px × 12px (`px-3.5 py-3`) | Overlay textareas |
| Pill padding | 20px × 6px (`px-5 py-1.5`) | Overlay actions |
| Control gaps | 12px between siblings, 16px between zones | Overlay |
| Studio radii | 6px (`rounded-md`) cards/inputs, 8px panels | Studio |
| Studio rhythm | 20px page padding (`px-5`), 12px card padding | Studio |

### Iconography

Inline SVG, stroke 1.5, `currentColor`, sized to text (chevron 10×6, ⋮ 24px
hit area). No icon font, no emoji in UI. Tray icon: monochrome forge/spark
glyph at 16/20/24/32px, light+dark variants — **currently
`nativeImage.createEmpty()`; a real icon is table stakes** (see gap map).

## Component system

| Component | Anatomy | States | Notes |
|---|---|---|---|
| **GlassShell** | `.apple-glass` card, max-w 578px in a 720×520 transparent window | invisible (session closed) / visible; never animates in | Revealed by window opacity, not CSS transition |
| **GlassPanel** | Text well wrapping a borderless textarea, `scroll-thin` scrollbar | default / readOnly (busy, capturing) / error (`ring-1 ring-warn/50`) / busy (`ring-1 ring-white/20`) | Placeholder copy is a state signal: "Prompt input…" / "Capturing…" / "Refining…" / "Output will appear here" |
| **GlassPill** | Rounded-full button, 15px medium | default / hover (+10% white) / active (`scale(0.98)`) / disabled (40% opacity, no cursor) | Primary verbs only: Generate/Regenerate, Apply, Copy |
| **LevelSlider** | 132×26px track, 3px lane `white/14`, 4 dot stops `white/25`, white fill, 20px radial-gradient thumb, 34px color label | rest / dragging (thumb ×1.14, no spring) / keyboard (arrows step, `focus-visible` halo on lane) / disabled (40%) | Spring `cubic-bezier(0.34,1.56,0.64,1)` 420ms on release; label pops 320ms, colored per level. The one playful element — keep it singular |
| **GlassTab** | `.apple-glass-tab` + side variant: organic folder-tab shape drawn as an SVG `::before` background — S-curve sides sliding into the card (curves span ~26% of the tab per side), rounded shoulders, `white/22` stroke following the curve, `drop-shadow` filter hugging the shape, z-0 behind card; bottom/right mirror the top/left artwork via `scaleY/X(-1)` (content stays unwarped) | static (appears/disappears with shell, never animates) | Top = type picker (46px), bottom-left = ModelPicker (42px), left = wordmark 190px (vertically centered on the card), right = ⋮ bump (52px); interactive content lives in the visible protrusion |
| **PromptTypePicker (top tab)** | `MeasuredSelect` at 13px: Auto / Question / Prompt / Letter | default / open / disabled (busy, capturing) | Rewrite hint; defaults to Auto, resets per capture session |
| **ModelPicker (bottom tab)** | Native `<select>` with measured label width + chevron exactly 7px after text | default / open (native popup) / disabled | Width-measured so the chevron hugs the label; short labels ("Opus4.8", "GPT-5"); lives in the bottom folder tab, not the footer |
| **Discard** | Text button `white/45` → hover `white/65` | default / hover | Deliberately not a pill, not pink/red — leaving is cheap and unemphasized |
| **⋮ menu** | 24px dot button top-right *outside* the shell; GlassMenu with Position picker, Settings, Dismiss | closed / open (outside-pointer closes) | Only non-essential controls live here |
| **OverlayPlacementPicker** | 140×88px monitor skeleton, 5 snap zones (28×20, center 32×22) | zone: default / hover / selected (accent) | `role=radiogroup`; applies instantly, no confirm |
| **Notice (overlay)** | 13px `warn` inline text in footer, `role=status` | — | e.g. "Couldn't insert — copied to clipboard"; truncates, never wraps the footer |
| **Stream cursor** | `▋` absolute bottom-right of output, `animate-pulse` | visible while revealing | Hidden under `prefers-reduced-motion` |
| **ScoreRing (Studio)** | SVG ring, 7px stroke, 400ms dashoffset ease, center number + "/100" | color by band (≥75 ok, ≥50 warn, else bad) | Studio-only, forever |
| **RubricChips (Studio)** | Pill per rubric key, `v/max`, band-colored border/tint | — | Tooltip = key: v/max; future: click → explanation |
| **ScoreLift (Studio)** | `+N lift` in ok, or "no lift" muted | — | Sits beside Optimized header |
| **DiffView (Studio)** | Mono 12px; adds = ok block w/ left bar + semantic tag chip; removes = struck bad block; context dimmed | — | Tags ("+ Constraints", "+ Output format") become clickable explainers (P2) |
| **Toast (Studio — missing)** | Bottom-right stack, 3s auto-dismiss, ok/warn variants | — | Replaces both `alert()` calls |
| **Onboarding (missing)** | 3 cards + guided try-it-now | — | See System surfaces |

## Overlay — perfect experience

### Layout (annotated)

720×520 transparent window; the card centers within it; snap placement
positions the *window* on the active display's work area.

**Folder tabs (2026-07-07 concept):** four tabs tucked *behind* the card
(`.apple-glass-tab`, z-0 under the card's z-10, near-opaque gradient sampled
from the shell's edge tones, rounded on the protruding side only, own drop
shadow). Seamless border-merging is deliberately avoided — translucent glass
layers double in density when overlapped; behind-the-card gives the manila-
folder depth without breaking the frost.

```
            ___________
           /  Auto ⌄   \   ← top tab: PromptTypePicker (26px visible)
╭──────────────────── .apple-glass · 578px · r34 · z-10 ─────────────────────╮
│P╭─ Original · r26 · h88 ──────────╮  ╭─ Output · r26 · h150 ─────────────╮ │⋮ ← right tab:
│R│ fix my react search lag…        │  │ <task>                            │ │   menu bump
│O│ (editable · Enter = newline)    │  │ Optimize the search input…      ▋ │ │   (24px visible)
│M╰─────────────────────────────────╯  │ (editable after done;             │ │
│P                                     │  terminal ⇒ single line,          │ │
│T ( Generate )  ○──●──○──○  Warm      │  Enter blocked)                   │ │
│F  glass pill   132px track  colored  ╰───────────────────────────────────╯ │
│G ← left tab: vertical wordmark (26px visible, aria-hidden)                 │
│  [notice: warn 13px]                      Discard  ( Apply )  ( Copy )     │
│   role=status                             white/45   pills, right-aligned  │
╰────────────────────────────────────────────────────────────────────────────╯
      \__Opus4.8 ⌄__/   ← bottom tab: ModelPicker (22px visible, out of footer)
```

Prompt type (Auto / Question / Prompt / Letter) is a rewrite hint: non-auto
types add a deliverable-shape rule to the meta-prompt (question stays a
question, letter demands a written message); Auto adds nothing. Resets to
Auto on every new capture session; cache hash carries `|type:{t}`.

Proportions that matter: Original is deliberately shorter (88px) than Output
(150px) — the refined prompt is the star; the input is context. Footer is one
36px row: identity (model) left, verdict actions right, notices in between.
Nothing else. The ⋮ button floats outside the card so the card itself contains
only the work.

**One addition to today's layout — Compose mode.** Capture-fail is currently a
dead end (a warn panel, no inputs). Perfect: the warn line renders *above the
normal layout*, the Original panel stays editable and focused, and the user can
type a prompt from scratch. Apply is replaced by Copy-primary (there is no
frozen target). Same shell, one extra line — no new surface. Copy: field —
"Nothing captured — type a prompt below, or click into a text field and press
Ctrl+Shift+O again."; terminal — "Select terminal text or type at the prompt,
then press the hotkey."

### Interaction flows

**Gold path (field):**
1. `Ctrl+Shift+O` → glass shell visible *instantly* (resident window, opacity
   flip; ≤150ms p95). Empty Original with "Prompt input…" — never a spinner.
2. Captured text fills Original ~300–900ms later (second `OVERLAY_SHOW`). No
   layout shift — the panel exists from frame one.
3. `Enter` (or Generate) → Output ring `white/20`, placeholder "Refining…",
   stream typewrites in; pill reads "Refining…" disabled; slider/picker
   disabled.
4. Stream completes → phase done. Output editable. Pill reads "Regenerate".
5. `Enter` (or Apply) → overlay hides, text lands in the captured field. The
   user never saw a window "close" — it was simply gone when focus returned.

**Terminal variant:** identical shell and footer (per AGENTS — Apply injects,
not copy-only). Output is forced single-line; Enter in the output textarea is
swallowed; stream chunks are sanitized live. The *only* visible difference is
the one-line output — the UX contract is "terminals are normal fields."

**Error path (API/key):** Output shows `Error: <message>` with `ring-warn/50`;
phase error keeps the textarea readOnly (don't let users edit an error string
as if it were a prompt). `Enter` retries (runOptimize). Perfect addition: when
the message is the missing-key error, render an inline "Open Settings →" text
link under the message (deep-links `STUDIO_SETTINGS`) — today the user must
find Settings themselves.

**Apply-fallback path:** inject fails → overlay *reopens* (session preserved),
footer notice "Couldn't insert — copied to clipboard" in warn. The refined text
is on the clipboard (never clobbered by snapshot restore — engine contract).
User pastes manually; overlay stays until Esc/Discard.

**Regenerate:** `skipCache: true`, same flow as Generate; Apply notice clears.
**Dismiss:** Esc, Discard, blur (when not hotkey-in-flight), or ⋮ → Dismiss —
all identical: `OVERLAY_CLEAR`, opacity 0, session closed, state reset.

### Motion & timing

| Thing | Motion | Budget / spec |
|---|---|---|
| Shell reveal | **None.** Opacity 0→1 after renderer-prepared rAF ack | Perceived as instant; the rAF handshake is a white-flash guard, not an animation — never replace it with a fade |
| Capture text arriving | None (text just appears) | The *absence* of a spinner is the feature |
| Stream reveal | Typewriter ~3 chars/frame, catch-up 12/frame when >120 behind; `▋` pulses | Feels like thinking-at-speed; catch-up guarantees reveal never lags the API |
| Level slider | Thumb/fill spring 420ms `cubic-bezier(0.34,1.56,0.64,1)` on snap; label pop 320ms; thumb ×1.14 while dragging | The single moment of delight; do not add springs elsewhere |
| Pills | `active:scale(0.98)`, ~150ms color transitions | Tactile, sub-perceptual |
| Menu open | Instant (no transition today — keep, or ≤80ms fade max) | |
| Overlay hide on Apply | Immediate opacity 0 *before* inject settles | The prompt "went home"; showing the overlay during the ~200ms inject settle would read as lag |
| `prefers-reduced-motion` | Typewriter → full text instantly; pulse off; springs may remain (position, not flashing) | Already implemented in `useTypewriterReveal` — preserve |

Never animate: shell entry/exit, capture fill, placement change (window jumps
instantly to the new snap), disabled-state changes.

### Keyboard & focus

Current shortcuts (window-scoped, only when focus is outside editables):
`Esc` dismiss · `Enter` = Refine when idle/error, Apply when done ·
`Shift+Enter` reserved · `1–4` set level · arrows on slider when it has focus.
This map is right. `Enter` advances the pipeline — one key from hotkey to
applied prompt — and must stay the spine of the gold path.

**The fork: focus after hotkey.** Today the overlay opens via `showInactive()`
and never takes focus, so every shortcut needs a click first — the gold path is
keyboard-first in name only. The constraint is real: focus must stay on the
source app until the UIA snapshot and capture have run, and the blur-hide
handler is suppressed only while `hotkeyInFlight`.

**Recommendation: focus the overlay window exactly once, at the end of
`deliverCaptureToOverlay()`** — after the snapshot is frozen and text is
delivered, immediately before/with `setOpacity(1)` finishing the in-flight
window. Capture-safe by construction (nothing reads the foreground after the
snapshot; Apply focus-restores from the frozen target, not from "whatever was
focused"). Blur-hide then also works as designed: clicking back into the source
app dismisses the overlay, which matches the mental model. Inside the window,
focus lands on the *window* (no element), so Enter/1–4/Esc work instantly; Tab
order: Original → Generate → slider → output → model → Discard → Apply → Copy →
⋮. In Compose mode, focus lands *in* the Original textarea instead — typing is
the next action there.

Also required: visible `focus-visible` rings. Today textareas and pills are
`focus:outline-none` with nothing in exchange; only the slider has a halo.
Spec: 2px `white/30` ring on panels, `white/50` on pills, offset 2px —
keyboard users must always see where they are.

## Studio — perfect experience

### Information architecture

Keep the as-built shape — left rail (identity dot + wordmark, then Workbench /
Library / History / Settings, hotkey hint pinned bottom) — it is the right IA.
Refinements:

- **Deep links stay first-class:** overlay Settings and tray Settings land on
  the Settings tab (as built via `STUDIO_SETTINGS`). Add `history` routing so a
  future overlay "Open in Studio" can land on the workbench with a session
  preloaded.
- **"Open in Studio" from the overlay** (new, P2): a menu item in ⋮ — not a
  footer button — that opens the workbench with the current Original/Output/
  model/level. This is the bridge for "why did it write this?" moments without
  putting explanation in the overlay.
- No Personas tab yet (product-vision keeps personas P2, managed inside
  Settings until they earn a rail slot). No credits/sync chrome (CONCEPT §7's
  top-bar credits are cloud-tier, deferred).

### Workbench layout

```
┌ rail ┬──────────────────────────────────────────────────────────────────┐
│ ●PF  │ [Opus 4.8 ⌄] [1 Cool|2 Warm|3 Hot|4 Max]        (Analyze)(Optimize)│
│ Work │──────────────────────────────────────────────────────────────────│
│ Libr │ ORIGINAL                        │ OPTIMIZED  [Hot] [+18 lift]     │
│ Hist │ mono 14px, editable             │ DiffView: adds ok-tinted with   │
│ Sett │                                 │ "+ Constraints" tag chips,      │
│      │ baseline score + weaknesses     │ removes struck; toggle:         │
│      │ footer (after Analyze)          │ [Diff | Clean] view             │
│      │─────────────────────────────────┴─────────────────────────────────│
│ ⌨ C-S-O │ (72px ScoreRing) [rubric chips…] persona · notes   (Copy)(Save) │
└──────┴──────────────────────────────────────────────────────────────────┘
```

Specifics the current build should grow into:

- **Level control carries the level colors.** The segmented control stays (a
  slider is wrong in a dense toolbar) but the active segment tints with the
  level color, matching the overlay label — one recognition system across
  surfaces.
- **Adherence, honestly labeled.** Replace the `Structuur: Hot` chip (Dutch —
  UI is English-only) with `Structure: Hot` — and when measured ≠ requested,
  show both: `Requested Max · Measured Hot` in warn. That gap is exactly what
  the user needs Studio for.
- **Diff/Clean toggle.** DiffView is the default; a Clean tab shows the
  optimized prompt as copyable text. Today the diff replaces the streamed text
  entirely once the result lands.
- **Streaming parity:** Studio streams into the mono `<pre>` with the same `▋`
  cursor — keep, but adopt the typewriter hook for consistency of feel.
- **Toasts, not `alert()`.** "Saved to library." and "Settings saved." become
  bottom-right toasts (ok variant, 3s). A blocking native dialog inside a
  polished workbench destroys the quality signal.

### Library, history, settings

- **Library:** as-built card list (title, model · L · score, tags, 2-line
  preview, search) is right. Add: click card → loads into workbench
  (Original+Optimized+model+level); delete gets an undo toast instead of
  instant removal. Tag chips filter on click.
- **History:** add the missing verb — **Re-run** (loads into workbench with
  current defaults) and **Copy out**. Rows stay one-line-scannable
  (`model · L · score · source · timestamp`). "clear" gets a confirm (it is the
  only destructive bulk action in the app).
- **Settings:** the as-built form (hotkey, default model/level, persona,
  context memory, telemetry, key management with secure-storage warning) is the
  right scope. Required fixes: (1) the key-section copy still says "Without a
  key, Anvyll uses the local fallback optimizer" — **false and
  trust-corrosive**; replace with "Without a key, optimization is unavailable —
  Anvyll never substitutes generic output." (2) Hotkey entry becomes a
  recorder (press the combo, it fills; free-text stays as fallback) with a
  conflict check. (3) Key save confirms via toast + masked "•••• stored ••••"
  state (exists) — never echo the key.

## System surfaces

- **Tray:** the only always-on presence — needs a real monochrome glyph (empty
  image today). Menu: `Refine clipboard` (runs the pipeline on clipboard text —
  cheap, high-utility), `Open Studio`, `Settings`, `Quit`. Tooltip
  "Anvyll — Ctrl+Shift+O".
- **Onboarding (first run only):** three glass cards in the overlay's own
  shell — (1) "Press Ctrl+Shift+O in any text field" with the hotkey rendered
  as keycaps; (2) "Pick the model you're sending to — Anvyll rewrites to
  *its* published methodology" with the six model marks; (3) guided try-it-now:
  a sample rough prompt pre-filled, user presses Enter, watches the stream,
  presses Apply into a demo field. API-key entry is step 0 if absent, with a
  paste field and a "get a key" link. Telemetry opt-in lives here, explicit,
  not buried.
- **Placement picker:** as-built monitor skeleton is exactly right (spatial
  choice rendered spatially). Selected zone retokens to accent; zones gain
  `focus-visible` rings and arrow-key movement.
- **Dev preview** (`#/overlay-preview`): keep — it is the design-review surface
  for this doc's specs.

## Accessibility

- [ ] Full keyboard path: hotkey → (focus lands per §Keyboard) → Enter →
      Enter → done, zero pointer events. Tab reaches every control in the
      documented order; Esc always exits.
- [ ] `focus-visible` rings on every interactive element (spec in §Keyboard);
      never `outline-none` without a replacement.
- [ ] Phase changes announced: an `aria-live="polite"` region mirrors
      "Capturing…" / "Refining…" / "Done — output ready" / error text. (Today
      only the Apply notice has `role=status`.)
- [ ] Slider: `role=slider` with valuemin/max/now/text (as built — keep);
      picker: `role=radiogroup` (as built — keep); ⋮ gains `aria-haspopup` +
      `aria-expanded` (expanded exists).
- [ ] Color never sole signal: levels pair color with the Cool/Warm/Hot/Max
      word; scores pair ring color with the number; diff pairs tint with
      +/struck styling and tag text.
- [ ] `prefers-reduced-motion`: instant text reveal (built), no pulse, springs
      reduced to opacity/position snaps.
- [ ] Min hit target 32px: the ⋮ button (24px SVG + padding) passes; slider
      track is 26px tall — its generous width compensates, but keep the whole
      132×26 area interactive (it is).
- [ ] Windows text scaling: overlay uses px throughout; at 125–150% display
      scaling Electron scales the window uniformly — verify the 578px card
      still fits the 720px window at 150% (it does: scaling is uniform), and
      test 200%.

## Responsive & platform notes

- **Multi-monitor:** placement resolves against the display nearest the cursor
  at hotkey time (as built) — the overlay follows the user's attention, not a
  remembered monitor. Snap coordinates come from `workArea` (taskbar-safe).
- **Window is fixed 720×520; card is content-sized.** No responsive overlay —
  it is an instrument, not a page. If output regularly exceeds 150px of
  height, the answer is the panel's own scrollbar (`scroll-thin`), never a
  growing window.
- **Transparent frameless window constraints:** no true acrylic blur of the
  desktop (Windows limitation — simulated frost is the design, not a
  compromise to apologize for); white-flash guard = opacity 0 → `showInactive`
  → renderer rAF ack → opacity 1 — a correctness handshake, invisible by
  design. `hasShadow: false`; the CSS drop shadow is the shadow.
- **No drag regions.** Placement is snap-only (five zones); no
  `-webkit-app-region: drag` anywhere — accidental drags would fight the
  frozen-target trust story and the resident-window lifecycle.
- **Studio** is a normal framed window: resizable, remembers size, standard
  chrome, min 960×600.

## Gap map: today's UI → perfect UI

| Area | Perfect | Current | Priority | Files |
|---|---|---|---|---|
| Keyboard focus after hotkey | Overlay focused once capture is delivered; Enter works immediately; Tab order defined | `showInactive`, never focused; shortcuts need a click (known memory note) | **P1** | `src/main/main.ts` (`deliverCaptureToOverlay`), `Overlay.tsx` |
| Capture-fail dead end | Compose mode: warn line + editable Original + Copy-primary | Warn panel only; no inputs; user must dismiss and retry | **P1** | `Overlay.tsx` |
| Focus visibility | `focus-visible` rings on panels/pills/menu/zones | `outline-none` everywhere except slider lane halo | **P1** | `index.css`, `Overlay.tsx` |
| Stale/false Settings copy | "Without a key, optimization is unavailable — never substituted" | Claims a local fallback optimizer that no longer exists | **P1** (trust) | `Studio.tsx` Settings |
| English-only UI | `Structure:` label; English tooltips | `Structuur:` chip + `guide-structuur` title in Studio | **P1** (cheap) | `Studio.tsx` |
| Tray icon | Real monochrome glyph, light/dark, tooltip | `nativeImage.createEmpty()` | **P1** | `src/main/main.ts`, assets |
| Onboarding | 3 glass cards + guided try-it-now + key step + telemetry opt-in | None | **P1** | new `Onboarding` view |
| Studio feedback | Toast system; undo on delete; confirm on History clear | `alert()` ×2; instant deletes | P2 | `Studio.tsx`, new `Toast` |
| Error → Settings deep-link | Missing-key error links "Open Settings →" in overlay | Error text only | P2 | `Overlay.tsx` |
| Adherence honesty | `Requested Max · Measured Hot` (warn when ≠) | Measured only, Dutch label | P2 | `Studio.tsx` |
| Workbench loop | Library/History rows load into workbench; Diff/Clean toggle; overlay "Open in Studio" ⋮ item | Read-only lists; diff replaces clean text | P2 | `Studio.tsx`, `Overlay.tsx`, IPC |
| Level color continuity | Studio level segments tinted with level colors | Accent-tinted segments | P2 | `Studio.tsx` |
| Accent token drift | Placement picker selected = accent | Raw indigo values | P3 | `index.css` |
| Hotkey recorder | Press-to-set recorder + conflict check | Free-text input | P3 | `Studio.tsx` Settings |
| Screen-reader phases | `aria-live` phase announcements | Apply notice only | P3 | `Overlay.tsx` |

## Anti-patterns (never ship)

- Black scrim / dimmed desktop behind the overlay.
- Any open/close animation on the shell, or a spinner between hotkey and text.
- Score ring, rubric chips, badges, or any meter in the overlay.
- Free-drag overlay, remembered pixel positions, or drag regions.
- Windows acrylic / `setBackgroundMaterial` on the overlay window; WebGL glass.
- Auto-refine on open, or auto-apply without an explicit Enter/Apply.
- Silent fallback output styled as success (errors are errors, in warn).
- Native `alert()`/`confirm()` anywhere; blocking dialogs in Studio.
- Dutch (or any non-English) strings in app UI.
- Emphasized/red Discard — leaving must never feel destructive.
- A second accent color, or level colors used decoratively at partial opacity.
- Toasts or notifications from the overlay after it has closed (the surface is
  gone; the clipboard message belongs to the reopened overlay only).

## Open questions

1. **Studio's visual kinship** — keep Studio deliberately matte/dense (this
   doc's stance) or pull one signature overlay element (glass rail? level
   spring?) into it for brand continuity? Risk: frost creep.
2. **Compose-mode scope** — is empty-capture compose (typing a prompt from
   scratch in the overlay) in v1, or does the overlay stay strictly
   capture-driven with Studio as the compose surface?
3. **Light theme** — the app is dark-only by design language; do Windows
   light-mode users get a light glass variant eventually, or is dark-only a
   permanent identity statement (Raycast-style)?
4. **Overlay height vs long prompts** — fixed 150px output with scroll is the
   instrument stance; is there a threshold (e.g. L4 Max multi-section prompts)
   where an expand-toggle (still fixed window, taller card) earns its place?
5. **`Refine clipboard` tray action** — high utility, but it introduces a
   second entry path with no capture target (Copy-only result). Worth the
   conceptual cost?
