import { describe, expect, it, vi } from "vitest";
import { keyInputFromKeyboardEvent } from "./browser.js";

describe("browser keyboard adapter", () => {
  it("preserves native identity, phase, modifiers, repeat, and composition", () => {
    const event = new KeyboardEvent("keyup", {
      key: "AltGraph",
      code: "AltRight",
      location: KeyboardEvent.DOM_KEY_LOCATION_RIGHT,
      altKey: true,
      ctrlKey: true,
      shiftKey: true,
      repeat: true,
      isComposing: true,
    });
    vi.spyOn(event, "getModifierState").mockImplementation(
      (modifier) => modifier === "AltGraph"
    );

    expect(keyInputFromKeyboardEvent(event)).toMatchObject({
      phase: "up",
      key: "AltGraph",
      code: "AltRight",
      location: 2,
      modifiers: { alt: true, ctrl: true, meta: false, shift: true, altGraph: true },
      repeat: true,
      composing: true,
    });
  });
});
