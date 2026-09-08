'use client';

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  materializeSlideDeckContent,
  useCanvasRuntime,
  useCanvasState,
} from '@/domains/canvas/public';
import { HOST_ICONOLOGY } from '@/shared/icons/iconology';
import { MAX_ZOOM, MIN_ZOOM } from '@/shared/lib/constants';
import {
  Button,
  FloatingSurface,
  Tooltip,
  TooltipCreateHandle,
  TooltipPopup,
  TooltipTrigger,
  type TooltipHandle,
} from '@chardesk/ui';


import { useUiI18n } from '@/shared/i18n';
import { useInPlaceFeedback } from '@/shared/hooks/use-in-place-feedback';
import { useCanvasEngineRuntime } from '@/widgets/canvas-editor/engine/useCanvasEngineRuntime';
import {
  useCanvasLiveViewportOptional,
  useCanvasViewOptional,
  useCanvasWorkspaceOptional,
} from '@/widgets/canvas-editor/engine/CanvasWorkspace';
import { SlidePlaybackOverlay } from './slide-playback';
import type {
  EditorFormFactor,
  EditorViewportFrame,
} from '@/widgets/editor-chrome/public';
import { resolvePaneViewportFrame } from '@/widgets/editor-chrome/public';
import { RecoverableLazyBoundary } from '@/shared/components/RecoverableLazyBoundary';
import { requireLoadedModule } from '@/shared/lib/moduleLoadRecovery';

const ZOOM_STEP = 1.2;
const ZOOM_EPSILON = 0.000001;
const ZOOM_ANIMATION_DURATION_MS = 280;
const ZoomOutIcon = HOST_ICONOLOGY.zoomAction.out;
const ZoomInIcon = HOST_ICONOLOGY.zoomAction.in;
const GridIcon = HOST_ICONOLOGY.viewportAction.grid;
const MinimapIcon = HOST_ICONOLOGY.viewportAction.minimap;
const PlayIcon = HOST_ICONOLOGY.slideAction.play;
const Minimap = lazy(() =>
  import('@/widgets/canvas-editor/Minimap').then((loaded) => ({
    default: requireLoadedModule(loaded).Minimap,
  }))
);

type ZoomControlProps = {
  containerSize?: { width: number; height: number };
  viewportFrame?: EditorViewportFrame;
  formFactor?: EditorFormFactor;
};

type ZoomActionProps = ComponentProps<typeof Button> & {
  tooltip: string;
  tooltipHandle: TooltipHandle<string>;
};

function ZoomAction({ tooltip, tooltipHandle, disabled, ...props }: ZoomActionProps) {
  const button = <Button disabled={disabled} {...props} />;

  return (
    <TooltipTrigger
      handle={tooltipHandle}
      payload={tooltip}
      render={disabled ? <span className="inline-flex">{button}</span> : button}
    />
  );
}

