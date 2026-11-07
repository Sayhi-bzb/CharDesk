import { validateDrawingWork } from '../drawing/limits.js';
import type { ToolType } from './tool.js';
import type { CanvasInteractionPort, CanvasInteractionState } from './canvasToolRuntime.js';
import type { CanvasMode } from '../contracts.js';
import type { Point } from '@chardesk/cell-plane/types';
type CanvasPointerContextResolver = { hasCanvasRect: () => boolean };
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

import { resolveDrawingUpdateDecision } from './drawing.js';
import { updateRangeMoveInteraction } from './rangeMove.js';
import { resolveSelectionCommitDecision, type SelectionCommitDecision } from './selectionCommit.js';

export class InteractionStateCapture {
  #state: CanvasInteractionState = { type: 'idle' };

  setState(state: CanvasInteractionState) {
    this.#state = state;
  }

  getState() {
    return this.#state;
  }
}

type DragUpdateHandler = (input: {
  state: CanvasInteractionState;
  tool: ToolType;
  canvasMode: CanvasMode;
  currentGrid: Point;
}) => void;

type PrimaryDragEndHandler = (input: {
  state: CanvasInteractionState;
  tool: ToolType;
  canvasMode: CanvasMode;
  resolvedEndGrid: Point | null;
}) => boolean;

export type CanvasInteractionPortDependencies = {
  onDrawingError?: CanvasInteractionPort['reportError'];
  rangeMoveThreshold?: number;
  capture: InteractionStateCapture;
  tool: ToolType;
  canvasMode: CanvasMode;
  brushChar: string;
  pointerContext: Pick<CanvasPointerContextResolver, 'hasCanvasRect'>;
  dragStart: CanvasDragStartRouteAdapter;
  dragUpdate: DragUpdateHandler;
  dragEnd: PrimaryDragEndHandler;
  commitSelection: (decision: SelectionCommitDecision) => void;
  getSelectionAnchor: () => Point | null;
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
  onDrawingError,
  rangeMoveThreshold,
  capture,
  tool,
  canvasMode,
  brushChar,
  pointerContext,
  dragStart,
  dragUpdate,
  dragEnd,
  commitSelection,
  getSelectionAnchor,
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
}: CanvasInteractionPortDependencies): CanvasInteractionPort => {
  const port: CanvasInteractionPort = {
    reportError: onDrawingError,
    begin: beginInteraction,
    start: (event) => {
      capture.setState({ type: 'idle' });
      if (tool === 'select' && event.button === 0 && event.isCtrlOrMetaPressed && event.gridPoint) {
        const state: CanvasInteractionState = {
          type: 'selecting',
          anchor: event.gridPoint,
          current: event.gridPoint,
          append: true,
        };
        capture.setState(state);
        beginAppendSelection?.(event.gridPoint);
        return { state };
      }
      if (
        tool === 'select' &&
        event.button === 0 &&
        !event.isCtrlOrMetaPressed &&
        !event.shiftKey &&
        event.gridPoint &&
        canStartStaticRangeMove?.(event.gridPoint)
      ) {
        const state: CanvasInteractionState = {
          type: 'rangeMovePending',
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
        anchorGrid: getSelectionAnchor(),
        brushChar: event.brushChar,
        preventDefault: () => undefined,
        resolveGridPoint: () => event.gridPoint,
      });
      return started && capture.getState().type !== 'idle'
        ? {
            state: capture.getState(),
          }
        : null;
    },
    update: (state, event) => {
      if (state.type === 'panning') {
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
      if (state.type === 'rangeMovePending' || state.type === 'movingRange') {
        const result = updateRangeMoveInteraction({
          state,
          eventDelta: event.delta,
          threshold: rangeMoveThreshold,
          currentGrid,
        });
        if (result.preview) {
          updateStaticRangeMove?.(result.state.anchor, result.state.current);
          setCursor('grabbing');
        }
        capture.setState(result.state);
        return result.state;
      }
      if (state.type === 'drawing') {
        const decision = resolveDrawingUpdateDecision({
          tool: state.tool,
          brushChar,
          lastGrid: state.lastGrid,
          currentGrid,
          lastPlacedGrid: state.lastPlacedGrid,
        });
        if (decision.type === 'none') return state;
        const work = (state.work ?? 1) + decision.points.length;
        validateDrawingWork(work);
        if (decision.type === 'scratch' && decision.points.length > 0) {
          addScratchPoints(decision.points);
        } else if (decision.type === 'erase') {
          erasePoints(decision.points);
        }
        if (state.tool === 'eraser') setHoveredGrid(currentGrid);
        return {
          ...state,
          work,
          lastGrid: decision.nextLastGrid,
          lastPlacedGrid: decision.nextLastPlacedGrid,
        };
      }

      capture.setState(state);
      dragUpdate({ state, tool, canvasMode, currentGrid });
      return capture.getState();
    },
    complete: (state, endGrid) => {
      // Release can carry a final coordinate with no preceding move event.
      if (endGrid && (state.type === 'drawing' || state.type === 'shapePreview'))
        state = port.update(state, {
          type: 'canvas-drag-update',
          currentGrid: endGrid,
          delta: { x: 0, y: 0 },
        });
      if (state.type === 'rangeMovePending' || state.type === 'movingRange') {
        if (state.type === 'movingRange') {
          commitStaticRangeMove?.(state.anchor, endGrid ?? state.current);
        } else {
          const point = endGrid ?? state.current;
          commitSelection(
            resolveSelectionCommitDecision({
              selection: { start: point, end: point },
              tool,
            })
          );
        }
        clearStaticRangeMovePreview?.();
        setCursor('');
        completeInteraction();
        return;
      }
      if (state.type === 'panning') {
        flushPan();
        clearLinkHover();
        setCursor(tool === 'pan' ? 'grab' : '');
      } else if (state.type === 'selecting') {
        commitSelection(
          resolveSelectionCommitDecision({
            selection: { start: state.anchor, end: endGrid ?? state.current },
            tool,
            append: state.append,
          })
        );
        setCursor('');
      } else {
        dragEnd({
          state,
          tool,
          canvasMode,
          resolvedEndGrid: endGrid,
        });
        setCursor('');
      }
      completeInteraction();
    },
    cancel: cancelInteraction,
  };
  return port;
};
