# Prompting Guide for Composer 2.5

## Overview

Composer 2.5 is Cursor’s in-house coding model for long-running software tasks inside Cursor.[1] Cursor says it improves on Composer 2 in sustained work, reliability with complex instructions, communication style, and effort calibration.[1] It is built on the same Moonshot Kimi K2.5 checkpoint as Composer 2, but trained with more difficult reinforcement learning tasks and substantially more synthetic data.[1] Because of that training profile, the best prompts for Composer 2.5 are usually structured, repo-aware, and explicit about process, constraints, and output format.[1]

This guide is focused on practical prompting: how to ask for work, how to control behavior, how to reduce waste, and how to make Composer 2.5 behave consistently on real coding tasks.[1][2] It is written in the style of a model-specific prompt engineering guide rather than a product review.[1]

## What Composer 2.5 Appears Optimized For

Cursor describes Composer 2.5 as better at long-running tasks and more reliable at following complex instructions.[1] The same post explains that Cursor specifically trained behavior such as coding style and model communication, not just benchmark performance.[1] That matters for prompting: it suggests the model responds well to instruction hierarchy, localized feedback, and iterative workflows where expectations are clearly stated up front.[1]

Composer 2 was already trained on long-horizon coding tasks that require hundreds of actions. Composer 2.5 extends that direction with 25 times more synthetic tasks than Composer 2 and new targeted RL methods that reinforce local corrections such as fixing a bad tool call or a style violation.[1] In practice, this means prompting works best when requests are split into phases and when feedback is precise rather than emotional or vague.[1]

## Core Prompting Principles

### 1. State the goal in one sentence

Open with a concrete objective before giving detail.[1] Good examples are “Add offline caching for the feed screen” or “Refactor the auth flow to remove duplicate session refresh logic.” A short, specific goal helps anchor all later instructions and reduces the chance that the model optimizes for a side quest instead of the real task.[1]

Recommended pattern:

```md
Goal
- Add [feature/fix/refactor] to [area of codebase] so that [user or system outcome].
```

### 2. Give repo context early

Composer 2.5 is intended for real codebase work rather than isolated snippets.[1] It performs better when the prompt names the stack, architecture, conventions, and key files before asking for changes.[1] If a repo has existing patterns for API access, state management, form validation, logging, testing, or folder layout, include them explicitly so the model follows them instead of inventing alternatives.[1]



### 3. Specify constraints before the work starts

Composer 2.5 follows complex instructions more reliably when they are stated explicitly.[1] Put hard limits in the prompt before asking for implementation: no new dependencies, no breaking API changes, no edits outside a listed folder, no `any`, no class components, preserve public exports, or keep behavior identical except for the named fix.[1] This is more effective than correcting the model after it has already gone in the wrong direction.[1]

Recommended pattern:

```md
Constraints
- Do not add dependencies.
- Preserve current public API.
- Do not edit files outside /features/auth except tests.
- Use async/await only.
- No any or ts-ignore.
```

### 4. Ask for a phased workflow

The model is positioned for sustained work on long tasks, so prompting it as a workflow is usually better than asking for everything at once.[1] A strong default is: inspect, plan, wait, implement, verify.[1] This gives the model room to reason over the repo while still keeping you in control of scope and review points.[1]

Recommended pattern:

```md
Process
1. Inspect the relevant files first.
2. Summarize your understanding in 5-10 bullets.
3. Propose a plan.
4. Wait for my OK.
5. Implement in small steps.
6. Show diffs only.
7. End with verification notes and risks.
```

### 5. Define the output format

Much prompt failure is really output-format failure.[1] If you want a plan, ask for bullets. If you want only code changes, ask for a unified diff. If you want a reviewable answer, cap length and structure it with headings.[1] Composer 2.5 was trained on communication style as well as coding behavior, so presentation instructions are worth including.[1]

Recommended pattern:

```md
Output format
- Use headings.
- Keep explanation under 200 words.
- Show unified diffs only.
- Put code in fenced blocks.
- End with a checklist of tests and edge cases.
```

### 6. Use local feedback, not generic criticism

Cursor says Composer 2.5 was trained with targeted textual feedback that points to the exact place in a trajectory where the behavior should improve.[1] That means prompts such as “Use the existing query helper instead of direct Supabase calls” or “Keep the explanation shorter and focus on changed files” are better aligned with how the model was trained than broad feedback like “this is bad” or “be smarter.”[1] Specific feedback tied to one behavior tends to produce more stable improvement on the next turn.[1]

Recommended pattern:

```md
Feedback on previous answer
- Good: you found the right root cause.
- Improve: use the existing auth service instead of adding a new helper.
- Improve: keep the response shorter and show only changed files.
- Apply this feedback in the next answer.
```