export function ZoomControl({
  containerSize,
  viewportFrame,
  formFactor = 'desktop',
}: ZoomControlProps) {
  const canvas = useCanvasRuntime();
  const { t } = useUiI18n();
  const runtime = useCanvasEngineRuntime();
  const workspace = useCanvasWorkspaceOptional();
  const activeCanvasView = useCanvasViewOptional();
  const liveViewport = useCanvasLiveViewportOptional();
  const { zoom: storedZoom, canvasMode, slideDeck, showGrid, activeCanvasId, contentSurface } = useCanvasState(
    useShallow((state) => ({
      zoom: state.zoom,
      canvasMode: state.canvasMode,
      slideDeck: state.slideDeck,
      showGrid: state.showGrid,
      activeCanvasId: state.activeCanvasId,
      contentSurface: state.contentSurface,
    }))
  );
  const zoom = liveViewport?.zoom ?? storedZoom;
  const playbackDeck = useMemo(
    () =>
      slideDeck
        ? materializeSlideDeckContent(
            canvas.documents,
            activeCanvasId,
            {
              ...slideDeck,
              slides: slideDeck.slides.map((slide) =>
                slide.id === slideDeck.activeSlideId
                  ? {
                      ...slide,
                      grid: Array.from(contentSurface.reader.materialize()),
                    }
                  : slide
              ),
            }
          )
        : null,
    [activeCanvasId, canvas.documents, contentSurface, slideDeck]
  );
  const setShowGrid = canvas.commands.preferences.setShowGrid;
  const [minimapOpen, setMinimapOpen] = useState(false);
  const [playbackSlideId, setPlaybackSlideId] = useState<string | null>(null);
  const playbackSlideIdRef = useRef<string | null>(null);
  const {
    feedback: playbackFeedback,
    show: showPlaybackFeedback,
    clear: clearPlaybackFeedback,
  } = useInPlaceFeedback<'fullscreen'>();
  const ownsFullscreenRef = useRef(false);
  const tooltipHandle = useMemo(() => TooltipCreateHandle<string>(), []);
  const activeViewportFrame = useMemo(() => {
    const activeSize = activeCanvasView?.containerSize;
    if (!viewportFrame || !activeSize) return viewportFrame;
    return resolvePaneViewportFrame(
      viewportFrame,
      activeSize,
      workspace?.splitEnabled
        ? activeCanvasView.viewId === 'primary' ? 'start' : 'end'
        : 'single'
    );
  }, [activeCanvasView?.containerSize, activeCanvasView?.viewId, viewportFrame, workspace?.splitEnabled]);
  const viewportSize = activeCanvasView?.containerSize ?? (viewportFrame
    ? { width: viewportFrame.width, height: viewportFrame.height }
    : containerSize);

  useEffect(
    () => () => runtime.camera.cancelAnimation(),
    [runtime]
  );

  const finishPlayback = useCallback((exitFullscreen: boolean) => {
    const lastSlideId = playbackSlideIdRef.current;
    if (!lastSlideId) return;
    playbackSlideIdRef.current = null;
    clearPlaybackFeedback();
    setPlaybackSlideId(null);
    canvas.commands.slides.activate(lastSlideId);
    if (!exitFullscreen || !ownsFullscreenRef.current) return;
    ownsFullscreenRef.current = false;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
  }, [canvas.commands.slides, clearPlaybackFeedback]);

  const exitPlayback = useCallback(() => finishPlayback(true), [finishPlayback]);

  const updatePlaybackSlide = useCallback((slideId: string) => {
    playbackSlideIdRef.current = slideId;
    setPlaybackSlideId(slideId);
  }, []);

  const startPlayback = useCallback(() => {
    if (!slideDeck) return;
    clearPlaybackFeedback();
    updatePlaybackSlide(slideDeck.activeSlideId);
    if (document.fullscreenElement) return;
    const requestFullscreen = document.documentElement.requestFullscreen;
    if (!requestFullscreen) {
      showPlaybackFeedback('fullscreen', 'warning');
      return;
    }
    void requestFullscreen
      .call(document.documentElement)
      .then(() => {
        ownsFullscreenRef.current = true;
      })
      .catch(() => {
        showPlaybackFeedback('fullscreen', 'warning');
      });
  }, [clearPlaybackFeedback, showPlaybackFeedback, slideDeck, updatePlaybackSlide]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (document.fullscreenElement || !ownsFullscreenRef.current) return;
      ownsFullscreenRef.current = false;
      finishPlayback(false);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      if (ownsFullscreenRef.current && document.fullscreenElement) {
        ownsFullscreenRef.current = false;
        void document.exitFullscreen().catch(() => undefined);
      }
    };
  }, [finishPlayback]);

  const animateZoomTo = useCallback(
    (requestedZoom: number) => {
      const viewportCenter = activeViewportFrame?.center ??
        (containerSize
          ? { x: containerSize.width / 2, y: containerSize.height / 2 }
          : undefined);
      if (!viewportCenter) return;
      const targetZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, requestedZoom));
      if (Math.abs(targetZoom - runtime.camera.getViewport().zoom) <= ZOOM_EPSILON) return;
      runtime.camera.animateZoomTo(
        targetZoom,
        viewportCenter,
        { duration: ZOOM_ANIMATION_DURATION_MS }
      );
    },
    [activeViewportFrame, containerSize, runtime]
  );

  const applyZoomDelta = useCallback(
    (deltaZoom: number) => {
      const baseZoom = runtime.camera.getTargetViewport().zoom;
      animateZoomTo(baseZoom * deltaZoom);
    },
    [animateZoomTo, runtime]
  );

  const percentage = Math.round(zoom * 100);
  const zoomLabel = `${t('zoom.label')} — ${percentage}%`;
  const isMinZoom = zoom <= MIN_ZOOM + ZOOM_EPSILON;
  const resetLabel = `${t('zoom.reset')} — ${percentage}%`;
  const isMaxZoom = zoom >= MAX_ZOOM - ZOOM_EPSILON;
  const actionsDisabled = !viewportSize;
  const gridLabel = showGrid ? t('sidebar.grid.hide') : t('action.toggleGrid');
  const minimapLabel = t('sidebar.minimap');
  const playbackLabel = t('slide.playback.start');

  if (formFactor === 'phone') return null;

  return (
    <FloatingSurface
      data-canvas-ui="true"
      data-testid="zoom-control"
      variant="control-bar"
      aria-label={zoomLabel}
    >
      {canvasMode !== 'slide' && minimapOpen && (
        <FloatingSurface
          data-testid="zoom-minimap"
          variant="panel"
          className="absolute bottom-full left-0 z-(--layer-popover) mb-2 w-auto"
        >
          <RecoverableLazyBoundary
            resetKey={minimapOpen}
            onError={() => setMinimapOpen(false)}
          >
            <Suspense fallback={<div className="h-[140px] w-[220px] bg-muted" />}>
              <Minimap containerSize={viewportSize} />
            </Suspense>
          </RecoverableLazyBoundary>
        </FloatingSurface>
      )}
      <ZoomAction
        tooltip={t('zoom.out')}
        tooltipHandle={tooltipHandle}
        tone="subtle"
        size="md"
        shape="square"
        joined="start"
        aria-label={t('zoom.out')}
        data-testid="zoom-out"
        disabled={actionsDisabled || isMinZoom}
        onClick={() => applyZoomDelta(1 / ZOOM_STEP)}
      >
        <ZoomOutIcon />
      </ZoomAction>
      <ZoomAction
        tooltip={resetLabel}
        tooltipHandle={tooltipHandle}
        tone="subtle"
        size="md"
        joined="middle"
        className="w-12 px-2 tabular-nums"
        aria-label={resetLabel}
        data-testid="zoom-reset"
        disabled={actionsDisabled}
        onClick={() => animateZoomTo(1)}
      >
        {percentage}%
      </ZoomAction>
      <ZoomAction
        tooltip={t('zoom.in')}
        tooltipHandle={tooltipHandle}
        tone="subtle"
        size="md"
        shape="square"
        joined="middle"
        aria-label={t('zoom.in')}
        data-testid="zoom-in"
        disabled={actionsDisabled || isMaxZoom}
        onClick={() => applyZoomDelta(ZOOM_STEP)}
      >
        <ZoomInIcon />
      </ZoomAction>
      <ZoomAction
        tooltip={gridLabel}
        tooltipHandle={tooltipHandle}
        tone="subtle"
        size="md"
        shape="square"
        pressed={showGrid}
        joined="middle"
        aria-label={gridLabel}
        data-testid="zoom-grid"
        onClick={() => setShowGrid(!showGrid)}
      >
        <GridIcon />
      </ZoomAction>
      {canvasMode === 'slide' ? (
        <ZoomAction
          tooltip={playbackLabel}
          tooltipHandle={tooltipHandle}
          tone="subtle"
          size="md"
          shape="square"
          joined="end"
          aria-label={playbackLabel}
          data-testid="zoom-playback"
          disabled={!slideDeck}
          onClick={startPlayback}
        >
          <PlayIcon />
        </ZoomAction>
      ) : (
        <ZoomAction
          tooltip={minimapLabel}
          tooltipHandle={tooltipHandle}
          tone="subtle"
          size="md"
          shape="square"
          pressed={minimapOpen}
          joined="end"
          aria-label={minimapLabel}
          data-testid="zoom-minimap-toggle"
          disabled={actionsDisabled}
          onClick={() => setMinimapOpen((open) => !open)}
        >
          <MinimapIcon />
        </ZoomAction>
      )}
      <Tooltip handle={tooltipHandle}>
        {({ payload }) => <TooltipPopup side="top">{payload}</TooltipPopup>}
      </Tooltip>
      {playbackSlideId && playbackDeck && (
        <SlidePlaybackOverlay
          deck={playbackDeck}
          activeSlideId={playbackSlideId}
          onActiveSlideChange={updatePlaybackSlide}
          warning={
            playbackFeedback?.status === 'warning'
              ? t('slide.playback.fullscreenUnavailable')
              : null
          }
          onExit={exitPlayback}
        />
      )}
    </FloatingSurface>
  );
}
