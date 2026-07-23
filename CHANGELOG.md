# Changelog

## Unreleased

- Added **context awareness Phase 1–3**: Overlay/Studio Refine auto-ensures an active session so runs stamp `sessionId`; Settings **Standing notes (all Refines)** merge main-side on every optimize; softer session/project grounding allows folding established facts; quiet “Session memory updated” hint after refresh.
- Added **per-project file memory**: destination file hints scope to the active project (legacy entries stay global/unscoped).
- Added **Promote to project**: Context panel suggests merging session KEY FACTS/TERMINOLOGY into project memory via compact (explicit user action only).
- Added session memory delta **destination hints** and **Studio verdict** lines on Apply/Copy refresh.
- Bumped rewrite pipeline to **v15** (standing notes + grounding text in meta-prompt).
- Added **Session memory** refresh: after Apply or Copy, the active session's standing context is debounced-refreshed into the six-label summary via GPT-4.1 (toggle in Studio Settings; project memory stays manual).
- Added Import-context **Compact and add**: pastes longer than 4k chars show a compact step (session or project) with a spectral loading animation before saving.
- Changed Cursor integrated-terminal refinement sessions to a single modal-styled Copy action; Apply/injection remains available everywhere else.
