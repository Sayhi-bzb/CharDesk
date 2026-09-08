import { useRef, type RefObject } from "react";
import { useGesture } from "@use-gesture/react";
import type { CanvasMode } from "@/domains/sessions/public";
import type { ToolType } from "@/domains/canvas/public";
import type { CanvasViewportState } from "@/domains/canvas/public";
import type { CanvasState } from "@/domains/canvas/public";
import type {
  CanvasEditorInputEvent,
  CanvasInteractionState,
  EditorRuntime,
} from "@/domains/editor/public";
import type { StructuredNode } from "@/domains/structured-content/public";
import { isCtrlOrMeta } from "@/shared/utils/event";
import { MAX_ZOOM, MIN_ZOOM } from "@/shared/lib/constants";
import type { CanvasPointerContextResolver } from "../core/pointerContext";
import type { HoverInteractionController } from "../preview/hoverInteractionController";
import type {
  CanvasPinchRouteHandler,
  CanvasPinchStart,
} from "./pinchInteraction";
import type { CanvasMoveRouteHandler } from "./moveExecution";
import type { CanvasDragStartRouteAdapter } from "./dragStartExecution";
import type { CanvasClickRouteHandler } from "./clickExecution";
import {
  getCanvasWheelOrigin,
  type CanvasWheelRouteHandler,
} from "./wheelInteraction";
import { shouldIgnoreCanvasSurfaceGesture } from "../core/gestureGuards";
import { shouldOpenCanvasLink } from "../core/hitTesting";
import type { CanvasEditorCapabilities } from "../../../canvasEditorCapabilities";

export const resolveCanvasDragTermination = ({
  canceled,
  eventType,
}: {
  canceled: boolean;
  eventType: string;
}): "complete" | "cancel" => {
  if (canceled || eventType === "pointercancel") return "cancel";
  return "complete";
};