## Prompt Structure That Works Well

A practical Composer 2.5 prompt often has six blocks: goal, context, constraints, process, output format, and success criteria.[1] This structure matches the model’s strengths in instruction-following and long-horizon coding work.[1]

Template:

```md
Goal
- [What should be achieved]

Context
- [Tech stack]
- [Relevant files]
- [Existing patterns]

Constraints
- [What it must not do]
- [Coding rules]
- [Scope boundaries]

Process
1. Inspect
2. Summarize
3. Plan
4. Wait for approval
5. Implement
6. Verify

Output format
- [Bullets, diff, short explanation, checklist]

Success criteria
- [How to tell the work is done]
```

For small tasks, this can be compressed into a short prompt with the same logic.[1] For large tasks, expand each block instead of writing one giant paragraph.[1]

## Patterns by Task Type

### Feature implementation

Use a prompt that defines the user outcome, affected area, existing architecture, and approval gate before changes.[1] Composer 2.5 is especially suited to this because Cursor frames it as stronger on sustained work and complex instructions.[1]

Example:

```md
Goal
- Add pull-to-refresh and 30-second cache invalidation to the activity feed.

Context
- Stack: React Native + Expo + Supabase.
- Relevant files:
  - app/screens/FeedScreen.tsx
  - hooks/useFeed.ts
  - services/feedService.ts
- Existing pattern: all data access goes through services.

Constraints
- Do not add dependencies.
- No direct Supabase calls in UI components.
- Preserve current loading and error UI behavior.

Process
1. Inspect the relevant files.
2. Explain the current data flow in up to 8 bullets.
3. Propose a plan.
4. Wait for my OK.
5. Implement in small steps and show diffs only.
6. End with tests and edge cases.
```

### Bug fixing

For debugging, ask for hypothesis formation before implementation.[1] This reduces random edits and uses the model more like an investigator than a code generator.[1]

Example:

```md
Bug
- Users sometimes get signed out after app resume.

Task
1. List the top 3 likely causes based on the current auth flow.
2. Identify which files you need to inspect and why.
3. Propose the safest fix.
4. Wait for approval.
5. Implement and show diffs only.
6. End with regression risks and test cases.
```

### Refactoring

For refactors, define what must stay unchanged.[1] The model is strong enough to perform large changes, but without guardrails it may optimize for elegance over stability.[1]

Example:

```md
Goal
- Refactor the notifications module for readability and duplication reduction.

Must remain unchanged
- Public exports
- Runtime behavior
- Existing analytics event names
- Current test coverage expectations

Task
1. Summarize the current structure.
2. Identify duplication and high-risk areas.
3. Propose a phased refactor.
4. Wait for GO.
5. Implement in small reviewable diffs.
```

### Code review

Composer 2.5 can also be prompted as a reviewer instead of an implementer.[1] This works well when you want structured feedback rather than edits.[1]

Example:

```md
Review task
- Review this diff for correctness, maintainability, edge cases, and consistency with existing patterns.

Output
the output should be the logic output of the users prompt
  
- Do not rewrite the entire implementation.
```

## Prompting Tactics That Usually Improve Results

### Prefer “inspect first” over “code now”

Because Composer 2.5 is built for long-running work, it is often better to let it map the local codebase before editing.[1] Asking it to inspect first reduces premature abstraction and makes later edits more consistent with the repo’s existing style.[1]

### Ask for diffs, not full files

Cursor prices Composer 2.5 by input and output tokens, with a standard tier at $0.50 per million input tokens and $2.50 per million output tokens, plus a faster default variant that costs more.[1] Diff-only output keeps responses leaner and easier to review, which helps both cost and quality.[1]

### Cap explanation length

If the task is implementation-heavy, tell the model to keep prose short.[1] This lowers noise and reduces the chance that the answer becomes a broad essay instead of usable engineering output.[1]

### Separate non-negotiables from preferences

Hard rules and soft preferences should not be mixed.[1] Put non-negotiables in a “Constraints” block and nice-to-haves in a “Preferences” block so the model can prioritize correctly.[1]

Example:

```md
Constraints
- No breaking changes.
- No new dependencies.
- No changes outside listed files.

Preferences
- Favor small helper functions.
- Keep naming aligned with existing hooks.
- Prefer composition over inheritance.
```

### Add a success test

The more specific the completion condition, the better the result usually is.[1] Instead of “improve this screen,” say “done when the screen loads from cache immediately, refreshes in the background, and preserves the empty state UI.” Clear success criteria narrow ambiguity without micromanaging implementation.[1]

