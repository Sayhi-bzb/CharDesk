import { useCreation } from "ahooks";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  createStaticGridRangeMovePlan,
  isPointInStaticGridRange,
  useCanvasRuntime,
} from "@/domains/canvas/public";
import { isStaticGridMode } from "@/domains/sessions/public";
import { hasGridRangeSelection } from "@/domains/selection/public";
import {
  useEditor,
  type CanvasInteractionState,
} from "@/domains/editor/public";
import { type CanvasLinkHit } from "./interaction/core/linkHitTesting";

import {
  createCanvasClickExecutor,
  createCanvasClickHandler,
  createCanvasClickRouteHandler,
} from "./interaction/gestures/clickExecution";
import {
  createColorPickerDragStartExecutor,
  createColorPickerDragStartHandler,
  chooseCanvasColorSource,
  executeCanvasColorPickDecision,
  type CanvasColorSourceChoice,
} from "./interaction/gestures/colorPickerInteraction";
import {
  createCanvasMoveExecutor,
  createCanvasMoveHandler,
  createCanvasMoveRouteHandler,
} from "./interaction/gestures/moveExecution";
import {
  createCanvasPinchExecutor,
  createCanvasPinchHandler,
  createCanvasPinchRouteHandler,
} from "./interaction/gestures/pinchInteraction";
import {
  createCanvasWheelExecutor,
  createCanvasWheelHandler,
  createCanvasWheelRouteHandler,
} from "./interaction/gestures/wheelInteraction";
import {
  createPrimaryDragEndExecutor,
  createPrimaryDragEndHandler,
} from "./interaction/gestures/dragEndExecution";
import {
  createDragUpdateExecutor,
  createDragUpdateHandler,
} from "./interaction/gestures/dragUpdateExecution";
import {
  createPanningDragStartExecutor,
  createDragStartRouteHandler,
  createCanvasDragStartRouteAdapter,
  createPrimaryCanvasDragStartHandler,
  createDrawingShapeDragStartExecutor,
  createSelectionDragStartExecutor,
} from "./interaction/gestures/dragStartExecution";
import {
  shouldIgnoreActiveCanvasGesture,
  shouldIgnoreCanvasSurfaceGesture,
} from "./interaction/core/gestureGuards";
export { shouldOpenCanvasLink, shouldUseCanvasLinkPointer } from "./interaction/core/hitTesting";
import { useCanvasGestureAdapter } from "./interaction/gestures/gestureAdapter";
import { useInteractionControllers } from "./interaction/use-interaction-controllers";
import type { CanvasEngineRuntime } from "../engine/CanvasEngineRuntime";
import type { useCanvasEditorModels } from "./useCanvasEditorModels";
import {
  DEFAULT_CANVAS_EDITOR_CAPABILITIES,
  type CanvasEditorCapabilities,
} from "../canvasEditorCapabilities";
import {
  createCanvasInteractionPort,
  InteractionStateCapture,
} from "./interaction/canvasInteractionPort";



