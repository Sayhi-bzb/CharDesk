import type { ActionSource } from "@/domains/actions/core/types";
import type { KeyInput } from "@chardesk/keyboard";
import { shouldIgnoreClipboardShortcut } from "@/shared/utils/dom-focus";
import { getFirstGrapheme } from "@/shared/utils/characters";

const isCommandBypassingFocusGuard = (source: ActionSource) => {
  return source === "context-menu" || source === "canvas-keydown";
};

const isNamedKey = (key: string) =>
  key.length > 1 && /^[A-Za-z][A-Za-z0-9]*$/.test(key);

export const shouldIgnoreEditorCommandByFocus = (
  source: ActionSource,
  managedTextarea?: HTMLTextAreaElement | null
) => {
  if (isCommandBypassingFocusGuard(source)) return false;
  return shouldIgnoreClipboardShortcut(document.activeElement, managedTextarea);
};

export const resolveFillHotkeyChar = (
  input: Pick<KeyInput, "key" | "modifiers">
) => {
  if (input.modifiers.ctrl || input.modifiers.meta || input.modifiers.alt) return null;
  if (!input.key) return null;
  if (
    input.key === "Dead" ||
    input.key === "Process" ||
    input.key === "Unidentified"
  ) {
    return null;
  }
  if (isNamedKey(input.key)) return null;

  const char = getFirstGrapheme(input.key);
  return char || null;
};
