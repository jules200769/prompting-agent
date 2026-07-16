---
name: ""
overview: ""
todos: []
isProject: false
---

Writing Mode Optimization â Five-Agent Orchestration Plan

1. Overview: Goal and Approach

Goal. Systematically test and optimize every parameter of writing mode â and optionally the context awareness (destination context) feature â until output quality is consistently successful against defined criteria, using direct API calls only (no overlay/Studio UI involvement).

Approach. Five agents work in parallel on disjoint parameter subsets, all driving the engine through the same two direct entry points:

- In-process: import buildWritingMetaPrompt (src/engine/writing.ts) + optimizeStream (src/engine/providers.ts) from a script, following the scripts/calibration-round.mts pattern (API key from env/.env.local).
- Dev bridge: POST http://127.0.0.1:5174/api/optimize with an OptimizeRequest JSON body (skipCache: true always, so the persisted cache never masks a change).

The engine's tunable surface is two-layered, and the plan treats both as "parameters":

1. Request parameters (what callers vary): writingType (4 values), level (1â4), context (standing memory), captureContext (app/site/category, text scope, before/after cursor, files, styleHint), terminalContext, plus the draft prompt itself as a corpus dimension.
2. Meta-prompt parameters (what we optimize): DELIVERABLE, TYPE_RULES, LEVEL_RULES (16 typeÃlevel cells), STRUCTURE_ONLY, the OUTPUT RULES block, the TERMINAL SHELL override, the DESTINATION CONTEXT block renderer and CATEGORY_DIRECTIVES/CONTEXT_CAPS in contextSignals.ts, and the fixed REWRITE_CONFIG (model gpt-4.1-mini, temperature 0.3 â tested, only changed if evidence demands it).

Optimization runs in rounds: test â score â diagnose â adjust one meta-prompt parameter set â retest, until the convergence gate (Â§4) holds.

---
2. The Five Agents

Agent 1 â Harness, Corpus & Parameter Matrix (foundation)

Focus: infrastructure every other agent uses; no prompt tuning itself.
- Enumerate the full parameter matrix from types.ts/writing.ts/contextSignals.ts and freeze it as test.results/Writing_test_results/parameter-matrix.json (4 types Ã 4 levels Ã {terminal on/off} Ã {context on/off} Ã capture-context variants).
- Build scripts/writing-round.mts (generalizing calibration-round.mts): accepts a matrix slice, sends direct API requests with writingType set, skipCache: true, N=3 repeats per cell, and writes one JSONL record per call (full request, system+user meta-prompt, raw output, latency, timestamp, round id).
- Assemble the draft corpus: â¥5 drafts per writing type covering short/long, typo-heavy, multi-point, non-English, and edge cases (draft already has a Subject line, draft with emoji, draft with a question embedded in a story, etc.). Corpus is versioned and shared â every agent tests against the same drafts so rounds are comparable.
- Maintain the shared results directory layout (mirroring the existing test.results/<Model>_test_results convention).

Agent 2 â Conversational Deliverables: email + message (8 level cells)

Focus: TYPE_RULES.email, TYPE_RULES.message, their LEVEL_RULES (Structure/Formal/Friendly/Informal; Structure/Informal/Formal/Auto), and STRUCTURE_ONLY behavior for these types.
- Run the matrix slice for both types at all four levels against the shared corpus.
- Check type-specific invariants mechanically: Subject line only when the draft has one; greeting/sign-off presence matching the level; no invented names/dates/commitments (diff against draft facts); message outputs contain no subject/formal sign-off; L1 preserves the user's vocabulary (similarity check against draft).
- Verify the message L4 "Auto" tone actually flips between professional and casual when the draft/recipient signal changes.
- Propose concrete rule-text edits per failing cell; retest only the affected cells plus a regression sample of passing ones.

Agent 3 â Analytical Deliverables: question + explain, plus terminalContext (8 level cells + override)

Focus: TYPE_RULES.question, TYPE_RULES.explain, their LEVEL_RULES (Closed/Open/Auto; Simple/Technical/Step-by-step), and the TERMINAL SHELL override.
- Same round mechanics as Agent 2 for its slice.
- Mechanical invariants: question outputs end with ? and contain exactly one primary question; closed-form outputs are answerable in one line; explain outputs preserve every draft fact and invent none; step-by-step outputs are numbered with one idea per step.
- Test terminalContext: true across all four types Ã levels: output must be a single line (zero \n), and the override must beat any structure rule (e.g. an email rewrite forced single-line). This is the highest-priority precedence test because the code says the terminal contract "must keep authority."
- Test language preservation (non-English drafts stay non-English) and the "no preamble/no fences" output rules for its slice.

Agent 4 â Context Awareness (optional feature): context, captureContext, style directives

Focus: everything rendered by buildDestinationContextBlock and the standing-context line â the optional layer on top of any writing type.
- Vary captureContext systematically: each AppCategory (7), each ContextTextScope (selection/field/empty), beforeCursor/afterCursor at and beyond CONTEXT_CAPS, file lists (dedup, cap of 10, exact-spelling rule), styleHint per CategoryStylePreset (auto/formal/neutral/casual/off), and absent context as the control.
- Verify the block's own rules hold in outputs: before/after-cursor text is never repeated in the output; context adapts tone/format only and never adds facts; styleHint respects presets and disappears when styleMatching is off or category is "other".
- Test interaction effects with Agents 2/3's slices (e.g. message L4 Auto + chat category; email + docs-notes; terminal category + terminalContext), since the destination block and level rules can pull in different directions.
- Test standing context (memory): drawn on where relevant, never quoted verbatim, never leaking into unrelated drafts.
- Because this feature is optional, Agent 4's rounds start one round after Agents 2/3 stabilize their baseline, so context effects are measured against a known-good core.

