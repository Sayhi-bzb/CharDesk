import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCanvasFont } from '@/shared/fonts/hooks';
import {
  BACKGROUND_COLOR,
  GRID_COLOR,
} from '@/shared/lib/constants';
import type { HostVisualTheme } from '@/shared/hooks/useHostVisualTheme';
import { isStaticGridMode } from '@/domains/sessions/public';
import type { CanvasRenderModel } from './canvasModels';
import { GridManager } from '@/shared/utils/grid';
import type { SelectionArea, GridMap, Point, NodeBounds } from '@/shared/types';
import {
  createGridSurfaceReader,
  isIncrementalCanvasSurfaceReader,
  type StaticGridRangeMovePlan,
  type CanvasSurfaceReader,
} from '@/domains/canvas/public';
import type { StructuredSplitBoxNode } from '@/domains/structured-content/public';
import type { CanvasLinkHit } from './interaction/core/linkHitTesting';
import {
  DEFAULT_GRID_RENDER_METRICS,
  drawGridLines,
  drawTextCell,
  getCellOccupancy,
  gridCellRect,
  prepareCanvasSurface,
  setTextRenderStyle,
} from '@/shared/metrics';
import {
  getStaticGridViewState,
} from '@/domains/selection/public';
import {
  getStructuredBoxBounds,
  getStructuredSplitBoxGuides,
} from '@/domains/structured-content/public';
import { getStructuredNodeBounds } from '@/domains/structured-content/public';
import { getStructuredTextSelectionRange } from '@/domains/structured-content/public';
import { createTextLayout, getTextLayoutSelectionRects } from '@/domains/structured-content/public';
import {
  getStructuredLineHandlePoints,
  getStructuredRectHandlePoints,
  getStructuredSplitBoxHandlePoints,
} from '@/domains/structured-content/public';

import type { StructuredMovePreview } from './interaction/structured/structuredInteractionPreview';
import {
  drawGridLayer,
  drawHoveredLinkDecoration,
} from '../rendering/drawGridLayer';
import type { CanvasEngineRuntime } from '../engine/CanvasEngineRuntime';
import {
  CANVAS_FRAME_INVALIDATION,
  type CanvasFrameInvalidation,
} from '../engine/FrameScheduler';
import { CanvasRenderManager } from '../engine/CanvasRenderManager';
import { shouldDrawCanvasGrid } from '../rendering/canvasGridVisibility';
import { drawCanvasCellIndicator } from '../rendering/canvasCellIndicator';
import {
  resolveCanvasCellPresentation,
  resolveCanvasRangePresentation,
} from '../presentation/canvasCellPresentation';
import type { CanvasCursorPreference } from '@/shared/canvas-cursor/runtime';
import { DEFAULT_CHARDESK_CELL_CURSOR_BLINK_INTERVAL_MS } from '@chardesk/rendering';
import {
  drawCharDeskCanvasRange,
  loadCharDeskCanvasFonts,
} from '@chardesk/rendering/canvas';
import {
  resolveCanvasContentDpr,
  resolveCanvasContentResolutionMode,
  type CanvasContentResolutionMode,
} from '../rendering/canvasContentResolution';
import type { CanvasSurfaceGeometry } from '../canvasSurfaceGeometry';
export type { StructuredMovePreview } from './interaction/structured/structuredInteractionPreview';

interface LayerRefs {
  content: React.RefObject<HTMLCanvasElement | null>;
  interaction: React.RefObject<HTMLCanvasElement | null>;
}

export type CanvasInteractionPalette = HostVisualTheme['canvas'];

type CanvasCellPresentationContext = Readonly<{
  viewActive: boolean;
  inputFocused: boolean;
  cursorPreference: CanvasCursorPreference;
}>;

export const resolveCanvasRenderPasses = (invalidation: CanvasFrameInvalidation) => ({
  content: CanvasRenderManager.includes(invalidation, 'background'),
  interaction:
    CanvasRenderManager.includes(invalidation, 'scratch') ||
    CanvasRenderManager.includes(invalidation, 'overlay'),
});

export const shouldSuppressCanvasContentRendering = (search: string) => {
  const params = new URLSearchParams(search);
  return params.has('canvas-stress') && params.get('canvas-stress-render') === 'off';
};

