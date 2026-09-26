import type { KeyInput } from "@chardesk/keyboard";
import { resolveFillHotkeyChar } from "@/domains/actions/public";
import type { StaticGridInteraction } from "@/domains/selection/public";

type Direction = -1 | 0 | 1;

export type ManagedCanvasKeyboardContext = Readonly<{
  mutateEnabled: boolean;
  staticGridInteraction: StaticGridInteraction["kind"] | null;
  hasActiveSelection: boolean;
  colorPickerOpen: boolean;
  pageRows: number;
}>;

export type ManagedCanvasKeyIntent =
  | Readonly<{ type: "delete-grid"; direction: "backward" | "forward" }>
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
  | Readonly<{
      type: "escape";
      target:
        | "color-picker"
        | "grid-text-edit"
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
  const staticGridMode = context.staticGridInteraction !== null;
  const staticGridNavigating = context.staticGridInteraction === "navigate"
    || context.staticGridInteraction === "range";
  const staticGridRange = context.staticGridInteraction === "range";
  const flushPendingText = mod
    || input.modifiers.alt
    || input.key.length !== 1
    || staticGridRange;
  const decide = (
    intent: ManagedCanvasKeyIntent | null,
    preventDefault: boolean
  ): ManagedCanvasKeyDecision => ({ flushPendingText, preventDefault, intent });

  if (
    !context.mutateEnabled
    && (input.key === "Backspace" || input.key === "Delete")
  ) return decide(null, true);

  if (
    (staticGridMode || context.hasActiveSelection)
    && (input.key === "Delete" || input.key === "Backspace")
  ) {
    return decide({
      type: "delete-grid",
      direction: input.key === "Backspace" ? "backward" : "forward",
    }, true);
  }

  if (staticGridMode && mod && input.key.toLowerCase() === "a") {
    return decide({ type: "select-grid-all" }, true);
  }
  if (
    staticGridNavigating
    && input.modifiers.shift
    && input.code === "Space"
    && !mod
  ) return decide({ type: "select-grid-row" }, true);
  if (
    staticGridNavigating
    && input.modifiers.ctrl
    && input.code === "Space"
    && !input.modifiers.meta
  ) return decide({ type: "select-grid-column" }, true);
  if (staticGridMode && input.key === "F2" && context.mutateEnabled) {
    return decide({ type: "enter-grid-text-edit" }, true);
  }
  if (
    staticGridNavigating
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
    staticGridNavigating
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
      staticGridNavigating
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
      staticGridNavigating
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
    if (staticGridNavigating) {
      return decide({
        type: "move-grid-focus",
        ...direction,
        extend: input.modifiers.shift,
      }, true);
    }
    if (context.staticGridInteraction === "text-edit") {
      return decide({ type: "move-text-cursor", ...direction }, true);
    }
    return decide(null, false);
  }
  if (input.key === "Escape") {
    const target = context.colorPickerOpen
      ? "color-picker"
      : context.staticGridInteraction === "text-edit"
        ? "grid-text-edit"
        : context.hasActiveSelection
          ? "selection"
          : "none";
    return decide({ type: "escape", target }, true);
  }
  if (staticGridRange && context.mutateEnabled) {
    const char = resolveFillHotkeyChar(input);
    if (char) return decide({ type: "fill-selection", char }, true);
  }
  return decide(null, false);
};
