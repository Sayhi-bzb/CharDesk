/** Browser-only geometry for anchoring hosted layers to visible Cell bounds. */
import type { CharDeskCellMetrics } from "@chardesk/rendering";
import type { CellRect, CellSize } from "./types.js";

export type CellSurfaceGeometrySnapshot = Readonly<{
  elementRectPx: DOMRectReadOnly;
  canvasRectPx: DOMRectReadOnly | null;
  viewport: CellSize;
  metrics: CharDeskCellMetrics;
  guardCells: number;
  contentRectCells: CellRect;
}>;

export type CellSurfaceGeometry = Readonly<{
  contentRect: () => DOMRect | null;
  targetRect: (id: string) => DOMRect | null;
  snapshot?: () => CellSurfaceGeometrySnapshot | null;
}>;

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

export const resolveCellOverlayContentRect = (portal: Element): DOMRect | null => {
  const surface = portal.querySelector("[data-cell-surface]");
  return surface ? geometries.get(surface)?.contentRect() ?? null : null;
};
