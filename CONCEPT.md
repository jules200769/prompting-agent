# PromptForge — Product & Architecture Concept Document

> A Windows-native AI prompt optimization studio that rewrites ordinary prompts into
> model-specific, high-performance versions before they reach the AI — summoned by a global
> hotkey from any text box on the system.

**Status:** Concept v1.0 (market/vision) · Technical sections updated to **as-built v0.1** · Date: Jun 2026

> **Reading note.** Sections 1–4 (vision, market, competition, workflow) describe the original
> product thesis and still hold. Sections **5, 6, 8, and 13** have been rewritten to match what is
> actually built today: a **local-only Electron app** with a **single OpenAI rewrite model** and
> **prompting guides shipped as files** — not the original Tauri + cloud-backend design. Sections
> 7, 9–12 still describe the longer-term vision and are not yet implemented.

---

## Executive Summary

PromptForge is a desktop application that sits between the user and the AI model they are
prompting. The user writes a normal, unstructured prompt ("Improve my SaaS landing page."),
presses a global hotkey, and PromptForge rewrites that prompt according to the **official
prompt-engineering methodology of the specific target model** (Claude Opus 4.8, GPT-5,
Gemini 3, DeepSeek, Grok), then either injects the optimized prompt back into the original
text box or copies it to the clipboard.

The thesis is two-fold and defensible:

1. **Model-specific, not model-agnostic.** Every surviving competitor optimizes prompts into
   one "good" generic structure. But the published evidence is clear that prompting
   techniques are not portable: Anthropic, OpenAI, Google, DeepSeek, and xAI each publish
   distinct, frequently updated guidance. PromptForge treats each model's optimization
   framework as first-class, versioned, and auto-updating.
2. **Windows-native paste-anywhere hotkey.** The competitive field is macOS- and
   Chrome-extension-first. A true system-wide Windows overlay that works in ChatGPT Desktop,
   Cursor, VS Code, Notion, Word, browsers, and terminals is an open lane.

