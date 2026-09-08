import type { ToolType } from "@/domains/canvas/public";
import type {
  CanvasInteractionPort,
  CanvasInteractionState,
} from "@/domains/editor/public";
import type { CanvasMode } from "@/domains/sessions/public";
import {
  isStructuredSplitBoxLineHandle,
  type StructuredNode,
  type StructuredSplitBoxHandle,
} from "@/domains/structured-content/public";
import type { Point } from "@/shared/types";
import type { CanvasPointerContextResolver } from "./core/pointerContext";
import type { CanvasDragStartRouteAdapter } from "./gestures/dragStartExecution";
import { resolveDrawingUpdateDecision } from "./gestures/drawingInteraction";
import { updateRangeMoveInteraction } from "./gestures/rangeMoveInteraction";

export class InteractionStateCapture {
  #state: CanvasInteractionState = { type: "idle" };
  #selectionAnchor: Point | null = null;

  setState(state: CanvasInteractionState) {
    this.#state = state;
  }

  getState() {
    return this.#state;
  }

  setSelectionAnchor(point: Point | null) {
    this.#selectionAnchor = point;
  }

  getSelectionAnchor() {
    return this.#selectionAnchor;
  }
}

type DragUpdateHandler = (input: {
  state: CanvasInteractionState;
  tool: ToolType;
  canvasMode: CanvasMode;
  currentGrid: Point;
  structuredScene: StructuredNode[];
}) => void;

type PrimaryDragEndHandler = (input: {
  state: CanvasInteractionState;
  tool: ToolType;
  canvasMode: CanvasMode;
  structuredScene: StructuredNode[];
  resolvedEndGrid: Point | null;
  isDividerHandle: (handle: StructuredSplitBoxHandle) => boolean;
}) => boolean;

export type CanvasInteractionPortDependencies = {
  capture: InteractionStateCapture;
  tool: ToolType;
  canvasMode: CanvasMode;
  brushChar: string;
  structuredScene: StructuredNode[];
  pointerContext: Pick<
    CanvasPointerContextResolver,
    "hasCanvasRect" | "resolveLocalPoint"
  >;
  dragStart: CanvasDragStartRouteAdapter;
  dragUpdate: DragUpdateHandler;
  dragEnd: PrimaryDragEndHandler;
  beginInteraction: () => void;
  completeInteraction: () => void;
  cancelInteraction: () => void;
  queuePan: (delta: Point) => void;
  flushPan: () => void;
  clearLinkHover: () => void;
  setCursor: (cursor: string) => void;
  addScratchPoints: (points: Array<Point & { char: string }>) => void;
  erasePoints: (points: Point[]) => void;
  setHoveredGrid: (point: Point) => void;
  beginAppendSelection?: (point: Point) => void;
  canStartStaticRangeMove?: (point: Point) => boolean;
  updateStaticRangeMove?: (anchor: Point, current: Point) => void;
  commitStaticRangeMove?: (anchor: Point, current: Point) => void;
  clearStaticRangeMovePreview?: () => void;
};

