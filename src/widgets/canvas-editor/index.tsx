import { useCallback, useRef, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useSize } from 'ahooks';
import { useCanvasInteraction } from './hooks/useCanvasInteraction';
import { useCanvasRenderer } from './hooks/useCanvasRenderer';
import { useCanvasEditorModels } from './hooks/useCanvasEditorModels';
import { CanvasContextMenuContent } from './CanvasContextMenuContent';
import { CanvasSurface } from './CanvasSurface';
import { CanvasColorSourceChooser } from './CanvasColorSourceChooser';
import { CanvasTemplatePreviewOverlay } from './CanvasTemplatePreviewOverlay';
import { useCanvasTemplateDrop } from './hooks/useCanvasTemplateDrop';
import { useManagedCanvasInput } from './hooks/useManagedCanvasInput';
import type { ManagedInputBatchCommitSample } from './hooks/ManagedInputBatchScheduler';
import { useCanvasSpacePan } from './hooks/useCanvasSpacePan';
import { ContextMenu, ContextMenuTrigger } from '@chardesk/ui';
import { CANVAS_CONTEXT_MENU } from '@/domains/actions/public';
import { DEFAULT_CANVAS_CELL_METRICS } from '@/shared/fonts/canvas-profile';
import type { CanvasLinkHit } from './hooks/interaction/core/linkHitTesting';
import { useCanvasEngineRuntime } from './engine/useCanvasEngineRuntime';
import { useCanvasViewOptional } from './engine/CanvasWorkspace';
import { useCanvasCursor } from '@/shared/canvas-cursor/hooks';
import { useCanvasAppearance } from '@/shared/canvas-appearance/hooks';
import { resolveCanvasSurfaceGeometry } from './canvasSurfaceGeometry';
import type { EditorViewportFrame } from '@/widgets/editor-chrome/public';
import { computeVisibleSurfaceBounds } from './minimap/geometry';
import {
  filterCanvasContextMenuEntries,
  DEFAULT_CANVAS_EDITOR_CAPABILITIES,
  type CanvasEditorCapabilities,
} from './canvasEditorCapabilities';

interface CanvasEditorProps {
  onUndo: () => void;
  onRedo: () => void;
  onContainerSizeChange?: (size: { width: number; height: number } | undefined) => void;
  capabilities?: CanvasEditorCapabilities;
  viewportFrame?: EditorViewportFrame;
  fitContentRevision?: number;
  active?: boolean;
  onActivate?: () => void;
}