export const getStructuredSplitBoxActiveLeafBounds = (
  node: StructuredSplitBoxNode,
  point: Point | null
): NodeBounds | null => {
  if (!point) return null;
  const leaf = getStructuredSplitBoxGuides(node).leafBounds.find(
    ({ bounds }) =>
      point.x >= bounds.x &&
      point.x < bounds.x + bounds.width &&
      point.y >= bounds.y &&
      point.y < bounds.y + bounds.height
  );
  return leaf?.bounds ?? null;
};

export const drawCanvasColorPickerAnchor = (
  ctx: CanvasRenderingContext2D,
  point: Point,
  viewport: { offset: Point; zoom: number },
  palette: CanvasInteractionPalette
) => {
  const pos = gridCellRect(point, viewport);
  const x = Math.round(pos.x);
  const y = Math.round(pos.y);
  const width = Math.round(pos.width);
  const height = Math.round(pos.height);
  const corner = Math.max(4, Math.round(Math.min(width, height) * 0.32));
  const lineWidth = Math.max(1, Math.round(1.5 * viewport.zoom));

  ctx.save();
  ctx.lineWidth = lineWidth + 2;
  ctx.strokeStyle = palette.pickerOuter;
  ctx.strokeRect(x, y, width, height);

  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = palette.pickerInner;
  ctx.strokeRect(x, y, width, height);

  ctx.strokeStyle = palette.pickerAccent;
  ctx.lineWidth = Math.max(2, lineWidth);
  ctx.beginPath();
  ctx.moveTo(x, y + corner);
  ctx.lineTo(x, y);
  ctx.lineTo(x + corner, y);
  ctx.moveTo(x + width - corner, y);
  ctx.lineTo(x + width, y);
  ctx.lineTo(x + width, y + corner);
  ctx.moveTo(x + width, y + height - corner);
  ctx.lineTo(x + width, y + height);
  ctx.lineTo(x + width - corner, y + height);
  ctx.moveTo(x + corner, y + height);
  ctx.lineTo(x, y + height);
  ctx.lineTo(x, y + height - corner);
  ctx.stroke();
  ctx.restore();
};

