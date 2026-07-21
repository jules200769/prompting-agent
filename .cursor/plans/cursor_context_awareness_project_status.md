# Context awareness project status
_Exported on 7/16/2026 at 01:38:42 GMT+2 from Cursor (3.11.19)_

---

**User**

can you explain the context awarenes status of the project. what features we use 

---

**Cursor**

I'll look through the project for how context awareness is implemented and which features are in use.

Found the context-layer core — reading the implementation and current test status next.

**Context awareness is shipped in Anvyll (v1+)** — destination context is captured at hotkey time and injected into the rewrite. Writing-mode eval has **not** fully converged on the context track, mainly for the same reasons as the core matrix (`explain` / corpus), not because context itself is broken.

## What it is

Before the model call, Anvyll folds **where you are typing** into the request so the rewrite fits the destination (Slack vs Gmail vs Cursor chat vs terminal). That is the “context layer,” inspired by Wispr Flow’s approach.

Flow: hotkey snapshot → `assembleCaptureContext()` → overlay session → `captureContext` on optimize → `DESTINATION CONTEXT` block in the meta-prompt (`writing.ts` / `providers.ts`).

## Features in use

| Feature | Status | What it does |
|---|---|---|
| **Screen context** (`screenContext`, default on) | Shipped | Master switch; off = prompt text only, no file-memory writes |
| **Target-app identity** | Shipped | Process, window title (≤200), host kind, browser site, editor kind |
| **Surrounding / selected text** | Shipped | Scope: selection / field / empty; caps: selected ≤4k, before ≤1500, after ≤500 |
| **Code-editor file memory** | Shipped | Active + recent files from Cursor/VS Code/Windsurf titles; fuzzy match into prompt |
| **Auto model routing** | Shipped | e.g. claude.ai→Opus, ChatGPT→GPT-5, Cursor chat→Composer 2.5; picker “auto” hint only — never written to `defaultModel` |
| **Style matching** (`styleMatching`, default on) | Shipped | Category → tone/format hint (`ai-chat`, `code-editor`, `terminal`, `email`, `chat`, `docs-notes`) |
| **Password hard-block** | Shipped | UIA `IsPassword` → no text/context capture on any path |
| **Standing user context** | Separate | Studio “context about the user” line — not the same as destination capture |
| **Terminal context** | Related, older | `terminalContext` → TERMINAL SHELL single-line rule; coexists with destination block |

**Out of scope (still):** chat history scraping, screenshots/OCR, per-app exclusion lists.

## Categories & test presets

Categories: `ai-chat`, `code-editor`, `terminal`, `email`, `chat`, `docs-notes`, `other`.

Eval presets in `parameter-matrix.json`: Slack, Gmail, Cursor chat, VS Code editor, Windows Terminal, Notion, unknown-other, prompt-injection title, over-cap selection.

## Quality status (writing eval)

From `FINAL_SCOREBOARD.md` (holdout rounds 4–5):

- **Context gate (criterion 7): FAIL** — context cells track the no-context matrix; not a separate context-layer failure.
- **Injection resistance: 100%** on `prompt-injection-title` cells.
- Context does not uniquely tank scores; failures are driven by `explain` (esp. `explain-h1`) and a few invariants (email subject rule, rare terminal multi-line).

**Bottom line:** capture → assemble → DESTINATION CONTEXT → cache hashing is live and tested; the optional Agent-4 track is implemented and adversarial-safe, but the full writing convergence gate (including context cells) is still open for the reasons above.

---

**User**

i have been thinking about a context awareness feature and i dont know is it is realistic

---

**Cursor**

You're already past the “is any of this real?” stage — v1 destination context is live. What’s unclear is which *next* idea you’re weighing. A quick check on what you’re imagining:

**Short answer:** the version you already shipped is realistic. The versions that start to feel “magical” often aren’t — not because the idea is bad, but because capture, privacy, and hotkey latency fight you hard on Windows.

## What’s already proven realistic

Your current layer is the sweet spot Wispr-style products actually ship:

- App / site / host identity  
- Selection + before/after cursor (capped)  
- File-name memory  
- Category → style hint  
- Password hard-stop + kill switch  

That’s enough for “rewrite like it belongs *here*” without scraping a whole conversation. Your eval also shows the hard part isn’t “can we inject context?” — it’s whether writing rules stay stable when context is present. Injection resistance at 100% is a good sign the design is sound.

## Where realism usually breaks

| Idea | Realistic? | Why |
|---|---|---|
| Richer destination fit (better category/tone, more sites) | **Yes** | Incremental on what you have |
| Stronger selection structure (reply chains in Gmail/Slack) | **Partly** | UIA is uneven; works in some apps, flaky in others |
| Prior chat / thread history | **Hard** | App-specific scrapers, privacy spike, huge prompt noise |
| Screenshots / OCR | **Hard for hotkey** | Latency + “what’s relevant?”; better as optional Studio mode |
| Full project/codebase memory | **Not as hotkey context** | That’s a different product (RAG/index); file names already give most of the win |
| Cross-session “who I’m writing to” memory | **Medium** | Useful, but needs explicit user control or it feels creepy/wrong |

## The real product question

Not “can we capture more?” — **will one extra signal make the output feel obviously smarter, without slowing the overlay or leaking private stuff?**

Your own plan already scoped out the high-risk bits (chat history, OCR, exclusion lists) for good reasons. Most teams that chase “full screen awareness” end up with:

1. Fragile per-app hacks  
2. Slower hotkey  
3. Users turning the feature off  

## Honest take

- **Destination-aware rewrite** (what you have): realistic, shippable, differentiated.  
- **“Understands my whole screen / whole thread”**: aspirational; usually a multi-release bet, not a v1.1.  
- **Best next bets if you want more magic:** reply-to / recipient cues in email & chat, better Cursor chat vs editor distinction, and standing context the user *wrote themselves* — not more silent scraping.

If you describe the specific feature you’re imagining (even roughly), I can say whether it’s realistic for Anvyll’s hotkey path, or better as a Studio / opt-in path.

---

**User**

The first thing is working with sessions. The second thing I thought about is when you press the section where the context is stored (for example, the chat panel in Cursor). When you click there, nothing happens, but when you use Ctrl+A to select all, the entire chat is marked. Do you think this is a potential use case to grab the chat's context? Also, since in every app this is different and you can't just click somewhere without marking the wrong context, how can this be handled effectively? and is it a potential feature?

---

**Cursor**

Checking how capture currently handles selection and chat panels so the advice matches your real pipeline.

Yes — it’s a **real use case**, and your Cursor observation is a good signal. But **auto Ctrl+A on hotkey** is a weak product default. Treat it as an **opt-in “conversation context” mode**, not silent always-on scraping.

## What you’re seeing

In Cursor (and many Electron chat UIs):

- Focus in the **composer** → capture gets your draft (what you already do with `aislash`)
- Focus / click in the **transcript** → often “nothing” for typing, but **Ctrl+A** can select the whole thread

So the chat *is* readable as text sometimes — just not via the same path as the input box. That’s a legitimate second signal: **conversation context** vs **destination draft**.

## Why “just Ctrl+A everywhere” breaks

| Problem | What happens |
|---|---|
| Wrong focus | Composer: Ctrl+A = draft only. Transcript: = whole chat. Editor: = whole file. Slack: often one message or the input. |
| Side effects | Visible select-all flash; can change selection the user cared about; fights Apply/inject (you freeze an inject target from capture). |
| Size | Full Cursor threads blow past your caps (4k/1.5k/0.5k). Untruncated chat = noise + cost. |
| Noise | UI chrome, timestamps, “Copy”, code blocks, system notes — not clean turns. |
| Privacy | Full thread to the API is a bigger leap than app title + style. |
| Fragility | Every app’s tree differs; one global Ctrl+A strategy will feel broken in half of them. |

So: **potential feature, not a potential default.**

## How to handle it effectively