export const CanvasEditor = ({
  onUndo,
  onRedo,
  onContainerSizeChange,
  capabilities = DEFAULT_CANVAS_EDITOR_CAPABILITIES,
  viewportFrame,
  fitContentRevision = 0,
  active = true,
  onActivate,
}: CanvasEditorProps) => {
  const canvasView = useCanvasViewOptional();
  const subscribeViewport = canvasView?.subscribeViewport;
  const runtime = useCanvasEngineRuntime();
  const effectiveCapabilities = capabilities;
  const contentCanvasRef = useRef<HTMLCanvasElement>(null);
  const interactionCanvasRef = useRef<HTMLCanvasElement>(null);
  const canvasLayers = useMemo(
    () => ({ content: contentCanvasRef, interaction: interactionCanvasRef }),
    [],
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasAppearance = useCanvasAppearance();
  const cursorPreference = useCanvasCursor();
  const [hoveredLink, setHoveredLink] = useState<CanvasLinkHit | null>(null);
  const requestCanvasRenderRef = useRef<(() => void) | null>(null);
  const restoringManagedInputFocusRef = useRef(false);
  const size = useSize(containerRef);
  const surfaceGeometry = useMemo(
    () => (size ? resolveCanvasSurfaceGeometry(size) : undefined),
    [size]
  );
  useEffect(() => {
    onContainerSizeChange?.(size);
  }, [onContainerSizeChange, size]);
  const {
    interaction: interactionStore,
    renderer: rendererStore,
    editor: editorStore,
  } = useCanvasEditorModels();
  const { canvasMode } = interactionStore;
  const {
    offset,
    zoom,
    setTextCursor,
  } = editorStore;
  const { textCursor } = editorStore.interaction;
  const lastSlideViewRef = useRef<{
    sessionId: string;
    pageKey: string;
  } | null>(null);
  const activeCanvasId = rendererStore.activeCanvasId;
  const lastFitContentRevisionRef = useRef(0);
  const pendingCameraPlacement = editorStore.pendingCameraPlacement;
  const consumePendingCameraPlacement =
    editorStore.consumePendingCameraPlacement;

  useLayoutEffect(() => {
    if (
      !active ||
      !size ||
      !activeCanvasId ||
      pendingCameraPlacement?.sessionId !== activeCanvasId
    ) return;

    const bounds = computeVisibleSurfaceBounds(rendererStore.contentReader);
    if (bounds) {
      runtime.camera.fitBounds(bounds, size, {
        alignment: "start",
        maxZoom: 1,
        padding: 48,
        insets: viewportFrame?.insets,
      });
    }
    consumePendingCameraPlacement(activeCanvasId);
  }, [
    active,
    activeCanvasId,
    consumePendingCameraPlacement,
    pendingCameraPlacement,
    rendererStore.contentReader,
    runtime,
    size,
    viewportFrame?.insets,
  ]);

  useEffect(() => {
    if (
      fitContentRevision <= 0 ||
      fitContentRevision === lastFitContentRevisionRef.current ||
      !size
    ) return;
    const bounds = computeVisibleSurfaceBounds(rendererStore.contentReader);
    if (!bounds) return;
    lastFitContentRevisionRef.current = fitContentRevision;
    runtime.camera.fitBounds(bounds, size, {
      padding: 48,
      insets: viewportFrame?.insets,
    });
  }, [
    fitContentRevision,
    rendererStore.contentReader,
    runtime,
    size,
    viewportFrame?.insets,
  ]);

  useEffect(() => {
    const slideDeck = rendererStore.slideDeck;
    if (canvasMode !== "slide" || !slideDeck || !size || !activeCanvasId) return;
    const activeSlide = slideDeck.slides.find(
      (slide) => slide.id === slideDeck.activeSlideId
    );
    if (!activeSlide) return;
    const pageKey = `${activeSlide.id}:${activeSlide.size.columns}x${activeSlide.size.rows}`;
    const previous = lastSlideViewRef.current;
    if (previous?.sessionId === activeCanvasId && previous.pageKey === pageKey) return;
    lastSlideViewRef.current = { sessionId: activeCanvasId, pageKey };
    runtime.camera.fitBounds(
      {
        x: 0,
        y: 0,
        width:
          activeSlide.size.columns * DEFAULT_CANVAS_CELL_METRICS.cellWidth,
        height:
          activeSlide.size.rows * DEFAULT_CANVAS_CELL_METRICS.cellHeight,
      },
      size,
      { padding: 48, insets: viewportFrame?.insets }
    );
  }, [
    activeCanvasId,
    canvasMode,
    rendererStore.slideDeck,
    runtime,
    size,
    viewportFrame?.insets,
  ]);

  useEffect(() => {
    const unsubscribe = subscribeViewport?.(() => requestCanvasRenderRef.current?.());
    return () => { unsubscribe?.(); };
  }, [subscribeViewport]);

  const canvasTemplateDrop = useCanvasTemplateDrop({
    canvasMode,
    containerRef,
    model: editorStore,
    enabled: effectiveCapabilities.mutateContent,
  });
  const recordManagedInputBatch = useCallback(
    (sample: ManagedInputBatchCommitSample) => {
      runtime?.renderExperience.recordManagedInputBatch(sample);
    },
    [runtime]
  );
  const {
    textareaRef,
    focusManagedTextarea,
    restoreManagedInputFocus,
    canvasOwnsInputFocus,
    onCanvasPointerDown,
    textareaStyle,
    textareaProps,
  } = useManagedCanvasInput({
    inputIdentity: activeCanvasId,
    model: editorStore,
    size,
    onUndo,
    onRedo,
    copyEnabled: effectiveCapabilities.copy,
    mutateEnabled: active && effectiveCapabilities.mutateContent,
    active,
    onManagedInputBatch: recordManagedInputBatch,
  });
  const isCanvasTextEditing = editorStore.interaction.staticGridEditMode === 'text-edit';
  const isTemporaryPanActive = useCanvasSpacePan({
    enabled:
      active &&
      effectiveCapabilities.navigate &&
      canvasOwnsInputFocus &&
      !isCanvasTextEditing,
  });
  const interactionModel = isTemporaryPanActive
    ? { ...interactionStore, tool: 'pan' as const }
    : interactionStore;
  const rendererModel = isTemporaryPanActive
    ? { ...rendererStore, tool: 'pan' as const }
    : rendererStore;

  useLayoutEffect(() => {
    restoringManagedInputFocusRef.current = true;
    try {
      restoreManagedInputFocus();
    } finally {
      restoringManagedInputFocusRef.current = false;
    }
  }, [activeCanvasId, restoreManagedInputFocus]);

  const {
    activateInteractionOwner = () => false,
    cursor,
    draggingSelection,
    staticRangeMovePreview,
    handleDoubleClick,
    colorSourceChoice,
    selectColorSource,
    cancelColorSourceChoice,
  } = useCanvasInteraction(
    interactionModel,
    containerRef,
    setHoveredLink,
    runtime,
    effectiveCapabilities,
    canvasView?.viewId ?? 'single'
  );

  const activateCanvas = useCallback(() => {
    if (restoringManagedInputFocusRef.current) return;
    activateInteractionOwner();
    onActivate?.();
  }, [activateInteractionOwner, onActivate]);

  useLayoutEffect(() => {
    if (active) activateInteractionOwner();
  }, [active, activateInteractionOwner]);

  useEffect(() => {
    if (!active) return;
    const diagnostics = window as Window & {
      __chardeskCanvasExperienceStats?: () => ReturnType<
        typeof runtime.renderExperience.getStats
      >;
      __chardeskCanvasExperienceResetManagedInput?: () => void;
      __chardeskCanvasManagedInputFocus?: () => void;
      __chardeskCanvasManagedInputIdentity?: () => string;
      __chardeskCanvasManagedInputSetCursor?: (point: { x: number; y: number }) => void;
      __chardeskCanvasManagedInputCursor?: () => { x: number; y: number } | null;
    };
    const readStats = () => runtime.renderExperience.getStats();
    const resetManagedInput = () => runtime.renderExperience.resetManagedInputStats();
    const readManagedInputIdentity = () => activeCanvasId;
    const setManagedInputCursor = (point: { x: number; y: number }) =>
      setTextCursor(point);
    const readManagedInputCursor = () => textCursor;
    diagnostics.__chardeskCanvasExperienceStats = readStats;
    diagnostics.__chardeskCanvasExperienceResetManagedInput = resetManagedInput;
    diagnostics.__chardeskCanvasManagedInputFocus = focusManagedTextarea;
    diagnostics.__chardeskCanvasManagedInputIdentity = readManagedInputIdentity;
    diagnostics.__chardeskCanvasManagedInputSetCursor = setManagedInputCursor;
    diagnostics.__chardeskCanvasManagedInputCursor = readManagedInputCursor;
    return () => {
      if (diagnostics.__chardeskCanvasExperienceStats === readStats) {
        delete diagnostics.__chardeskCanvasExperienceStats;
      }
      if (
        diagnostics.__chardeskCanvasExperienceResetManagedInput === resetManagedInput
      ) {
        delete diagnostics.__chardeskCanvasExperienceResetManagedInput;
      }
      if (diagnostics.__chardeskCanvasManagedInputFocus === focusManagedTextarea) {
        delete diagnostics.__chardeskCanvasManagedInputFocus;
      }
      if (
        diagnostics.__chardeskCanvasManagedInputIdentity === readManagedInputIdentity
      ) {
        delete diagnostics.__chardeskCanvasManagedInputIdentity;
      }
      if (
        diagnostics.__chardeskCanvasManagedInputSetCursor === setManagedInputCursor
      ) {
        delete diagnostics.__chardeskCanvasManagedInputSetCursor;
      }
      if (diagnostics.__chardeskCanvasManagedInputCursor === readManagedInputCursor) {
        delete diagnostics.__chardeskCanvasManagedInputCursor;
      }
    };
  }, [
    active,
    activeCanvasId,
    focusManagedTextarea,
    runtime,
    setTextCursor,
    textCursor,
  ]);

  useCanvasRenderer(
    canvasLayers,
    size,
    surfaceGeometry,
    rendererModel,
    draggingSelection,
    staticRangeMovePreview,
    hoveredLink,
    canvasAppearance,
    {
      viewActive: active,
      inputFocused: canvasOwnsInputFocus,
      cursorPreference,
    },
    requestCanvasRenderRef,
    runtime
  );

  const availableContextMenu = useMemo(
    () => filterCanvasContextMenuEntries(CANVAS_CONTEXT_MENU, effectiveCapabilities),
    [effectiveCapabilities],
  );
  const handleContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    if (availableContextMenu.length === 0) {
      event.preventDefault();
    }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <CanvasSurface
          containerRef={containerRef}
          contentCanvasRef={contentCanvasRef}
          interactionCanvasRef={interactionCanvasRef}
          surfaceGeometry={surfaceGeometry}
          onContextMenu={handleContextMenu}
          onFocusCapture={activateCanvas}
          onPointerDownCapture={activateCanvas}
          onWheelCapture={activateCanvas}
          data-canvas-view-active={active ? 'true' : 'false'}
          style={{ cursor: cursor || undefined }}
          {...canvasTemplateDrop.surfaceProps}
          onDoubleClick={handleDoubleClick}
          onPointerDown={onCanvasPointerDown}
          textareaRef={textareaRef}
          textareaKey={activeCanvasId}
          textareaStyle={textareaStyle}
          textareaProps={textareaProps}
        >
          <CanvasTemplatePreviewOverlay preview={canvasTemplateDrop.preview} zoom={zoom} />
          {colorSourceChoice && (
            <CanvasColorSourceChooser
              choice={colorSourceChoice}
              offset={offset}
              zoom={zoom}
              onSelect={selectColorSource}
              onCancel={cancelColorSourceChoice}
            />
          )}
        </CanvasSurface>
      </ContextMenuTrigger>

      {availableContextMenu.length > 0 && (
        <CanvasContextMenuContent
          entries={availableContextMenu}
          managedTextareaRef={textareaRef}
        />
      )}
    </ContextMenu>
  );
};
