import type { Point, SelectionArea } from "@/shared/types";
import type { CanvasMode } from "@/domains/sessions/public";
import type { ToolType } from "@/domains/canvas/public";
import {
  resolveDragStartRouteDecision,
  resolveDrawingShapeDragStartDecision,
  resolveSelectionDragStartDecision,
  type DrawingShapeDragStartDecision,
  type SelectionDragStartDecision,
} from "./dragStartInteraction";
import type { CanvasInteractionState } from "@/domains/editor/public";

type PanningDragStartExecutor = {
  setInteractionState: (state: CanvasInteractionState) => void;
  setCursor: (cursor: string) => void;
};

export const createPanningDragStartExecutor = ({
  setInteractionState,
  setCursor,
}: {
  setInteractionState: (state: CanvasInteractionState) => void;
  setCursor: (cursor: string) => void;
}): PanningDragStartExecutor => ({
  setInteractionState,
  setCursor,
});

export const executePanningDragStart = (
  lastScreen: Point,
  executor: PanningDragStartExecutor
): void => {
  executor.setInteractionState({ type: "panning", lastScreen });
  executor.setCursor("grabbing");
};
type SelectionDragStartExecutor = {
  setInteractionState: (state: CanvasInteractionState) => void;
  clearInteractionState: () => void;
  clearSelections: () => void;
  setStaticGridSelectionStart: (point: Point) => void;
  setAnchorGrid: (point: Point | null) => void;
  setSelectionPreview: (selection: SelectionArea) => void;
  clearTextCursor: () => void;
};

export const executeSelectionDragStartDecision = (
  decision: SelectionDragStartDecision,
  executor: SelectionDragStartExecutor
): boolean => {
  if (decision.type !== "selection") return false;

  executor.setInteractionState({
    type: "selecting",
    anchor: decision.dragStart,
    current: decision.interactionAnchor,
  });
  if (decision.clearInteractionState) executor.clearInteractionState();
  if (decision.clearExistingSelection) executor.clearSelections();
  if (decision.activateStaticGridCell) {
    executor.setStaticGridSelectionStart(decision.activateStaticGridCell);
  }
  if (decision.nextAnchor !== null) executor.setAnchorGrid(decision.nextAnchor);
  executor.setSelectionPreview(decision.preview);
  executor.clearTextCursor();
  return true;
};

export const createSelectionDragStartExecutor = ({
  setAnchorGrid,
  setInteractionState,
  clearInteractionState,
  clearSelections,
  setStaticGridSelectionStart,
  setSelectionPreview,
  clearTextCursor,
}: {
  setAnchorGrid: (point: Point | null) => void;
  setInteractionState: (state: CanvasInteractionState) => void;
  clearInteractionState: () => void;
  clearSelections: () => void;
  setStaticGridSelectionStart: (point: Point) => void;
  setSelectionPreview: (selection: SelectionArea) => void;
  clearTextCursor: () => void;
}): SelectionDragStartExecutor => ({
  setInteractionState,
  clearInteractionState,
  clearSelections,
  setStaticGridSelectionStart,
  setAnchorGrid,
  setSelectionPreview,
  clearTextCursor,
});

type DrawingShapeDragStartExecutor = {
  clearInteractionState: () => void;
  setAnchorGrid: (point: Point) => void;
  setInteractionState: (state: CanvasInteractionState) => void;
  addScratchPoint: (point: { x: number; y: number; char: string }) => void;
  erasePoint: (point: Point) => void;
};

export const executeDrawingShapeDragStartDecision = (
  decision: DrawingShapeDragStartDecision,
  start: Point,
  executor: DrawingShapeDragStartExecutor
): boolean => {
  if (decision.type === "ignore") return false;

  executor.clearInteractionState();
  executor.setAnchorGrid(start);
  executor.setInteractionState(decision.state);

  if (decision.type === "drawing") {
    if (decision.scratchPoint) executor.addScratchPoint(decision.scratchPoint);
    if (decision.erasePoint) executor.erasePoint(decision.erasePoint);
  }

  return true;
};

export const createDrawingShapeDragStartExecutor = ({
  setAnchorGrid,
  setInteractionState,
  clearInteractionState,
  addScratchPoint,
  erasePoint,
}: {
  setAnchorGrid: (point: Point) => void;
  setInteractionState: (state: CanvasInteractionState) => void;
  clearInteractionState: () => void;
  addScratchPoint: (point: { x: number; y: number; char: string }) => void;
  erasePoint: (point: Point) => void;
}): DrawingShapeDragStartExecutor => ({
  clearInteractionState,
  setAnchorGrid,
  setInteractionState,
  addScratchPoint,
  erasePoint,
});

type PrimaryCanvasDragStartContext = {
  start: Point;
  canvasMode: CanvasMode;
  tool: ToolType;
  shiftKey: boolean;
  anchorGrid: Point | null;
  brushChar: string;
};

