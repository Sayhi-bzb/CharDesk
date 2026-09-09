import type { ToolType } from "@/domains/canvas/public";
import type { CanvasInteractionState } from "@/domains/editor/public";
import type { CanvasMode } from "@/domains/sessions/public";
import type { Point, SelectionArea } from "@/shared/types";
import { isShapeTool } from "./dragStartInteraction";

type ShapePreviewUpdate = {
  start: Point;
  end: Point;
  axis: "horizontal" | "vertical" | null;
};

export type DragUpdateDecision =
  | { type: "selection-preview"; preview: SelectionArea }
  | { type: "drawing"; point: Point }
  | { type: "shape-preview"; update: ShapePreviewUpdate }
  | { type: "none" };

export const resolveShapePreviewUpdate = ({
  tool,
  canvasMode,
  dragStart,
  currentGrid,
  currentAxis,
}: {
  tool: ToolType;
  canvasMode: CanvasMode;
  dragStart: Point;
  currentGrid: Point;
  currentAxis: "horizontal" | "vertical" | null;
}): ShapePreviewUpdate | null => {
  if (!isShapeTool(tool, canvasMode)) return null;
  let axis = currentAxis;
  if ((tool === "line" || tool === "arrowLine") && !axis) {
    const dx = Math.abs(currentGrid.x - dragStart.x);
    const dy = Math.abs(currentGrid.y - dragStart.y);
    if (dx > 0 || dy > 0) axis = dy > dx ? "vertical" : "horizontal";
  }
  return { start: dragStart, end: currentGrid, axis };
};

export const resolveDragUpdateDecision = ({
  canvasMode,
  currentGrid,
  state,
}: {
  canvasMode: CanvasMode;
  currentGrid: Point;
  state: CanvasInteractionState;
}): DragUpdateDecision => {
  switch (state.type) {
    case "selecting":
      return {
        type: "selection-preview",
        preview: { start: state.anchor, end: currentGrid },
      };
    case "drawing":
      return state.tool === "brush" || state.tool === "eraser"
        ? { type: "drawing", point: currentGrid }
        : { type: "none" };
    case "shapePreview": {
      const update = resolveShapePreviewUpdate({
        tool: state.tool,
        canvasMode,
        dragStart: state.start,
        currentGrid,
        currentAxis: state.axis,
      });
      return update ? { type: "shape-preview", update } : { type: "none" };
    }
    default:
      return { type: "none" };
  }
};