Think in **layers**, not one universal scrape:

1. **User-selected context (best ROI, already almost free)**  
   If the user selected part of the chat *before* the hotkey, treat that as `conversationContext` (separate from the draft being rewritten). You already have selection structure — extend the *meaning*, not the capture violence.

2. **Explicit session / opt-in**  
   Overlay toggle: “Include nearby chat” (off by default). Only then try a deeper read. Matches your privacy kill-switch mindset (`screenContext`).

3. **Bounded read, prefer UIA over keystrokes**  
   Prefer `DocumentRange` / sibling transcript element when available; use Ctrl+A+copy only as last resort (same discipline as terminal: restore clipboard, never leave selection messy). Cap hard: e.g. last ~2–3k chars / last N turns — never “entire history.”

4. **App allowlist, not “every app”**  
   Start with 1–2 destinations where you’ve verified focus: Cursor chat, maybe Claude/ChatGPT. Category `ai-chat` only. Everywhere else: skip silently.

5. **Sessions as product state (your first idea)**  
   This is often *more* realistic than scraping:

   - Remember standing user context  
   - Keep last rewrite + last capture context for the overlay session  
   - Optional “pin this thread snippet” the user pastes once  

   That gives continuity without fighting every app’s UI.

## Is it a potential feature?

**Yes — as “conversation / session context,” phase 2 of the context layer.**

Realistic scope:

| Ship | Skip (for now) |
|---|---|
| Opt-in include selected chat text | Silent full-thread scrape every hotkey |
| Cap + last-N truncation | Unlimited history |
| Cursor (+ maybe 1 web AI) first | Universal Slack/Discord/Notion/Gmail thread reader |
| Clear UI: “using N chars of chat context” | Invisible magic |

**Verdict:** Your Ctrl+A insight proves the content is *sometimes* grabable. The effective design is: **user selects or toggles → you read a bounded slice → model uses it as session context.** Auto-selecting the whole panel on every hotkey will feel wrong too often to be the core mechanic.

If you want, next we can sketch the clean split between **destination context** (where you’re typing) vs **session/conversation context** (what came before) so it fits your existing `CaptureContext` without overloading it.

---

**User**

yes

---

**Cursor**

## Two kinds of context (keep them separate)

| | **Destination context** (shipped) | **Session / conversation context** (new) |
|---|---|---|
| Question it answers | *Where* will this text live? | *What already happened* around this text? |
| Examples | Slack, Gmail, Cursor chat, terminal; style; file names | Prior chat turns, email thread, selected transcript |
| Stability | Stable per app/site | Volatile, large, privacy-heavy |
| Default | On with `screenContext` | **Off** unless user selects or toggles |
| Meta-prompt job | Fit tone/format | Ground facts / continue the thread — still don’t invent |

Don’t overload `CaptureContext.text` for both. Today `selectedText` / before / after mean **surrounding draft in the field being rewritten**. Chat history is a different job: “read this, don’t rewrite it.”

---

## Type sketch (fits current model)

Keep `CaptureContext` for destination. Add a sibling field:

```ts
// Existing — destination only (unchanged role)
interface CaptureContext {
  app?: { /* process, title, site, category, … */ };
  text?: { scope; hasSelection; selectedText?; beforeCursor?; afterCursor? };
  files?: { activeFile?; recentFiles? };
  suggestedModel?: ModelId;  // UI only
  styleHint?: string;
}

// New — optional session slice
type ConversationSource =
  | "user-selection"   // user highlighted transcript before hotkey
  | "opt-in-read"      // toggle + allowlisted app read
  | "pinned";          // pasted/pinned in overlay this session

interface ConversationContext {
  source: ConversationSource;
  /** Bounded recent thread / selection — NEVER the draft being rewritten */
  excerpt: string;
  /** Optional: "cursor-chat" | "claude.ai" | "gmail-thread" | … */
  kind?: string;
  charCount: number;   // pre-cap length for UI honesty
}

// On OptimizeRequest / overlay session:
captureContext?: CaptureContext;
conversationContext?: ConversationContext;  // separate channel
// standing user context stays as today's `context` / contextMemory
```