The timing is unusually clean: `PromptPerfect`, the category leader, is shutting down on
**September 1, 2026** ([PromptPerfect Alternative 2026: Best Replacement After Shutdown](https://promptitin.com/promptperfect-alternative), [PromptPerfect - AI Prompt Generator and Optimizer](https://promptperfect.jina.ai/)), leaving a documented, migrating user base actively looking for a replacement ([PromptPerfect Alternative — Migrate Before September 2026](https://www.promptai360.com/promptperfect-alternative)).

This document specifies the full product, architecture, schema, UX, roadmap, monetization,
MVP, scaling, risks, and implementation plan.

---

## 1. Product Vision

### One-liner
PromptForge turns any prompt into the best possible prompt for the model it is destined for,
instantly, from anywhere on Windows.

### North Star
> Every prompt a user sends to any AI is automatically shaped to that model's proven
> optimization framework — with zero friction and measurable, demonstrated lift in output
> quality.

### The two-axis thesis

```mermaid
flowchart LR
    subgraph market[Open Market Gap]
        A["Surviving competitors: model-agnostic optimization"]
        B["Surviving competitors: macOS + Chrome first"]
    end
    subgraph forge[PromptForge Defensible Wedge]
        C[Model-specific engines per provider]
        D[Windows-native global hotkey overlay]
    end
    A --> C
    B --> D
```

- **Axis 1 — Model specificity.** A Claude Opus 4.8 prompt, a GPT-5 prompt, and a Gemini 3
  prompt are not interchangeable. Each provider publishes and iterates its own framework
  ([8 Best Prompt Engineering Tools in 2026](https://orq.ai/blog/prompt-engineering-tools)).
  PromptForge maintains a versioned optimization engine per model and updates it as guidance
  evolves.
- **Axis 2 — Frictionless Windows capture.** No copy-paste round-trip to a web dashboard.
  A hotkey fires a floating overlay over whatever app has focus, captures the active text,
  optimizes, and returns the result in place.

### Target users (primary → secondary)
1. **Power users & prompt-curious professionals** — marketers, founders, analysts, writers
   who use multiple AI tools daily and know their prompts are weak but don't want to study
   prompt engineering.
2. **Developers & AI builders** — people who live in Cursor, VS Code, terminals, and AI
   playgrounds and want deterministic, high-quality prompts fast.
3. **Teams & agencies** — shared prompt libraries, consistent quality, brand/persona memory.

### Non-goals (explicit)
- Not an LLM provider. PromptForge does not answer the prompt; it only shapes it.
- Not a generic chat UI. The Studio is a prompt workbench, not a chat surface.
- Not model-agnostic. We will not collapse all engines into one "good enough" template.

---

## 2. Market Analysis

### Why now (timing)
- **PromptPerfect, the incumbent, shuts down September 1, 2026**, following Elastic's October
  2025 acquisition of Jina AI ([PromptPerfect Alternative 2026: Best Replacement After Shutdown](https://promptitin.com/promptperfect-alternative),
  [PromptPerfect - AI Prompt Generator and Optimizer](https://promptperfect.jina.ai/)). Its
  paying user base is being actively migrated by replacements offering 25% switch discounts
  ([PromptPerfect Is Shutting Down: What You Need to Know](https://www.promptai360.com/blog/promptperfect-shutting-down)).
- **Prompting is not a solved problem.** Every major provider publishes and updates its own
  guidance, meaning "good prompting" is a moving, model-dependent target — exactly the
  maintenance burden an auto-updating product offloads from users.

### Market sizing (rough, top-down)
- **TAM (Total Addressable Market):** Global users of generative AI assistants. With
  ChatGPT-scale active users in the hundreds of millions plus Claude/Gemini/Copilot users,
  the universe of people who prompt regularly is plausibly **300M+**. Even a tiny paid
  conversion is a large number.
- **SAM (Serviceable Available Market):** Windows users of AI tools who prompt in English and
  are willing to install a desktop utility. Windows is ~70% of desktop OS share; conservatively
  tens of millions of likely candidates.
- **SOM (Serviceable Obtainable Market, 24-month):** A realistic wedge of
  ~100K–500K activated free users and ~3–8% paid conversion → **3K–40K paying users** in the
  first two years, in line with comparable utility-pricing tools at ~$9–12/mo.

### Demand drivers
- Multiplication of frontier models (Claude Opus/Sonnet, GPT-5, Gemini 3, DeepSeek, Grok) —
  users juggle several and cannot track each one's best practices.
- Rising professional reliance on AI for revenue-generating work, where prompt quality
  directly affects output quality and time.
- The documented migration event from PromptPerfect creates a ready, searching audience.

### Trends working in favor
- Provider-published prompt guides are becoming more formal and more frequently revised.
- Desktop AI apps (ChatGPT Desktop, Cursor, Claude Desktop) normalize "AI as a local app,"
  creating room for adjacent desktop utilities.
- Users increasingly want **memory/persona/context** baked in, not just one-shot rewrites.

---

## 3. Competitive Analysis

The field splits into three camps. No incumbent combines **model-specific engines** with a
**Windows-native system-wide hotkey**. That intersection is PromptForge's lane.

### Camp A — Direct prompt enhancers (closest substitutes)

- **PromptAI (promptai360.com).** Chrome extension + macOS desktop app; enhances prompts
  inside ChatGPT/Claude/Gemini/Copilot/Perplexible; fine-tuned GPT-4.1 rewriter; from
  $7.99/mo; **explicitly model-agnostic** ("prompts are model-agnostic, so the same enhanced
  output works across every LLM"). macOS ⌘⇧P hotkey for Cursor/Claude Code/terminals
  ([PromptPerfect Alternative — Migrate Before September 2026](https://www.promptai360.com/promptperfect-alternative),
  [PromptPerfect Is Shutting Down: What You Need to Know](https://www.promptai360.com/blog/promptperfect-shutting-down)).
  *Gap we exploit: no Windows desktop app; model-agnostic by design, not model-specific.*
- **PromptItIn (promptitin.com).** Structured ROLE/CONTEXT/TASK/CONSTRAINTS/FORMAT framework;
  personalized memory; 5-dimension quality score; supports ChatGPT/Claude/Gemini/Grok/DeepSeek/Cursor;
  free 2/day, $9/mo Pro, $49/mo Team (5 seats); paste-anywhere
  ([PromptPerfect Alternative 2026: Best Replacement After Shutdown](https://promptitin.com/promptperfect-alternative)).
  *Gap: browser-/web-centric, single shared framework rather than per-provider engines, no
  native Windows hotkey capture.*
- **FlashPrompt.** Lightweight browser one-click enhancer; narrower model support and feature
  set ([PromptPerfect Is Shutting Down: What You Need to Know](https://www.promptai360.com/blog/promptperfect-shutting-down)).
  *Gap: shallow feature set, extension-only.*
- **AIPRM.** Community-rated prompt templates for ChatGPT only
  ([PromptPerfect Is Shutting Down: What You Need to Know](https://www.promptai360.com/blog/promptperfect-shutting-down)).
  *Gap: ChatGPT-only, template library not a live optimizer.*

### Camp B — Open-source / self-host

- **Prompt Optimizer (linshenkx).** Open-source desktop app + Chrome extension + Docker; MCP
  support for Claude Desktop; avoids browser CORS ([8 Best Prompt Engineering Tools in 2026](https://orq.ai/blog/prompt-engineering-tools),
  search synthesis). *Gap: technical setup, no managed cloud sync/billing, generic
  optimization, no Windows-native capture UX.*

### Camp C — Developer-facing prompt platforms (different buyer)

- **orq.ai, LangChain, Agenta, Promptmetheus, Helicone** — prompt management, testing,
  debugging, observability for teams shipping LLM apps ([8 Best Prompt Engineering Tools in 2026](https://orq.ai/blog/prompt-engineering-tools)).
  *Gap: built for engineers managing prompt pipelines in production, not for an end user
  who just wants a better prompt right now. Different persona, different surface.*

### Competitive gap matrix (textual)

- **Model-specific engines:** PromptAI no · PromptItIn partial (one framework) · FlashPrompt
  no · AIPRM no · Prompt Optimizer no · orq.ai n/a · **PromptForge YES.**
- **Windows-native system-wide hotkey:** PromptAI macOS-only · PromptItIn web/paste ·
  FlashPrompt extension · AIPRM extension · Prompt Optimizer desktop but generic · **PromptForge YES.**
- **Auto-updating optimization frameworks (AI Research Mode):** all competitors manual/stale ·
  **PromptForge YES (reviewed).**
- **Quality score + diff comparison view:** PromptItIn has scoring; others minimal ·
  **PromptForge YES (full diff + rubric).**
- **Persona/context memory:** PromptItIn yes; others minimal · **PromptForge YES.**

### Differentiation risk
The differentiation is real but not patentable. The moat is **execution speed on the
auto-updating, model-specific engine packs plus a polished Windows capture UX**, reinforced
by switching costs from saved prompt libraries and persona memory.

---

## 4. User Workflow

### Two surfaces, one engine

1. **Floating overlay** — the primary, fast surface (the killer feature).
2. **Studio** — the full workbench for analysis, comparison, persona management, library.

### Primary flow: hotkey → optimize → inject

The user is typing a prompt into any text box (ChatGPT Desktop, Cursor, a browser, Word,
Notion, a terminal). The primary capture path reads the focused field's value through the
**Windows UI Automation `TextPattern`** API (driven by PowerShell helper scripts), with a
**clipboard copy fallback** when UIA cannot read the field. Apply writes the optimized text
back via UIA `ValuePattern`/`TextPattern` (or a paste cascade), and terminals are
**copy-only** ([How do I get the selected text from the focused window using native Win32 API?](https://stackoverflow.com/questions/2251578/how-do-i-get-the-selected-text-from-the-focused-window-using-native-win32-api)).

```mermaid
sequenceDiagram
    participant U as User
    participant App as Focused App (any)
    participant HK as Electron globalShortcut
    participant Main as Electron Main (Node)
    participant PS as PowerShell + UIA (koffi)
    participant Eng as Local Engine (src/engine)
    participant API as OpenAI (gpt-4.1-mini)

    U->>App: Types a rough prompt
    U->>HK: Presses Ctrl+Shift+O (global)
    HK->>Main: fires event (hotkeySnapshot)
    Main->>PS: capture focused field (UIA TextPattern)
    PS-->>Main: original prompt + field metadata
    Main->>Main: show floating overlay (model + level)
    U->>Main: edits text / picks model + level / clicks Refine
    Main->>Eng: optimize(prompt, model, level, persona)
    Eng->>Eng: load prompting-guide excerpt (model x level)
    alt OpenAI API key present
        Eng->>API: rewrite (streaming, plain text)
        API-->>Eng: optimized prompt text
    else no key
        Eng->>Eng: localOptimizer template fallback
    end
    Eng->>Eng: strip artifacts; score locally via rubric.ts
    Eng-->>Main: plain optimized prompt (overlay), score (Studio)
    U->>Main: choose Apply (or Copy)
    Main->>PS: inject optimized text (ValuePattern / paste)
    PS->>App: replaces text in box
    Main->>Main: persist to local JSON store (history + LRU cache)
```

### Edge cases handled in the flow
- **No selection / empty clipboard after Ctrl+C** → overlay opens in "compose" mode so the
  user can type or paste a prompt directly.
- **Secure input fields that block synthetic input** (some password/protected boxes) → fall
  back to **Copy to clipboard** and show a toast; never fail silently.
- **Clipboard clobber** → snapshot the user's clipboard before the simulated copy and restore
  it after injection, so we don't destroy what they had copied.
- **Debounce** → ignore rapid re-trigger of the hotkey; if the overlay is already open, the
  same hotkey dismisses it.
- **Hotkey conflict** → user-reassignable; detect collisions with common apps at startup.

### Studio flow (deliberate workbench)
1. Open Studio from tray or hotkey variant.
2. Paste or load a prompt from library.
3. Run **Analyze** → quality score (1–100) + rubric breakdown + detected weaknesses.
4. Pick target model + optimization level (1–4) → **Optimize**.
5. View **Original vs Optimized** side-by-side diff with highlighted improvements.
6. Edit optimized prompt, save to library with tags, or copy/inject.
7. Manage **personas** and **context memory** (job, audience, tone) applied automatically.

---

## 5. Technical Architecture

> **As-built (v0.1).** The shipping app is a **single-process Windows Electron app with no
> cloud backend.** Optimization, scoring, guides, and storage all run locally on the client.
> The cloud-backend / Tauri design below the original v1.0 vision is retained in §11 (Scaling)
> as a future direction, not current reality.

### Framework: Electron + Vite + React/TypeScript

The app is built on **Electron 32** with a **Vite + React 18 + TypeScript + Tailwind**
renderer (SWC plugin). It is **Windows-only**. The codebase is organised into four areas:

- `src/main` — Electron main process (Node): window/overlay/tray lifecycle, global hotkey,
  capture/inject orchestration, native Win32 calls, local storage, encrypted key store.
- `src/renderer` — React UI for the overlay and the Studio (Studio is lazy-loaded as a
  separate chunk).
- `src/engine` — the optimization engine: prompt-packs, guide loader, rubric/scoring, diff,
  provider call, local-fallback optimizer, orchestrator.
- `src/shared` — types and IPC channel names shared across processes; capture/terminal
  resolution helpers.
- `src/preload` — the contextIsolated bridge exposing a small, explicit IPC surface to the
  renderer.

Electron (over the originally-planned Tauri) was chosen pragmatically: the capture/inject
path depends on **Windows UI Automation** invoked from Node via PowerShell helper scripts and
`koffi` FFI, and a zero-native-dependency JSON store avoids native-ABI rebuild pain.

### Component diagram (as-built)

```mermaid
flowchart TB
    subgraph Client[Windows Client — Electron]
        UI["React UI: Overlay + Studio (Vite)"]
        Preload["Preload bridge (contextIsolation)"]
        Main["Main process (Node)"]
        HK["globalShortcut (Ctrl+Shift+O)"]
        Win32["win32.ts via koffi + PowerShell scripts"]
        Tray["System Tray"]
        Keys["keyStore: OS Credential Manager"]
        Store["Local JSON store (userData)"]
        Engine["Engine: packs + guideLoader + rubric + diff"]
        UI -- IPC --> Preload
        Preload -- ipcMain --> Main
        Main --> HK
        Main --> Win32
        Main --> Tray
        Main --> Keys
        Main --> Store
        Main --> Engine
    end

    subgraph Files[Bundled data files]
        Guides["prompting-guides/*.md"]
        Packs["src/engine/packs.ts (metadata)"]
    end

    subgraph Ext[External]
        OpenAI["OpenAI API (gpt-4.1-mini)"]
    end

    Engine --> Guides
    Engine --> Packs
    Engine -->|HTTPS, only if key set| OpenAI
```

### Main-process responsibilities (`src/main`)
- Register the global hotkey (`Ctrl+Shift+O`, reassignable) via Electron `globalShortcut`.
- On trigger: `hotkeySnapshot()` → capture the focused field via UIA `TextPattern`
  (PowerShell `win-hotkey-snapshot.ps1` / `win-capture.ps1`), with clipboard fallback;
  poll the foreground window via `GetForegroundWindow` (`win32.ts`, koffi).
- Detect terminal hosts (`terminalDetect.ts`) and switch to **copy-only** terminal mode.
- Manage overlay window (frameless, transparent, draggable, position-persisted) and the
  lazy Studio window; system tray with Settings/Quit.
- Run optimization in-process via the engine; stream plain text to the overlay.
- **Apply**: inject optimized text back via UIA `ValuePattern`/`TextPattern`/paste cascade
  (`win-inject.ps1`); terminals route Apply to clipboard only.
- Store the OpenAI API key encrypted in the **Windows Credential Manager** (`keyStore`);
  never in plaintext config. Only the prompt text is sent to the rewrite API — UIA metadata
  (`runtimeId`/`className`/`bounds`) stays local.
- Persist settings, library, history, and an LRU optimization cache to a local JSON file in
  `userData` (`storage.ts`).

### No backend (today)
There is **no API gateway, auth service, billing, sync engine, Postgres, or Redis**. The
original cloud design (versioned pack registry served over a CDN, managed credits, OAuth,
CRDT sync, AI Research Pipeline) is **not implemented** and lives in §11/§12 as future scope.
Everything the app needs ships inside the client bundle.

### One rewrite model for all targets (key as-built decision)
The **target-model picker only selects which prompting methodology is applied** — it does
**not** route to that provider. A **single rewrite model, OpenAI `gpt-4.1-mini`**
(`REWRITE_CONFIG`, temperature fixed at `0.3`), performs every rewrite regardless of target.
The decoupling is explicit in `rewrite.ts` (`rewriteProviderForTarget()` always returns
OpenAI). Settings therefore expose a **single OpenAI API key**. If no key is present, the
engine falls back to `localOptimizer.ts` (per-model templates, no network call).

### Engines as data: prompting guides + packs (as-built)
"Model specificity" is delivered by **two local data sources**, not a cloud registry:

- **`prompting-guides/*.md`** — the source of truth per target model: `opus4.8.md`,
  `gpt5.5.md`, `gemini.3.pro.md`, `deepseek.V3.md`, `grok4.md`, `composer2.5.md`.
  `guideLoader.ts` loads the file for the chosen model and extracts a **level-sized excerpt**
  (char budget per level: L1 3000 → L4 12000), preferring sections whose headings match
  level-relevant keywords.
- **`src/engine/packs.ts`** — per-model metadata: `system_prompt`, a UI-facing `methodology`
  bullet list, the scoring `rubric`, `exemplars`, an output-schema hint, and
  `level_overrides` (token budgets / depth notes).

Updating a model's methodology is editing a markdown file — no client release needed for
guide-text changes, and PowerShell capture/inject scripts are likewise read fresh at runtime.
Adding a new target model means adding a guide file plus a `ModelId` entry. (Note: the model
list and ids in `types.ts` — e.g. `gpt-5` mapped to the `gpt5.5.md` guide — are an internal
inconsistency worth tidying.)

### Optimization Levels (1–4) — guide-structure adherence scale
Levels here are **not** "number of LLM calls" or a self-critique depth dial. They set **how
strictly the model-specific guide structure is applied**, labelled **Cool / Warm / Hot / Max**
(`LEVEL_LABELS`), via `getLevelRewriteInstruction()`:

- **L1 Cool** — minimal rewrite: fix typos/ambiguity, keep the user's sentences and order,
  lightest guide formatting only.
- **L2 Warm** — light model-native structure (e.g. XML tags for Claude, markdown headers for
  GPT); preserve all content, reorganise slightly. **Default.**
- **L3 Hot** — full guide-compliant structure (context, task, constraints, output format),
  bracketed placeholders only where the user left gaps.
- **L4 Max** — complete guide methodology including examples, verification/success criteria,
  and advanced patterns from the guide.

Every level uses the same single rewrite call at the same fixed temperature; the level changes
the **guide excerpt size and the rewrite instruction intensity**, not the model or the call
count. The **measured** guide-structure adherence of the result is computed locally by
`adherenceLevel()` in `rubric.ts` from the structure subscores.

### Output & scoring (as-built)
- The **overlay shows plain refined prompt text only** — no JSON, no score ring, no rubric
  chips. Artifacts from the LLM are stripped by `stripResponseArtifacts()` (`cleanRewrite.ts`).
- The **1–100 score and per-dimension subscores are computed locally** in `rubric.ts`
  (baseline vs optimized); the diff is built locally in `diff.ts`. Score and diff surface in
  the **Studio**, not the overlay.

### Performance & efficiency targets (as-built)
- Overlay reveal is tuned for an "instant feel" (~50–150ms pre-reveal acceptable); a warmup
  (`ps-warmup.ps1`, `primeOverlayBuffer()`) reduces first-hotkey PowerShell/UIA cold start.
- Streaming so the user sees the rewrite appear progressively.
- **Identical-input caching**: hash of `(model|level|persona|prompt)` → slim LRU cache
  (cap 100) in the local JSON store; the diff is rebuilt on read.
- Memory hygiene: `spellcheck: false`, overlay `backgroundThrottling: false`, Studio
  throttled and nulled on close.

---

## 6. Database Schema

> **As-built (v0.1).** There is **no SQL database** — neither client SQLite nor cloud
> Postgres. All persistence is a **single local JSON document** plus the OS Credential
> Manager for the API key. The relational schema below is retained as the **future
> cloud/sync data model** (needed once accounts, billing, and multi-device sync exist), not
> as what ships today.

### As-built storage

| Concern | Where | Detail |
|---|---|---|
| Settings, library, history, opt cache | `promptforge.store.json` in Electron `userData` | Single JSON file via `src/main/storage.ts` (`readFileSync`/`writeFileSync`). Chosen to avoid native-ABI rebuilds. |
| OpenAI API key | Windows Credential Manager | Encrypted, via `keyStore`. Settings store only a presence flag. |
| Prompting guides | `prompting-guides/*.md` (bundled) | Read-only at runtime by `guideLoader.ts`. |
| Pack metadata | `src/engine/packs.ts` (bundled) | Compiled into the app, not a DB row. |

The persisted JSON document (`StoreShape`) holds: `settings`, `library` (`LibraryItem[]`),
`history` (`HistoryItem[]`, capped at 500), and `optCache` — a slim LRU map (cap **100**) keyed
by `hash(model|level|persona|prompt)`. Cache entries omit the `diff` array (rebuilt on read via
`buildDiff`) to keep the file small. Local types live in `src/shared/types.ts`
(`AppSettings`, `LibraryItem`, `HistoryItem`, `OptimizeResult`, `SubScores`, `DiffSegment`).

### Future cloud/sync data model (not implemented)

The relational schema for the eventual managed backend (accounts, subscriptions, credits,
versioned packs, BYOK, sync state):

```mermaid
erDiagram
    USERS ||--o{ PROMPTS : owns
    USERS ||--o{ PERSONAS : owns
    USERS ||--o{ USAGE_EVENTS : incurs
    USERS ||--o{ SUBSCRIPTIONS : has
    USERS ||--o{ API_KEYS_BYOK : holds
    PROMPTS ||--o{ OPTIMIZATIONS : optimized_by
    OPTIMIZATIONS ||--|| ANALYSIS_REPORTS : has
    OPTIMIZATIONS }o--|| PROMPT_PACKS : uses
    PROMPT_PACKS ||--o{ PACK_VERSIONS : versioned_as
    PERSONAS ||--o{ OPTIMIZATIONS : applied_to
    SUBSCRIPTIONS ||--o{ CREDIT_LEDGER : draws
    USAGE_EVENTS }o--|| CREDIT_LEDGER : settles
    USERS ||--o{ SYNC_STATE : tracked_by

    USERS {
        uuid id PK
        text email UK
        text oauth_subject
        timestamptz created_at
        text tier
    }
    PROMPTS {
        uuid id PK
        uuid user_id FK
        text original_text
        text title
        text[] tags
        timestamptz created_at
        timestamptz updated_at
        int version
    }
    OPTIMIZATIONS {
        uuid id PK
        uuid prompt_id FK
        uuid pack_version_id FK
        text target_model
        int level
        text optimized_text
        int score
        jsonb diff
        uuid persona_id FK
        int tokens_in
        int tokens_out
        timestamptz created_at
    }
    ANALYSIS_REPORTS {
        uuid id PK
        uuid optimization_id FK
        int score
        jsonb rubric
        jsonb weaknesses
        jsonb suggestions
    }
    PROMPT_PACKS {
        uuid id PK
        text provider
        text model_id
        text name
        bool published
    }
    PACK_VERSIONS {
        uuid id PK
        uuid pack_id FK
        int semver_major
        int semver_minor
        jsonb system_prompt
        jsonb rubric
        jsonb exemplars
        jsonb output_schema
        jsonb level_overrides
        timestamptz published_at
    }
    PERSONAS {
        uuid id PK
        uuid user_id FK
        text name
        text role
        text context
        text tone
        text audience
    }
    USAGE_EVENTS {
        uuid id PK
        uuid user_id FK
        text event_type
        jsonb payload
        timestamptz at
    }
    SUBSCRIPTIONS {
        uuid id PK
        uuid user_id FK
        text plan
        timestamptz renews_at
        text status
    }
    CREDIT_LEDGER {
        uuid id PK
        uuid user_id FK
        int delta
        text reason
        timestamptz at
    }
    API_KEYS_BYOK {
        uuid id PK
        uuid user_id FK
        text provider
        text encrypted_key
        timestamptz rotated_at
    }
    SYNC_STATE {
        uuid id PK
        uuid user_id FK
        text entity_type
        text entity_id
        int vector_clock
        timestamptz local_updated_at
        timestamptz cloud_updated_at
    }
```

### Notes
- Today the API key is stored only in the **client OS Credential Manager** (BYOK-style, no
  server). The `API_KEYS_BYOK` table above applies only to the future managed backend.
- In the future model, `OPTIMIZATIONS.diff` is a JSON patch for the Studio diff; today the
  diff is computed on the fly by `diff.ts` and never persisted (cache rebuilds it on read).
- In the future model, `PACK_VERSIONS` is immutable once published; today "pack versions" are
  string constants in `packs.ts` shipped with the build.

---

## 7. UI / UX Design

### Design language
- **Aesthetic:** quiet, fast, premium-utility. Dark-first, glassy floating overlay, high
  contrast, restrained accent color (single brand hue). Think Raycast/Linear polish, not a
  busy dashboard.
- **Motion:** overlay springs in (~120ms), results stream into place, no jank. Respect
  `prefers-reduced-motion`.
- **Density:** overlay is sparse and glanceable; Studio is denser and information-rich.

### The floating overlay (primary surface)
A small, borderless, always-on-top window anchored near the caret/cursor:

- **Top row:** target model picker (Claude Opus 4.8, Claude Sonnet, GPT-5, Gemini 3, DeepSeek,
  Grok) + optimization level segmented control (1 2 3 4).
- **Middle:** original prompt (collapsed, one line) → optimized prompt (streaming in,
  monospace-ish).
- **Quality score ring:** 1–100 with rubric chips (clarity, context, constraints, format,
  examples, persona) color-coded.
- **Actions:** `Inject` (primary), `Copy`, `Edit`, `Open in Studio`, `Dismiss`.
- **Keyboard-first:** Tab between model/level, Enter to inject, Esc to dismiss, `1–4` to set
  level instantly. Mouse optional.

### The Studio (full workbench)
- **Left rail:** Library (tagged, searchable, versioned prompts), Personas, History, Settings.
- **Center:** the workbench — Original | Optimized split with a **highlighted diff** (added
  structure, added persona, added constraints, added output format all color-tagged).
- **Right panel:** Analysis (score + rubric + detected weaknesses + suggestions) and the
  auto-generated **Persona** with a one-click "apply to all" toggle.
- **Top bar:** model + level, persona selector, sync status, credits remaining.

### Comparison / diff view
- Side-by-side and unified-diff toggle.
- Improvements annotated inline: "+ Role/persona", "+ Constraints", "+ Output format",
  "+ Example", "Reordered for clarity". Each tag is clickable to explain why (ties into the
  "learn-as-you-go" idea competitors like PromptItIn use
  ([PromptPerfect Alternative 2026: Best Replacement After Shutdown](https://promptitin.com/promptperfect-alternative))).

### Auto Persona Generation
- On optimize, the engine proposes the best expert role. Example transformation:
  - Before: "Help me improve my landing page."
  - Auto persona: "You are a world-class SaaS conversion optimization specialist with
    expertise in UX, copywriting, behavioral psychology, and CRO."
- Personas are saved, reusable, and can be set as a persistent default with context memory
  (job, goals, audience, tone) — matching the memory layer users now expect
  ([PromptPerfect Alternative 2026: Best Replacement After Shutdown](https://promptitin.com/promptperfect-alternative)).

### System tray & onboarding
- Tray icon: quick actions (Open Studio, New optimization, Settings, Quit) + credits badge.
- First-run onboarding: 3 slides (capture model, model-specific thesis, hotkey), then a
  guided "try it now" that fires the overlay on a sample prompt. Telemetry opt-in here, not
  buried.

### Accessibility
- Full keyboard navigation; overlay is screen-reader-announced; scores have text alternatives
  not just color; min touch target 32px; respects system theme and scaling.

---

## 8. Feature Roadmap

### Done — as-built v0.1 (local-only Electron app)
- Electron shell; **global hotkey `Ctrl+Shift+O`**; tray (Settings, Quit); transparent,
  draggable, position-persisted overlay; lazy-loaded Studio.
- **Windows UIA capture/inject** via PowerShell + `koffi` (`TextPattern`/`ValuePattern`,
  paste cascade); clipboard fallback; **terminal copy-only** mode with host detection.
- **6 target-model guides** (Claude Opus 4.8, GPT-5/5.5, Gemini 3 Pro, DeepSeek V3, Grok 4,
  Composer 2.5) as `prompting-guides/*.md` + `packs.ts` metadata.
- **Levels 1–4 as a guide-structure adherence scale** (Cool/Warm/Hot/Max).
- **Single OpenAI `gpt-4.1-mini` rewrite** for all targets; `localOptimizer` template
  fallback when no key; plain-text streaming output.
- Local JSON store: settings, library, history, LRU opt-cache; API key in OS Credential
  Manager; local rubric scoring + diff (surfaced in Studio).

### Next — close the MVP gaps (§10)
- Studio polish: full Original↔Optimized diff/comparison, analysis/rubric panel.
- Onboarding flow + first-run "try it now"; telemetry opt-in.
- Tidy model ids in `types.ts` (e.g. `gpt-5` vs the `gpt5.5.md` guide) and the §7 overlay
  model list (drop the non-existent "Claude Sonnet", surface Composer 2.5).
- Saved/reusable personas + persistent context memory applied automatically.

### Later — vision items (require a backend; not started)
- Accounts/auth, managed credits + free tier + Pro/Team, cloud sync of the library.
- AI Research Mode (doc watchers → human-reviewed guide/pack updates) and an eval harness.
- Plugin architecture / third-party packs, MCP integration
  ([8 Best Prompt Engineering Tools in 2026](https://orq.ai/blog/prompt-engineering-tools)),
  public API, marketplace, enterprise (SSO, audit logs, data residency).
- Per-provider rewrite routing (use each target's own LLM) instead of one rewrite model.
- macOS port (Windows-first remains); optional local inference for a privacy tier.

---

## 9. Monetization Strategy

### Tiers
- **Free:** 3–5 optimizations/day, Levels 1–2 only, 2 models, local library, no sync. A real,
  useful tier that drives adoption and virality.
- **Pro (~$9–12/mo, annual discount):** unlimited optimizations, all models, Levels 1–4,
  cloud sync, personas + memory, diff/Studio. Anchored to competitor pricing: PromptItIn
  $9/mo Pro, PromptAI $7.99/mo
  ([PromptPerfect Alternative 2026: Best Replacement After Shutdown](https://promptitin.com/promptperfect-alternative),
  [PromptPerfect Alternative — Migrate Before September 2026](https://www.promptai360.com/promptperfect-alternative)).
- **Team (~$49/mo, 5 seats, then per-seat):** everything in Pro + shared library, roles,
  billing centralization. Matches PromptItin's Team $49/5-seat anchor
  ([PromptPerfect Alternative 2026: Best Replacement After Shutdown](https://promptitin.com/promptperfect-alternative)).
- **BYOK mode:** users supply their own provider keys; pay a small platform fee (~$3–5/mo) or
  a metered rate instead of per-optimization credits. Their token spend is their own.
- **Credits add-on:** for free users who occasionally exceed the cap, or Pro users who want
  L4 bursts.

### Cost model (per optimization)
Managed mode cost is dominated by provider token spend. Illustrative economics (subject to
provider pricing changes):

- **L1:** ~1.5K tokens in/out blended → est. **~$0.005** per optimization.
- **L2:** ~3K tokens → **~$0.01**.
- **L3:** ~7K tokens (2 calls) → **~$0.02**.
- **L4:** ~15K tokens (optimize + critique + refine) → **~$0.05**.

If an average paying user runs ~150 optimizations/month weighted toward L1–L2, blended COGS
is roughly **$1.50–2.50/user/month**. At $9–12/mo Pro, **gross margin ≈ 75–85%**, with BYOK
users essentially free to serve (near-zero COGS, small platform fee). L4 heavy users are the
margin risk — mitigated by level-based credit costs and soft caps.

### Revenue logic
- Land via Free; convert via daily-cap friction and the visible quality score (users *see*
  their prompt jump from 42 → 91 and want more).
- Team expansion via shared library network effects.
- BYOK captures the price-sensitive power-user segment that would otherwise churn, at near
  zero COGS.

### Migration play
Time the launch and a "switch from PromptPerfect" onboarding flow to the September 2026
shutdown window; offer a migration import for exported PromptPerfect libraries
([PromptPerfect Is Shutting Down: What You Need to Know](https://www.promptai360.com/blog/promptperfect-shutting-down)).

---

## 10. MVP Scope

### In (the smallest lovable product)
- Windows Tauri app: global hotkey, clipboard capture, inject-or-copy, tray, secure storage.
- Overlay: model picker (4 models), Level 1–2 selector, quality score, Copy + Inject.
- Backend: Optimization Engine for 4 models × 2 levels, prompt-pack registry, streaming,
  auth, managed credits + free tier + Pro, BYOK toggle.
- Analysis + 1–100 score with rubric chips (in the overlay, compact).
- Local library + history; cloud sync of library only.
- Onboarding + telemetry opt-in + a "switch from PromptPerfect" import.

### Out (deliberately deferred from MVP)
- Levels 3–4 (expert/maximum) — later.
- The full Studio diff/comparison view — MVP shows score + result in overlay only.
- Auto Persona Generation as a saved, reusable library — MVP auto-generates inline only.
- AI Research Mode — later.
- Team plan, marketplace, plugins, public API, macOS — later.
- Local/offline inference — later.

### MVP success criteria
- Hotkey→inject in **<2s** for L1–L2 at p95.
- At least one model where the eval harness shows optimized prompts beat baseline by a
  measurable margin (the core credibility proof).
- Free→Pro conversion ≥ 3%.
- Day-7 retention ≥ 25% for activated free users.

---

## 11. Scaling Plan

### Infrastructure
- Stateless Engine Service behind a load balancer; autoscale on WebSocket connections and
  provider rate limits.
- Prompt-pack Registry behind a CDN; clients cache locally and revalidate via ETag/version.
- Postgres for accounts/library/billing (managed, read replicas for library reads).
- Redis for: identical-input result cache, rate limiting, session store, streaming fan-out.
- Per-provider outbound proxy pool to manage rate limits and failover across regions.

### Cost & latency levers
- **Input-hash caching:** identical `(prompt, model, level, persona)` returns cached result —
  huge for repeat power users and template-driven workflows.
- **Level-based model routing:** L1 may use a cheaper/faster model for the rewrite than L4,
  cutting COGS without hurting perceived quality.
- **Regional inference:** route to nearest provider region; cache packs at edge.
- **Streaming everywhere** so perceived latency is far below actual latency.

### Quality scaling — the Eval Harness (critical)
Scaling the *product* means scaling *engine quality* without regressions. The eval harness is
a first-class system:

- A curated benchmark set of weak prompts with reference "good" optimized prompts per model.
- For each candidate prompt-pack version: run the benchmark, score outputs on a rubric
  (clarity, structure, constraints, format, examples, persona), and compare against the
  incumbent pack and against a baseline unoptimized prompt fed to the target model.
- **Promotion gate:** a new pack version only ships if it beats the incumbent on the rubric
  *and* demonstrates real downstream lift (optimized prompt → target model produces a
  better-rated answer than the original prompt → target model).
- This is also the answer to the hardest risk (§12): proving model-specific optimization is
  actually better, not just longer.

### Organizational scaling
- Phase 0–1: 1 founder/PM + 1 Rust/client eng + 1 backend eng + 1 prompt-engineer/eval
  (contractor ok).
- Phase 2: +1 frontend/design, +1 backend, +1 eval/quality.
- Phase 3+: platform team, partnerships with providers.

---

## 12. Risks and Challenges

1. **"Is model-specific actually better?" (existential).** The whole thesis rests on
   model-specific packs outperforming a single generic optimizer. Mitigation: the Eval Harness
   (§11) must prove measurable downstream lift before launch, and be the promotion gate for
   every pack change. If we can't prove it, we reposition — but the eval is what makes the
   claim credible to users and investors.

2. **Provider API & pricing churn.** Models, pricing, and best practices change constantly
   (the PromptPerfect shutdown itself shows how fast this space moves
   ([PromptPerfect - AI Prompt Generator and Optimizer](https://promptperfect.jina.ai/)).
   Mitigation: provider abstraction layer; prompt-packs-as-data; AI Research Mode; level-based
   cost controls; BYOK as a hedge against any single provider's pricing shock.

3. **Cost blowout on L4 / heavy users.** Self-critique loops are expensive. Mitigation:
   credit-cost per level, soft caps, BYOK, input caching, cheaper-model routing for L1–L2.

4. **Synthetic input blocking.** Some apps and secure fields block simulated keystrokes, so
   inject-in-place can fail ([I Built a Local Voice-to-Text App with Tauri 2.0](https://dev.to/auratech/i-built-a-local-voice-to-text-app-with-rust-tauri-20-whispercpp-and-llamacpp-heres-how-32h5)).
   Mitigation: graceful Copy-to-clipboard fallback + toast; never fail silently; maintain a
   compatibility list and per-app injection strategies.

5. **Security of keys & prompts.** Handling user API keys and potentially sensitive prompts.
   Mitigation: OS Credential Manager for keys; encryption in transit and at rest; no prompt
   content stored server-side without explicit consent; telemetry opt-in; BYOK keys kept
   client-side by default; allowlist IPC; regular security review.

6. **Competitor fast-follow.** Model-specificity and a Windows hotkey are copyable.
   Mitigation: speed of the auto-updating pack pipeline, eval-gated quality, switching costs
   via library/persona memory, and brand built around "the model-specific one."

7. **Tauri cross-platform rendering variance.** OS webview differs across platforms
   ([I Built a Local Voice-to-Text App with Tauri 2.0](https://dev.to/auratech/i-built-a-local-voice-to-text-app-with-rust-tauri-20-whispercpp-and-llamacpp-heres-how-32h5)).
   Mitigation: Windows-first MVP; defer macOS; keep UI simple and resilient; test on WebView2
   explicitly.

8. **Dependency on third-party LLMs for the core function.** If a provider blocks
   meta-prompting or changes ToS, the engine for that model is at risk. Mitigation: BYOK
   shifts the relationship to the user; multiple provider backends; the rewrite LLM need not
   be the same as the target model.

9. **Clipboard UX friction.** The capture flow briefly clobbers the clipboard. Mitigation:
   snapshot/restore; debounce; clear visual state; compose-mode fallback when nothing is
   selected.

10. **Trust / "did it actually improve?"** Users can't easily tell if an optimized prompt is
    better until they run it. Mitigation: the visible score + diff + the "explain every
    change" pattern users like in competitors
    ([PromptPerfect Alternative 2026: Best Replacement After Shutdown](https://promptitin.com/promptperfect-alternative)),
    plus optional before/after answer comparison in the Studio.

---

## 13. Implementation Plan

### Milestone sequence

**Done (as-built v0.1):**
- **M0 — Capture spike (the riskiest unknown), done first.** Electron shell, global hotkey,
  and Windows UIA capture/inject via PowerShell + `koffi`, with clipboard fallback and
  terminal copy-only mode. Foreground-window polling, warmup to kill first-hotkey latency.
- **M1 — Engine, local.** In-process optimization engine: 6 model guides as files, level-based
  excerpting, single OpenAI `gpt-4.1-mini` rewrite + `localOptimizer` fallback, plain-text
  streaming, local rubric scoring + diff, LRU cache.
- **M2 — Surfaces.** Overlay (model picker, Cool/Warm/Hot/Max level slider, Refine, Apply/Copy,
  Discard; draggable, position-persisted) and lazy Studio. Settings with a single OpenAI key
  stored in the OS Credential Manager. Local library + history.

**Remaining to a shippable MVP:**
- **M3 — Studio + onboarding.** Full diff/comparison + analysis panel in Studio; first-run
  onboarding and "try it now"; telemetry opt-in; tidy model ids and the overlay model list;
  Windows signing + NSIS packaging + auto-update; p95 latency + security pass.

**Vision (needs a backend, not started):**
- **M4+ — Managed tier.** Accounts/auth, managed credits + free tier + Pro/Team, cloud sync,
  PromptPerfect migration import, timed near the Sept 2026 shutdown window
  ([PromptPerfect Alternative — Migrate Before September 2026](https://www.promptai360.com/promptperfect-alternative)).
- **M5+ — Quality & platform.** AI Research Mode + eval harness, per-provider rewrite routing,
  plugins/MCP, public API, marketplace, enterprise, macOS port.

### Build principles (as-built)
- Prove the riskiest unknown (system-wide Windows capture) first — done in M0.
- Guides-as-files, packs-as-data — never hardcode a model's methodology in UI code; guide and
  PowerShell scripts are read fresh at runtime (no rebuild for text edits).
- Ship the overlay first (it is the wedge); Studio second.
- Local-first and key-optional: the app degrades to `localOptimizer` with no network/API key.
- Keep prompt content the only thing sent to the rewrite API; UIA metadata stays local.

### Reality vs. original plan
- **Stack:** Electron (not Tauri/Rust); local JSON store (not SQLite/`sqlx`).
- **Backend:** none yet (no auth/billing/sync/registry); the engine runs in the client.
- **Rewrite:** one OpenAI model for all targets (not per-provider LLM routing).
- **Levels:** a guide-adherence scale (Cool/Warm/Hot/Max), not a call-count/self-critique dial.
- **Eval harness / AI Research Mode:** not yet built — still the key open risk in §12.

---

## Appendix A — Prompt Analysis Rubric (the 1–100 score)

Six dimensions, weighted:

- **Clarity & specificity (25):** is the task unambiguous?
- **Context (20):** background, audience, constraints provided?
- **Structure (15):** organized, separable instructions?
- **Output format (15):** is the desired response shape specified?
- **Examples / evidence (10):** few-shot or reference examples included?
- **Persona / role (10):** expert role set?
- **Verifiability (5):** success criteria / checks defined?

Each scored 0–full; summed to 100. The engine emits per-dimension sub-scores and a weakness
list (e.g., "missing output format", "no examples", "vague task"), which drive both the score
and the highlighted improvements in the diff view.

## Appendix B — Example prompt-pack shape (Claude Opus 4.8, L2)

```json
{
  "pack_id": "claude-opus-4.8",
  "version": "1.3.0",
  "provider": "anthropic",
  "model_id": "claude-opus-4-8",
  "system_prompt": "You are an Anthropic prompt-engineering specialist. Rewrite the user's prompt for Claude Opus 4.8 applying: explicit expert role, XML-tagged sections (<context>, <task>, <constraints>, <output_format>, <examples>), clear step-by-step instructions, and concrete success criteria. Preserve the user's intent; do not invent facts. Return structured JSON per the output schema.",
  "rubric": { "clarity": 25, "context": 20, "structure": 15, "format": 15, "examples": 10, "persona": 10, "verifiability": 5 },
  "exemplars": [ { "before": "...", "after": "..." } ],
  "output_schema": {
    "optimized_prompt": "string",
    "score": "int",
    "subscores": "object",
    "diff": "array",
    "persona_suggestion": "string",
    "notes": "array"
  },
  "level_overrides": {
    "1": { "add_examples": false, "add_persona": false, "max_tokens": 1200 },
    "2": { "add_examples": false, "add_persona": true,  "max_tokens": 2400 },
    "3": { "add_examples": true,  "add_persona": true,  "max_tokens": 6000, "self_critique": false },
    "4": { "add_examples": true,  "add_persona": true,  "max_tokens": 12000, "self_critique": true, "passes": 3 }
  }
}
```

## Appendix C — Sources

- [PromptPerfect Alternative 2026: Best Replacement After Shutdown | PromptItIn](https://promptitin.com/promptperfect-alternative)
- [PromptPerfect - AI Prompt Generator and Optimizer (Jina AI)](https://promptperfect.jina.ai/)
- [PromptPerfect Alternative — Migrate Before September 2026 | PromptAI 360](https://www.promptai360.com/promptperfect-alternative)
- [PromptPerfect Is Shutting Down: What You Need to Know | PromptAI](https://www.promptai360.com/blog/promptperfect-shutting-down)
- [8 Best Prompt Engineering Tools in 2026 | orq.ai](https://orq.ai/blog/prompt-engineering-tools)
- [Gets the user selected text? · tauri-apps Discussion #5624](https://github.com/tauri-apps/tauri/discussions/5624)
- [Electron: How do I get the selected text from a focused window? (Stack Overflow)](https://stackoverflow.com/questions/57507526/electron-how-do-i-get-the-selected-text-from-the-focused-window)
- [How do I get the selected text from the focused window using native Win32 API? (Stack Overflow)](https://stackoverflow.com/questions/2251578/how-do-i-get-the-selected-text-from-the-focused-window-using-native-win32-api)
- [How to retrieve the selected text from the active window (Stack Overflow)](https://stackoverflow.com/questions/1007185/how-to-retrieve-the-selected-text-from-the-active-window)
- [I Built a Local Voice-to-Text App with Tauri 2.0, whisper.cpp, and llama.cpp (DEV)](https://dev.to/auratech/i-built-a-local-voice-to-text-app-with-rust-tauri-20-whispercpp-and-llamacpp-heres-how-32h5)
