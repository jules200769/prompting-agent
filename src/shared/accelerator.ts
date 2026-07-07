// Build an Electron accelerator string from a keyboard event (Settings hotkey recorder).

export interface AcceleratorKeyEvent {
  key: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta", "AltGraph"]);

const KEY_NAMES: Record<string, string> = {
  " ": "Space",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  "+": "Plus",
};

/**
 * Returns an Electron accelerator (e.g. "CommandOrControl+Shift+O") for a keydown,
 * or null when the combo is incomplete: modifier-only, no modifier at all
 * (global hotkeys must be chorded), or Escape (reserved for cancel).
 */
export function acceleratorFromEvent(e: AcceleratorKeyEvent): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null;
  if (e.key === "Escape") return null;
  const mods: string[] = [];
  if (e.ctrlKey || e.metaKey) mods.push("CommandOrControl");
  if (e.shiftKey) mods.push("Shift");
  if (e.altKey) mods.push("Alt");
  if (mods.length === 0) return null;
  const key = KEY_NAMES[e.key] ?? (e.key.length === 1 ? e.key.toUpperCase() : e.key);
  return [...mods, key].join("+");
}