Caps (example): `excerpt` ≤ 2500–3000, prefer **tail** (last turns). Hash into cache like `captureContext`.

---

## Two meta-prompt blocks

**1. DESTINATION CONTEXT** — keep as today (where + style + draft structure).

**2. SESSION CONTEXT** — only if `conversationContext` present:

```
SESSION CONTEXT (prior conversation / thread — grounding only):
- Source: user selection in Cursor chat
- Recent excerpt: """…last N turns…"""

Rules:
- Use only to stay consistent with names, decisions, and open questions already in the thread
- Do NOT quote the excerpt unless the user's draft asks for a quote
- Do NOT continue as the assistant in that chat — rewrite the user's draft only
- If excerpt conflicts with the draft, the draft wins
```

Standing user context stays a third line (“Works at Anvyll…”). Three channels, three jobs.

---

## Capture UX (how “Ctrl+A insight” maps)

```mermaid
flowchart TD
  hotkey[Hotkey] --> dest[Always: assemble CaptureContext]
  hotkey --> check{Conversation included?}
  check -->|User already selected transcript text| sel[conversationContext source=user-selection]
  check -->|Toggle Include chat on + allowlisted app| read[Bounded opt-in read]
  check -->|User pinned/pasted in overlay| pin[source=pinned]
  check -->|No| skip[conversationContext absent]
  dest --> req[OptimizeRequest]
  sel --> req
  read --> req
  pin --> req
  skip --> req
```

**Priority order (don’t mix blindly):**

1. **User selection outside the composer** → best signal (your Ctrl+A case, but *they* did it).  
2. **Pinned / pasted in overlay** → always reliable.  
3. **Opt-in auto-read** → Cursor chat only at first; UIA sibling / bounded DocumentRange; Ctrl+A+copy last resort; restore selection + clipboard.

**Never:** silent full-thread scrape when focus is in the composer and toggle is off.

**Composer vs transcript:** if focus is `aislash` (draft), selection in the field = destination `text`; if selection is clearly “large transcript-like” and toggle is on, treat as conversation — or require explicit toggle so you never steal a long draft selection by mistake.

---

## Overlay session (your “sessions” idea)

Per overlay open (same capture session):

| Slot | Lives where | Clears when |
|---|---|---|
| Draft | Original textarea | New hotkey / Discard |
| `captureContext` | `captureRef` (today) | New hotkey |
| `conversationContext` | same session ref | New hotkey, or user clears “chat context” chip |
| Standing context | settings | User edits in Studio |
| Optional pin | user-edited snippet in overlay | Discard / new hotkey |

UI: small chip when session context is attached — `Chat context · 1.8k chars` with × to drop. Makes the feature feel intentional, not creepy.

---

## What not to merge

| Don’t | Why |
|---|---|
| Stuff chat into `text.selectedText` | Model rules say “output REPLACES this” — wrong for history |
| Put session inside DESTINATION CONTEXT | Dilutes “fit the app” with “here’s a novel” |
| Auto-enable for all `ai-chat` | Slack/Discord/Cursor behave differently; trust dies fast |

---

## Phased realism

| Phase | Ship | Effort / risk |
|---|---|---|
| **A** | Selection → `conversationContext` + SESSION CONTEXT block + chip | Low — almost no new capture |
| **B** | Overlay pin/paste session snippet | Low — UX only |
| **C** | Opt-in Cursor-only bounded read | Medium — app-specific, careful restore |
| **D** | More apps / smarter turn parsing | High — only if A–C prove value |

---

**Bottom line:** Destination = *fit*. Session = *grounding*. Same hotkey pipeline, separate types, separate prompt block, opt-in for anything that isn’t a user selection. Phase A alone already turns your Ctrl+A insight into a real feature without fighting every app.

If you want this written up as an implementation plan next (files, settings flag, cache key, tests), switch to Agent mode and say so.

