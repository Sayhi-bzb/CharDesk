/** Browser-only geometry contract for Cell scene, canvas, DOM and hosted layers. */
import type { CharDeskCellMetrics } from "@chardesk/rendering";
import type { CellInspectionSnapshot, CellInteractionTraceEvent } from "./debug.js";
import type { CellPoint, CellRect, CellSize, FrameSnapshot, WidgetId } from "./types.js";

export type CellSurfaceGeometryInput = Readonly<{
  surface: Element;
  viewport: CellSize;
  overlayViewport: CellSize;
  metrics: CharDeskCellMetrics;
  guardCells: number;
}>;

export type CellSurfaceGeometryTransform = Readonly<{
  contentOriginPx: Readonly<{ left: number; top: number }>;
  sceneToClientRect: (rect: CellRect) => DOMRect;
  sceneToSurfaceRect: (rect: CellRect) => DOMRect;
  sceneToCanvasRect: (rect: CellRect) => DOMRect;
  sceneToBaseCanvasRect: (rect: CellRect, originRow?: number) => DOMRect;
  overlayPlaneToCanvasRect: (rect: CellRect) => DOMRect;
  overlayPlaneClipPath: (rect: CellRect) => string;
  clientToScenePoint: (point: Readonly<{ clientX: number; clientY: number }>) => CellPoint;
  clientToScenePosition: (point: Readonly<{ clientX: number; clientY: number }>) => Readonly<{ x: number; y: number }>;
}>;

export type CellSurfaceGeometrySnapshot = Readonly<{
  elementRectPx: DOMRectReadOnly;
  canvasRectPx: DOMRectReadOnly | null;
  overlayCanvasRectPx: DOMRectReadOnly | null;
  viewport: CellSize;
  overlayViewport: CellSize;
  metrics: CharDeskCellMetrics;
  guardCells: number;
  contentOriginPx: Readonly<{ left: number; top: number }>;
  contentRectCells: CellRect;
}>;

export type CellSurfaceGeometry = Readonly<{
  contentRect: () => DOMRect | null;
  targetRect: (id: string) => DOMRect | null;
  transform: () => CellSurfaceGeometryTransform | null;
  inspect?: (point: CellPoint) => CellInspectionSnapshot | null;
  inspectWidget?: (id: WidgetId) => CellInspectionSnapshot | null;
  frame?: () => FrameSnapshot | null;
  trace?: () => readonly CellInteractionTraceEvent[];
  snapshot?: () => CellSurfaceGeometrySnapshot | null;
}>;

export const createCellSurfaceGeometryTransform = ({
  surface,
  overlayViewport,
  metrics,
  guardCells,
}: CellSurfaceGeometryInput): CellSurfaceGeometryTransform => {
  const elementRect = surface.getBoundingClientRect();
  const contentOriginPx = {
    left: elementRect.left + guardCells * metrics.cellWidth,
    top: elementRect.top + guardCells * metrics.cellHeight,
  };
  const sceneToClientRect = (rect: CellRect): DOMRect => new DOMRect(
    contentOriginPx.left + rect.x * metrics.cellWidth,
    contentOriginPx.top + rect.y * metrics.cellHeight,
    rect.width * metrics.cellWidth,
    rect.height * metrics.cellHeight,
  );
  const sceneToSurfaceRect = (rect: CellRect): DOMRect => new DOMRect(
    (guardCells + rect.x) * metrics.cellWidth,
    (guardCells + rect.y) * metrics.cellHeight,
    rect.width * metrics.cellWidth,
    rect.height * metrics.cellHeight,
  );
  const sceneToCanvasRect = (rect: CellRect): DOMRect => new DOMRect(
    rect.x * metrics.cellWidth,
    rect.y * metrics.cellHeight,
    rect.width * metrics.cellWidth,
    rect.height * metrics.cellHeight,
  );
  const sceneToBaseCanvasRect = (rect: CellRect, originRow = 0): DOMRect => new DOMRect(
    (guardCells + rect.x) * metrics.cellWidth,
    (guardCells + rect.y - originRow) * metrics.cellHeight,
    rect.width * metrics.cellWidth,
    rect.height * metrics.cellHeight,
  );
  const overlayPlaneClipPath = (rect: CellRect): string => {
    const right = Math.max(0, overlayViewport.width - rect.x - rect.width) * metrics.cellWidth;
    const bottom = Math.max(0, overlayViewport.height - rect.y - rect.height) * metrics.cellHeight;
    return `inset(${rect.y * metrics.cellHeight}px ${right}px ${bottom}px ${rect.x * metrics.cellWidth}px)`;
  };
  return {
    contentOriginPx,
    sceneToClientRect,
    sceneToSurfaceRect,
    sceneToCanvasRect,
    sceneToBaseCanvasRect,
    overlayPlaneToCanvasRect: sceneToCanvasRect,
    overlayPlaneClipPath,
    clientToScenePosition: (point) => ({
      x: (point.clientX - contentOriginPx.left) / metrics.cellWidth,
      y: (point.clientY - contentOriginPx.top) / metrics.cellHeight,
    }),
    clientToScenePoint: (point) => {
      const position = {
        x: (point.clientX - contentOriginPx.left) / metrics.cellWidth,
        y: (point.clientY - contentOriginPx.top) / metrics.cellHeight,
      };
      return { x: Math.floor(position.x), y: Math.floor(position.y) };
    },
  };
};

