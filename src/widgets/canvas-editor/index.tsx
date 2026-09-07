import { useCallback, useRef, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useSize } from 'ahooks';
import { useCanvasInteraction } from './hooks/useCanvasInteraction';
import { useCanvasRenderer } from './hooks/useCanvasRenderer';
import { useHostVisualTheme } from '@/shared/hooks/useHostVisualTheme';
import { useCanvasEditorModels } from './hooks/useCanvasEditorModels';
import { CanvasContextMenuContent } from './CanvasContextMenuContent';
import { CanvasSurface } from './CanvasSurface';
import { CanvasColorSourceChooser } from './CanvasColorSourceChooser';
import { StructuredTemplatePreviewOverlay } from './StructuredTemplatePreviewOverlay';
import { useStructuredTemplateDrop } from './hooks/useStructuredTemplateDrop';
import { useManagedCanvasInput } from './hooks/useManagedCanvasInput';
import { useCanvasSpacePan } from './hooks/useCanvasSpacePan';
import { ContextMenu, ContextMenuTrigger } from '@chardesk/ui';
import { CANVAS_CONTEXT_MENU, STRUCTURED_CONTEXT_MENU } from '@/domains/actions/public';
import { GridManager } from '@/shared/utils/grid';
import { DEFAULT_GRID_RENDER_METRICS } from '@/shared/metrics';
import {
  createStructuredSceneQuery,
  isStructuredSplitBoxLineHandle,
} from '@/domains/structured-content/public';
import type { CanvasLinkHit } from './hooks/interaction/core/linkHitTesting';
import type { StructuredMovePreview } from './hooks/useCanvasRenderer';
import { isStaticGridMode } from '@/domains/sessions/public';
import { useCanvasEngineRuntime } from './engine/useCanvasEngineRuntime';
import { useCanvasViewOptional } from './engine/CanvasWorkspace';
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
  const visualTheme = useHostVisualTheme(containerRef);
  const [hoveredLink, setHoveredLink] = useState<CanvasLinkHit | null>(null);
  const structuredMovePreviewRef = useRef<StructuredMovePreview | null>(null);
  const requestCanvasRenderRef = useRef<(() => void) | null>(null);
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
    setStructuredGridFocus,
    selectedStructuredNodeIds,
    setSelectedStructuredNodeIds,
    setSelectedStructuredSplitHandle,
    structuredScene,
    setStructuredContextPoint,
  } = editorStore;
  const structuredSceneQuery = useMemo(
    () => createStructuredSceneQuery(structuredScene),
    [structuredScene]
  );
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
          activeSlide.size.columns * DEFAULT_GRID_RENDER_METRICS.cellWidth,
        height:
          activeSlide.size.rows * DEFAULT_GRID_RENDER_METRICS.cellHeight,
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

  const structuredTemplateDrop = useStructuredTemplateDrop({
    canvasMode,
    containerRef,
    model: editorStore,
    enabled: effectiveCapabilities.mutateContent,
  });
  const {
    textareaRef,
    canvasOwnsInputFocus,
    onCanvasPointerDown,
    textareaStyle,
    textareaProps,
  } = useManagedCanvasInput({
    canvasMode,
    model: editorStore,
    size,
    onUndo,
    onRedo,
    copyEnabled: effectiveCapabilities.copy,
    mutateEnabled: active && effectiveCapabilities.mutateContent,
    active,
  });
  const isCanvasTextEditing = isStaticGridMode(canvasMode)
    ? editorStore.staticGridEditMode === 'text-edit'
    : !!rendererStore.textCursor ||
      !!rendererStore.editingStructuredTextNodeId ||
      !!rendererStore.structuredTextSelection;
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

  const {
    activateInteractionOwner = () => false,
    cursor,
    draggingSelection,
    handleDoubleClick,
    colorSourceChoice,
    selectColorSource,
    cancelColorSourceChoice,
  } = useCanvasInteraction(
    interactionModel,
    containerRef,
    setHoveredLink,
    structuredMovePreviewRef,
    requestCanvasRenderRef,
    runtime,
    effectiveCapabilities,
    canvasView?.viewId ?? 'single'
  );

  const activateCanvas = useCallback(() => {
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
    };
    const readStats = () => runtime.renderExperience.getStats();
    diagnostics.__chardeskCanvasExperienceStats = readStats;
    return () => {
      if (diagnostics.__chardeskCanvasExperienceStats === readStats) {
        delete diagnostics.__chardeskCanvasExperienceStats;
      }
    };
  }, [active, runtime]);

  useCanvasRenderer(
    canvasLayers,
    size,
    surfaceGeometry,
    rendererModel,
    draggingSelection,
    structuredMovePreviewRef,
    hoveredLink,
    visualTheme,
    requestCanvasRenderRef,
    runtime
  );

  const activeContextMenu =
    canvasMode === 'structured' ? STRUCTURED_CONTEXT_MENU : CANVAS_CONTEXT_MENU;
  const availableContextMenu = useMemo(
    () => filterCanvasContextMenuEntries(activeContextMenu, effectiveCapabilities),
    [activeContextMenu, effectiveCapabilities],
  );
  const handleContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    if (availableContextMenu.length === 0) {
      event.preventDefault();
      return;
    }
    if (canvasMode !== 'structured') return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const point = GridManager.screenToGrid(
      event.clientX - rect.left,
      event.clientY - rect.top,
      offset.x,
      offset.y,
      zoom
    );
    setStructuredContextPoint(point);

    const hit = structuredSceneQuery.findHit(point);
    if (!hit) {
      setSelectedStructuredSplitHandle(null);
      setStructuredGridFocus(point);
      return;
    }

    if (hit.kind === 'splitBox' && hit.handle && isStructuredSplitBoxLineHandle(hit.handle)) {
      setSelectedStructuredNodeIds([hit.node.id]);
      setSelectedStructuredSplitHandle({ nodeId: hit.node.id, handle: hit.handle });
      return;
    }

    setSelectedStructuredSplitHandle(null);
    if (hit.kind === 'splitBox') {
      setSelectedStructuredNodeIds([hit.node.id]);
      return;
    }
    if (!selectedStructuredNodeIds.includes(hit.node.id)) {
      setSelectedStructuredNodeIds([hit.node.id]);
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
          containerSize={size}
          viewportFrame={viewportFrame}
          onContextMenu={handleContextMenu}
          onFocusCapture={activateCanvas}
          onPointerDownCapture={activateCanvas}
          onWheelCapture={activateCanvas}
          data-canvas-view-active={active ? 'true' : 'false'}
          style={{ cursor: cursor || undefined }}
          interactionUi={active}
          {...structuredTemplateDrop.surfaceProps}
          onDoubleClick={handleDoubleClick}
          onPointerDown={onCanvasPointerDown}
          textareaRef={textareaRef}
          textareaStyle={textareaStyle}
          textareaProps={textareaProps}
        >
          <StructuredTemplatePreviewOverlay preview={structuredTemplateDrop.preview} zoom={zoom} />
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