export const useCanvasGestureAdapter = ({
  cancelInteraction,
  stopEdgeScroll,
  updateEdgeScroll,
  containerRef,
  canvasMode,
  tool,
  brushChar,
  getViewport,
  hasColorPickerTarget,
  selectedStructuredNodeIds,
  structuredScene,
  editingStructuredTextNodeId,
  pointerContext,
  editorRuntime,
  getInteractionState,
  hoverInteraction,
  shouldIgnoreActiveGestureEvent,
  canvasPinchRouteHandler,
  canvasMoveRouteHandler,
  canvasDragStartRouteAdapter,
  canvasClickRouteHandler,
  canvasWheelRouteHandler,
  capabilities,
  canStartStaticRangeMove,
}: {
  cancelInteraction: () => void;
  stopEdgeScroll: () => void;
  updateEdgeScroll: (clientPoint: { x: number; y: number }) => void;
  containerRef: RefObject<HTMLDivElement | null>;
  canvasMode: CanvasMode;
  tool: ToolType;
  brushChar: string;
  getViewport: () => CanvasViewportState;
  hasColorPickerTarget: boolean;
  selectedStructuredNodeIds: string[];
  structuredScene: StructuredNode[];
  editingStructuredTextNodeId: string | null;
  pointerContext: CanvasPointerContextResolver;
  editorRuntime: EditorRuntime<CanvasState, CanvasEditorInputEvent>;
  getInteractionState: () => CanvasInteractionState;
  hoverInteraction: HoverInteractionController;
  shouldIgnoreActiveGestureEvent: (event: Event | undefined) => boolean;
  canvasPinchRouteHandler: CanvasPinchRouteHandler;
  canvasMoveRouteHandler: CanvasMoveRouteHandler;
  canvasDragStartRouteAdapter: CanvasDragStartRouteAdapter;
  canvasClickRouteHandler: CanvasClickRouteHandler;
  canvasWheelRouteHandler: CanvasWheelRouteHandler;
  capabilities: CanvasEditorCapabilities;
  canStartStaticRangeMove: (point: { x: number; y: number }) => boolean;
}) => {
  const pinchStartRef = useRef<CanvasPinchStart | null>(null);

  return useGesture(
    {
      onPinchStart: ({ origin: [ox, oy] }) => {
        if (!capabilities.navigate) return;
        const anchor = pointerContext.resolveLocalPoint(ox, oy);
        pinchStartRef.current = anchor
          ? {
              viewport: getViewport(),
              anchor,
            }
          : null;
      },
      onPinch: ({ offset: [scale], origin: [ox, oy], event }) => {
        if (!capabilities.navigate) return;
        const pinchStart = pinchStartRef.current;
        if (!pinchStart) return;
        canvasPinchRouteHandler({
          pinchStart,
          scale,
          currentViewport: getViewport(),
          origin: { x: ox, y: oy },
          zoomBounds: { min: MIN_ZOOM, max: MAX_ZOOM },
          preventDefault: () => event.preventDefault(),
          resolveAnchor: (origin) =>
            pointerContext.resolveLocalPoint(origin.x, origin.y),
        });
      },
      onPinchEnd: () => {
        pinchStartRef.current = null;
      },
      onMove: ({ xy: [x, y], event }) => {
        if (shouldIgnoreCanvasSurfaceGesture(event)) return;
        if (
          getInteractionState().type === "panning"
        ) {
          return;
        }
        canvasMoveRouteHandler({
          hasColorPickerTarget,
          canvasMode,
          tool,
          clientPoint: { x, y },
          staticRangeMoveHit: (() => {
            const point = pointerContext.resolveGridPoint(x, y);
            return !!point && canStartStaticRangeMove(point);
          })(),
          resolveMoveContext: ({
            clientPoint,
            shouldResolveStructuredSelectCursor,
            shouldResolveEraserHoverPoint,
          }) =>
            pointerContext.resolveMoveContext({
              clientX: clientPoint.x,
              clientY: clientPoint.y,
              shouldResolveStructuredSelectCursor,
              shouldResolveEraserHoverPoint,
              selectedStructuredNodeIds,
              structuredScene,
              editingStructuredTextNodeId,
            }),
        });
      },
      onDragStart: ({ xy: [x, y], event }) => {
        if (shouldIgnoreCanvasSurfaceGesture(event)) return;
        const mouseEvent = event as MouseEvent;
        const canStart = mouseEvent.button === 1 || tool === "pan"
          ? capabilities.navigate
          : tool === "select"
            ? capabilities.select
            : capabilities.mutateContent;
        if (!canStart || (hasColorPickerTarget && !capabilities.mutateContent)) return;
        stopEdgeScroll();
        hoverInteraction.clearLinkHover();
        if (hasColorPickerTarget) {
          const started = canvasDragStartRouteAdapter({
            canvasMode,
            tool,
            button: mouseEvent.button,
            isCtrlOrMetaPressed: isCtrlOrMeta(mouseEvent),
            hasColorPickerTarget: true,
            hasCanvasRect: pointerContext.hasCanvasRect(),
            screenPoint: { x, y },
            shiftKey: mouseEvent.shiftKey,
            anchorGrid: null,
            brushChar,
            mouseDetail: mouseEvent.detail,
            preventDefault: () => event.preventDefault(),
            resolveGridPoint: (point) =>
              pointerContext.resolveGridPoint(point.x, point.y),
            resolveLocalPoint: (point) =>
              pointerContext.resolveLocalPoint(point.x, point.y),
          });
          if (!started) cancelInteraction();
          return;
        }
        if (editorRuntime.dispatch({
            type: "canvas-drag-start",
            canvasMode,
            button: mouseEvent.button,
            isCtrlOrMetaPressed: isCtrlOrMeta(mouseEvent),
            shiftKey: mouseEvent.shiftKey,
            detail: mouseEvent.detail,
            screenPoint: { x, y },
            gridPoint: pointerContext.resolveGridPoint(x, y),
            brushChar,
          })) {
          event.preventDefault();
          return;
        }
        cancelInteraction();
      },
      onDrag: ({ xy: [x, y], delta: [dx, dy], event }) => {
        if (shouldIgnoreActiveGestureEvent(event)) return;
        if (editorRuntime.dispatch({
            type: "canvas-drag-update",
            delta: { x: dx, y: dy },
            currentGrid: pointerContext.resolveClampedGridPoint(x, y),
          })) {
          updateEdgeScroll({ x, y });
          return;
        }
      },
      onDragEnd: ({ event, xy: [x, y], canceled }) => {
        stopEdgeScroll();
        const endGrid = pointerContext.resolveClampedGridPoint(x, y);
        if (resolveCanvasDragTermination({
          canceled,
          eventType: event.type,
        }) === "cancel") {
          editorRuntime.dispatch({
            type: "canvas-interaction-cancel",
            reason: "pointer",
          });
          return;
        }
        if (shouldIgnoreActiveGestureEvent(event)) {
          cancelInteraction();
          return;
        }
        if (editorRuntime.dispatch({
          type: "canvas-drag-end",
          button: (event as MouseEvent).button,
          endGrid,
        })) {
          return;
        }
        cancelInteraction();
      },
      onClick: ({ event }) => {
        if (!capabilities.select && !capabilities.navigate) return;
        if (shouldIgnoreCanvasSurfaceGesture(event)) return;
        const mouseEvent = event as MouseEvent;
        canvasClickRouteHandler({
          clientPoint: { x: mouseEvent.clientX, y: mouseEvent.clientY },
          preventDefault: () => event.preventDefault(),
          resolveGridPoint: (clientPoint) =>
            pointerContext.resolveGridPoint(clientPoint.x, clientPoint.y),
          resolveLinkHit: (clientPoint) =>
            pointerContext.resolveLinkHit(clientPoint.x, clientPoint.y),
          shouldOpenLink: () => shouldOpenCanvasLink(mouseEvent),
        });
      },
      onWheel: ({ delta: [gestureDeltaX, gestureDeltaY], event }) => {
        if (!capabilities.navigate) return;
        if (shouldIgnoreCanvasSurfaceGesture(event)) return;
        const wheelEvent = event as WheelEvent;
        canvasWheelRouteHandler({
          isCtrlOrMetaPressed: isCtrlOrMeta(event),
          gestureDeltaX,
          gestureDeltaY,
          shiftKey: wheelEvent.shiftKey,
          origin: getCanvasWheelOrigin(wheelEvent),
          preventDefault: () => event.preventDefault(),
          resolveAnchor: (origin) =>
            pointerContext.resolveLocalPoint(origin.x, origin.y),
        });
      },
    },
    {
      target: containerRef,
      eventOptions: { passive: false },
      drag: { pointer: { capture: true } },
      pinch: { pinchOnWheel: false },
    }
  );
};
