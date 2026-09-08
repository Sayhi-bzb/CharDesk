import { describe, expect, it } from "vitest";
import { createKeyInput } from "./index.js";

describe("KeyInput", () => {
  it("creates a complete deterministic input from minimal facts", () => {
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
    expect(createKeyInput({ key: "1", location: 8 }).location).toBe(0);
  });
});
