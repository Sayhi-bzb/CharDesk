import type { Point } from "@/shared/types";
import type { CanvasMode } from "@/domains/sessions/public";
import type { ToolType } from "@/domains/canvas/public";
import type { CanvasLinkHit } from "../core/linkHitTesting";
import { isShapeTool } from "./dragStartInteraction";

type CanvasMoveAction =
  | { type: "none" }
  | { type: "pan-hover" }
  | { type: "structured-text-cursor" }
  | { type: "structured-shape-hover"; point: Point | null }
  | { type: "structured-select-hover"; cursor: string }
  | { type: "static-range-move-hover" }
  | { type: "eraser-hover"; point: Point | null };

export type CanvasMoveDecision =
  | { type: "color-picker-hover"; point: Point | null }
  | { type: "canvas-hover"; linkHit: CanvasLinkHit | null; action: CanvasMoveAction };

export const resolveCanvasMoveDecision = ({
  hasColorPickerTarget,
  canvasMode,
  tool,
  point,
  linkHit,
  structuredSelectCursor,
  eraserHoverPoint,
  staticRangeMoveHit,
}: {
  hasColorPickerTarget: boolean;
  canvasMode: CanvasMode;
  tool: ToolType;
  point: Point | null;
  linkHit: CanvasLinkHit | null;
  structuredSelectCursor: string | null;
  eraserHoverPoint: Point | null;
  staticRangeMoveHit: boolean;
}): CanvasMoveDecision => {
  if (hasColorPickerTarget) {
    return { type: "color-picker-hover", point };
  }

  if (tool === "pan") {
    return { type: "canvas-hover", linkHit: null, action: { type: "pan-hover" } };
  }

  if (canvasMode === "structured") {
    if (tool === "text") {
      return { type: "canvas-hover", linkHit, action: { type: "structured-text-cursor" } };
    }
    if (isShapeTool(tool, canvasMode)) {
      return {
        type: "canvas-hover",
        linkHit,
        action: { type: "structured-shape-hover", point },
      };
    }
    if (tool === "select") {
      return {
        type: "canvas-hover",
        linkHit,
        action: {
          type: "structured-select-hover",
          cursor: structuredSelectCursor ?? "",
        },
      };
    }
    return { type: "canvas-hover", linkHit, action: { type: "none" } };
  }

  if (tool === "select" && staticRangeMoveHit) {
    return {
      type: "canvas-hover",
      linkHit: null,
      action: { type: "static-range-move-hover" },
    };
  }

  if (tool === "eraser") {
    return {
      type: "canvas-hover",
      linkHit,
      action: { type: "eraser-hover", point: eraserHoverPoint },
    };
  }

  return { type: "canvas-hover", linkHit, action: { type: "none" } };
};
