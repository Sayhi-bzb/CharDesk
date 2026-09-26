export type ShortcutTargetKind =
  | "managed-canvas"
  | "editable"
  | "canvas-ui"
  | "overlay"
  | "canvas-surface"
  | "document";

const isHTMLElement = (element: Element | null): element is HTMLElement => {
  return element instanceof HTMLElement;
};

export const classifyShortcutTarget = (
  target: EventTarget | null
): ShortcutTargetKind => {
  if (!(target instanceof HTMLElement)) return "document";
  if (target.dataset.canvasManagedInput === "true") return "managed-canvas";
  if (target.closest('[role="dialog"], [role="menu"], [role="listbox"]')) {
    return "overlay";
  }
  const editable = target.closest(
    'input, textarea, select, [contenteditable]:not([contenteditable="false"])'
  );
  if (editable) return "editable";
  if (target.closest('[data-canvas-ui="true"]')) return "canvas-ui";
  if (target.closest('[data-testid="canvas-editor-surface"]')) {
    return "canvas-surface";
  }
  return "document";
};

export const shouldIgnoreClipboardShortcut = (
  activeElement: Element | null,
  managedTextarea?: HTMLTextAreaElement | null
) => {
  if (!isHTMLElement(activeElement)) return false;
  const tagName = activeElement.tagName.toLowerCase();

  if (tagName === "input") return true;
  if (tagName === "textarea") {
    if (!managedTextarea) return true;
    return activeElement !== managedTextarea;
  }

  return activeElement.isContentEditable;
};
