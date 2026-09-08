import type { KeyInput } from "@chardesk/keyboard";
import { resolveFillHotkeyChar } from "@/domains/actions/public";

type Direction = -1 | 0 | 1;

export type ManagedCanvasKeyboardContext = Readonly<{
  mutateEnabled: boolean;
  staticGridMode: boolean;
  staticGridEditMode: "navigate" | "text-edit";
  hasStaticGridSelection: boolean;
  hasTextCursor: boolean;
  hasActiveSelection: boolean;
  hasStructuredSelection: boolean;
  hasStructuredGridFocus: boolean;
  colorPickerOpen: boolean;
  pageRows: number;
}>;

export type ManagedCanvasKeyIntent =
  | Readonly<{ type: "delete-text"; direction: "backward" | "forward" }>
  | Readonly<{ type: "delete-selection" }>
  | Readonly<{ type: "select-grid-all" | "select-grid-row" | "select-grid-column" }>
  | Readonly<{ type: "enter-grid-text-edit" }>
  | Readonly<{
      type: "move-grid-edge";
      edge: "left" | "right" | "top-left" | "bottom-right";
      extend: boolean;
    }>
  | Readonly<{ type: "move-grid-page"; rows: number; extend: boolean }>
  | Readonly<{ type: "move-grid-focus"; dx: Direction; dy: Direction; extend: boolean }>
  | Readonly<{ type: "newline-text" | "indent-text" }>
  | Readonly<{ type: "move-text-cursor"; dx: Direction; dy: Direction }>
  | Readonly<{ type: "move-structured-grid-focus"; dx: Direction; dy: Direction }>
  | Readonly<{
      type: "escape";
      target:
        | "color-picker"
        | "grid-text-edit"
        | "text-cursor"
        | "structured-selection"
        | "structured-grid-focus"
        | "selection"
        | "none";
    }>
  | Readonly<{ type: "fill-selection"; char: string }>;

type ManagedCanvasKeyDecision = Readonly<{
  flushPendingText: boolean;
  preventDefault: boolean;
  intent: ManagedCanvasKeyIntent | null;
}>;

const ignoredDecision: ManagedCanvasKeyDecision = {
  flushPendingText: false,
  preventDefault: false,
  intent: null,
};

const directionFor = (key: string): Readonly<{ dx: Direction; dy: Direction }> => ({
  dx: key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1 : 0,
  dy: key === "ArrowUp" ? -1 : key === "ArrowDown" ? 1 : 0,
});

export const modifiedArrowEdgeFor = (input: KeyInput) => {
  if (
    input.phase !== "down"
    || input.composing
    || input.modifiers.altGraph
    || (!input.modifiers.ctrl && !input.modifiers.meta)
  ) return null;
  if (input.key === "ArrowLeft") return "left" as const;
  if (input.key === "ArrowRight") return "right" as const;
  if (input.key === "ArrowUp") return "top" as const;
  if (input.key === "ArrowDown") return "bottom" as const;
  return null;
};

export const resolveManagedCanvasKeyIntent = (
  input: KeyInput,
  context: ManagedCanvasKeyboardContext
): ManagedCanvasKeyDecision => {
  if (input.phase !== "down" || input.composing || input.modifiers.altGraph) {
    return ignoredDecision;
  }

  const mod = input.modifiers.ctrl || input.modifiers.meta;
  const flushPendingText = mod
    || input.modifiers.alt
    || input.key.length !== 1
    || (context.hasStaticGridSelection && !context.hasTextCursor);
  const decide = (
    intent: ManagedCanvasKeyIntent | null,
    preventDefault: boolean
  ): ManagedCanvasKeyDecision => ({ flushPendingText, preventDefault, intent });

  if (
    !context.mutateEnabled
    && (input.key === "Backspace" || input.key === "Delete")
  ) return decide(null, true);

  if (context.hasTextCursor && input.key === "Backspace") {
    return decide({ type: "delete-text", direction: "backward" }, true);
  }
  if (context.hasTextCursor && input.key === "Delete") {
    return decide({ type: "delete-text", direction: "forward" }, true);
  }
  if (
    context.hasActiveSelection
    && (input.key === "Delete" || input.key === "Backspace")
  ) return decide({ type: "delete-selection" }, true);

  if (context.staticGridMode && mod && input.key.toLowerCase() === "a") {
    return decide({ type: "select-grid-all" }, true);
  }
  if (
    context.staticGridMode
    && context.staticGridEditMode === "navigate"
    && input.modifiers.shift
    && input.code === "Space"
    && !mod
  ) return decide({ type: "select-grid-row" }, true);
  if (
    context.staticGridMode
    && context.staticGridEditMode === "navigate"
    && input.modifiers.ctrl
    && input.code === "Space"
    && !input.modifiers.meta
  ) return decide({ type: "select-grid-column" }, true);
  if (context.staticGridMode && input.key === "F2" && context.mutateEnabled) {
    return decide({ type: "enter-grid-text-edit" }, true);
  }
  if (
    context.staticGridMode
    && context.staticGridEditMode === "navigate"
    && (input.key === "Home" || input.key === "End")
  ) {
    return decide({
      type: "move-grid-edge",
      edge: mod
        ? input.key === "Home" ? "top-left" : "bottom-right"
        : input.key === "Home" ? "left" : "right",
      extend: input.modifiers.shift,
    }, true);
  }
  if (
    context.staticGridMode
    && context.staticGridEditMode === "navigate"
    && (input.key === "PageUp" || input.key === "PageDown")
  ) {
    return decide({
      type: "move-grid-page",
      rows: (input.key === "PageUp" ? -1 : 1) * Math.max(1, context.pageRows),
      extend: input.modifiers.shift,
    }, true);
  }
  if (input.key === "Enter") {
    return decide(
      context.staticGridMode && context.staticGridEditMode === "navigate"
        ? {
            type: "move-grid-focus",
            dx: 0,
            dy: input.modifiers.shift ? -1 : 1,
            extend: false,
          }
        : { type: "newline-text" },
      true
    );
  }
  if (input.key === "Tab") {
    return decide(
      context.staticGridMode && context.staticGridEditMode === "navigate"
        ? {
            type: "move-grid-focus",
            dx: input.modifiers.shift ? -1 : 1,
            dy: 0,
            extend: false,
          }
        : { type: "indent-text" },
      true
    );
  }
  if (input.key.startsWith("Arrow")) {
    const direction = directionFor(input.key);
    if (context.staticGridMode && context.staticGridEditMode === "navigate") {
      return decide({
        type: "move-grid-focus",
        ...direction,
        extend: input.modifiers.shift,
      }, true);
    }
    if (context.hasTextCursor) {
      return decide({ type: "move-text-cursor", ...direction }, true);
    }
    return decide(
      context.hasStructuredSelection
        ? null
        : { type: "move-structured-grid-focus", ...direction },
      true
    );
  }
  if (input.key === "Escape") {
    const target = context.colorPickerOpen
      ? "color-picker"
      : context.staticGridMode && context.staticGridEditMode === "text-edit"
        ? "grid-text-edit"
        : context.hasTextCursor
          ? "text-cursor"
          : context.hasStructuredSelection
            ? "structured-selection"
            : context.hasStructuredGridFocus
              ? "structured-grid-focus"
              : context.hasActiveSelection
                ? "selection"
                : "none";
    return decide({ type: "escape", target }, true);
  }
  if (context.hasStaticGridSelection && !context.hasTextCursor && context.mutateEnabled) {
    const char = resolveFillHotkeyChar(input);
    if (char) return decide({ type: "fill-selection", char }, true);
  }
  return decide(null, false);
};