const geometries = new WeakMap<Element, CellSurfaceGeometry>();
const surfaces = new Set<Element>();

export const registerCellSurfaceGeometry = (surface: Element, geometry: CellSurfaceGeometry): (() => void) => {
  geometries.set(surface, geometry);
  surfaces.add(surface);
  return () => { geometries.delete(surface); surfaces.delete(surface); };
};

export const listCellSurfaceElements = (): readonly Element[] => [...surfaces];

export const resolveCellAnchorRect = (anchor: Element): DOMRect | null => {
  const id = (anchor as HTMLElement).dataset.cellSemanticId;
  const surface = anchor.closest("[data-cell-surface]");
  return id && surface ? geometries.get(surface)?.targetRect(id) ?? null : null;
};

export const resolveCellSurfaceContentRect = (target: Element): DOMRect | null => {
  const surface = target.closest("[data-cell-surface]");
  return surface ? geometries.get(surface)?.contentRect() ?? null : null;
};

export const resolveCellSurfaceGeometry = (target: Element): CellSurfaceGeometrySnapshot | null => {
  const surface = target.closest("[data-cell-surface]");
  return surface ? geometries.get(surface)?.snapshot?.() ?? null : null;
};

export const resolveCellSurfaceTransform = (target: Element): CellSurfaceGeometryTransform | null => {
  const surface = target.closest("[data-cell-surface]");
  return surface ? geometries.get(surface)?.transform() ?? null : null;
};

export type CellSurfaceInspectionQuery = Readonly<{
  point?: CellPoint;
  clientPoint?: Readonly<{ clientX: number; clientY: number }>;
  widgetId?: WidgetId;
}>;

export const resolveCellSurfaceInspection = (
  target: Element,
  query: CellSurfaceInspectionQuery,
): CellInspectionSnapshot | null => {
  const surface = target.closest("[data-cell-surface]") ?? target.querySelector("[data-cell-surface]");
  if (!surface) return null;
  const geometry = geometries.get(surface);
  if (!geometry) return null;
  const inspection = query.widgetId
    ? geometry.inspectWidget?.(query.widgetId) ?? null
    : query.point
      ? geometry.inspect?.(query.point) ?? null
      : query.clientPoint
        ? geometry.inspect?.(geometry.transform()?.clientToScenePoint(query.clientPoint) ?? { x: -1, y: -1 }) ?? null
        : null;
  if (!inspection) return null;
  const transform = geometry.transform?.();
  if (!transform) return inspection;
  const bounds = inspection.scene.paintBounds ?? inspection.scene.hitBounds;
  return {
    ...inspection,
    projection: {
      cellRectPx: bounds ? transform.sceneToClientRect(bounds) : null,
      surfaceRectPx: bounds ? transform.sceneToSurfaceRect(bounds) : null,
    },
  };
};

export const resolveCellSurfaceFrame = (target: Element): FrameSnapshot | null => {
  const surface = target.closest("[data-cell-surface]") ?? target.querySelector("[data-cell-surface]");
  return surface ? geometries.get(surface)?.frame?.() ?? null : null;
};

export const resolveCellSurfaceTrace = (target: Element): readonly CellInteractionTraceEvent[] => {
  const surface = target.closest("[data-cell-surface]") ?? target.querySelector("[data-cell-surface]");
  return surface ? geometries.get(surface)?.trace?.() ?? [] : [];
};

export const resolveCellOverlayContentRect = (portal: Element): DOMRect | null => {
  const surface = portal.querySelector("[data-cell-surface]");
  return surface ? geometries.get(surface)?.contentRect() ?? null : null;
};