export const useCanvasInteraction = (
  store: ReturnType<typeof useCanvasEditorModels>["interaction"],
  containerRef: React.RefObject<HTMLDivElement | null>,
  setHoveredLink: (hit: CanvasLinkHit | null) => void,
  runtime?: CanvasEngineRuntime,
  capabilities: CanvasEditorCapabilities = DEFAULT_CANVAS_EDITOR_CAPABILITIES,
  interactionOwnerId = "single"
) => {
  if (!runtime) {
    throw new Error('useCanvasInteraction requires a canvas engine runtime');
  }
  const canvas = useCanvasRuntime();
  const editorRuntime = useEditor();
  const {
    tool,
    brushChar,
    setBrushColor,
    setBrushBackgroundColor,
    canvasColorPickerTarget,
    setCanvasColorPickerTarget,
    canvasMode,
    slideDeck,
    addScratchPoints,
    commitScratch,
    setTextCursor,
    setStaticGridActiveCell,
    enterStaticGridTextEdit,
    setStaticGridSelectionRange,
    appendStaticGridSelectionRange,
    clearSelections,
    clearInteractionState,
    erasePoints,
    contentReader,
    staticGridSelection,
    moveStaticGridSelection,
    updateScratchForShape,
    setHoveredGrid,
    fillArea,
  } = store;
  const colorSourceContextKey = `${store.activeCanvasId}:${canvasMode}:${tool}`;
  const [pendingColorSourceChoice, setPendingColorSourceChoice] = useState<{
    contextKey: string;
    choice: CanvasColorSourceChoice;
  } | null>(null);
  const colorSourceChoice =
    !canvasColorPickerTarget &&
    pendingColorSourceChoice?.contextKey === colorSourceContextKey
      ? pendingColorSourceChoice.choice
      : null;
  const previousColorSourceContextRef = useRef(colorSourceContextKey);

  useEffect(() => {
    if (previousColorSourceContextRef.current === colorSourceContextKey) return;
    previousColorSourceContextRef.current = colorSourceContextKey;
    queueMicrotask(() => {
      setPendingColorSourceChoice((current) =>
        current && current.contextKey !== colorSourceContextKey ? null : current
      );
    });
  }, [colorSourceContextKey]);

  const clearColorSourceChoice = () => setPendingColorSourceChoice(null);

  const {
    beginInteraction,
    cancelInteraction,
    cancelInteractionEffects,
    colorPickerClickRef,
    completeInteraction,
    cursor,
    draggingSelection,
    staticRangeMovePreview,
    setStaticRangeMovePreview,
    edgeScroll,
    hoverInteraction,
    pointerContext,
    resetDragState,
    selectionPreview,
    viewportInteraction,
  } = useInteractionControllers({
    store,
    containerRef,
    setHoveredLink,
    runtime,
    editorRuntime,
  });
  const shouldIgnoreActiveGestureEvent = (event: Event | undefined) =>
    shouldIgnoreActiveCanvasGesture({
      event,
      interactionMode: editorRuntime.getInteractionState().type,
      hasDragStartGrid: editorRuntime.getInteractionState().type !== "idle",
      isPanning: editorRuntime.getInteractionState().type === "panning",
    });
  const interactionCapture = useCreation(() => new InteractionStateCapture(), []);
  const setInteractionState = (state: CanvasInteractionState) => {
    interactionCapture.setState(state);
  };
  const panningDragStartExecutor = createPanningDragStartExecutor({
    setInteractionState,
    setCursor: (cursor) => hoverInteraction.setCursor(cursor),
  });
  const dragStartRouteHandler = createDragStartRouteHandler({
    panning: panningDragStartExecutor,
  });
  const selectionDragStartExecutor = createSelectionDragStartExecutor({
    setAnchorGrid: (point) => interactionCapture.setSelectionAnchor(point),
    setInteractionState,
    clearInteractionState,
    clearSelections,
    setStaticGridSelectionStart: (point) =>
      setStaticGridSelectionRange({ start: point, end: point }),
    setSelectionPreview: (selection) => selectionPreview.set(selection),
    clearTextCursor: () => setTextCursor(null),
  });
  const drawingShapeDragStartExecutor = createDrawingShapeDragStartExecutor({
    setAnchorGrid: (point) => interactionCapture.setSelectionAnchor(point),
    setInteractionState,
    clearInteractionState,
    addScratchPoint: (point) => addScratchPoints([point]),
    erasePoint: (point) => erasePoints([point], false),
  });
  const primaryCanvasDragStartHandler = createPrimaryCanvasDragStartHandler({
    selection: selectionDragStartExecutor,
    drawingShape: drawingShapeDragStartExecutor,
  });
  const dragUpdateExecutor = createDragUpdateExecutor({
    setInteractionState,
    setSelectionPreview: (selection) => selectionPreview.set(selection),
    draw: () => undefined,
    updateScratchForShape,
    setHoveredGrid,
  });
  const dragUpdateHandler = createDragUpdateHandler({
    executor: dragUpdateExecutor,
  });
  const primaryDragEndExecutor = createPrimaryDragEndExecutor({
    selectionPreview,
    fillArea,
    setStaticGridActiveCell,
    setStaticGridSelectionRange,
    appendStaticGridSelectionRange,
    clearSelections,
    commitScratch,
    forceHistorySave: canvas.commands.history.finishCapture,
    resetDragState,
  });
  const primaryDragEndHandler = createPrimaryDragEndHandler({
    executor: primaryDragEndExecutor,
  });
  const canvasPinchExecutor = createCanvasPinchExecutor({
    setViewport: (updater) =>
      runtime.camera.setTransientViewport(updater(runtime.camera.getViewport())),
  });
  const canvasPinchHandler = createCanvasPinchHandler({
    executor: canvasPinchExecutor,
  });
  const canvasPinchRouteHandler = createCanvasPinchRouteHandler({
    handler: canvasPinchHandler,
  });
  const colorPickerDragStartExecutor = useCreation(
    () =>
      createColorPickerDragStartExecutor({
        colorPickerClick: colorPickerClickRef,
        preventDefault: () => undefined,
        setBrushColor,
        setBrushBackgroundColor,
        setSelectionForegroundColor:
          canvas.commands.selection.setForegroundColor,
        setSelectionBackgroundColor:
          canvas.commands.selection.setBackgroundColor,
        openColorSourceChooser: (choice) =>
          setPendingColorSourceChoice({
            contextKey: colorSourceContextKey,
            choice,
          }),
        clearColorPickerTarget: () => setCanvasColorPickerTarget(null),
        clearHoveredGrid: () => setHoveredGrid(null),
        resetDragState,
        setCursor: (cursor) => hoverInteraction.setCursor(cursor),
      }),
    [
      hoverInteraction,
      canvas,
      colorSourceContextKey,
      resetDragState,
      setBrushColor,
      setBrushBackgroundColor,
      setCanvasColorPickerTarget,
      setHoveredGrid,
    ]
  );
  const colorPickerDragStartHandler = createColorPickerDragStartHandler({
    target: canvasColorPickerTarget,
    isStaticGridSelectionActive:
      isStaticGridMode(canvasMode) &&
      hasGridRangeSelection(staticGridSelection),
    getCell: (point) => contentReader.get(point),
    executor: colorPickerDragStartExecutor,
  });
  const selectColorSource = (source: "foreground" | "background") => {
    if (!colorSourceChoice) return;
    executeCanvasColorPickDecision(
      chooseCanvasColorSource(colorSourceChoice, source),
      colorPickerDragStartExecutor
    );
    clearColorSourceChoice();
  };
  const canvasDragStartRouteAdapter = createCanvasDragStartRouteAdapter({
    route: dragStartRouteHandler,
    colorPicker: colorPickerDragStartHandler,
    primaryCanvas: primaryCanvasDragStartHandler,
  });
  const canvasClickExecutor = useCreation(
    () =>
      createCanvasClickExecutor({
        colorPickerClick: colorPickerClickRef,
        preventDefault: () => undefined,
        openLink: (href) => window.open(href, "_blank", "noopener,noreferrer"),
        setHoveredLink,
      }),
    [
      hoverInteraction,
      setHoveredLink,
    ]
  );
  const canvasClickHandler = useCreation(
    () =>
      createCanvasClickHandler({
        getColorPickerClickPending: () => colorPickerClickRef.current,
        getInteractionMode: () => editorRuntime.getInteractionState().type,
        executor: canvasClickExecutor,
      }),
    [canvasClickExecutor]
  );
  const canvasClickRouteHandler = createCanvasClickRouteHandler({
    handler: canvasClickHandler,
  });
  const canvasMoveExecutor = createCanvasMoveExecutor({
    updateColorPickerHover: (hoverPoint) =>
      hoverInteraction.updateColorPickerHover(hoverPoint),
    updateLinkHover: (hit) => hoverInteraction.updateLinkHover(hit),
    setHoveredGrid,
    setCursor: (cursor) => hoverInteraction.setCursor(cursor),
  });
  const canvasMoveHandler = createCanvasMoveHandler({
    executor: canvasMoveExecutor,
  });
  const canvasMoveRouteHandler = createCanvasMoveRouteHandler({
    handler: canvasMoveHandler,
  });
  const canvasWheelExecutor = createCanvasWheelExecutor({
    preventDefault: () => undefined,
    flushOffset: () => viewportInteraction.flushOffset(),
    queueZoomDelta: (deltaZoom, mouseX, mouseY) =>
      viewportInteraction.queueZoomDelta(deltaZoom, mouseX, mouseY),
    queueOffsetDelta: (dx, dy) => viewportInteraction.queueOffsetDelta(dx, dy),
  });
  const canvasWheelHandler = createCanvasWheelHandler({
    executor: canvasWheelExecutor,
  });
  const canvasWheelRouteHandler = createCanvasWheelRouteHandler({
    handler: canvasWheelHandler,
  });
  const canStartStaticRangeMove = (point: { x: number; y: number }) =>
    capabilities.mutateContent &&
    isStaticGridMode(canvasMode) &&
    staticGridSelection.mode === "range" &&
    staticGridSelection.additionalRanges.length === 0 &&
    isPointInStaticGridRange(
      contentReader,
      staticGridSelection.primaryRange,
      point
    );
  const coreInteractionPort = useCreation(
    () =>
      createCanvasInteractionPort({
        capture: interactionCapture,
        tool,
        canvasMode,
        brushChar,
        pointerContext,
        dragStart: canvasDragStartRouteAdapter,
        dragUpdate: dragUpdateHandler,
        dragEnd: primaryDragEndHandler,
        beginInteraction,
        completeInteraction,
        cancelInteraction: cancelInteractionEffects,
        queuePan: ({ x, y }) => viewportInteraction.queueOffsetDelta(x, y),
        flushPan: () => viewportInteraction.flushOffset(),
        clearLinkHover: () => hoverInteraction.clearLinkHover(),
        setCursor: (cursor) => hoverInteraction.setCursor(cursor),
        addScratchPoints,
        erasePoints: (points) => erasePoints(points, false),
        setHoveredGrid,
        beginAppendSelection: (point) => {
          selectionPreview.set({ start: point, end: point }, { immediate: true });
        },
        canStartStaticRangeMove,
        updateStaticRangeMove: (anchor, current) => {
          const activeSlide = canvasMode === "slide"
            ? slideDeck?.slides.find(
                (slide) => slide.id === slideDeck.activeSlideId
              )
            : null;
          setStaticRangeMovePreview(
            createStaticGridRangeMovePlan({
              source: contentReader,
              range: staticGridSelection.primaryRange,
              requestedDelta: {
                x: current.x - anchor.x,
                y: current.y - anchor.y,
              },
              bounds: activeSlide
                ? {
                    start: { x: 0, y: 0 },
                    end: {
                      x: activeSlide.size.columns - 1,
                      y: activeSlide.size.rows - 1,
                    },
                  }
                : null,
            })
          );
        },
        commitStaticRangeMove: (anchor, current) => {
          moveStaticGridSelection({
            x: current.x - anchor.x,
            y: current.y - anchor.y,
          });
        },
        clearStaticRangeMovePreview: () => setStaticRangeMovePreview(null),
      }),
    [
      addScratchPoints,
      brushChar,
      canvasMode,
      capabilities.mutateContent,
      completeInteraction,
      contentReader,
      erasePoints,
      hoverInteraction,
      primaryDragEndHandler,
      moveStaticGridSelection,
      setHoveredGrid,
      staticGridSelection,
      tool,
      viewportInteraction,
      beginInteraction,
      cancelInteractionEffects,
      canvasDragStartRouteAdapter,
      dragUpdateHandler,
      pointerContext,
      selectionPreview,
      setStaticRangeMovePreview,
      slideDeck,
    ]
  );
  const coreInteractionPortRef = useRef(coreInteractionPort);
  useLayoutEffect(() => {
    coreInteractionPortRef.current = coreInteractionPort;
  }, [coreInteractionPort]);
  useLayoutEffect(() => {
    const unregister = editorRuntime.interactionPort.registerRef(
      interactionOwnerId,
      coreInteractionPortRef
    );
    return () => {
      if (editorRuntime.interactionPort.isActive(interactionOwnerId)) {
        editorRuntime.dispatch({
          type: "canvas-interaction-cancel",
          reason: "dispose",
        });
      }
      unregister();
    };
  }, [editorRuntime, interactionOwnerId]);
  const updateEdgeScroll = (clientPoint: { x: number; y: number }) => {
    if (!edgeScroll) return;
    const isEnabled = () => {
      const type = editorRuntime.getInteractionState().type;
      return (
        type === "selecting" ||
        type === "movingRange"
      );
    };
    edgeScroll.update({
      clientPoint,
      getBounds: () => containerRef.current?.getBoundingClientRect() ?? null,
      isEnabled,
      onCameraMove: () => {
        if (!isEnabled()) return;
        const currentGrid = pointerContext.resolveClampedGridPoint(
          clientPoint.x,
          clientPoint.y
        );
        if (!currentGrid) return;
        editorRuntime.dispatch({
          type: "canvas-drag-update",
          delta: { x: 0, y: 0 },
          currentGrid,
        });
      },
    });
  };
  const bind = useCanvasGestureAdapter({
    cancelInteraction,
    stopEdgeScroll: () => edgeScroll?.stop(),
    updateEdgeScroll,
    containerRef,
    canvasMode,
    tool,
    brushChar,
    getViewport: runtime.camera.getViewport.bind(runtime.camera),
    hasColorPickerTarget: !!canvasColorPickerTarget,
    pointerContext,
    editorRuntime,
    getInteractionState: editorRuntime.getInteractionState,
    hoverInteraction,
    shouldIgnoreActiveGestureEvent,
    canvasPinchRouteHandler,
    canvasMoveRouteHandler,
    canvasDragStartRouteAdapter,
    canvasClickRouteHandler,
    canvasWheelRouteHandler,
    capabilities,
    canStartStaticRangeMove,
  });

  const handleDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!capabilities.mutateContent) return;
    if (tool !== "select" || shouldIgnoreCanvasSurfaceGesture(event.nativeEvent)) {
      return;
    }
    const point = pointerContext.resolveGridPoint(event.clientX, event.clientY);
    if (!point) return;
    event.preventDefault();
    enterStaticGridTextEdit(point);
  };
  const activateInteractionOwner = useCallback(
    () => editorRuntime.activateInteractionOwner(interactionOwnerId),
    [editorRuntime, interactionOwnerId]
  );

  return {
    bind,
    activateInteractionOwner,
    cursor,
    draggingSelection,
    staticRangeMovePreview,
    handleDoubleClick,
    colorSourceChoice,
    selectColorSource,
    cancelColorSourceChoice: clearColorSourceChoice,
  };
};
