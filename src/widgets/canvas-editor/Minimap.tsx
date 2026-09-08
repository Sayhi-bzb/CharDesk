"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { useShallow } from "zustand/react/shallow";
import {
  isIncrementalCanvasSurfaceReader,
  useCanvasState,
} from "@/domains/canvas/public";
import { useUiI18n } from "@/shared/i18n";
import { useHostVisualTheme } from "@/shared/hooks/useHostVisualTheme";
import { cn } from "@chardesk/ui";
import type { Point } from "@/shared/types";
import { resolveCanvasWheelDecision } from "./hooks/interaction/gestures/wheelInteraction";
import { useCanvasEngineRuntime } from "./engine/useCanvasEngineRuntime";
import { useCanvasLiveViewportOptional } from "./engine/CanvasWorkspace";
import {
  cameraCenterToOffset,
  expandMinimapRect,
  getRectCenter,
  isPointInMinimapRect,
  unionMinimapRects,
} from "./minimap/geometry";
import { MinimapManager } from "./minimap/MinimapManager";

const MINIMAP_DIMENSIONS = { width: 220, height: 140 } as const;
const MINIMAP_PADDING = 4;
const VIEWPORT_HIT_SLOP = 4;
const CLICK_JITTER_THRESHOLD_SQ = 4;
const CAMERA_ANIMATION_MS = 180;

type PointerSession = {
  pointerId: number;
  originScreenPoint: Point;
  originPagePoint: Point;
  originPageCenter: Point;
  isInViewport: boolean;
};