const executePrimaryCanvasDragStart = (
  context: PrimaryCanvasDragStartContext,
  executors: {
    selection: SelectionDragStartExecutor;
    drawingShape: DrawingShapeDragStartExecutor;
  }
): boolean => {
  const selectionDecision = resolveSelectionDragStartDecision({
    tool: context.tool,
    canvasMode: context.canvasMode,
    start: context.start,
    shiftKey: context.shiftKey,
    anchorGrid: context.anchorGrid,
  });
  if (executeSelectionDragStartDecision(selectionDecision, executors.selection)) {
    return true;
  }

  const dragStartDecision = resolveDrawingShapeDragStartDecision({
    tool: context.tool,
    canvasMode: context.canvasMode,
    start: context.start,
    brushChar: context.brushChar,
  });

  return executeDrawingShapeDragStartDecision(
    dragStartDecision,
    context.start,
    executors.drawingShape
  );
};


type PrimaryCanvasDragStartHandler = (
  context: PrimaryCanvasDragStartContext
) => boolean;

export const createPrimaryCanvasDragStartHandler = ({
  selection,
  drawingShape,
}: {
  selection: SelectionDragStartExecutor;
  drawingShape: DrawingShapeDragStartExecutor;
}): PrimaryCanvasDragStartHandler => (context) =>
  executePrimaryCanvasDragStart(context, { selection, drawingShape });

type DragStartRouteHandler = ({
  tool,
  button,
  isCtrlOrMetaPressed,
  hasColorPickerTarget,
  hasCanvasRect,
  screenPoint,
  executeColorPickerStart,
  executePrimaryCanvasStart,
}: {
  tool: ToolType;
  button: number;
  isCtrlOrMetaPressed: boolean;
  hasColorPickerTarget: boolean;
  hasCanvasRect: boolean;
  screenPoint: Point;
  executeColorPickerStart: () => boolean;
  executePrimaryCanvasStart: () => boolean;
}) => boolean;

export const createDragStartRouteHandler = ({
  panning,
}: {
  panning: PanningDragStartExecutor;
}): DragStartRouteHandler => ({
  tool,
  button,
  isCtrlOrMetaPressed,
  hasColorPickerTarget,
  hasCanvasRect,
  screenPoint,
  executeColorPickerStart,
  executePrimaryCanvasStart,
}) => {
  const routeDecision = resolveDragStartRouteDecision({
    tool,
    button,
    isCtrlOrMetaPressed,
    hasColorPickerTarget,
    hasCanvasRect,
  });

  switch (routeDecision.type) {
    case "color-picker":
      return executeColorPickerStart();
    case "pan":
      executePanningDragStart(screenPoint, panning);
      return true;
    case "primary-canvas":
      return executePrimaryCanvasStart();
    case "ignore":
      return false;
  }
};
export type CanvasDragStartRouteAdapter = ({
  tool,
  button,
  isCtrlOrMetaPressed,
  hasColorPickerTarget,
  hasCanvasRect,
  screenPoint,
  shiftKey,
  anchorGrid,
  brushChar,
  preventDefault,
  resolveGridPoint,
}: {
  canvasMode: CanvasMode;
  tool: ToolType;
  button: number;
  isCtrlOrMetaPressed: boolean;
  hasColorPickerTarget: boolean;
  hasCanvasRect: boolean;
  screenPoint: Point;
  shiftKey: boolean;
  anchorGrid: Point | null;
  brushChar: string;
  preventDefault: () => void;
  resolveGridPoint: (screenPoint: Point) => Point | null;
}) => boolean;

export const createCanvasDragStartRouteAdapter = ({
  route,
  colorPicker,
  primaryCanvas,
}: {
  route: DragStartRouteHandler;
  colorPicker: (input: {
    point: Point | null;
    preventDefault: () => void;
  }) => boolean;
  primaryCanvas: PrimaryCanvasDragStartHandler;
}): CanvasDragStartRouteAdapter =>
  ({
    canvasMode,
    tool,
    button,
    isCtrlOrMetaPressed,
    hasColorPickerTarget,
    hasCanvasRect,
    screenPoint,
    shiftKey,
    anchorGrid,
    brushChar,
    preventDefault,
    resolveGridPoint,
  }) =>
    route({
      tool,
      button,
      isCtrlOrMetaPressed,
      hasColorPickerTarget,
      hasCanvasRect,
      screenPoint,
      executeColorPickerStart: () =>
        colorPicker({
          point: resolveGridPoint(screenPoint),
          preventDefault,
        }),
      executePrimaryCanvasStart: () => {
        const start = resolveGridPoint(screenPoint);
        if (!start) return false;

        return primaryCanvas({
          start,
          canvasMode,
          tool,
          shiftKey,
          anchorGrid,
          brushChar,
        });
      },
    });
