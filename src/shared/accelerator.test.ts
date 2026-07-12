import { describe, expect, it } from "vitest";
import {
  acceleratorDisplayParts,
  acceleratorFromEvent,
  isValidAccelerator,
  normalizeAccelerator,
} from "./accelerator";

const base = { ctrlKey: false, shiftKey: false, altKey: false, metaKey: false };

describe("acceleratorFromEvent", () => {
  it("builds CommandOrControl+Shift+letter combos uppercased", () => {
    expect(acceleratorFromEvent({ ...base, ctrlKey: true, shiftKey: true, key: "o" })).toBe(
      "CommandOrControl+Shift+O",
    );
  });

  it("maps Meta (Win key) to Super", () => {
    expect(acceleratorFromEvent({ ...base, metaKey: true, key: "k" })).toBe("Super+K");
    expect(acceleratorFromEvent({ ...base, ctrlKey: true, metaKey: true, key: "k" })).toBe(
      "CommandOrControl+Super+K",
    );
  });

  it("returns null for modifier-only presses", () => {
    expect(acceleratorFromEvent({ ...base, ctrlKey: true, key: "Control" })).toBeNull();
    expect(acceleratorFromEvent({ ...base, shiftKey: true, key: "Shift" })).toBeNull();
    expect(acceleratorFromEvent({ ...base, metaKey: true, key: "Meta" })).toBeNull();
  });

  it("returns null without any modifier (global hotkeys must be chorded)", () => {
    expect(acceleratorFromEvent({ ...base, key: "a" })).toBeNull();
    expect(acceleratorFromEvent({ ...base, key: "F5" })).toBeNull();
  });

  it("returns null for Escape (reserved for cancel)", () => {
    expect(acceleratorFromEvent({ ...base, ctrlKey: true, key: "Escape" })).toBeNull();
  });

  it("returns null for key repeats and dead keys", () => {
    expect(acceleratorFromEvent({ ...base, ctrlKey: true, key: "o", repeat: true })).toBeNull();
    expect(acceleratorFromEvent({ ...base, ctrlKey: true, key: "Dead" })).toBeNull();
  });

  it("prefers KeyboardEvent.code so shifted keys record their base key", () => {
    expect(
      acceleratorFromEvent({ ...base, ctrlKey: true, shiftKey: true, key: "!", code: "Digit1" }),
    ).toBe("CommandOrControl+Shift+1");
    expect(acceleratorFromEvent({ ...base, ctrlKey: true, key: "o", code: "KeyO" })).toBe(
      "CommandOrControl+O",
    );
    expect(acceleratorFromEvent({ ...base, altKey: true, key: "5", code: "Numpad5" })).toBe(
      "Alt+num5",
    );
  });

  it("normalizes special key names", () => {
    expect(acceleratorFromEvent({ ...base, ctrlKey: true, key: " " })).toBe("CommandOrControl+Space");
    expect(acceleratorFromEvent({ ...base, altKey: true, key: "ArrowUp" })).toBe("Alt+Up");
    expect(acceleratorFromEvent({ ...base, ctrlKey: true, key: "+" })).toBe("CommandOrControl+Plus");
    expect(acceleratorFromEvent({ ...base, ctrlKey: true, shiftKey: true, key: "F9" })).toBe(
      "CommandOrControl+Shift+F9",
    );
  });

  it("round-trips through normalizeAccelerator unchanged", () => {
    const events = [
      { ...base, ctrlKey: true, shiftKey: true, key: "o" },
      { ...base, metaKey: true, key: "k" },
      { ...base, ctrlKey: true, key: " " },
      { ...base, altKey: true, key: "ArrowUp" },
      { ...base, ctrlKey: true, key: "+" },
      { ...base, ctrlKey: true, shiftKey: true, key: "!", code: "Digit1" },
      { ...base, ctrlKey: true, shiftKey: true, altKey: true, metaKey: true, key: "F9" },
    ];
    for (const e of events) {
      const acc = acceleratorFromEvent(e);
      expect(acc).not.toBeNull();
      expect(normalizeAccelerator(acc!)).toBe(acc);
    }
  });
});

