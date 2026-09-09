import type { Point, SelectionArea } from "@/shared/types";
import type { CanvasMode } from "@/domains/sessions/public";
import type { ToolType } from "@/domains/canvas/public";
import type { CanvasInteractionState } from "@/domains/editor/public";

export const isShapeTool = (
  tool: ToolType,
  canvasMode: CanvasMode
): boolean => {
  void canvasMode;
  return ["box", "circle", "line", "stepline", "bg"].includes(tool);
};

export const isSelectionTool = (
  tool: ToolType,
  canvasMode: CanvasMode
): boolean => {
  void canvasMode;
  return tool === "select" || tool === "fill";
};


type DragStartRouteDecision =
  | { type: "color-picker" }
  | { type: "pan" }
  | { type: "primary-canvas" }
  | { type: "ignore" };

export const resolveDragStartRouteDecision = ({
  tool,
  button,
  isCtrlOrMetaPressed,
  hasColorPickerTarget,
  hasCanvasRect,
}: {
  tool: ToolType;
  button: number;
  isCtrlOrMetaPressed: boolean;
  hasColorPickerTarget: boolean;
  hasCanvasRect: boolean;
}): DragStartRouteDecision => {
  if (hasColorPickerTarget && button === 0) return { type: "color-picker" };
  if (tool === "pan") return { type: "pan" };
  if (button === 1 || isCtrlOrMetaPressed) {
    return { type: "pan" };
  }
  if (button === 0 && hasCanvasRect) return { type: "primary-canvas" };
  return { type: "ignore" };
};
export type SelectionDragStartDecision =
  | {
      type: "selection";
      interactionAnchor: Point;
      dragStart: Point;
      preview: SelectionArea;
      clearExistingSelection: boolean;
      clearInteractionState: boolean;
      activateStaticGridCell: Point | null;
      nextAnchor: Point | null;
    }
  | { type: "not-selection" };

export type DrawingShapeDragStartDecision =
  | {
      type: "drawing";
      state: CanvasInteractionState;
      scratchPoint?: { x: number; y: number; char: string };
      erasePoint?: Point;
    }
  | {
      type: "shape-preview";
      state: CanvasInteractionState;
    }
  | { type: "ignore" };

export const resolveSelectionDragStartDecision = ({
  tool,
  canvasMode,
  start,
  shiftKey,
  anchorGrid,
}: {
  tool: ToolType;
  canvasMode: CanvasMode;
  start: Point;
  shiftKey: boolean;
  anchorGrid: Point | null;
}): SelectionDragStartDecision => {
  if (!isSelectionTool(tool, canvasMode)) return { type: "not-selection" };
  if (tool === "select" && shiftKey && anchorGrid) {
    return {
      type: "selection",
      interactionAnchor: start,
      dragStart: { ...anchorGrid },
      preview: { start: { ...anchorGrid }, end: start },
      clearExistingSelection: false,
      clearInteractionState: true,
      activateStaticGridCell: null,
      nextAnchor: null,
    };
  }

  const nextAnchor = !shiftKey || (tool === "select" && !anchorGrid)
    ? start
    : null;
  const preview = { start, end: start };

  return {
    type: "selection",
    interactionAnchor: start,
    dragStart: start,
    preview,
    clearExistingSelection: !shiftKey,
    clearInteractionState: false,
    activateStaticGridCell:
      tool === "select" ? start : null,
    nextAnchor,
  };
};

export const resolveDrawingShapeDragStartDecision = ({
  tool,
  canvasMode,
  start,
  brushChar,
}: {
  tool: ToolType;
  canvasMode: CanvasMode;
  start: Point;
  brushChar: string;
}): DrawingShapeDragStartDecision => {
  if (tool === "brush") {
    return {
      type: "drawing",
      state: {
        type: "drawing", tool, start,
        lastGrid: start, lastPlacedGrid: start,
      },
      scratchPoint: { ...start, char: brushChar },
    };
  }

  if (tool === "eraser") {
    return {
      type: "drawing",
      state: {
        type: "drawing", tool, start,
        lastGrid: start, lastPlacedGrid: start,
      },
      erasePoint: start,
    };
  }

  if (isShapeTool(tool, canvasMode)) {
    return {
      type: "shape-preview",
      state: { type: "shapePreview", tool, start, current: start, axis: null },
    };
  }

  return { type: "ignore" };
};
