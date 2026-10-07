import { Button, Tooltip, TooltipPopup, TooltipTrigger } from "@chardesk/ui";
import { useCanvasState, useCanvasViewport } from "@/domains/canvas/public";
import { DEFAULT_CANVAS_CELL_METRICS } from "@/shared/fonts/canvas-profile";
import {
  markCanvasActivityRead,
  useCanvasActivity,
  type CanvasActivityMarker,
} from "@/shared/canvas-activity";
import { useCanvasLiveViewportOptional, useCanvasViewOptional } from "@/widgets/canvas-editor/engine/CanvasWorkspace";

type Point = { x: number; y: number };
type Rect = { left: number; top: number; right: number; bottom: number };

// Keep activity markers aligned with collaboration indicators: the 20px
// marker has a 4px breathing room beyond its 10px radius.
const ACTIVITY_INDICATOR_SIZE = 20;
const ACTIVITY_EDGE_GAP = 4;
const ACTIVITY_EDGE_INSET = ACTIVITY_INDICATOR_SIZE / 2 + ACTIVITY_EDGE_GAP;

const intersects = (left: Rect, right: Rect) =>
  left.right > right.left && left.left < right.right && left.bottom > right.top && left.top < right.bottom;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const toScreenRect = (
  bounds: readonly [number, number, number, number],
  viewport: { offset: Point; zoom: number },
): Rect => {
  const [x, y, width, height] = bounds;
  const cellWidth = DEFAULT_CANVAS_CELL_METRICS.cellWidth * viewport.zoom;
  const cellHeight = DEFAULT_CANVAS_CELL_METRICS.cellHeight * viewport.zoom;
  return {
    left: viewport.offset.x + x * cellWidth,
    top: viewport.offset.y + y * cellHeight,
    right: viewport.offset.x + (x + width) * cellWidth,
    bottom: viewport.offset.y + (y + height) * cellHeight,
  };
};

const resolveIndicator = (target: Point, viewport: Rect): Point => {
  const center = { x: (viewport.left + viewport.right) / 2, y: (viewport.top + viewport.bottom) / 2 };
  const dx = target.x - center.x;
  const dy = target.y - center.y;
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return center;
  const horizontal = Math.abs(dx) / Math.max(1, viewport.right - viewport.left);
  const vertical = Math.abs(dy) / Math.max(1, viewport.bottom - viewport.top);
  const scale = horizontal >= vertical
    ? (dx < 0 ? viewport.left - center.x : viewport.right - center.x) / dx
    : (dy < 0 ? viewport.top - center.y : viewport.bottom - center.y) / dy;
  return {
    x: clamp(center.x + dx * scale, viewport.left + ACTIVITY_EDGE_INSET, viewport.right - ACTIVITY_EDGE_INSET),
    y: clamp(center.y + dy * scale, viewport.top + ACTIVITY_EDGE_INSET, viewport.bottom - ACTIVITY_EDGE_INSET),
  };
};

const reveal = (
  marker: CanvasActivityMarker,
  canvasView: ReturnType<typeof useCanvasViewOptional>,
  viewport: { offset: Point; zoom: number },
  pane: Rect,
) => {
  if (!canvasView) return;
  const target = toScreenRect(marker.bounds, viewport);
  const center = { x: (target.left + target.right) / 2, y: (target.top + target.bottom) / 2 };
  canvasView.runtime.camera.animateTo({
    zoom: viewport.zoom,
    offset: {
      x: viewport.offset.x + (pane.left + pane.right) / 2 - center.x,
      y: viewport.offset.y + (pane.top + pane.bottom) / 2 - center.y,
    },
  }, { duration: 220 });
  markCanvasActivityRead(marker.id);
};

export function CanvasActivityOverlay() {
  const markers = useCanvasActivity();
  const canvasView = useCanvasViewOptional();
  const liveViewport = useCanvasLiveViewportOptional();
  const fallbackViewport = useCanvasViewport();
  const activeCanvasId = useCanvasState((state) => state.activeCanvasId);
  const activePageId = useCanvasState((state) => state.slideDeck?.activeSlideId);
  if (!canvasView || !canvasView.isActive || canvasView.loadState !== "idle" || !canvasView.sessionId || canvasView.sessionId !== activeCanvasId) return null;
  const viewport = liveViewport ?? fallbackViewport;
  const width = canvasView.containerSize?.width ?? 0;
  const height = canvasView.containerSize?.height ?? 0;
  if (width <= 0 || height <= 0) return null;
  const pane = { left: 0, top: 0, right: width, bottom: height };
  const visible = markers.filter((marker) =>
    marker.canvasId === canvasView.sessionId && (marker.pageId ?? undefined) === activePageId
  );

  return (
    <div className="pointer-events-none absolute inset-0 z-(--layer-activity) overflow-hidden" aria-label="Agent updates">
      {visible.map((marker) => {
        const target = toScreenRect(marker.bounds, viewport);
        const inside = intersects(target, pane);
        const targetPoint = { x: (target.left + target.right) / 2, y: (target.top + target.bottom) / 2 };
        const position = inside
          ? { x: clamp(target.left, ACTIVITY_EDGE_INSET, width - ACTIVITY_EDGE_INSET), y: clamp(target.top, ACTIVITY_EDGE_INSET, height - ACTIVITY_EDGE_INSET) }
          : resolveIndicator(targetPoint, pane);
        return (
          <Tooltip key={marker.id}>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  tone="subtle"
                  shape="pill"
                  size="xs"
                  data-canvas-ui="true"
                  aria-label={marker.label}
                  data-canvas-activity="unread"
                  className="pointer-events-auto absolute size-5 -translate-x-1/2 -translate-y-1/2 border-0 bg-(--color-destructive) p-0"
                  style={{ left: position.x, top: position.y }}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => reveal(marker, canvasView, viewport, pane)}
                />
              }
            />
            <TooltipPopup>{marker.label}</TooltipPopup>
          </Tooltip>
        );
      })}
    </div>
  );
}
