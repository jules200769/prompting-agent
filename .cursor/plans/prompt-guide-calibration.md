# PromptForge — Prompt guide kalibratie (alle modellen)
You are calibrating **PromptForge**'s rewrite pipeline for every target model in `prompting-guides/`. The rewrite always uses OpenAI **GPT-4.1 mini**; the target model picker selects which guide + structure contract apply.
Reference session: `cursor_ai_prompt_engineering_session.md` (Opus 4.8 — completed except final Max L4 API validation).
## Mission
For each target model: research official prompting guidance → run standardized tests → analyze outputs → fix `guideLoader.ts` / `providers.ts` if needed → re-test → document scorecard.
**Do not** change rewrite model, overlay UX, capture/inject, or add silent API fallbacks. On API failure, surface a clear error (no `optimizeLocal`).
## Prerequisites
- `npm run dev` running; Electron restarted after engine changes (main process does not hot-reload)
- OpenAI API key configured in Settings
- Test via overlay hotkey **or** `http://localhost:5173/#/overlay-preview` (Vite proxies `/api/optimize` → `127.0.0.1:5174`)
- After `guideLoader.ts` / `providers.ts` changes: bump `REWRITE_PIPELINE_VERSION` if contract semantics change; run `npm test`
## Shared test protocol
Use the **same two prompts** for every model (enables cross-model comparison).
### Prompt A — coding (action language + constraints)
```text
my react app lags when users type in the search box. the list has around 500 items. probably a rerender issue? fix it but dont change the ui or break filtering. typescript.
Prompt B — writing (tone + negative constraints + gaps)
write an email to my team about our Q3 roadmap slipping by 3 weeks because of a vendor delay. keep it professional but not too corporate or stiff. dont blame the vendor or anyone on the team. mention we have a mitigation plan but i havent finalized the details yet. they need to know whats changing and what stays the same.
Per model, per round
Select target model in overlay ModelPicker
Run L1 Cool → L2 Warm → L3 Hot → L4 Max on Prompt A (save 4 outputs)
Repeat on Prompt B (save 4 outputs)
8 outputs total per round
Folder layout
{ModelSlug}_test_results/
  first_round/
    first_test/          # Prompt A — cool, warm, hot, max + input_prompt
    second_test/         # Prompt B — cool, warm, hot, max + input_prompt2
  second_round_after_change/
    first_prompt_results/
    second_prompt_results/
Model slugs: Opus4.8 (done), GPT5.5, Gemini3, DeepSeekV3, Grok4, Composer2.5.

Universal scorecard (every model)
Level	Must
Cool L1
Plain prose only — no XML, no markdown headers, no role/persona; sentences/order preserved; typo/capitalization fixes only
Warm L2
Model-native light structure; user prompt verbatim in Input block — no duplication in instructions
Hot L3
Full structure per contract; works for both coding and writing; deliverable shape in output section; [detail TBD] for gaps, no invented facts
Max L4
All L3 sections retained + examples + 2–3 measurable success criteria + brief verification line
Universal red flags
Invented facts (wrong stack, euphemized "vendor delay" → "vendor issue")
"Suggest / recommend / provide a solution" when user said fix/implement/write
Preamble ("Here is your optimized prompt…")
JSON, rubric, or commentary in output
Cool with XML; Warm ≈ Hot ≈ Max (flat level scale)
Max that collapses L3 into a single instructions block
Local fallback patterns: [Add relevant background…], wrong persona (e.g. "B2B SDR" on email)
Fix locations
File	What
src/engine/guideLoader.ts
getLevelStructureContract(), getLevelRewriteInstruction(), structureFormat(), REWRITE_PIPELINE_VERSION
src/engine/providers.ts
buildMetaPrompt() — action language, constraint framing, terminal override
src/engine/guideLoader.test.ts
Contract assertions per model+level
prompting-guides/*.md
Only if guide excerpt content is wrong — prefer pipeline fixes first
Model 0 — Claude Opus 4.8 (validation only)
Status: Pipeline fixed in prior session. Gap: Max L4 not re-validated after final contract tightening.

One-shot validation (do first)
Model: claude-opus-4.8
Prompt B (email) on Max L4
Expect 6 XML tags: <context>, <task>, <constraints>, <output_format>, <examples>, <success_criteria> + verification line
No API error, no placeholders
If Max passes → mark Opus done. If not → tune L4 contract in guideLoader.ts only.

Model 1 — GPT-5.5 (gpt-5 / gpt5.5.md)
Structure format in code: markdown (## headers)

Research (before judging outputs)
OpenAI Using GPT-5.5
OpenAI prompting: outcome-first, shorter prompts, personality vs collaboration style
Key idea: do not carry over legacy process-heavy prompt stacks
Level expectations
Level	GPT-5.5-specific
Cool
Plain prose — shorter than Opus Warm would be; no personality block
Warm
## Instructions (short role + imperative) + ## Input (verbatim)
Hot
## Context, ## Task, ## Constraints, ## Output format — concise, outcome-first
Max
All Hot headers + ## Examples + ## Success criteria; no bloated process steps
Red flags
Long phased workflows on simple tasks (L1/L2)
Personality/collaboration blocks at Cool/Warm
Process instructions where outcome + constraints suffice
Markdown fences or JSON in output
Definition of done
 Web research summarized in session
 GPT5.5_test_results/first_round/ — 8 outputs
 Analysis + scorecard
 Fixes if needed + npm test green
 GPT5.5_test_results/second_round_after_change/ — 8 outputs
 Scorecard: Cool plain, Warm separated, Hot full markdown, Max retains L3 + examples
Model 2 — Composer 2.5 (composer-2.5 / composer2.5.md)
Structure format: composer (Goal / Context / Constraints / Output format)

Research
Cursor Composer 2.5 blog / docs — long-horizon coding, phased workflow, constraint-first
Goal in one sentence; repo context early; output format explicit
Level expectations
Level	Composer-specific
Cool
Plain prose — no Goal/Context blocks
Warm
Goal: imperative + Input: verbatim (no duplication)
Hot
Goal, Context, Constraints, Output format — coding prompts should bias toward implement/fix language
Max
Hot + Examples (e.g. desired diff/checklist pattern) + Success criteria
Red flags
Missing repo/stack context on coding Hot/Max when user gave stack hints
"Wait for my OK" on Cool/Warm (phased workflow only belongs L3+)
Suggest vs implement on "fix it" prompts
Definition of done
 Research done
 Composer2.5_test_results/ — two rounds × 8 outputs
 Coding Hot includes clear output format (code + verification notes)
 Scorecard signed off
Model 3 — DeepSeek V3 (deepseek-v3 / deepSeek.V3.md)
Structure format: deepseek (Role + Task / Context / Constraints / Output format)

Research
DeepSeek official prompting guidance
Four-part pattern: Task, Context, Constraints, Output format
Strong action verbs; verification step on complex tasks
Level expectations
Level	DeepSeek-specific
Cool
Plain prose
Warm
Role + Task summary, then Input verbatim
Hot
Context, Task, Constraints, Output format — template-aligned
Max
Hot + Examples + Success criteria + verification
Red flags
Vague one-liner outputs on Hot/Max
Missing output format section
Bloated "master prompt" filler text
Definition of done
 Research done
 DeepSeekV3_test_results/ — two rounds × 8 outputs
 Consider strengthening thin deepseek contracts in guideLoader.ts if levels flatten
 Scorecard signed off
Model 4 — Grok 4 (grok-4 / grok4.md)
Structure format in code: xml (default) — guide uses GOAL/CONTEXT/OUTPUT FORMAT/QUALITY BAR

Research
xAI Grok 4 prompting — 4-part formula, live X/web search (do not invent citations)
Outcome in one sentence; quality bar with include/avoid
Level expectations
Level	Grok-specific
Cool
Plain prose
Warm
Short goal + input verbatim
Hot
Full GOAL/CONTEXT/OUTPUT FORMAT/QUALITY BAR structure (or XML equivalent if contract unchanged)
Max
Hot + example pattern + measurable quality bar items
Known risk
structureFormat("grok-4") returns xml but guide is GOAL/CONTEXT-based. If first round shows XML that doesn't match guide, add case "grok-4": return "grok" and a dedicated contract block mirroring the guide's 4-part formula.

Red flags
Invented X posts or web citations
Model name / version padding in prompt body
QUALITY BAR missing on Hot/Max
Definition of done
 Research done
 Grok4_test_results/ — two rounds × 8 outputs
 Structure format aligned with guide (code change if needed)
 Scorecard signed off
Model 5 — Gemini 3 Pro (gemini-3 / gemini.3.pro.md)
Structure format: gemini (briefest contracts — highest flattening risk)

Research
Google Gemini 3 prompting strategies
Constraints at end of prompt; avoid blanket "do not infer"
Persona can override instructions — use carefully
Temperature stays at 1.0 (not in paste-prompt, but know for evals)
Level expectations
Level	Gemini-specific
Cool
Plain prose
Warm
Persona (optional one line) + Task + Input verbatim
Hot
Context, Task, Constraints, Output — critical constraints last
Max
Hot + Examples + Success criteria; constraints still at end
Red flags
Negative constraints only at top (guide says put at end for Hot+)
Over-strong persona on L1/L2
"Do not infer" style blanket negatives
Thin contracts producing single-block output on all levels → strengthen gemini block in getLevelStructureContract
Definition of done
 Research done
 Gemini3_test_results/ — two rounds × 8 outputs
 Gemini contracts strengthened if needed (match XML/markdown detail level)
 Scorecard signed off
Execution order
Opus 4.8 — one Max validation (close the gap)
GPT-5.5 — strongest contrast to Opus; markdown contract already detailed
Composer 2.5 — Cursor-native; high user value
DeepSeek V3 — sanity check on generic rules
Grok 4 — likely structureFormat fix
Gemini 3 Pro — likely contract strengthening
Do not start model N+1 until model N's second_round scorecard is acceptable.

How to work (per model)
Phase 1 — Research
Web search official docs for the target model. Write a short beoordelingskader: level table + red flags (Dutch or English — user-facing app strings stay English).

Phase 2 — Round 1
User or agent saves 8 outputs to first_round/. Agent analyzes against research + universal scorecard.

Phase 3 — Fix
Minimal diff in guideLoader.ts / providers.ts. Add/adjust guideLoader.test.ts assertions. npm test + npm run lint.

Phase 4 — Round 2
Re-run same 8 tests → second_round_after_change/. Compare to round 1.

Phase 5 — Sign-off
If Max still collapses L3 or levels are flat → one more targeted meta-prompt tweak, not a rewrite of architecture.

Autonomy rules

Act without asking for: contract tweaks, test analysis, guideLoader/providers fixes, unit tests.
Ask only for: scope changes, destructive git ops, manual Windows UX claims you cannot verify.
Never commit unless user asks.
Final report (when all models done)
Outcome — per model: calibrated / partial / blocked
Scorecard table — model × level × Prompt A/B pass/fail
Code changes — files and why
Open gaps — e.g. Grok structureFormat, Gemini contract depth
Test evidence — npm test summary