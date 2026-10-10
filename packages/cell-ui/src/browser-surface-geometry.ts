/** Browser-only geometry contract for Cell scene, canvas, DOM and hosted layers. */
import type { CharDeskCellMetrics } from "@chardesk/rendering";
import type { CellPoint, CellRect, CellSize } from "./types.js";

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
  overlayPlaneToCanvasRect: (rect: CellRect) => DOMRect;
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
  snapshot?: () => CellSurfaceGeometrySnapshot | null;
}>;

export const createCellSurfaceGeometryTransform = ({
  surface,
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
  return {
    contentOriginPx,
    sceneToClientRect,
    sceneToSurfaceRect,
    sceneToCanvasRect,
    overlayPlaneToCanvasRect: sceneToCanvasRect,
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

export const registerCellSurfaceGeometry = (surface: Element, geometry: CellSurfaceGeometry): (() => void) => {
  geometries.set(surface, geometry);
  return () => { geometries.delete(surface); };
};

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

export const resolveCellOverlayContentRect = (portal: Element): DOMRect | null => {
  const surface = portal.querySelector("[data-cell-surface]");
  return surface ? geometries.get(surface)?.contentRect() ?? null : null;
};
