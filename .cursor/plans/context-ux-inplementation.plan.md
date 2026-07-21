Implementation Plan — Session/Context UX Redesign (Anvyll / Anvyll)
All paths absolute under C:\Users\julez\Apps\Anvyll\prompt-master. Line numbers refer to current file state.

Shared groundwork (do first, tiny, enables Waves 1–2)
G1. One context snapshot refresher in Overlay.tsx
The context bar (item 1) and later the tree panel (item 4) need sessions, projects (with color/title), and activeProjectId at all times — today those are fetched only on menu open (effect at src/renderer/views/Overlay.tsx:511-521) and picker open (onNewSession, 523-530).

Changes in src/renderer/views/Overlay.tsx:

Add state: const [projects, setProjects] = useState<ProjectContext[]>([]) and const [activeProjectId, setActiveProjectId] = useState<string | null>(null). menuProjectColors (line 339) becomes derivable — delete it and derive colors from projects where used (menu session rows at 830-873 until Wave NEXT deletes them).
Add a single helper next to refreshActiveSession (371-377):
function refreshContextSnapshot(): void {
  void Promise.all([api.sessionGetActive(), api.projectContextGet(), api.sessionList(), api.projectList()])
    .then(([active, projText, sessionList, { projects, activeProjectId }]) => { ...set all five states... });
}
Call it: in the mount effect (replaces the two calls at 426-427), inside applyCapture (replaces 466-467), in resetOverlaySession (replaces 412-413), and after every mutation: onStartNewSession, onResumeSession, onConfirmDeleteProject, onDeleteSession, onClearSession, onAddToContext (after save). The store is a local JSON doc; four IPC round-trips per hotkey is negligible.
The menu-open effect (511-521) and onNewSession's fetch (527-529) become redundant — keep the menu-open effect as a cheap re-sync (refreshContextSnapshot()) until Wave NEXT removes the left panel; pickerProjects (327) can immediately be replaced by the new projects state.
Derived active project for the bar: const activeProject = activeSession?.projectId ? projects.find(p => p.id === activeSession.projectId) ?? null : (activeProjectId ? projects.find(...) : null). Prefer activeSession.projectId as the lookup key (the session is what the bar names); fall back to activeProjectId only when there is no active session. (Decision: keeps the bar truthful even if session/project active pointers ever diverge.)

WAVE "NOW"
1. Context bar on the overlay card
File: src/renderer/views/Overlay.tsx only.

New helper component ContextBar next to GlassPill (after line 296):
Props: { project: ProjectContext | null; session: SessionContext | null; open: boolean; onClick: () => void; disabled?: boolean }.
Render (mirrors design-doc .ctx-bar, lines 129-137/336-342 of the doc): a full-width <button> — flex items-center gap-2 h-7 px-2 -mx-1 mb-2 rounded-[10px] hover:bg-white/[.06] transition text-[13px], with mandatory focus-visible ring (index.css convention). Contents:
dot: h-2 w-2 rounded-full, style={{backgroundColor: project?.color ?? "rgba(255,255,255,.25)"}}
project name text-white/45 truncate — project?.title ?? "No project"
separator / in text-white/30
session title text-white font-medium truncate — session?.title ?? "New session" (when activeSession is null show "No session"; see edge cases)
chevron ▾ pushed right (ml-auto text-white/40 text-[11px]), rotated when open.
a11y: aria-haspopup="menu", aria-expanded={open}, aria-label like "Context: Anvyll / Fix overlay session UX".
Insert as the first child inside .apple-glass card (line 941), above the flex gap-4 mb-4 row at 943. The card grows ~30px; that is expected per the design doc ("one line tall; silhouette otherwise untouched"). No animation on appearance — it's always rendered (AGENTS rule: shell shows instantly, no flicker).
disabled while capturing (placeholder state) so it can't open a stale panel mid-capture.
Click target in Wave NOW (decision — doc is ambiguous because the panel ships in Wave NEXT): onClick={() => setMenuOpen(v => !v)} as an interim wiring — the bar opens the existing ⋮ dropdown, which already contains session switching + "Context". Wave NEXT rewires it to setContextPanelOpen(true). This keeps Wave NOW shippable and useful on its own.
Edge cases:

No active session at all (fresh install, or active session deleted): bar shows neutral dot + "No project / No session" — still clickable, still teaches where context lives.
Long titles: both spans truncate with min-w-0 on the button; session title gets flex-1 priority.
resetOverlaySession/applyCapture already refresh the snapshot (G1), so the bar is correct on every hotkey without waiting for menu open.
2. Grounding chip row
Plumbing path (main → renderer):

src/shared/grounding.ts (new file) — pure, unit-testable:
export function computeGrounding(
  sessionOn: boolean, projectOn: boolean, capture?: CaptureContext,
): OptimizeGrounding
session: sessionOn, project: projectOn (booleans already reflect non-empty trimmed text, matching optimizeHandler's sessionText/projectText — a session that exists with empty contextText yields chip off, consistent with contextStatusPlaceholder, 262-273).
destination: built from capture.app (CaptureContext, src/shared/types.ts:109-133): label priority editorKind map (cursor→"Cursor", vscode→"VS Code", windsurf→"Windsurf") → app.site → app.processName (strip .exe, capitalize). detail = basename of capture.files?.activeFile (split on //\). Omit destination entirely when no app info.
src/shared/types.ts — extend OptimizeWithRunId (318-321): grounding?: OptimizeGrounding;. Optional so Studio/dev-bridge consumers and old cached call sites compile untouched; optimizeHandler always populates it.
src/main/optimizeHandler.ts — in runOptimize (7-33), after computing sessionText/projectText (15-16): const grounding = computeGrounding(Boolean(sessionText), Boolean(projectText), req.captureContext); and attach to both returns: cache hit (return { ...cached, runId, grounding }, line 27) and fresh (return { ...result, runId, grounding }, line 32).
Cached results carry grounding — yes (decision): grounding is computed per-request before the cache lookup from the live store, so a fromCache run's chips are accurate for this run, not the run that populated the cache. Nothing is persisted into the cache or run ledger (grounding is UI-only; if we later want it in history, that's a separate RunRecord change — out of scope).
src/preload/index.ts — no change; optimize (57-63) already returns the invoke result untyped-through.
src/main/main.ts — no change; handler at 491-502 passes the return through.
Renderer (Overlay.tsx):
State: const [lastGrounding, setLastGrounding] = useState<OptimizeGrounding | null>(null).
In runOptimize (632-676): set setLastGrounding(null) at the top (with setOutputText(""), line 639) so stale chips never show during a run; after res arrives set setLastGrounding(res.grounding ?? null). In the catch (668) leave it null — no chips on error (decision: an errored run grounded nothing the user can act on).
Clear on applyCapture (new capture) and resetOverlaySession (Discard/hide → OVERLAY_CLEAR → reset). Apply/Copy hide the overlay → cleared via reset; nothing extra needed.
Render location: immediately after the footer row's closing </div> (line 1042), still inside .apple-glass:
<div className="min-h-[20px] mt-2 px-1 flex items-center gap-1.5 flex-wrap text-[11px] text-white/40">
  {phase === "done" && lastGrounding && ( "Grounded by" + chips )}
</div>
The container is always rendered with a fixed min-height (decision) so the card doesn't jump when chips appear post-refine (in the spirit of the no-flicker rules).

Chips: small rounded-full border border-white/10 bg-white/5 px-2 py-px text-white/70 spans; render only layers that are on — Session, Project, and `${destination.app}${detail ? ` · ${detail}` : ""}` (e.g. "Cursor · Overlay.tsx"). If all layers are off, render one muted chip No context that opens the bar's target (menu now, panel later) — keeps the teaching loop closed instead of hiding the row (decision; doc shows only the on-state).
Tests: new src/shared/grounding.test.ts — session/project booleans; editorKind label mapping; site fallback; processName .exe stripping; activeFile basename with both slash kinds; destination omitted when app absent.

3. Renames + empty-state copy
Complete string inventory (grep-verified; all in src/renderer/views/Overlay.tsx, no Studio occurrences):

Line	Current	New
902	Configure context	Context
1209	Import context to Anvyll	Bring context from your chat
1234	Copy this prompt into a chat with your other AI provider	Copy this prompt into your AI chat — your refinements will understand that conversation. (payoff-first, per doc 4.3)
1112	Start with project context?	unchanged in NOW (interstitial dies in Wave NEXT)
262-273	contextStatusPlaceholder both-off case: "Session: off · Project: off"	when both off return one payoff sentence, e.g. "No context yet — add a session or project so refinements understand your work."; keep the current concise Session: on — {title} · Project: on/off formats when anything is on (decision)
1258-1259	Step-2 paste labels	keep, they already name the scope; reword lightly to `"Paste the answer below — it becomes this {session's	project's} memory"`
1301	Add to context	keep (Added confirm unchanged)
Also update the comment at 325/551 mentioning "Import context" for accuracy. No test changes; these are copy-only.

Wave NOW commit order: G1 → item 1 → item 3 (one PR), item 2 (second PR — it touches shared/main types and has its own tests).

WAVE "NEXT"
4. Unified context panel (tree)
New file: src/renderer/components/ContextPanel.tsx (follows the existing convention — OverlayPlacementPicker, ModelPicker, WritingTypePicker live in src/renderer/components/). Overlay.tsx stays the state owner; the panel is presentational + callbacks.

Props:

{
  projects: ProjectContext[];
  sessions: SessionContext[];
  activeSessionId: string | null;
  pendingDeleteProject: ProjectContext | null;
  onResumeSession(id: string): void;
  onDeleteSession(id: string): void;
  onNewSessionIn(projectId: string | null): void;
  onRequestDeleteProject(p: ProjectContext | null): void;  // null = cancel
  onConfirmDeleteProject(): void;
  onNewProject(): void;                    // → import modal, project scope, newProjectFlow
  onBringContext(): void;                  // → import modal, session scope (active session)
  onEditProjectMemory(p: ProjectContext): void; // → import modal, project scope for p
  onClose(): void;
}
Grouping selector — put in src/shared/session.ts so it's unit-testable:

export function groupSessionsByProject(sessions: SessionContext[], projects: ProjectContext[]):
  { project: ProjectContext | null; sessions: SessionContext[] }[]
Order: projects in listProjects() order, each with its sessions (in sessionList order = recency); a trailing No project group always present (even when empty, so "+ New session here" exists for unlinked work); empty projects still render (their group is the only place to open them). Extend src/shared/session.test.ts with grouping cases (empty lists, orphaned projectId pointing at a deleted project → falls into No-project group, ordering).

Layout & interaction (per design doc .panel, 160-184 / figure 4.2):

Anchor: absolutely positioned popover inside the card wrapper div (line 786, already relative): absolute left-4 right-4 top-[52px] z-30 max-w-[340px] — it pops from directly under the context bar. apple-glass-menu rounded-[18px] p-3 (AGENTS: apple-glass-menu for menu panels/modals; no scrim — bare popover, like the ⋮ dropdown, not the fixed inset-0 pattern).
Header eyebrow CONTEXT (text-[10px] uppercase tracking-wider text-white/50).
Scroll: tree body max-h-[300px] overflow-y-auto scroll-thin — handles 20 projects × 50 sessions; the 5-session cap from the old menu (line 830 slice(0,5)) is dropped inside groups.
Project group: rounded-xl border border-white/10 bg-white/[.04] p-1 mb-2. Header row: color dot · title (font-medium) · right-aligned mini: memory ✓ (text-[10px] text-white/45) when p.contextText.trim(), else add memory as a subtle button — both clickable → onEditProjectMemory(p). Trash icon (reuses TrashIcon) → onRequestDeleteProject(p) (confirm required — standing rule).
Session rows: indented (pl-6), dot-less (group provides color), truncate; active session row bg-white/10 text-white + right badge active (text-[10px], tinted with the project color or text-white/60) — "active" means: this session's context will ground the next refine, matching activeSession. Row click → onResumeSession(id) then onClose() — the context bar updating is the confirmation (doc's after-path step 3). Trash per row, no confirm (standing rule).
+ New session here row at the bottom of every group (incl. No project) → onNewSessionIn(p?.id ?? null); implementation is exactly onStartNewSession (533-549) minus the picker-state lines, then onClose().
Bottom row (fixed under the scroll area): two pills — ＋ Project (secondary) → onNewProject(); Bring context from your chat (primary tint) → onBringContext().
Delete-project confirm lives inside the panel (decision): when pendingDeleteProject is set the panel body swaps to the existing confirm view (markup lifted from 1058-1108, including the linked-session count derived from sessions). Cancel → back to tree. This mirrors how the interstitial handles it today and avoids a third floating surface.
Outside click: same pattern as the menu effect (499-508) — panel root ref, pointerdown listener closing it; also treat a click on the context bar itself as toggle (bar click while open → close).
Esc: today the global handler (line 725) hides the whole overlay. Change: keyStateRef gains panelOpen (and, for consistency, modalOpen); Esc closes the topmost surface first (panel/import modal → then overlay) (decision: fixes a latent annoyance for all modals; small, contained).
Mutual exclusion: opening the panel sets menuOpen=false and vice versa; opening the import modal from panel callbacks sets contextPanelOpen=false.
State migration in Overlay.tsx:

