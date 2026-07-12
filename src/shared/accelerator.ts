// Electron accelerator utilities: build from keyboard events (Settings hotkey
// recorder), normalize/validate user-typed strings, and format for display.

export interface AcceleratorKeyEvent {
  key: string;
  /** KeyboardEvent.code — preferred for the key so Shift+1 records as "1", not "!". */
  code?: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  repeat?: boolean;
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

// KeyboardEvent.code → Electron key code, for codes that don't follow the
// Key*/Digit*/F*/Numpad* patterns handled in keyFromCode.
const CODE_NAMES: Record<string, string> = {
  Space: "Space",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Enter: "Enter",
  Tab: "Tab",
  Backspace: "Backspace",
  Delete: "Delete",
  Insert: "Insert",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Semicolon: ";",
  Quote: "'",
  Backquote: "`",
  Backslash: "\\",
  Comma: ",",
  Period: ".",
  Slash: "/",
  NumpadAdd: "numadd",
  NumpadSubtract: "numsub",
  NumpadMultiply: "nummult",
  NumpadDivide: "numdiv",
  NumpadDecimal: "numdec",
  PrintScreen: "PrintScreen",
};

function keyFromCode(code: string): string | null {
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1];
  const digit = /^Digit([0-9])$/.exec(code);
  if (digit) return digit[1];
  const fn = /^F([1-9]|1[0-9]|2[0-4])$/.exec(code);
  if (fn) return `F${fn[1]}`;
  const numpad = /^Numpad([0-9])$/.exec(code);
  if (numpad) return `num${numpad[1]}`;
  return CODE_NAMES[code] ?? null;
}

/**
 * Returns an Electron accelerator (e.g. "CommandOrControl+Shift+O") for a keydown,
 * or null when the combo is incomplete: modifier-only, no modifier at all
 * (global hotkeys must be chorded), key repeat, dead keys, or Escape (reserved
 * for cancel).
 */
export function acceleratorFromEvent(e: AcceleratorKeyEvent): string | null {
  if (e.repeat) return null;
  if (MODIFIER_KEYS.has(e.key) || e.key === "Dead") return null;
  if (e.key === "Escape") return null;
  const mods: string[] = [];
  if (e.ctrlKey) mods.push("CommandOrControl");
  if (e.shiftKey) mods.push("Shift");
  if (e.altKey) mods.push("Alt");
  if (e.metaKey) mods.push("Super");
  if (mods.length === 0) return null;
  const key =
    (e.code ? keyFromCode(e.code) : null) ??
    KEY_NAMES[e.key] ??
    (e.key.length === 1 ? e.key.toUpperCase() : e.key);
  return [...mods, key].join("+");
}

// ---------- Normalization / validation of typed accelerator strings ----------

const MODIFIER_ALIASES: Record<string, string> = {
  ctrl: "Control",
  control: "Control",
  cmd: "Command",
  command: "Command",
  cmdorctrl: "CommandOrControl",
  commandorcontrol: "CommandOrControl",
  ctrlorcmd: "CommandOrControl",
  alt: "Alt",
  option: "Alt",
  altgr: "AltGr",
  altgraph: "AltGr",
  shift: "Shift",
  super: "Super",
  meta: "Super",
  win: "Super",
  windows: "Super",
};

// Modifier output order matches acceleratorFromEvent so recorded combos round-trip.
const MODIFIER_ORDER: Record<string, number> = {
  CommandOrControl: 0,
  Command: 1,
  Control: 2,
  Shift: 3,
  Alt: 4,
  AltGr: 5,
  Super: 6,
};