## How to Give Follow-up Feedback

Cursor’s own explanation of Composer 2.5 emphasizes targeted textual feedback on local mistakes or style issues.[1] Follow-up prompts should mirror that by identifying one or two concrete corrections at a time.[1]

Good follow-up examples:

- “Keep the plan, but use the existing `sessionStore` instead of creating a new auth cache.”[1]
- “Same implementation direction, but no new dependency and no file moves.”[1]
- “Shorten the explanation and show only the changed sections.”[1]
- “The bug fix is correct, but preserve current event names and analytics payload shape.”[1]

Less effective follow-up examples:

- “Do better.”
- “This feels off.”
- “Try again from scratch.”

The weak versions give no local correction target, so they are less aligned with the model’s training signal.[1]

## A Reusable Master Template

```md
You are working on an existing codebase in Cursor with Composer 2.5.

Goal
- [Describe the exact feature, fix, refactor, or review objective in one sentence.]

Context
- Stack: [e.g. React Native, Expo, Supabase, TypeScript]
- Relevant files:
  - [file 1]
  - [file 2]
  - [file 3]
- Existing patterns:
  - [pattern 1]
  - [pattern 2]
  - [pattern 3]

Constraints
- [No breaking changes / no new dependencies / preserve exports / no any / etc.]
- [Scope boundaries]
- [Architecture rules]

Process
1. Inspect the relevant files first.
2. Summarize your understanding in up to 10 bullets.
3. Propose a plan.
4. Wait for my approval before editing code.
5. Implement in small steps.
6. Show diffs only unless I ask for full files.
7. End with verification steps, risks, and tests.

Output format
- Use headings.
- Keep explanation concise.
- Put code in fenced blocks.
- End with a checklist.

Success criteria
- [Describe how success should be verified.]
```

## Example: Better vs Worse Prompts

| Situation | Worse prompt | Better prompt |
|---|---|---|
| Feature | “Add notifications.” | “Add push notification preference toggles to the settings screen using the existing settings service, without adding dependencies, and wait for approval before code changes.” |
| Bug | “Fix auth bug.” | “Investigate why users are signed out after app resume, inspect the auth flow first, list top 3 causes, propose the safest fix, then wait for approval before implementation.” |
| Refactor | “Clean this up.” | “Refactor the notifications module to reduce duplication while preserving runtime behavior, public exports, and analytics event names; propose a phased plan first.” |
| Review | “Check my code.” | “Review this diff for correctness, maintainability, edge cases, and consistency with existing repo patterns; group findings by severity and suggest concrete fixes.” |

The better prompts give Composer 2.5 a clear objective, local context, non-negotiable constraints, and a controlled workflow.[1] That is the main pattern behind reliable prompting for this model.[1]

## Common Failure Modes

### Too little context

If the prompt omits relevant files, architecture, or conventions, the model may invent patterns that do not fit the repo.[1] This is avoidable by giving a small amount of high-value context instead of assuming the model will infer everything.[1]

### Too much work in one turn

Even for a long-horizon model, “analyze the whole repo, redesign the architecture, implement everything, and write tests” is usually too broad for one clean turn.[1] Splitting into analysis, planning, and execution phases produces more stable results.[1]

### Ambiguous scope

Prompts like “modernize this” or “make it better” leave the success condition underspecified.[1] Composer 2.5 follows instructions better when the task has explicit boundaries and a named definition of done.[1]

### Missing output rules

If you do not specify diff-only output, length, or review structure, the answer may become verbose or hard to apply.[1] Output format should be treated as part of the task, not an afterthought.[1]

### Vague feedback loops

Because the model was trained with targeted feedback, follow-up guidance should be local and concrete.[1] Specific corrections usually outperform broad restarts.[1]

## Recommendations for Daily Use

- Start with a one-line goal.[1]
- Add only the repo context that materially changes the implementation.[1]
- Put hard rules in a dedicated constraints section.[1]
- Ask for inspect → summarize → plan → wait → implement → verify.[1]
- Request diffs instead of full files when possible.[1]
- Give localized follow-up corrections instead of broad criticism.[1]
- Define success in observable terms such as behavior, tests, or preserved interfaces.[1]

## Final Takeaway

The most effective way to prompt Composer 2.5 is to treat it like a repo-aware coding agent that performs best with explicit goals, strong local context, hard constraints, phased execution, and targeted follow-up feedback.[1] Cursor’s own description of the model points directly to those behaviors: better sustained work on long tasks, stronger handling of complex instructions, and training methods that reinforce localized corrections in coding style, communication, and tool use.[1] Prompting that matches those strengths is usually more reliable than asking for big unspecific code generation in a single shot.[1]