Agent 5 â Evaluation, Scoring & Convergence Control (the loop driver)

Focus: judging quality, aggregating results across agents, deciding what changes and when the loop stops.
- Build the two-stage evaluator that every result passes through:
  a. Deterministic checks (free, run on everything): format invariants per type, single-line for terminal, no markdown fences/preamble, language match, fact-preservation diff.
  b. LLM-judge rubric (per output): intent preservation, tone-matches-level-label (WRITING_LEVEL_LABELS is the target named in the meta-prompt), naturalness/readiness-to-send, context fit â each 0â10 with a written justification, judged by a fixed model at temperature 0 for reproducibility.
- Aggregate each round into a scoreboard per matrix cell: pass rate, mean judge score, and consistency (score variance across the N=3 repeats â the explicit "consistent" requirement).
- Diagnose failures neutrally (which rule text, which parameter interaction) and file one change proposal per round per parameter area, assigned back to the owning agent. One meta-prompt change set per round, so effects are attributable.
- Own the convergence gate (Â§4) and the final report.

---
3. Testing & Optimization Workflow (direct API)

Round structure (repeats until convergence):

1. Seed (roundÂ 0): Agent 1 delivers harness + corpus + matrix; all agents run the full baseline sweep via direct API calls (writing-round.mts in-process, dev bridge as fallback) â no UI at any point.
2. Parallel execution: Agents 2, 3, 4 each run their matrix slice concurrently (slices are disjoint, so parallel calls don't contend; rate-limit with a small concurrency cap per provider key). Every call uses skipCache: true and logs the exact system prompt sent, so meta-prompt diffs between rounds are auditable.
3. Scoring: Agent 5 runs deterministic checks + LLM judge over the round's JSONL, publishes the scoreboard.
4. Adjustment: owning agents apply the approved change set to writing.ts/contextSignals.ts rule text (one changed parameter area per round), bump a round id, and commit.
5. Regression-aware retest: next round re-runs the changed cells at full depth and a 20% random sample of previously passing cells to catch regressions. Full-matrix sweeps every third round.
6. Loop 2â5 until the gate in Â§4 holds.

Cost control: deterministic checks gate the LLM judge (hard-fail outputs skip judging); repeats (N) rise from 3 to 5 only for cells near the pass threshold, where consistency needs tighter measurement.

---
4. Progress Monitoring & Success Criteria

Per-cell success: all deterministic invariants pass, mean judge score â¥ 8/10, no single repeat below 7, and repeat variance â¤ 1 point.

Convergence gate (loop exit):
- â¥ 95% of matrix cells at per-cell success, with zero failures on the mandatory invariants (terminal single-line, no invented facts, no preamble/fences, language match), for two consecutive full-matrix rounds â the "consistently successful" requirement.
- No cell that passed in round k fails in round k+1 (regression-free).
- Context-awareness cells (if the optional feature is in scope) meet the same bar independently, both with context present and absent.

Monitoring: Agent 5 publishes after each round a scoreboard (round-N-scoreboard.md in the shared results dir): per-cell pass/score/variance heat-map, deltas vs. the previous round, open change proposals, and cells trending toward/away from the gate. A run ledger (JSONL) preserves every request/response pair for audit and re-judging.

---
5. Coordination & Communication

- Single source of truth: the shared test.results/Writing_test_results/ tree â corpus, matrix, round JSONLs, scoreboards. No agent keeps private state the others can't read.
- Ownership boundaries: each meta-prompt region has exactly one owning agent (Agent 2: email/message rules; Agent 3: question/explain + terminal; Agent 4: context block + directives; Agent 1: harness; Agent 5: evaluator). Cross-boundary changes go through Agent 5's change proposal, never applied directly.
- Round synchronization: rounds are the only sync point â agents run their slices asynchronously within a round, but no meta-prompt edits land mid-round, so every result in a round is attributable to one engine version (tag each round with the git commit of the engine).
- Change protocol: proposal â Agent 5 approval â owning agent applies â round id bump â retest. One parameter area changes per round; conflicting proposals are sequenced across rounds rather than merged.
- Neutral reporting: scoreboards and diagnoses describe what the output did versus what the criterion requires ("L2 email outputs used contractions in 4/15 runs; the FORMAL rule may need an explicit example"), never which agent or change "caused a failure."
- Escalation: if a cell fails three consecutive rounds under different rule texts, Agent 5 flags it for a structural decision (e.g. reconsidering the fixed REWRITE_CONFIG model/temperature) rather than more text iteration â that's the only point where the frozen config becomes a candidate parameter.

---
Success-criteria check on this deliverable: â  five distinct agent roles with specific parameter responsibilities â Â§2, each mapped to concrete code-level parameters; â¡ direct API over frontend â Â§1/Â§3, in-process optimizeStream and dev-bridge POST /api/optimize only, UI explicitly excluded; â¢ iterative loop until consistent success â Â§3 round structure + Â§4 two-consecutive-rounds gate with variance bounds; â£ progress tracking and coordination mechanisms â Â§4 scoreboards/ledger and Â§5 protocol; â¤ structured, actionable format â numbered sections matching the requested outline, grounded in the actual files (writing.ts, contextSignals.ts, types.ts, calibration-round.mts) so Agent 1's harness work can start immediately. All constraints are met, including optional context-awareness coverage (Agent 4) and neutral language (Â§5).