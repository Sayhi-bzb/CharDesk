import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useCreation } from "ahooks";
import { useCanvasRuntime } from "@/domains/canvas/public";
import type { StaticGridRangeMovePlan } from "@/domains/canvas/public";
import type { CanvasEditorRuntime } from "@/domains/editor/public";
import type { SelectionArea } from "@/shared/types";
import type { CanvasLinkHit } from "./core/linkHitTesting";
import { createCanvasInteractionTransactionController } from "./core/interactionTransaction";
import { createCanvasPointerContextResolver } from "./core/pointerContext";
import { createDragResetController } from "./gestures/dragResetExecution";
import { createHoverInteractionController } from "./preview/hoverInteractionController";
import { createSelectionPreviewController } from "./preview/selectionPreviewController";
import {
  SHORTCUT_PRIORITY,
  useShortcutLayer,
} from "@/shared/shortcuts/dispatcher";
import type { CanvasEngineRuntime } from "../../engine/CanvasEngineRuntime";
import { CanvasEdgeScrollManager } from "../../engine/CanvasEdgeScrollManager";
import type { useCanvasEditorModels } from "../useCanvasEditorModels";

type ControllerStore = Pick<
  ReturnType<typeof useCanvasEditorModels>["interaction"],
  | "tool"
  | "contentReader"
  | "canvasMode"
  | "setHoveredGrid"
> & {
  activeCanvasId?: ReturnType<typeof useCanvasEditorModels>["interaction"]["activeCanvasId"];
  slideDeck?: ReturnType<typeof useCanvasEditorModels>["interaction"]["slideDeck"];
};

