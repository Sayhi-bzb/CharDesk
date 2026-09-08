import { describe, expect, it } from "vitest";
import {
  createKeyInput,
  type KeyInput,
} from "./index.js";
import { textCommandForKeyInput } from "./keyboard.js";

describe("Cell key input", () => {
  it("creates a complete deterministic event from minimal input", () => {
    expect(createKeyInput({ key: "Enter" })).toEqual({
      type: "key",
      phase: "down",
      key: "Enter",
      code: "",
      location: 0,
      modifiers: {
        alt: false,
        ctrl: false,
        meta: false,
        shift: false,
        altGraph: false,
      },
      repeat: false,
      composing: false,
    });
    expect(createKeyInput({ key: "1", location: 9 }).location).toBe(0);
  });

  it("maps text commands without treating modified navigation or IME keys as text editing", () => {
    const input = (key: string, fields: Partial<Omit<KeyInput, "type" | "key">> = {}) =>
      createKeyInput({ key, ...fields });

    expect(textCommandForKeyInput(input("ArrowLeft"), false))
      .toEqual({ type: "move", direction: "left", extend: false });
    expect(textCommandForKeyInput(input("ArrowRight", {
      modifiers: { alt: false, ctrl: false, meta: false, shift: true, altGraph: false },
    }), false)).toEqual({ type: "move", direction: "right", extend: true });
    expect(textCommandForKeyInput(input("z", {
      modifiers: { alt: false, ctrl: true, meta: false, shift: true, altGraph: false },
    }), false)).toEqual({ type: "redo" });
    expect(textCommandForKeyInput(input("ArrowLeft", {
      modifiers: { alt: false, ctrl: false, meta: true, shift: false, altGraph: false },
    }), false)).toBeNull();
    expect(textCommandForKeyInput(input("Dead"), false)).toBeNull();
    expect(textCommandForKeyInput(input("Enter", { composing: true }), true)).toBeNull();
  });
});