export const Minimap = ({
  containerSize,
}: {
  containerSize: { width: number; height: number } | undefined;
}) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const managerRef = useRef<MinimapManager | null>(null);
  const pointerSessionRef = useRef<PointerSession | null>(null);
  const endPointerSessionRef = useRef<() => void>(() => {});
  const [isViewportHovered, setIsViewportHovered] = useState(false);
  const [isDraggingViewport, setIsDraggingViewport] = useState(false);
  const visualTheme = useHostVisualTheme(hostRef);
  const minimapColors = useMemo(() => visualTheme ? ({
    background: visualTheme.canvas.minimapSurface,
    foreground: visualTheme.canvas.minimapContent,
    viewportFill: visualTheme.canvas.minimapViewportSurface,
    viewportStroke: visualTheme.canvas.minimapViewportBorder,
  }) : null, [visualTheme]);
  const { t } = useUiI18n();
  const runtime = useCanvasEngineRuntime();
  const liveViewport = useCanvasLiveViewportOptional();
  const { contentSurface, offset: storedOffset, zoom: storedZoom } = useCanvasState(
    useShallow((state) => ({
      contentSurface: state.contentSurface,
      offset: state.offset,
      zoom: state.zoom,
    }))
  );
  const offset = liveViewport?.offset ?? storedOffset;
  const zoom = liveViewport?.zoom ?? storedZoom;
  const contentReader = contentSurface.reader;

  const removeDragEndListeners = useCallback(() => {
    const end = endPointerSessionRef.current;
    document.body.removeEventListener("pointerup", end);
    document.body.removeEventListener("pointercancel", end);
    document.body.removeEventListener("contextmenu", end, true);
  }, []);

  const endPointerSession = useCallback(() => {
    const session = pointerSessionRef.current;
    pointerSessionRef.current = null;
    setIsDraggingViewport(false);
    removeDragEndListeners();
    const canvas = canvasRef.current;
    if (
      session &&
      canvas?.hasPointerCapture?.(session.pointerId)
    ) {
      canvas.releasePointerCapture(session.pointerId);
    }
  }, [removeDragEndListeners]);

  useEffect(() => {
    endPointerSessionRef.current = endPointerSession;
  }, [endPointerSession]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host || !minimapColors) return;
    try {
      const manager = new MinimapManager(
        canvas,
        host,
        MINIMAP_DIMENSIONS,
        MINIMAP_PADDING,
        minimapColors
      );
      managerRef.current = manager;
      return () => {
        endPointerSession();
        manager.close();
        managerRef.current = null;
      };
    } catch (error) {
      console.error("Minimap initialization failed", error);
      return;
    }
  }, [endPointerSession, minimapColors]);

  useEffect(
    () => () => runtime.camera.cancelAnimation(),
    [runtime]
  );

  useEffect(() => {
    if (!containerSize) return;
    if (!contentReader) return;
    managerRef.current?.update({
      reader: contentReader,
      contentRevision: isIncrementalCanvasSurfaceReader(contentReader)
        ? contentReader.getRevision()
        : contentSurface.revision,
      offset,
      zoom,
      viewportSize: containerSize,
    });
  }, [containerSize, contentReader, contentSurface.revision, offset, zoom]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (!minimapColors) return;
      managerRef.current?.setColors(minimapColors);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [minimapColors]);

  const addDragEndListeners = useCallback(() => {
    document.body.addEventListener("pointerup", endPointerSession);
    document.body.addEventListener("pointercancel", endPointerSession);
    document.body.addEventListener("contextmenu", endPointerSession, true);
  }, [endPointerSession]);

  const getCanvasPoint = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return rect ? { x: clientX - rect.left, y: clientY - rect.top } : null;
  };

  const moveCameraTo = useCallback(
    (center: Point, animated: boolean) => {
      if (!containerSize) return;
      const target = cameraCenterToOffset(center, zoom, containerSize);
      if (animated) {
        runtime.camera.animateTo(
          { offset: target, zoom },
          { duration: CAMERA_ANIMATION_MS }
        );
      } else {
        runtime.camera.setViewport({ offset: target, zoom });
      }
    },
    [containerSize, runtime, zoom]
  );

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const manager = managerRef.current;
    const transform = manager?.getTransform();
    if (!manager || !transform || !manager.hasContent() || !containerSize) {
      return;
    }
    if (event.button !== 0) return;

    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

    const rawPoint = manager.getWorldPoint(event.clientX, event.clientY);
    if (!rawPoint) return;
    const commonBounds = unionMinimapRects(
      transform.contentBounds!,
      transform.viewportBounds
    );
    const allowedBounds = expandMinimapRect(
      commonBounds,
      transform.viewportBounds.width / 2,
      transform.viewportBounds.height / 2
    );
    const pointInViewport = isPointInMinimapRect(
      rawPoint,
      transform.viewportBounds
    );

    let originPagePoint: Point;
    let originPageCenter: Point;
    let isInViewport: boolean;

    if (isPointInMinimapRect(rawPoint, allowedBounds) && !pointInViewport) {
      originPagePoint = {
        x: rawPoint.x + transform.viewportBounds.width / 2,
        y: rawPoint.y + transform.viewportBounds.height / 2,
      };
      originPageCenter = rawPoint;
      isInViewport = false;
      moveCameraTo(rawPoint, true);
    } else {
      const clampedPoint = manager.getWorldPoint(
        event.clientX,
        event.clientY,
        { clampToWorld: true, clampToContent: true }
      );
      if (!clampedPoint) return;
      originPagePoint = clampedPoint;
      originPageCenter = getRectCenter(transform.viewportBounds);
      isInViewport = isPointInMinimapRect(
        clampedPoint,
        transform.viewportBounds
      );
    }

    pointerSessionRef.current = {
      pointerId: event.pointerId,
      originScreenPoint: { x: event.clientX, y: event.clientY },
      originPagePoint,
      originPageCenter,
      isInViewport,
    };
    setIsDraggingViewport(true);
    addDragEndListeners();
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.stopPropagation();
    const manager = managerRef.current;
    if (!manager) return;
    const session = pointerSessionRef.current;

    if (session && session.pointerId === event.pointerId) {
      const dx = event.clientX - session.originScreenPoint.x;
      const dy = event.clientY - session.originScreenPoint.y;
      if (dx * dx + dy * dy <= CLICK_JITTER_THRESHOLD_SQ) return;

      const point = manager.getWorldPoint(event.clientX, event.clientY, {
        clampToWorld: true,
        clampToContent: true,
        axisOrigin: event.shiftKey ? session.originPagePoint : undefined,
      });
      if (!point) return;
      const center = session.isInViewport
        ? {
            x:
              point.x -
              (session.originPagePoint.x - session.originPageCenter.x),
            y:
              point.y -
              (session.originPagePoint.y - session.originPageCenter.y),
          }
        : point;
      moveCameraTo(center, false);
      event.preventDefault();
      return;
    }

    const canvasPoint = getCanvasPoint(event.clientX, event.clientY);
    const viewportRect = manager.getViewportRect();
    setIsViewportHovered(
      !!canvasPoint &&
        !!viewportRect &&
        isPointInMinimapRect(canvasPoint, viewportRect, VIEWPORT_HIT_SLOP)
    );
  };

  const handleDoubleClick = (
    event: React.MouseEvent<HTMLCanvasElement>
  ) => {
    const manager = managerRef.current;
    if (!manager?.hasContent()) return;
    event.stopPropagation();
    event.preventDefault();
    const point = manager.getWorldPoint(event.clientX, event.clientY);
    if (point) moveCameraTo(point, true);
  };

  const handleWheel = (event: ReactWheelEvent<HTMLCanvasElement>) => {
    if (!containerSize) return;
    const decision = resolveCanvasWheelDecision({
      isCtrlOrMetaPressed: event.ctrlKey || event.metaKey,
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      shiftKey: event.shiftKey,
      anchor: {
        x: containerSize.width / 2,
        y: containerSize.height / 2,
      },
    });
    if (decision.type === "none") return;

    event.preventDefault();
    event.stopPropagation();
    if (decision.type === "pan") {
      runtime.camera.queuePan(decision.delta.x, decision.delta.y);
      return;
    }
    runtime.camera.flushPan();
    runtime.camera.queueZoomAt(decision.deltaZoom, decision.anchor);
  };

  const cursorClass = isDraggingViewport
    ? "cursor-grabbing"
    : isViewportHovered
      ? "cursor-grab"
      : "cursor-crosshair";

  return (
    <div
      ref={hostRef}
      data-minimap-root="true"
      className="size-fit overflow-hidden"
    >
      <canvas
        ref={canvasRef}
        width={MINIMAP_DIMENSIONS.width}
        height={MINIMAP_DIMENSIONS.height}
        style={{
          width: `${MINIMAP_DIMENSIONS.width}px`,
          height: `${MINIMAP_DIMENSIONS.height}px`,
        }}
        role="img"
        aria-label={t("minimap.canvas")}
        data-testid="minimap-canvas"
        className={cn("block touch-none select-none", cursorClass)}
        onDoubleClick={handleDoubleClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => {
          if (!pointerSessionRef.current) setIsViewportHovered(false);
        }}
        onPointerCancel={endPointerSession}
        onLostPointerCapture={endPointerSession}
        onWheelCapture={handleWheel}
      />
    </div>
  );
};