const KEY_ALIASES: Record<string, string> = {
  space: "Space",
  spacebar: "Space",
  up: "Up",
  arrowup: "Up",
  down: "Down",
  arrowdown: "Down",
  left: "Left",
  arrowleft: "Left",
  right: "Right",
  arrowright: "Right",
  enter: "Enter",
  return: "Enter",
  tab: "Tab",
  backspace: "Backspace",
  delete: "Delete",
  del: "Delete",
  insert: "Insert",
  ins: "Insert",
  home: "Home",
  end: "End",
  pageup: "PageUp",
  pgup: "PageUp",
  pagedown: "PageDown",
  pgdn: "PageDown",
  esc: "Escape",
  escape: "Escape",
  plus: "Plus",
  printscreen: "PrintScreen",
  numadd: "numadd",
  numsub: "numsub",
  nummult: "nummult",
  numdiv: "numdiv",
  numdec: "numdec",
  volumeup: "VolumeUp",
  volumedown: "VolumeDown",
  volumemute: "VolumeMute",
  medianexttrack: "MediaNextTrack",
  mediaprevioustrack: "MediaPreviousTrack",
  mediastop: "MediaStop",
  mediaplaypause: "MediaPlayPause",
};

// Keys Electron accepts without a modifier chord.
const UNCHORDED_OK = new Set([
  "VolumeUp",
  "VolumeDown",
  "VolumeMute",
  "MediaNextTrack",
  "MediaPreviousTrack",
  "MediaStop",
  "MediaPlayPause",
]);

// Modifiers that make an ordinary key a viable global hotkey (Shift alone is not).
const CHORD_MODIFIERS = new Set(["CommandOrControl", "Command", "Control", "Alt", "AltGr", "Super"]);

function normalizeKeyToken(token: string): string | null {
  const lower = token.toLowerCase();
  if (KEY_ALIASES[lower]) return KEY_ALIASES[lower];
  if (/^[a-z]$/.test(lower)) return lower.toUpperCase();
  if (/^[0-9]$/.test(token)) return token;
  const fn = /^f([1-9]|1[0-9]|2[0-4])$/.exec(lower);
  if (fn) return `F${fn[1]}`;
  const numpad = /^num([0-9])$/.exec(lower);
  if (numpad) return `num${numpad[1]}`;
  // Single-character punctuation (";", "[", "=", …) is a valid Electron key code.
  if (token.length === 1 && !/\s/.test(token)) return token;
  return null;
}

/**
 * Parse a user-typed hotkey string into a canonical Electron accelerator,
 * or null when it isn't a valid global hotkey. Tolerates whitespace and
 * case-insensitive aliases (ctrl, win, option, …); "Ctrl++" means Ctrl
 * plus the literal "+" key. Requires exactly one non-modifier key, chorded
 * with a non-Shift modifier unless the key is an F-key or media key.
 */
export function normalizeAccelerator(input: string): string | null {
  const compact = input.trim().replace(/\s*\+\s*/g, "+");
  if (!compact) return null;
  const tokens = compact.replace(/\+\+/g, "+Plus").split("+");
  if (tokens.some((t) => t === "")) return null;

  const mods = new Set<string>();
  const keys: string[] = [];
  for (const token of tokens) {
    const mod = MODIFIER_ALIASES[token.toLowerCase()];
    if (mod) {
      mods.add(mod);
      continue;
    }
    const key = normalizeKeyToken(token);
    if (!key) return null;
    keys.push(key);
  }

  if (keys.length !== 1) return null;
  const key = keys[0];
  if (key === "Escape") return null;

  const chorded = [...mods].some((m) => CHORD_MODIFIERS.has(m));
  const unchordedOk = UNCHORDED_OK.has(key) || /^F([1-9]|1[0-9]|2[0-4])$/.test(key);
  if (!chorded && !unchordedOk) return null;

  const ordered = [...mods].sort((a, b) => MODIFIER_ORDER[a] - MODIFIER_ORDER[b]);
  return [...ordered, key].join("+");
}

export function isValidAccelerator(input: string): boolean {
  return normalizeAccelerator(input) !== null;
}

const DISPLAY_LABELS: Record<string, string> = {
  CommandOrControl: "Ctrl",
  CmdOrCtrl: "Ctrl",
  Control: "Ctrl",
  Command: "Cmd",
  Cmd: "Cmd",
  Super: "Win",
  Meta: "Win",
  AltGraph: "AltGr",
};

/** Display labels for an accelerator's parts (keycap chips, tray tooltip). */
export function acceleratorDisplayParts(accelerator: string): string[] {
  if (!accelerator) return [];
  return accelerator.split("+").map((p) => DISPLAY_LABELS[p] ?? p);
}
