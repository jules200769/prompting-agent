import { describe, expect, it } from "vitest";
import { acceleratorFromEvent } from "./accelerator";

const base = { ctrlKey: false, shiftKey: false, altKey: false, metaKey: false };

describe("acceleratorFromEvent", () => {
  it("builds CommandOrControl+Shift+letter combos uppercased", () => {
    expect(acceleratorFromEvent({ ...base, ctrlKey: true, shiftKey: true, key: "o" })).toBe(
      "CommandOrControl+Shift+O",
    );
  });

  it("maps Meta to CommandOrControl", () => {
    expect(acceleratorFromEvent({ ...base, metaKey: true, key: "k" })).toBe("CommandOrControl+K");
  });

  it("returns null for modifier-only presses", () => {
    expect(acceleratorFromEvent({ ...base, ctrlKey: true, key: "Control" })).toBeNull();
    expect(acceleratorFromEvent({ ...base, shiftKey: true, key: "Shift" })).toBeNull();
  });

  it("returns null without any modifier (global hotkeys must be chorded)", () => {
    expect(acceleratorFromEvent({ ...base, key: "a" })).toBeNull();
    expect(acceleratorFromEvent({ ...base, key: "F5" })).toBeNull();
  });

  it("returns null for Escape (reserved for cancel)", () => {
    expect(acceleratorFromEvent({ ...base, ctrlKey: true, key: "Escape" })).toBeNull();
  });

  it("normalizes special key names", () => {
    expect(acceleratorFromEvent({ ...base, ctrlKey: true, key: " " })).toBe("CommandOrControl+Space");
    expect(acceleratorFromEvent({ ...base, altKey: true, key: "ArrowUp" })).toBe("Alt+Up");
    expect(acceleratorFromEvent({ ...base, ctrlKey: true, key: "+" })).toBe("CommandOrControl+Plus");
    expect(acceleratorFromEvent({ ...base, ctrlKey: true, shiftKey: true, key: "F9" })).toBe(
      "CommandOrControl+Shift+F9",
    );
  });
});
