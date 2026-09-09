import type { ToolType } from "@/domains/canvas/public";
import type { Point } from "@/shared/types";
import type { CanvasLinkHit } from "../core/linkHitTesting";

type CanvasMoveAction =
  | { type: "none" }
  | { type: "pan-hover" }
  | { type: "static-range-move-hover" }
  | { type: "eraser-hover"; point: Point | null };

export type CanvasMoveDecision =
  | { type: "color-picker-hover"; point: Point | null }
  | { type: "canvas-hover"; linkHit: CanvasLinkHit | null; action: CanvasMoveAction };

export const resolveCanvasMoveDecision = ({
  hasColorPickerTarget,
  tool,
  point,
  linkHit,
  eraserHoverPoint,
  staticRangeMoveHit,
}: {
  hasColorPickerTarget: boolean;
  tool: ToolType;
  point: Point | null;
  linkHit: CanvasLinkHit | null;
  eraserHoverPoint: Point | null;
  staticRangeMoveHit: boolean;
}): CanvasMoveDecision => {
  if (hasColorPickerTarget) return { type: "color-picker-hover", point };
  if (tool === "pan") {
    return { type: "canvas-hover", linkHit: null, action: { type: "pan-hover" } };
  }
  if (tool === "select" && staticRangeMoveHit) {
    return { type: "canvas-hover", linkHit: null, action: { type: "static-range-move-hover" } };
  }
  if (tool === "eraser") {
    return { type: "canvas-hover", linkHit, action: { type: "eraser-hover", point: eraserHoverPoint } };
  }
  return { type: "canvas-hover", linkHit, action: { type: "none" } };
};
