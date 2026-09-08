import type { KeyInput } from "@chardesk/keyboard";
import type { CellTextCommand } from "./text.js";

const isCompositionKey = (key: string) =>
  key === "Dead" || key === "Unidentified" || key === "Process";

const hasCommandModifier = (input: KeyInput) =>
  input.modifiers.alt
  || input.modifiers.ctrl
  || input.modifiers.meta
  || input.modifiers.altGraph;

const repeatableWidgetKeys = new Set([
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "End",
  "Home",
  "PageDown",
  "PageUp",
]);

export const acceptsWidgetKeyInput = (input: KeyInput): boolean =>
  input.phase === "down"
  && !input.composing
  && !isCompositionKey(input.key)
  && !hasCommandModifier(input)
  && (!input.repeat || repeatableWidgetKeys.has(input.key));

export const isCellKeyPress = (
  input: KeyInput,
  key: string,
  options: Readonly<{ allowRepeat?: boolean }> = {}
): boolean =>
  input.key === key
  && input.phase === "down"
  && !input.composing
  && !isCompositionKey(input.key)
  && !hasCommandModifier(input)
  && (options.allowRepeat === true || !input.repeat);

export const textCommandForKeyInput = (
  input: KeyInput,
  multiline: boolean
): CellTextCommand | null => {
  if (
    input.phase !== "down"
    || input.composing
    || input.modifiers.alt
    || input.modifiers.altGraph
    || isCompositionKey(input.key)
  ) return null;

  const commandModifier = input.modifiers.meta || input.modifiers.ctrl;
  if (commandModifier) {
    const key = input.key.toLowerCase();
    if (key === "a") return { type: "select-all" };
    if (key === "z") return { type: input.modifiers.shift ? "redo" : "undo" };
    if (key === "y") return { type: "redo" };
    return null;
  }

  if (input.key === "ArrowLeft") {
    return { type: "move", direction: "left", extend: input.modifiers.shift };
  }
  if (input.key === "ArrowRight") {
    return { type: "move", direction: "right", extend: input.modifiers.shift };
  }
  if (input.key === "ArrowUp") {
    return { type: "move", direction: "up", extend: input.modifiers.shift };
  }
  if (input.key === "ArrowDown") {
    return { type: "move", direction: "down", extend: input.modifiers.shift };
  }
  if (input.key === "Home") {
    return { type: "move", direction: "line-start", extend: input.modifiers.shift };
  }
  if (input.key === "End") {
    return { type: "move", direction: "line-end", extend: input.modifiers.shift };
  }
  if (input.key === "Enter" && multiline) return { type: "insert", text: "\n" };
  return null;
};