describe("normalizeAccelerator", () => {
  it("canonicalizes case-insensitive modifier aliases", () => {
    expect(normalizeAccelerator("ctrl+shift+o")).toBe("Control+Shift+O");
    expect(normalizeAccelerator("cmdorctrl+k")).toBe("CommandOrControl+K");
    expect(normalizeAccelerator("CommandOrControl+Shift+O")).toBe("CommandOrControl+Shift+O");
    expect(normalizeAccelerator("win+space")).toBe("Super+Space");
    expect(normalizeAccelerator("meta+d")).toBe("Super+D");
    expect(normalizeAccelerator("option+p")).toBe("Alt+P");
  });

  it("tolerates whitespace around separators", () => {
    expect(normalizeAccelerator("  Ctrl + Shift + O ")).toBe("Control+Shift+O");
  });

  it("orders modifiers canonically and dedupes them", () => {
    expect(normalizeAccelerator("Shift+Ctrl+O")).toBe("Control+Shift+O");
    expect(normalizeAccelerator("alt+super+shift+ctrl+x")).toBe("Control+Shift+Alt+Super+X");
    expect(normalizeAccelerator("ctrl+control+o")).toBe("Control+O");
  });

  it("treats a trailing ++ as the literal Plus key", () => {
    expect(normalizeAccelerator("ctrl++")).toBe("Control+Plus");
    expect(normalizeAccelerator("Ctrl+Plus")).toBe("Control+Plus");
  });

  it("normalizes key aliases", () => {
    expect(normalizeAccelerator("ctrl+esc")).toBeNull(); // Escape reserved
    expect(normalizeAccelerator("ctrl+return")).toBe("Control+Enter");
    expect(normalizeAccelerator("alt+pgup")).toBe("Alt+PageUp");
    expect(normalizeAccelerator("ctrl+del")).toBe("Control+Delete");
    expect(normalizeAccelerator("ctrl+arrowdown")).toBe("Control+Down");
    expect(normalizeAccelerator("ctrl+num7")).toBe("Control+num7");
    expect(normalizeAccelerator("ctrl+f24")).toBe("Control+F24");
    expect(normalizeAccelerator("ctrl+;")).toBe("Control+;");
  });

  it("rejects invalid strings", () => {
    expect(normalizeAccelerator("")).toBeNull();
    expect(normalizeAccelerator("Ctrl+Shft+O")).toBeNull(); // typo'd modifier
    expect(normalizeAccelerator("Ctrl+Shift")).toBeNull(); // modifier-only
    expect(normalizeAccelerator("O")).toBeNull(); // key-only
    expect(normalizeAccelerator("Ctrl+A+B")).toBeNull(); // two keys
    expect(normalizeAccelerator("Ctrl+F25")).toBeNull(); // F-keys stop at 24
    expect(normalizeAccelerator("foo")).toBeNull();
  });

  it("requires a non-Shift modifier for ordinary keys", () => {
    expect(normalizeAccelerator("Shift+O")).toBeNull();
    expect(normalizeAccelerator("Alt+O")).toBe("Alt+O");
  });

  it("allows unchorded F-keys and media keys", () => {
    expect(normalizeAccelerator("F12")).toBe("F12");
    expect(normalizeAccelerator("Shift+F12")).toBe("Shift+F12");
    expect(normalizeAccelerator("mediaplaypause")).toBe("MediaPlayPause");
    expect(normalizeAccelerator("volumemute")).toBe("VolumeMute");
  });
});

describe("isValidAccelerator", () => {
  it("mirrors normalizeAccelerator", () => {
    expect(isValidAccelerator("ctrl+shift+o")).toBe(true);
    expect(isValidAccelerator("Ctrl+Shft+O")).toBe(false);
  });
});

describe("acceleratorDisplayParts", () => {
  it("maps modifiers to friendly labels", () => {
    expect(acceleratorDisplayParts("CommandOrControl+Shift+O")).toEqual(["Ctrl", "Shift", "O"]);
    expect(acceleratorDisplayParts("Control+Super+K")).toEqual(["Ctrl", "Win", "K"]);
    expect(acceleratorDisplayParts("")).toEqual([]);
  });
});
