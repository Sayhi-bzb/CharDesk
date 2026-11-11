import { useEffect } from 'react';
import { IconButton } from '@chardesk/ui';
import { useCanvasRuntime, useCanvasState, useCanvasViewport } from '@/domains/canvas/public';
import { DEFAULT_CANVAS_CELL_METRICS } from '@/shared/fonts/canvas-profile';
import { acknowledgeCanvasActivity, useCanvasActivity } from '@/shared/canvas-activity';
import { nextActivityTarget, visibleActivityRanges } from '@/shared/canvas-activity/viewport';
import { useUiI18n } from '@/shared/i18n';
import { useCanvasLiveViewportOptional, useCanvasViewOptional } from '@/widgets/canvas-editor/engine/CanvasWorkspace';

const OBSERVE_MS = 1200;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function CanvasActivityOverlay() {
  const markers = useCanvasActivity();
  const canvas = useCanvasRuntime();
  const canvasView = useCanvasViewOptional();
  const liveViewport = useCanvasLiveViewportOptional();
  const fallbackViewport = useCanvasViewport();
  const activeCanvasId = useCanvasState((state) => state.activeCanvasId);
  const activePageId = useCanvasState((state) => state.slideDeck?.activeSlideId);
  const { t } = useUiI18n();
  const viewport = liveViewport ?? fallbackViewport;
  const width = canvasView?.containerSize?.width ?? 0;
  const height = canvasView?.containerSize?.height ?? 0;
  const enabled = canvasView?.isActive && canvasView.loadState === 'idle'
    && canvasView.sessionId === activeCanvasId && width > 0 && height > 0;
  const pageId = activeCanvasId ? canvas.documents.getDocumentAddress(activeCanvasId, activePageId)?.pageId : undefined;
  const marker = enabled ? markers.find((entry) => entry.canvasId === activeCanvasId && entry.pageId === pageId) : undefined;
  const cellWidth = DEFAULT_CANVAS_CELL_METRICS.cellWidth * viewport.zoom;
  const cellHeight = DEFAULT_CANVAS_CELL_METRICS.cellHeight * viewport.zoom;
  const { x: offsetX, y: offsetY } = viewport.offset;

  useEffect(() => {
    if (!marker) return;
    const visible = visibleActivityRanges(marker.ranges, {
      left: -offsetX / cellWidth, top: -offsetY / cellHeight,
      right: (width - offsetX) / cellWidth, bottom: (height - offsetY) / cellHeight,
    });
    if (!visible.length) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observe = () => {
      clearTimeout(timer);
      if (document.visibilityState === 'visible' && document.hasFocus()) {
        timer = setTimeout(() => acknowledgeCanvasActivity(marker, visible), OBSERVE_MS);
      }
    };
    const pause = () => clearTimeout(timer);
    window.addEventListener('focus', observe);
    window.addEventListener('blur', pause);
    document.addEventListener('visibilitychange', observe);
    observe();
    return () => {
      pause();
      window.removeEventListener('focus', observe);
      window.removeEventListener('blur', pause);
      document.removeEventListener('visibilitychange', observe);
    };
  }, [marker, width, height, cellWidth, cellHeight, offsetX, offsetY]);

  if (!marker || !canvasView) return null;
  const world = {
    left: -offsetX / cellWidth, top: -offsetY / cellHeight,
    right: (width - offsetX) / cellWidth, bottom: (height - offsetY) / cellHeight,
  };
  const target = nextActivityTarget(marker.ranges, world);
  const visible = marker.ranges.filter((range) => range.y + 1 > world.top && range.y < world.bottom
    && range.to > world.left && range.from < world.right);
  // One SVG path represents sparse changed Cells without hundreds of DOM nodes.
  const path = visible.map((range) => {
    const left = offsetX + Math.max(range.from, world.left) * cellWidth;
    const right = offsetX + Math.min(range.to, world.right) * cellWidth;
    const top = offsetY + range.y * cellHeight;
    return `M${left},${top}h${right - left}v${cellHeight}h${left - right}Z`;
  }).join('');
  const targetX = target ? offsetX + target.x * cellWidth : width / 2;
  const targetY = target ? offsetY + target.y * cellHeight : height / 2;
  const dx = targetX - width / 2, dy = targetY - height / 2;
  const scale = Math.min((width / 2) / Math.max(1, Math.abs(dx)), (height / 2) / Math.max(1, Math.abs(dy)));

  return (
    <div className="pointer-events-none absolute inset-0 z-(--layer-activity) overflow-hidden" aria-label={t('canvasActivity.label')}>
      {path && <svg aria-hidden="true" className="absolute inset-0 h-full w-full" data-canvas-activity="highlight">
        <path d={path} className="fill-primary/10" />
      </svg>}
      {target && (
        <IconButton
          type="button"
          data-canvas-ui="true" data-canvas-activity="pending"
          aria-label={t('canvasActivity.next')}
          className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: clamp(width / 2 + dx * scale, 20, width - 20), top: clamp(height / 2 + dy * scale, 20, height - 20) }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => canvasView.runtime.camera.animateTo({
            zoom: viewport.zoom,
            offset: { x: width / 2 - target.x * cellWidth, y: height / 2 - target.y * cellHeight },
          }, { duration: 220 })}
        >
          <span aria-hidden="true" className="size-3 rounded-full bg-destructive" />
        </IconButton>
      )}
    </div>
  );
}
