# Anvyll Studio brand specification

## Source assets

- Product mark: `assets/icon-source.png`
- Windows application icon: `build/icon.ico`
- Model identity assets: `src/renderer/assets/model-logos/`
- Forge theme previews: `src/renderer/assets/theme-previews/`
- Existing product UI source: `src/renderer/views/Overlay.tsx`, `src/renderer/themes.css`

The Studio imports the existing Anvyll product mark. It does not redraw or substitute the logo.

## Product character

Anvyll Studio is a focused Windows-native prompt workspace: precise, restrained, and fast. The premium redesign uses Prompt Builder’s observable hierarchy—persistent navigation, usage visibility, task-specific canvases, and progressive refinement—without copying its brand.

## Visual system

- Color: all Studio surfaces derive from the active forge theme tokens in `themes.css`.
- Typography: each theme’s `--font-display` gives headings their identity; `--font-sans` handles controls and body copy; JetBrains Mono is reserved for prompt output and indexes.
- Spacing: 8px base rhythm, with compact 4px steps for dense tool controls.
- Radius: 8px controls, 12px compact cards, 18px primary work surfaces and modals.
- Elevation: hairline borders plus two restrained shadow levels.
- Motion: 140–220ms state transitions; reduced-motion disables nonessential movement.

## Interaction rules

- One primary action per task surface.
- Visible hover, focus, active, disabled, empty, loading, streaming, error, quota, and integration-pending states.
- Generator and Optimizer remain separate.
- Target model methodology remains separate from the GPT-4.1 rewrite model.
- The hotkey overlay is outside this redesign and must retain its current behavior and styling.

## Viewport targets

- Minimum supported Studio window: 960×640.
- Default Studio window: 1280×820.
- All eight forge themes must remain legible at both sizes.