export const useInteractionControllers = ({
  store,
  containerRef,
  setHoveredLink,
  runtime,
  editorRuntime,
}: {
  store: ControllerStore;
  containerRef: React.RefObject<HTMLDivElement | null>;
  setHoveredLink: (hit: CanvasLinkHit | null) => void;
  runtime: CanvasEngineRuntime;
  editorRuntime: CanvasEditorRuntime;
}) => {
  const canvas = useCanvasRuntime();
  const {
    tool,
    activeCanvasId,
    contentReader,
    canvasMode,
    slideDeck,
    setHoveredGrid,
  } = store;
  const colorPickerClickRef = useRef(false);
  const [cursor, setCursor] = useState("");
  const [draggingSelection, setDraggingSelection] = useState<SelectionArea | null>(null);
  const [staticRangeMovePreview, setStaticRangeMovePreview] =
    useState<StaticGridRangeMovePlan | null>(null);
  const pointerInputsRef = useRef({ contentReader, canvasMode, slideDeck });
  const hoverOutputsRef = useRef({ setHoveredLink, setHoveredGrid });
  useLayoutEffect(() => {
    pointerInputsRef.current = { contentReader, canvasMode, slideDeck };
    hoverOutputsRef.current = { setHoveredLink, setHoveredGrid };
  }, [
    canvasMode,
    contentReader,
    setHoveredGrid,
    setHoveredLink,
    slideDeck,
  ]);
  const pointerContext = useCreation(
    () =>
      createCanvasPointerContextResolver({
        getRect: () => containerRef.current?.getBoundingClientRect(),
        getViewport: () => runtime.camera.getViewport(),
        getContentSource: () => pointerInputsRef.current.contentReader,
        getGridBounds: () => {
          const current = pointerInputsRef.current;
          return current.canvasMode === "slide" && current.slideDeck
            ? current.slideDeck.slides.find(
                (slide) => slide.id === current.slideDeck?.activeSlideId
              )?.size ?? null
            : null;
        },
      }),
    [containerRef]
  );
  const hoverInteraction = useCreation(
    () =>
      createHoverInteractionController({
        setCursor,
        setHoveredLink: (hit) => hoverOutputsRef.current.setHoveredLink(hit),
        setHoveredGrid: (point) => hoverOutputsRef.current.setHoveredGrid(point),
      }),
    [containerRef]
  );
  const selectionPreview = useCreation(
    () => createSelectionPreviewController({ setPreview: setDraggingSelection }),
    []
  );
  const viewportInteraction = useCreation(
    () => ({
      queueOffsetDelta: (dx: number, dy: number) =>
        runtime.camera.queuePan(dx, dy),
      flushOffset: () => runtime.camera.flushPan(),
      queueZoomDelta: (delta: number, x: number, y: number) =>
        runtime.camera.queueZoomAt(delta, { x, y }),
      flushZoom: () => runtime.camera.flushZoom(),
      cancel: () => runtime.camera.cancelPending(),
    }),
    [runtime]
  );
  const resetDragState = useCreation(
    () =>
      createDragResetController({
        clearScratch: canvas.commands.grid.clearScratch,
        selectionPreview,
        clearStaticRangeMovePreview: () => setStaticRangeMovePreview(null),
      }).reset,
    [canvas, selectionPreview]
  );
  const interactionTransaction = useCreation(
    () =>
      createCanvasInteractionTransactionController({
        createCheckpoint: editorRuntime.history.beginCheckpoint,
      }),
    [editorRuntime]
  );
  const edgeScroll = useCreation(
    () =>
      runtime
        ? new CanvasEdgeScrollManager(runtime.frameScheduler, runtime.camera)
        : null,
    [runtime]
  );
  const managerTargetsRef = useRef({
    edgeScroll,
    interactionTransaction,
    selectionPreview,
    viewportInteraction,
  });
  useLayoutEffect(() => {
    managerTargetsRef.current = {
      edgeScroll,
      interactionTransaction,
      selectionPreview,
      viewportInteraction,
    };
  }, [
    edgeScroll,
    interactionTransaction,
    selectionPreview,
    viewportInteraction,
  ]);
  const interactionManager = useCreation(
    () => ({
      dispose: () => {
        const targets = managerTargetsRef.current;
        targets.interactionTransaction.cancel();
        targets.edgeScroll?.stop();
        targets.viewportInteraction.cancel();
        targets.selectionPreview.cancel();
      },
    }),
    []
  );
  const cancelInteractionEffects = useCallback(() => {
    edgeScroll?.stop();
    viewportInteraction.cancel();
    interactionTransaction.cancel();
    resetDragState();
    hoverInteraction.clearLinkHover();
    hoverInteraction.setCursor(tool === "pan" ? "grab" : "");
  }, [
    edgeScroll,
    hoverInteraction,
    interactionTransaction,
    resetDragState,
    tool,
    viewportInteraction,
  ]);
  const cancelInteraction = useCallback((
    reason: "escape" | "blur" | "hidden" | "pointer" | "identity" = "identity"
  ) => {
    if (
      editorRuntime.dispatch({
        type: "canvas-interaction-cancel",
        reason,
      })
    ) {
      return;
    }
    cancelInteractionEffects();
  }, [cancelInteractionEffects, editorRuntime]);
  const beginInteraction = useCallback(() => {
    if (interactionTransaction.hasActive()) cancelInteraction();
    edgeScroll?.stop();
    interactionTransaction.begin();
  }, [cancelInteraction, edgeScroll, interactionTransaction]);
  const completeInteraction = useCallback(() => {
    edgeScroll?.stop();
    interactionTransaction.complete();
  }, [edgeScroll, interactionTransaction]);
  const interactionIdentityRef = useRef({
    activeCanvasId,
    activeSlideId: slideDeck?.activeSlideId,
    canvasMode,
    tool,
  });
  useLayoutEffect(() => {
    const nextIdentity = {
      activeCanvasId,
      activeSlideId: slideDeck?.activeSlideId,
      canvasMode,
      tool,
    };
    const previous = interactionIdentityRef.current;
    interactionIdentityRef.current = nextIdentity;
    if (
      interactionTransaction.hasActive() &&
      (previous.activeCanvasId !== nextIdentity.activeCanvasId ||
        previous.activeSlideId !== nextIdentity.activeSlideId ||
        previous.canvasMode !== nextIdentity.canvasMode ||
        previous.tool !== nextIdentity.tool)
    ) {
      cancelInteraction("identity");
    }
  }, [
    activeCanvasId,
    cancelInteraction,
    cancelInteractionEffects,
    canvasMode,
    interactionTransaction,
    slideDeck?.activeSlideId,
    tool,
  ]);

  useShortcutLayer({
    id: "canvas-active-interaction-cancel",
    priority: SHORTCUT_PRIORITY.canvasInteraction,
    onKeyDown: (input, context) => {
      if (
        input.key !== "Escape" ||
        !interactionTransaction.hasActive() ||
        context.targetKind === "editable" ||
        context.targetKind === "overlay"
      ) {
        return { claimed: false };
      }
      cancelInteraction("escape");
      return { claimed: true, preventDefault: true };
    },
  });

  useEffect(() => {
    const cancelOnBlur = () => {
      if (interactionTransaction.hasActive()) cancelInteraction("blur");
    };
    const cancelWhenHidden = () => {
      if (document.visibilityState === "hidden" && interactionTransaction.hasActive()) {
        cancelInteraction("hidden");
      }
    };
    window.addEventListener("blur", cancelOnBlur);
    document.addEventListener("visibilitychange", cancelWhenHidden);
    return () => {
      window.removeEventListener("blur", cancelOnBlur);
      document.removeEventListener("visibilitychange", cancelWhenHidden);
    };
  }, [cancelInteraction, interactionTransaction]);

  useEffect(() => {
    hoverInteraction.setCursor(tool === "pan" ? "grab" : "");
  }, [hoverInteraction, tool]);

  useEffect(() => {
    runtime?.registerManager("interaction", interactionManager);
    return () => {
      if (runtime) runtime.unregisterManager("interaction", interactionManager);
      else interactionManager.dispose();
    };
  }, [interactionManager, runtime]);

  return {
    colorPickerClickRef,
    beginInteraction,
    cancelInteraction,
    cancelInteractionEffects,
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
  };
};