Add contextPanelOpen. Delete: newSessionPickerOpen (324), pickerProjects (327), onNewSession (523-530), the whole interstitial JSX (1047-1196). pendingDeleteProject (328) stays, now owned by the panel flow. onStartNewSession stays (renamed onNewSessionIn, drops pickerProjects lookup — use projects).
closeContextModal (379-388): returnToSessionPicker → returnToContextPanel (reopens the panel instead of the picker after the "+ Project" import flow closes/cancels).
⋮ menu slimming (807-939): delete the left column (809-876) and the "Context" item (883-903, whose function moved to the panel bottom row). Right panel keeps Position / Settings / Open in Studio / Dismiss; the wrapper flex items-start gap-2 collapses to the single panel.
Context bar click rewired: setContextPanelOpen(v => !v). Grounding "No context" chip target likewise.
Risks/edge cases (NEXT): panel taller than the overlay window (overlay window is sized to the card + margins — verify max-h keeps the popover inside the window bounds; if the window clips, anchor the panel with top and reduce max-h to ~260px); deleting the active session/project from inside the panel (existing handlers already re-fetch active — G1's snapshot refresh covers the bar); 0 projects + 0 sessions → panel shows just the No-project group with "+ New session here" plus the two bottom pills (this is the empty state that must "explain the payoff" — add one muted sentence under the eyebrow when everything is empty).

5. Scope inherited from entry point
Entry points → scope (all set at open time):

Entry	Scope	Lock	Target
Panel bottom "Bring context from your chat"	session	locked	active session (or created on save — onAddToContext 622-624 already does this)
Project header "memory ✓ / add memory"	project	locked	that project
Panel "+ Project"	project	locked	new project (newProjectFlow, existing)
(Wave LATER toast confirm)	detected scope	locked	active session / active project
Implementation:

Keep contextImportScope + newProjectFlow; add importTargetProjectId: string | null (for the header entry). Every open path sets scope explicitly; the modal footer always passes lockedScope={contextImportScope} to ContextScopePill (1281-1287) — the pill's existing lockedScope mechanics (206-260) already filter to one non-interactive option, so it becomes the label with zero new components. Restyle the locked rendering slightly (drop hover affordance, add the target name: Session — Fix overlay session UX / Project — Anvyll) via a small addition to ContextScopePill (lockedLabelDetail?: string). onContextImportScopeChange (703-707) becomes dead — delete.
Non-active project import needs one new IPC (decision — smallest honest addition): projectUpsertActive (619) only writes the active project. Add:
src/main/storage.ts: setProjectContextByIdKeepTitle(id, text) — actually name it setProjectContextById(id: string, text: string): ProjectContext | null — clamp to PROJECT_CONTEXT_MAX_CHARS, re-derive title via deriveProjectTitle only if current title is the default (mirror upsertActiveProject internals), bump updatedAt.
src/shared/types.ts IPC const PROJECT_SET_CONTEXT_BY_ID: "anvyll:project:set-context-by-id"; handler in main.ts next to 613-621; preload projectSetContextById(id, text) next to 112-116.
onAddToContext project branch: if importTargetProjectId set and ≠ active project → api.projectSetContextById(...) (does not touch active project — respects the resume rule's spirit); else existing projectUpsertActive path.
Extend src/main/storage.session.test.ts: by-id write clamps, preserves activeProjectId, returns null for unknown id, cascade-unaffected.
Prefill on open stays as today (892-897) for the active-session path; for the project-header path prefill importedProjectContext from p.contextText.
Wave NEXT commits: PR3 = panel + grouping selector + tests + interstitial/menu removal + bar rewire; PR4 = scope inheritance + projectSetContextById IPC + storage tests. (PR4 can land before PR3's UI if desired; they touch different layers except the modal footer.)

WAVE "LATER"
6. Clipboard summary detection
Shared matcher — src/shared/contextSummaryDetect.ts (new), fully unit-testable:

Export label arrays from src/shared/contextImportPrompt.ts as the single source of truth (they're currently only embedded in the prompt strings): SESSION_SUMMARY_LABELS = ["GOAL","CURRENT STATE","KEY FACTS & DECISIONS","CONSTRAINTS & PREFERENCES","TERMINOLOGY & NAMES","OPEN ITEMS"], PROJECT_SUMMARY_LABELS = ["PROJECT","STACK & ARCHITECTURE","CONVENTIONS","KEY FACTS & DECISIONS","CONSTRAINTS & PREFERENCES","TERMINOLOGY & NAMES"]. (Optionally rebuild the prompt bodies from these arrays so they can't drift; low-risk refactor, prompt text unchanged.)
detectContextSummary(text: string): ContextImportScope | null:
Length guard: trimmed length in [40, SESSION_CONTEXT_MAX_CHARS * 2] (summaries are ≤250 words; reject giant clipboards cheaply before regexing).
Require all six numbered labels at line starts, in order: for each scope build new RegExp(String.raw^\s${i+1}.\s${escape(label)}\b, "m") and check ascending match indices. Disambiguation is inherent: 1. GOAL vs 1. PROJECT (plus STACK & ARCHITECTURE/CONVENTIONS vs OPEN ITEMS).
Critical false-positive guard: the export prompts themselves contain all six labels ("1. GOAL — what I am ultimately trying to achieve…") and are on the clipboard right after Step-1 Copy. Reject when the text contains prompt-only markers: "You are helping me export", "WHAT TO INCLUDE", or "ACCURACY" as a line — cheapest reliable check: text.includes("You are helping me export") plus /^WHAT TO INCLUDE$/m.
Tests — src/shared/contextSummaryDetect.test.ts: valid session summary → "session"; valid project summary → "project"; the literal CONTEXT_IMPORT_PROMPT and PROJECT_CONTEXT_IMPORT_PROMPT strings → null (regression-pins the guard); 5-of-6 labels → null; labels out of order → null; "not established" bodies → detected; oversized text → null; labels mid-sentence (not line-anchored) → null.
Where the check runs — main-side, in deliverCaptureToOverlay (src/main/main.ts:198-231) (decision):

Just before overlay.webContents.send(IPC.OVERLAY_SHOW, ...) (217): const clip = clipboard.readText(); const scope = detectContextSummary(clip); and, when matched, add clipboardSummary: { scope, text: clip } to the payload (extend the OverlayShowPayload type used by preload).
Why main-side: (a) the hotkey path already restores the pre-capture clipboard in capture.ts (195-201) before delivery, so at this point the clipboard holds what the user last copied — the external AI's answer; (b) no general "read clipboard" API is exposed to the renderer — only text that already matches Anvyll's own format ever crosses IPC, which is the strongest privacy posture; (c) deliverCaptureToOverlay ends in overlay.focus() (230) — this is the "on overlay focus" moment, including the second-OVERLAY_SHOW-while-open path (213).
Privacy constraints honored: check runs only here (never polled, never on blur/timer); the text lives only in the payload + renderer state; no store write ever happens unless the user confirms; state cleared on confirm/dismiss/OVERLAY_CLEAR/next capture.
Preload: no new invoke; onOverlayShow (146-152) passes the enlarged payload through untouched.
Renderer — consent toast in Overlay.tsx:

State: clipboardSummary: { scope: ContextImportScope; text: string } | null, set in applyCapture from the payload; cleared in resetOverlaySession, on dismiss, on confirm.
Interaction with resumeContextModalRef (358, consumed at 461) (decision — the toast supersedes the auto-reopen when it can): in applyCapture, if resumeContextModalRef.current && detail.clipboardSummary → do not reopen the modal; show the toast instead (and remember the pending scope: if the user copied the project export prompt but the clipboard now matches session, trust the detected scope — it reflects what's actually on the clipboard). If the ref is set but nothing matched (user came back without the answer), keep today's behavior: reopen the modal (line 461) so the flow still works manually. If a summary is detected with no pending flow (spontaneous round trip), show the toast too — that's the magic moment.
Toast UI: single-line strip, apple-glass-menu rounded-full positioned inside the card wrapper below the card (absolute left-1/2 -translate-x-1/2 -bottom-12 z-30), no scrim, no animation: Summary found on clipboard + primary pill Add to this session / Add to project memory + ✕ dismiss. role="status" for the announcement.
Confirm handler: session scope → const target = activeSession ?? await api.sessionCreate(); await api.sessionSetContext(target.id, text); project scope → api.projectUpsertActive(text) (active project; if none active this creates one — same semantics as the modal). Then refreshContextSnapshot(), brief Added ✓ state (~900ms, mirroring contextSaved at 626-629), clear clipboardSummary, resumeContextModalRef.current = false.
Truncation: clamp to SESSION_CONTEXT_MAX_CHARS/PROJECT_CONTEXT_MAX_CHARS on save (storage already clamps; renderer just passes through).
Edge cases (LATER): user's clipboard legitimately contains an old summary from days ago → toast still appears; acceptable because action is one click to view consent, and dismiss is one click (doc explicitly accepts this trade); repeated hotkey presses with the same clipboard → toast reappears — suppress by remembering a hash of the last-dismissed summary text in a renderer ref (cleared on app restart, never persisted); clipboard containing the summary plus surrounding chat chrome (user selected extra text) → ordered line-anchored match still passes if labels survive; if the "FORMAT" rules were violated by the external AI (markdown headers like **1. GOAL**) the match fails and the manual modal path remains — do not loosen the regex for v1.

Test plan summary
File	Wave	Coverage
src/shared/grounding.test.ts (new)	NOW	computeGrounding matrix (session/project booleans, destination label fallbacks, basename)
src/shared/session.test.ts (extend)	NEXT	groupSessionsByProject ordering, orphan projectId, always-present No-project group
src/main/storage.session.test.ts (extend)	NEXT	setProjectContextById clamp/title/active-untouched/unknown-id
src/shared/contextSummaryDetect.test.ts (new)	LATER	matcher accept/reject matrix incl. the export-prompt false-positive regression
Runtime verification per wave via the verify skill (hotkey → overlay → chips/panel/toast).

Commit/PR breakdown (recommended)
PR1 (NOW): G1 snapshot refresher + Context bar + all renames/empty-state copy. Renderer-only.
PR2 (NOW): shared/grounding.ts + OptimizeWithRunId.grounding + optimizeHandler attach + chip row + tests.
PR3 (NEXT): groupSessionsByProject + ContextPanel.tsx + interstitial/menu-left-panel removal + bar rewire + Esc layering.
PR4 (NEXT): scope-locked import modal (always-locked pill-as-label) + projectSetContextById IPC/storage + tests.
PR5 (LATER): label exports + contextSummaryDetect + main-side check in deliverCaptureToOverlay + consent toast + tests.
Each PR leaves the app shippable; PR3 is the only one that removes existing UI, and everything it removes is replaced within the same PR.

Critical Files for Implementation
C:\Users\julez\Apps\Anvyll\prompt-master\src\renderer\views\Overlay.tsx
C:\Users\julez\Apps\Anvyll\prompt-master\src\main\optimizeHandler.ts
C:\Users\julez\Apps\Anvyll\prompt-master\src\shared\types.ts
C:\Users\julez\Apps\Anvyll\prompt-master\src\main\main.ts
C:\Users\julez\Apps\Anvyll\prompt-master\src\shared\contextImportPrompt.ts