export const createCanvasInteractionPort = ({
  capture,
  tool,
  canvasMode,
  brushChar,
  structuredScene,
  pointerContext,
  dragStart,
  dragUpdate,
  dragEnd,
  beginInteraction,
  completeInteraction,
  cancelInteraction,
  queuePan,
  flushPan,
  clearLinkHover,
  setCursor,
  addScratchPoints,
  erasePoints,
  setHoveredGrid,
  beginAppendSelection,
  canStartStaticRangeMove,
  updateStaticRangeMove,
  commitStaticRangeMove,
  clearStaticRangeMovePreview,
}: CanvasInteractionPortDependencies): CanvasInteractionPort => ({
  begin: beginInteraction,
  start: (event, selectionAnchor) => {
    capture.setState({ type: "idle" });
    capture.setSelectionAnchor(selectionAnchor);
    if (
      canvasMode !== "structured" &&
      tool === "select" &&
      event.button === 0 &&
      event.isCtrlOrMetaPressed &&
      event.gridPoint
    ) {
      const state: CanvasInteractionState = {
        type: "selecting",
        anchor: event.gridPoint,
        current: event.gridPoint,
        append: true,
      };
      capture.setState(state);
      beginAppendSelection?.(event.gridPoint);
      return { state, selectionAnchor: event.gridPoint };
    }
    if (
      canvasMode !== "structured" &&
      tool === "select" &&
      event.button === 0 &&
      !event.isCtrlOrMetaPressed &&
      !event.shiftKey &&
      event.gridPoint &&
      canStartStaticRangeMove?.(event.gridPoint)
    ) {
      const state: CanvasInteractionState = {
        type: "rangeMovePending",
        anchor: event.gridPoint,
        current: event.gridPoint,
        accumulated: { x: 0, y: 0 },
      };
      capture.setState(state);
      return { state };
    }
    const started = dragStart({
      canvasMode: event.canvasMode,
      tool,
      button: event.button,
      isCtrlOrMetaPressed: event.isCtrlOrMetaPressed,
      hasColorPickerTarget: false,
      hasCanvasRect: pointerContext.hasCanvasRect(),
      screenPoint: event.screenPoint,
      shiftKey: event.shiftKey,
      anchorGrid: selectionAnchor,
      brushChar: event.brushChar,
      mouseDetail: event.detail,
      preventDefault: () => undefined,
      resolveGridPoint: () => event.gridPoint,
      resolveLocalPoint: (point) =>
        pointerContext.resolveLocalPoint(point.x, point.y),
    });
    return started && capture.getState().type !== "idle"
      ? {
          state: capture.getState(),
          selectionAnchor: capture.getSelectionAnchor(),
        }
      : null;
  },
  update: (state, event) => {
    if (state.type === "panning") {
      queuePan(event.delta);
      return {
        ...state,
        lastScreen: {
          x: state.lastScreen.x + event.delta.x,
          y: state.lastScreen.y + event.delta.y,
        },
      };
    }

    const currentGrid = event.currentGrid;
    if (!currentGrid) return state;
    if (state.type === "rangeMovePending" || state.type === "movingRange") {
      const result = updateRangeMoveInteraction({
        state,
        eventDelta: event.delta,
        currentGrid,
      });
      if (result.preview) {
        updateStaticRangeMove?.(result.state.anchor, result.state.current);
        setCursor("grabbing");
      }
      capture.setState(result.state);
      return result.state;
    }
    if (state.type === "drawing") {
      const decision = resolveDrawingUpdateDecision({
        tool: state.tool,
        brushChar,
        lastGrid: state.lastGrid,
        currentGrid,
        lastPlacedGrid: state.lastPlacedGrid,
      });
      if (decision.type === "none") return state;
      if (decision.type === "scratch" && decision.points.length > 0) {
        addScratchPoints(decision.points);
      } else if (decision.type === "erase") {
        erasePoints(decision.points);
      }
      if (state.tool === "eraser") setHoveredGrid(currentGrid);
      return {
        ...state,
        lastGrid: decision.nextLastGrid,
        lastPlacedGrid: decision.nextLastPlacedGrid,
      };
    }

    capture.setState(state);
    dragUpdate({ state, tool, canvasMode, currentGrid, structuredScene });
    return capture.getState();
  },
  complete: (state, endGrid) => {
    if (state.type === "rangeMovePending" || state.type === "movingRange") {
      if (state.type === "movingRange") {
        commitStaticRangeMove?.(state.anchor, endGrid ?? state.current);
      }
      clearStaticRangeMovePreview?.();
      setCursor("");
      completeInteraction();
      return;
    }
    if (state.type === "panning") {
      flushPan();
      clearLinkHover();
      setCursor(tool === "pan" ? "grab" : "");
    } else {
      dragEnd({
        state,
        tool,
        canvasMode,
        structuredScene,
        resolvedEndGrid: endGrid,
        isDividerHandle: isStructuredSplitBoxLineHandle,
      });
      setCursor("");
    }
    completeInteraction();
  },
  cancel: cancelInteraction,
});
