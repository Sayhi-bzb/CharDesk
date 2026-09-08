import { createKeyInput, type KeyInput } from "./index.js";

export type KeyboardEventLike = Readonly<{
  type: string;
  key: string;
  code: string;
  location: number;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
  isComposing: boolean;
  getModifierState?: (key: string) => boolean;
}>;

export const keyInputFromKeyboardEvent = (event: KeyboardEventLike): KeyInput =>
  createKeyInput({
    phase: event.type === "keyup" ? "up" : "down",
    key: event.key,
    code: event.code,
    location: event.location,
    modifiers: {
      alt: event.altKey,
      ctrl: event.ctrlKey,
      meta: event.metaKey,
      shift: event.shiftKey,
      altGraph: event.getModifierState?.("AltGraph") ?? false,
    },
    repeat: event.repeat,
    composing: event.isComposing,
  });
