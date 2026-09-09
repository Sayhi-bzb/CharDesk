import type { ToolType } from "@/domains/canvas/public";
import type { CanvasInteractionState } from "@/domains/editor/public";
import type { CanvasMode } from "@/domains/sessions/public";
import type { Point } from "@/shared/types";
import { resolveDragUpdateDecision, type DragUpdateDecision } from "./dragUpdateInteraction";

export type DragUpdateExecutor = {
  setInteractionState: (state: CanvasInteractionState) => void;
  setSelectionPreview: (
    selection: Extract<DragUpdateDecision, { type: "selection-preview" }>["preview"]
  ) => void;
  draw: (point: Point) => void;
  updateScratchForShape: (
    tool: ToolType,
    start: Point,
    end: Point,
    options: { axis: "horizontal" | "vertical" | null }
  ) => void;
  setHoveredGrid: (point: Point) => void;
};

export const executeDragUpdateDecision = (
  decision: DragUpdateDecision,
  executor: DragUpdateExecutor,
  context: {
    state: CanvasInteractionState;
    currentGrid: Point;
    tool: ToolType;
    updateEraserHover: boolean;
  }
): void => {
  switch (decision.type) {
    case "selection-preview":
      if (context.state.type === "selecting") {
        executor.setInteractionState({ ...context.state, current: context.currentGrid });
      }
      executor.setSelectionPreview(decision.preview);
      break;
    case "drawing":
      executor.draw(decision.point);
      break;
    case "shape-preview":
      if (context.state.type === "shapePreview") {
        executor.setInteractionState({
          ...context.state,
          current: decision.update.end,
          axis: decision.update.axis,
        });
      }
      executor.updateScratchForShape(
        context.tool,
        decision.update.start,
        decision.update.end,
        { axis: decision.update.axis }
      );
      break;
    case "none":
      break;
  }
  if (context.updateEraserHover) executor.setHoveredGrid(context.currentGrid);
};

export const createDragUpdateExecutor = ({
  setInteractionState,
  setSelectionPreview,
  draw,
  updateScratchForShape,
  setHoveredGrid,
}: DragUpdateExecutor): DragUpdateExecutor => ({
  setInteractionState,
  setSelectionPreview,
  draw,
  updateScratchForShape,
  setHoveredGrid,
});

export const createDragUpdateHandler = ({ executor }: { executor: DragUpdateExecutor }) => ({
  state,
  tool,
  canvasMode,
  currentGrid,
}: {
  state: CanvasInteractionState;
  tool: ToolType;
  canvasMode: CanvasMode;
  currentGrid: Point;
}) =>
  executeDragUpdateDecision(
    resolveDragUpdateDecision({ canvasMode, currentGrid, state }),
    executor,
    {
      state,
      currentGrid,
      tool: state.type === "drawing" || state.type === "shapePreview" ? state.tool : tool,
      updateEraserHover: state.type === "drawing" ? state.tool === "eraser" : tool === "eraser",
    }
  );
