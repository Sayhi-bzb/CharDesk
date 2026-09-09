import type { ToolType } from "@/domains/canvas/public";
import type { Point } from "@/shared/types";
import type { CanvasLinkHit } from "../core/linkHitTesting";
import { resolveCanvasMoveDecision, type CanvasMoveDecision } from "./moveInteraction";

export type CanvasMoveExecutor = {
  updateColorPickerHover: (point: Point | null) => void;
  updateLinkHover: (hit: CanvasLinkHit | null) => void;
  setHoveredGrid: (point: Point | null) => void;
  setCursor: (cursor: string) => void;
};

export const createCanvasMoveExecutor = (executor: CanvasMoveExecutor): CanvasMoveExecutor => executor;

export const executeCanvasMoveDecision = (
  decision: CanvasMoveDecision,
  executor: CanvasMoveExecutor
): void => {
  if (decision.type === "color-picker-hover") {
    executor.updateColorPickerHover(decision.point);
    return;
  }
  executor.updateLinkHover(decision.linkHit);
  switch (decision.action.type) {
    case "pan-hover":
    case "static-range-move-hover":
      executor.setCursor("grab");
      break;
    case "eraser-hover":
      executor.setHoveredGrid(decision.action.point);
      break;
    case "none":
      break;
  }
};

type CanvasMoveContext = {
  point: Point | null;
  linkHit: CanvasLinkHit | null;
  eraserHoverPoint: Point | null;
};

export const createCanvasMoveHandler = ({ executor }: { executor: CanvasMoveExecutor }) => ({
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
}) => executeCanvasMoveDecision(
  resolveCanvasMoveDecision({
    hasColorPickerTarget,
    tool,
    point,
    linkHit,
    eraserHoverPoint,
    staticRangeMoveHit,
  }),
  executor
);

export const createCanvasMoveRouteHandler = ({
  handler,
}: {
  handler: ReturnType<typeof createCanvasMoveHandler>;
}) => ({
  hasColorPickerTarget,
  tool,
  clientPoint,
  resolveMoveContext,
  staticRangeMoveHit,
}: {
  hasColorPickerTarget: boolean;
  tool: ToolType;
  clientPoint: Point;
  resolveMoveContext: (input: {
    clientPoint: Point;
    shouldResolveEraserHoverPoint: boolean;
  }) => CanvasMoveContext;
  staticRangeMoveHit: boolean;
}) => {
  const moveContext = resolveMoveContext({
    clientPoint,
    shouldResolveEraserHoverPoint: tool === "eraser",
  });
  handler({
    hasColorPickerTarget,
    tool,
    point: moveContext.point,
    linkHit: moveContext.linkHit,
    eraserHoverPoint: moveContext.eraserHoverPoint,
    staticRangeMoveHit,
  });
};

export type CanvasMoveRouteHandler = ReturnType<typeof createCanvasMoveRouteHandler>;