export const useCanvasRenderer = (
  layers: LayerRefs,
  size: { width: number; height: number } | undefined,
  surfaceGeometry: CanvasSurfaceGeometry | undefined,
  store: CanvasRenderModel,
  draggingSelection: SelectionArea | null,
  staticRangeMovePreview: StaticGridRangeMovePlan | null,
  structuredMovePreviewRef: React.RefObject<StructuredMovePreview | null>,
  hoveredLink: CanvasLinkHit | null,
  visualTheme: HostVisualTheme | null,
  cellContext: CanvasCellPresentationContext,
  requestRenderRef?: React.MutableRefObject<(() => void) | null>,
  runtime?: CanvasEngineRuntime
) => {
  const { profile: fontProfile } = useCanvasFont();
  const {
    activeCanvasId,
    offset,
    zoom,
    contentReader,
    contentRevision,
    scratchLayer,
    textCursor,
    staticGridSelection,
    staticGridEditMode,
    showGrid,
    hoveredGrid,
    tool,
    canvasMode,
    slideDeck,
    selectedStructuredNodeIds,
    structuredContextPoint,
    structuredGridFocus,
    structuredScene,
    editingStructuredTextNodeId,
    structuredTextSelection,
    canvasColorPickerTarget,
  } = store;

  const staticGridView = useMemo(
    () =>
      getStaticGridViewState({
        selection: staticGridSelection,
        editMode: staticGridEditMode,
        textCursor,
        grid: contentReader,
      }),
    [contentReader, staticGridEditMode, staticGridSelection, textCursor]
  );
  const renderedTextCursor = isStaticGridMode(canvasMode) ? null : textCursor;
  const rangePresentation = useMemo(
    () => resolveCanvasRangePresentation({
      canvasMode,
      source: contentReader,
      staticGrid: staticGridView,
      draggingSelection,
      movePreview: staticRangeMovePreview,
    }),
    [
      canvasMode,
      contentReader,
      draggingSelection,
      staticGridView,
      staticRangeMovePreview,
    ]
  );
  const cellPresentation = useMemo(
    () => resolveCanvasCellPresentation({
      viewActive: cellContext.viewActive,
      inputFocused: cellContext.inputFocused,
      canvasMode,
      range: rangePresentation,
      staticGrid: staticGridView.interaction,
      structured: {
        gridFocus: structuredGridFocus,
        editingText: !!editingStructuredTextNodeId,
        hasNodeSelection: selectedStructuredNodeIds.length > 0,
      },
      cursorPreference: cellContext.cursorPreference,
    }),
    [
      cellContext.inputFocused,
      cellContext.cursorPreference,
      cellContext.viewActive,
      canvasMode,
      editingStructuredTextNodeId,
      rangePresentation,
      selectedStructuredNodeIds.length,
      staticGridView.interaction,
      structuredGridFocus,
    ]
  );
  const cursorVisibleRef = useRef(true);
  const [renderManager] = useState(() => new CanvasRenderManager());
  const contentResolutionModeRef = useRef<CanvasContentResolutionMode>('full');
  const fallbackViewportRef = useRef({ offset, zoom });
  useEffect(() => {
    fallbackViewportRef.current = { offset, zoom };
  }, [offset, zoom]);
  const manualRenderRafRef = useRef<number | null>(null);
  const manualInvalidationRef = useRef<CanvasFrameInvalidation>(0);
  const observedContentRef = useRef<{
    reader: CanvasSurfaceReader;
    revision: number | null;
  } | null>(null);
  const requestedFontSamplesRef = useRef(new Set<string>());

  useEffect(() => {
    requestedFontSamplesRef.current.clear();
  }, [fontProfile]);

  useEffect(() => {
    if (!surfaceGeometry || surfaceGeometry.width <= 0 || surfaceGeometry.height <= 0) return;
    const viewBounds = GridManager.getViewportGridBounds(
      surfaceGeometry.width,
      surfaceGeometry.height,
      offset.x,
      offset.y,
      zoom
    );
    const samples: Array<{ grapheme: string; bold: boolean; italic: boolean }> = [];
    for (const span of contentReader.query({
      x: viewBounds.startX,
      y: viewBounds.startY,
      width: viewBounds.endX - viewBounds.startX + 1,
      height: viewBounds.endY - viewBounds.startY + 1,
    })) {
      for (const cell of span.cells) {
        if (!cell.char.trim()) continue;
        const bold = !!cell.attrs?.bold;
        const italic = !!cell.attrs?.italic;
        const key = `${bold ? 1 : 0}:${italic ? 1 : 0}:${cell.char}`;
        if (requestedFontSamplesRef.current.has(key)) continue;
        requestedFontSamplesRef.current.add(key);
        samples.push({ grapheme: cell.char, bold, italic });
      }
    }
    if (!samples.length) return;
    void loadCharDeskCanvasFonts(samples, {
      metrics: DEFAULT_GRID_RENDER_METRICS,
      fontProfile,
    }).then(() => requestRenderRef?.current?.());
  }, [contentReader, contentRevision, fontProfile, offset, requestRenderRef, surfaceGeometry, zoom]);

  const drawLayer = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      targetGrid: GridMap | null,
      viewBounds: ReturnType<typeof GridManager.getViewportGridBounds>,
      layerZoom: number,
      layerOffset: Point,
      alpha = 1,
      content: "all" | "background" | "text" = "all"
    ) =>
      drawGridLayer(
        ctx,
        targetGrid ? createGridSurfaceReader(targetGrid) : null,
        viewBounds,
        layerZoom,
        layerOffset,
        {
          alpha,
          content,
          fontProfile,
        }
      ),
    [fontProfile]
  );
  useEffect(() => {
    if (!visualTheme) return;
    let disposed = false;
    let cursorTimer: number | null = null;
    cursorVisibleRef.current = true;
    const palette = visualTheme.canvas;
    const render = (invalidation: CanvasFrameInvalidation) => {
      if (!size || !surfaceGeometry || size.width === 0 || size.height === 0) return;
      const { offset, zoom } = runtime?.camera.getViewport() ?? fallbackViewportRef.current;
      const frameStartedAt = performance.now();
      const structuredMovePreview = structuredMovePreviewRef.current;
      const renderedContentSource = structuredMovePreview
        ? createGridSurfaceReader(structuredMovePreview.baseGrid)
        : contentReader;
      const structuredPreviewMovingGrid = structuredMovePreview?.movingGrid ?? null;
      const renderedStructuredScene = structuredMovePreview
        ? [...structuredMovePreview.baseScene, ...structuredMovePreview.movingNodes]
        : structuredScene;

      const dpr = window.devicePixelRatio || 1;
      contentResolutionModeRef.current = resolveCanvasContentResolutionMode(
        zoom,
        contentResolutionModeRef.current
      );
      const contentDpr = resolveCanvasContentDpr(
        dpr,
        contentResolutionModeRef.current
      );
      const renderOffset = offset;
      const viewBounds = GridManager.getViewportGridBounds(
        surfaceGeometry.width,
        surfaceGeometry.height,
        renderOffset.x,
        renderOffset.y,
        zoom
      );
      const activeSlide = slideDeck?.slides.find(
        (slide) => slide.id === slideDeck.activeSlideId
      );
      const slidePageRect =
        canvasMode === "slide" && activeSlide
          ? (() => {
              const origin = gridCellRect(
                { x: 0, y: 0 },
                { offset: renderOffset, zoom }
              );
              return {
                x: origin.x,
                y: origin.y,
                width: origin.width * activeSlide.size.columns,
                height: origin.height * activeSlide.size.rows,
              };
            })()
          : null;
      const clipToSlidePage = (ctx: CanvasRenderingContext2D) => {
        if (!slidePageRect) return false;
        ctx.save();
        ctx.beginPath();
        ctx.rect(slidePageRect.x, slidePageRect.y, slidePageRect.width, slidePageRect.height);
        ctx.clip();
        return true;
      };
      const renderPasses = resolveCanvasRenderPasses(invalidation);
      const renderBackground = renderPasses.content;
      const suppressContentRendering = shouldSuppressCanvasContentRendering(
        window.location.search
      );
      const renderInteraction = renderPasses.interaction;
      const renderScratch = renderInteraction;
      const renderOverlay = renderInteraction;
      let renderedInvalidation = 0;
      let directGlyphs = 0;

      const bgCanvas = layers.content.current;
      const bgCtx = bgCanvas?.getContext('2d', { alpha: false });
      if (renderBackground && bgCanvas && bgCtx && !suppressContentRendering) {
        const drawVisibleGrid = showGrid && shouldDrawCanvasGrid(zoom);
        prepareCanvasSurface(
          bgCanvas,
          bgCtx,
          surfaceGeometry.width,
          surfaceGeometry.height,
          contentDpr
        );
          bgCtx.fillStyle = slidePageRect ? palette.workspaceSurface : BACKGROUND_COLOR;
          bgCtx.fillRect(0, 0, surfaceGeometry.width, surfaceGeometry.height);
          if (slidePageRect) {
            bgCtx.save();
            bgCtx.shadowColor = palette.pageShadow;
            bgCtx.shadowBlur = 18;
            bgCtx.shadowOffsetY = 4;
            bgCtx.fillStyle = BACKGROUND_COLOR;
            bgCtx.fillRect(
              slidePageRect.x,
              slidePageRect.y,
              slidePageRect.width,
              slidePageRect.height
            );
            bgCtx.restore();
            clipToSlidePage(bgCtx);
          }

          if (drawVisibleGrid) {
            drawGridLines(bgCtx, {
              startX: viewBounds.startX,
              endX: viewBounds.endX,
              startY: viewBounds.startY,
              endY: viewBounds.endY,
              offsetX: renderOffset.x,
              offsetY: renderOffset.y,
              width: surfaceGeometry.width,
              height: surfaceGeometry.height,
              zoom,
              color: GRID_COLOR,
            });
          }
          if (structuredMovePreview) {
            drawLayer(
              bgCtx,
              structuredMovePreview.baseGrid,
              viewBounds,
              zoom,
              renderOffset,
              1,
              "background"
            );
          } else {
            const rangeMoveProjection = staticRangeMovePreview
              ? {
                  hiddenSpans: staticRangeMovePreview.hiddenSpans,
                  overlay: staticRangeMovePreview.previewSource,
                }
              : undefined;
            directGlyphs = drawGridLayer(
              bgCtx,
              contentReader,
              viewBounds,
              zoom,
              renderOffset,
              { fontProfile, projection: rangeMoveProjection }
            ).glyphs;
          }
          if (structuredMovePreview) {
            directGlyphs = drawLayer(
              bgCtx,
              structuredMovePreview.baseGrid,
              viewBounds,
              zoom,
              renderOffset,
              1,
              "text"
            ).glyphs;
          }
          if (slidePageRect) bgCtx.restore();
        renderedInvalidation |= CANVAS_FRAME_INVALIDATION.background;
      }
      if (renderBackground && suppressContentRendering) {
        renderedInvalidation |= CANVAS_FRAME_INVALIDATION.background;
      }

      const scratchCanvas = layers.interaction.current;
      const scratchCtx = scratchCanvas?.getContext('2d');
      if (renderScratch && scratchCanvas && scratchCtx) {
        prepareCanvasSurface(
          scratchCanvas,
          scratchCtx,
          surfaceGeometry.width,
          surfaceGeometry.height,
          Math.min(2, dpr)
        );
        clipToSlidePage(scratchCtx);
        drawLayer(
          scratchCtx,
          scratchLayer,
          viewBounds,
          zoom,
          renderOffset
        );
        if (slidePageRect) scratchCtx.restore();
        renderedInvalidation |= CANVAS_FRAME_INVALIDATION.scratch;
      }

      const uiCanvas = scratchCanvas;
      const uiCtx = scratchCtx;
      if (renderOverlay && uiCanvas && uiCtx) {
        clipToSlidePage(uiCtx);

        if (
          hoveredLink &&
          hoveredLink.y >= viewBounds.startY &&
          hoveredLink.y <= viewBounds.endY &&
          hoveredLink.endX >= viewBounds.startX &&
          hoveredLink.startX <= viewBounds.endX
        ) {
          drawHoveredLinkDecoration(
            uiCtx,
            contentReader,
            hoveredLink,
            zoom,
            renderOffset
          );
        }

        if (canvasMode === 'structured' && structuredPreviewMovingGrid) {
          drawLayer(uiCtx, structuredPreviewMovingGrid, viewBounds, zoom, renderOffset);
        }

        const cellVisual = cellPresentation.visual;
        if (cellVisual?.kind === 'range') {
          drawCharDeskCanvasRange(uiCtx, {
            geometry: cellVisual.geometry,
            phase: cellVisual.phase,
            style: {
              surface: palette.selectionSurface,
              border: palette.selectionBorder,
            },
            options: {
              metrics: DEFAULT_GRID_RENDER_METRICS,
              offset: renderOffset,
              zoom,
            },
          });
        } else if (
          cellVisual &&
          (cellVisual.kind === 'navigation-focus' || cursorVisibleRef.current)
        ) {
          drawCanvasCellIndicator(uiCtx, cellVisual, {
            source: renderedContentSource,
            offset: renderOffset,
            zoom,
            palette,
            fontProfile,
          });
        }

        if (canvasMode === 'structured') {
          const selectionRange = getStructuredTextSelectionRange(structuredTextSelection);
          const selectedTextNode =
            selectionRange && structuredTextSelection
              ? renderedStructuredScene.find(
                  (node) => node.id === structuredTextSelection.nodeId && node.type === 'text'
                )
              : null;
          if (selectedTextNode?.type === 'text') {
            getTextLayoutSelectionRects(
              createTextLayout(selectedTextNode.text, selectedTextNode.position),
              selectionRange!.start,
              selectionRange!.end
            ).forEach((rect) => {
              const pos = gridCellRect(rect.point, { offset: renderOffset, zoom });
              uiCtx.fillStyle = palette.selectionSurface;
              uiCtx.fillRect(
                Math.round(pos.x),
                Math.round(pos.y),
                Math.round(pos.width * rect.width),
                Math.round(pos.height)
              );
            });
          }
        }

        if (canvasMode === 'structured' && selectedStructuredNodeIds.length > 0) {
          const selectedIds = new Set(selectedStructuredNodeIds);
          const selectedNodes = renderedStructuredScene.filter(
            (node) =>
              selectedIds.has(node.id) &&
              !(
                editingStructuredTextNodeId &&
                node.id === editingStructuredTextNodeId &&
                node.type === 'text'
              )
          );
          const drawStructuredBounds = (bounds: NodeBounds) => {
            const pos = gridCellRect(
              { x: bounds.x, y: bounds.y },
              { offset: renderOffset, zoom }
            );
            const width = bounds.width * pos.width;
            const height = bounds.height * pos.height;
            uiCtx.strokeRect(
              Math.round(pos.x),
              Math.round(pos.y),
              Math.round(width),
              Math.round(height)
            );
            return { pos, width, height };
          };
          const drawActiveSplitBoxLeaf = (node: StructuredSplitBoxNode, point: Point | null) => {
            const activeLeafBounds = getStructuredSplitBoxActiveLeafBounds(node, point);
            if (!activeLeafBounds) return;

            const pos = gridCellRect(
              { x: activeLeafBounds.x, y: activeLeafBounds.y },
              { offset: renderOffset, zoom }
            );
            const width = activeLeafBounds.width * pos.width;
            const height = activeLeafBounds.height * pos.height;
            uiCtx.save();
            uiCtx.fillStyle = palette.selectionSurface;
            uiCtx.strokeStyle = palette.selectionBorder;
            uiCtx.lineWidth = Math.max(2, Math.round(3 * zoom));
            uiCtx.fillRect(
              Math.round(pos.x),
              Math.round(pos.y),
              Math.round(width),
              Math.round(height)
            );
            uiCtx.strokeRect(
              Math.round(pos.x),
              Math.round(pos.y),
              Math.round(width),
              Math.round(height)
            );
            uiCtx.restore();
          };

          uiCtx.save();
          uiCtx.strokeStyle = palette.selectionBorder;
          uiCtx.lineWidth = Math.max(1, Math.round(2 * zoom));
          selectedNodes.forEach((node) => drawStructuredBounds(getStructuredNodeBounds(node)));

          const drawHandle = (x: number, y: number) => {
            const handleSize = Math.max(6, Math.round(7 * zoom));
            uiCtx.fillRect(
              Math.round(x - handleSize / 2),
              Math.round(y - handleSize / 2),
              handleSize,
              handleSize
            );
            uiCtx.strokeRect(
              Math.round(x - handleSize / 2),
              Math.round(y - handleSize / 2),
              handleSize,
              handleSize
            );
          };

          const selectedHandleNode =
            selectedStructuredNodeIds.length === 1
              ? renderedStructuredScene.find((node) => node.id === selectedStructuredNodeIds[0])
              : null;
          if (
            selectedHandleNode?.type === 'box' ||
            selectedHandleNode?.type === 'splitBox' ||
            selectedHandleNode?.type === 'bg'
          ) {
            const bounds =
              selectedHandleNode.type === 'box'
                ? getStructuredBoxBounds(selectedHandleNode)
                : getStructuredNodeBounds(selectedHandleNode);
            const { pos, width, height } = drawStructuredBounds(bounds);
            uiCtx.fillStyle = palette.pickerOuter;
            uiCtx.strokeStyle = palette.selectionBorder;
            uiCtx.lineWidth = 1;
            if (selectedHandleNode.type === 'splitBox') {
              drawActiveSplitBoxLeaf(selectedHandleNode, hoveredGrid ?? structuredContextPoint);
              getStructuredSplitBoxHandlePoints(selectedHandleNode).forEach(({ point }) => {
                const handlePos = gridCellRect(point, { offset: renderOffset, zoom });
                drawHandle(handlePos.x + handlePos.width / 2, handlePos.y + handlePos.height / 2);
              });
            } else {
              getStructuredRectHandlePoints(bounds).forEach(({ xRatio, yRatio }) => {
                const px = pos.x + width * xRatio;
                const py = pos.y + height * yRatio;
                drawHandle(px, py);
              });
            }
          } else if (selectedHandleNode?.type === 'line') {
            uiCtx.fillStyle = palette.pickerOuter;
            uiCtx.strokeStyle = palette.selectionBorder;
            uiCtx.lineWidth = 1;
            getStructuredLineHandlePoints().forEach(({ point }) => {
              const endpoint = selectedHandleNode[point];
              const pos = gridCellRect(endpoint, { offset: renderOffset, zoom });
              drawHandle(pos.x + pos.width / 2, pos.y + pos.height / 2);
            });
          }
          uiCtx.restore();
        }

        if (tool === 'eraser' && hoveredGrid) {
          const pos = gridCellRect(hoveredGrid, { offset: renderOffset, zoom });
          uiCtx.fillStyle = palette.eraserSurface;
          uiCtx.fillRect(
            Math.round(pos.x),
            Math.round(pos.y),
            Math.round(pos.width),
            Math.round(pos.height)
          );
        }

        if (renderedTextCursor) {
          const pos = gridCellRect(renderedTextCursor, { offset: renderOffset, zoom });
          if (canvasMode === 'structured' && editingStructuredTextNodeId) {
            uiCtx.fillStyle = palette.textCursorSurface;
            uiCtx.fillRect(
              Math.round(pos.x),
              Math.round(pos.y),
              Math.max(1, Math.round(2 * zoom)),
              Math.round(pos.height)
            );
          } else {
            const cell = renderedContentSource.get(renderedTextCursor);
            const occupancy = cell ? getCellOccupancy(cell.char) : 1;
            uiCtx.fillStyle = palette.textCursorSurface;
            uiCtx.fillRect(
              Math.round(pos.x),
              Math.round(pos.y),
              Math.round(pos.width * occupancy),
              Math.round(pos.height)
            );
            if (cell) {
              setTextRenderStyle(uiCtx, zoom, DEFAULT_GRID_RENDER_METRICS);
              drawTextCell(uiCtx, cell, pos.x, pos.y, {
                fontProfile,
                color: palette.textCursorForeground,
                zoom,
              });
            }
          }
        }

        if (canvasColorPickerTarget && hoveredGrid) {
          drawCanvasColorPickerAnchor(uiCtx, hoveredGrid, {
            offset: renderOffset,
            zoom,
          }, palette);
        }
        if (slidePageRect) uiCtx.restore();
        renderedInvalidation |= CANVAS_FRAME_INVALIDATION.overlay;
      }
      renderManager.commit(renderedInvalidation);
      if (CanvasRenderManager.includes(renderedInvalidation, 'background')) {
        runtime?.renderExperience.recordDirectFrame(
          directGlyphs,
          performance.now() - frameStartedAt
        );
      }
    };

    const scheduleRender = (
      invalidation: CanvasFrameInvalidation,
      priority?: 'interaction'
    ) => {
      if (invalidation === 0) return;
      if (runtime) {
        runtime.frameScheduler.request(
          "canvas-renderer",
          invalidation,
          (_timestamp, pendingInvalidation) => render(pendingInvalidation),
          priority
            ? { priority, phase: "render" }
            : { phase: "render" }
        );
        return;
      }
      manualInvalidationRef.current |= invalidation;
      if (manualRenderRafRef.current !== null) return;
      manualRenderRafRef.current = requestAnimationFrame(() => {
        manualRenderRafRef.current = null;
        const pendingInvalidation = manualInvalidationRef.current;
        manualInvalidationRef.current = 0;
        render(pendingInvalidation);
      });
    };
    const clearCursorTimer = () => {
      if (cursorTimer === null) return;
      window.clearTimeout(cursorTimer);
      cursorTimer = null;
    };
    const scheduleCursorBlink = () => {
      clearCursorTimer();
      if (
        cellPresentation.visual?.kind !== 'terminal-cursor' ||
        !cellPresentation.visual.blink ||
        visualTheme.motion.reduced ||
        document.visibilityState === 'hidden'
      ) return;
      cursorTimer = window.setTimeout(() => {
        cursorTimer = null;
        if (disposed) return;
        cursorVisibleRef.current = !cursorVisibleRef.current;
        scheduleRender(CANVAS_FRAME_INVALIDATION.overlay, 'interaction');
        scheduleCursorBlink();
      }, DEFAULT_CHARDESK_CELL_CURSOR_BLINK_INTERVAL_MS);
    };
    const handleVisibilityChange = () => {
      clearCursorTimer();
      if (document.visibilityState === 'hidden') return;
      cursorVisibleRef.current = true;
      scheduleRender(CANVAS_FRAME_INVALIDATION.overlay, 'interaction');
      scheduleCursorBlink();
    };
    const structuredMovePreview = structuredMovePreviewRef.current;
    const sharedViewportInputs = [
      fontProfile,
      size?.width,
      size?.height,
      activeCanvasId,
      offset,
      zoom,
      canvasMode,
      slideDeck,
    ];
    const readerRevision = isIncrementalCanvasSurfaceReader(contentReader)
      ? contentReader.getRevision()
      : null;
    const observedContent = observedContentRef.current;
    if (
      runtime &&
      observedContent?.reader === contentReader &&
      observedContent.revision !== null &&
      readerRevision !== null &&
      observedContent.revision !== readerRevision
    ) {
      runtime.renderActivity.markContentActivity();
    }
    observedContentRef.current = { reader: contentReader, revision: readerRevision };
    const invalidation = renderManager.update({
      background: [
        layers.content.current,
        ...sharedViewportInputs,
        contentReader,
        contentRevision,
        readerRevision,
        showGrid,
        staticRangeMovePreview,
        structuredMovePreview?.baseGrid ?? null,
      ],
      scratch: [
        layers.interaction.current,
        ...sharedViewportInputs,
        scratchLayer,
      ],
      overlay: [
        layers.interaction.current,
        ...sharedViewportInputs,
        contentReader,
        textCursor,
        staticGridSelection,
        staticGridEditMode,
        cellPresentation,
        draggingSelection,
        hoveredLink,
        hoveredGrid,
        tool,
        structuredScene,
        selectedStructuredNodeIds,
        structuredContextPoint,
        structuredGridFocus,
        editingStructuredTextNodeId,
        structuredTextSelection,
        canvasColorPickerTarget,
        staticRangeMovePreview,
        structuredMovePreview?.movingGrid ?? null,
      ],
    });
    const hasViewportInteractionContent = () => {
      const movePreview = structuredMovePreviewRef.current;
      return !!(
        scratchLayer?.size ||
        movePreview?.movingGrid.size ||
        hoveredLink ||
        draggingSelection ||
        cellPresentation.visual ||
        (canvasMode === 'structured' && (
          structuredGridFocus ||
          structuredTextSelection ||
          selectedStructuredNodeIds.length > 0
        )) ||
        (tool === 'eraser' && hoveredGrid) ||
        renderedTextCursor ||
        (canvasColorPickerTarget && hoveredGrid)
      );
    };
    const requestManualRender = () => {
      const interactionInvalidation = hasViewportInteractionContent()
        ? CANVAS_FRAME_INVALIDATION.scratch | CANVAS_FRAME_INVALIDATION.overlay
        : 0;
      scheduleRender(
        CANVAS_FRAME_INVALIDATION.background | interactionInvalidation,
        'interaction'
      );
    };
    if (requestRenderRef) {
      requestRenderRef.current = requestManualRender;
    }
    const fonts = document.fonts;
    const handleFontLoad = () => {
      scheduleRender(renderManager.reset());
    };
    fonts?.addEventListener('loadingdone', handleFontLoad);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const unsubscribeActivity = runtime?.renderActivity.subscribe((mode, previous) => {
      if (mode === "settled" && !disposed) {
        runtime.renderExperience.markSettling(previous);
        scheduleRender(CANVAS_FRAME_INVALIDATION.background);
      }
    });

    scheduleRender(invalidation);
    scheduleCursorBlink();
    return () => {
      disposed = true;
      clearCursorTimer();
      runtime?.frameScheduler.cancel("canvas-renderer");
      if (manualRenderRafRef.current !== null) {
        cancelAnimationFrame(manualRenderRafRef.current);
        manualRenderRafRef.current = null;
      }
      manualInvalidationRef.current = 0;
      if (requestRenderRef?.current === requestManualRender) {
        requestRenderRef.current = null;
      }
      fonts?.removeEventListener('loadingdone', handleFontLoad);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      unsubscribeActivity?.();
    };
  }, [
    activeCanvasId,
    offset,
    zoom,
    size,
    surfaceGeometry,
    contentReader,
    contentRevision,
    scratchLayer,
    textCursor,
    staticGridSelection,
    staticGridEditMode,
    draggingSelection,
    staticRangeMovePreview,
    showGrid,
    hoveredGrid,
    tool,
    canvasMode,
    slideDeck,
    structuredScene,
    selectedStructuredNodeIds,
    structuredContextPoint,
    structuredGridFocus,
    editingStructuredTextNodeId,
    structuredTextSelection,
    canvasColorPickerTarget,
    layers,
    hoveredLink,
    structuredMovePreviewRef,
    requestRenderRef,
    drawLayer,
    renderedTextCursor,
    cellPresentation,
    renderManager,
    runtime,
    visualTheme,
    fontProfile,
  ]);
};
