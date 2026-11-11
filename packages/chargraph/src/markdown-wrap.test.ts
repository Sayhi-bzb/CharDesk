import { expect, it } from "vitest";
import { wrapMarkdownProse } from "./markdown-wrap.js";

it.each([
  "明确任务目标与交付要求\n              ↓ 检查",
  "first\n   \n  last  ",
  "任务 🦀\n　　↓ 检查",
])("preserves authored whitespace while wrapping: %s", source => {
  expect(wrapMarkdownProse([{ text: source }], 80).map(part => part.text).join("")).toBe(source);
});

it("consumes a word separator at an automatic break without consuming the next authored indent", () => {
  const fragments = wrapMarkdownProse([{ text: "first second\n   next" }], 7);
  expect(fragments.map(part => part.text).join("")).toBe("first\nsecond\n   next");
});
