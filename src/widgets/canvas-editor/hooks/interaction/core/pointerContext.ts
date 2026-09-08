import type { GridCellSource, Point } from "@/shared/types";
import type { StructuredNode } from "@/domains/structured-content/public";
import { resolveCanvasLinkHit, type CanvasLinkHit } from "./linkHitTesting";
import {
  getLocalCanvasPoint,
  resolveHoverGridPoint,
  resolveSnappedGridPointFromScreen,
  type CanvasViewport,
} from "./coordinates";
import { resolveStructuredSelectHit as resolveStructuredSelectHover } from "./hitTesting";

type CanvasRect = Pick<DOMRect, "left" | "top">;

export type CanvasPointerContextResolver = {
  hasCanvasRect: () => boolean;
  resolveLocalPoint: (clientX: number, clientY: number) => Point | null;
  resolveGridPoint: (clientX: number, clientY: number) => Point | null;
  resolveClampedGridPoint: (clientX: number, clientY: number) => Point | null;
  resolveLinkHit: (clientX: number, clientY: number) => CanvasLinkHit | null;
  resolveHoverPoint: (
    clientX: number,
    clientY: number
  ) => Point | null;
  resolveMoveContext: (input: {
    clientX: number;
    clientY: number;
    shouldResolveStructuredSelectCursor: boolean;
    shouldResolveEraserHoverPoint: boolean;
    selectedStructuredNodeIds: string[];
    structuredScene: StructuredNode[];
    editingStructuredTextNodeId: string | null;
  }) => {
    point: Point | null;
    linkHit: CanvasLinkHit | null;
    structuredSelectCursor: string | null;
    eraserHoverPoint: Point | null;
  };
};

export const createCanvasPointerContextResolver = ({
  getRect,
  getViewport,
  getContentSource,
  getGridBounds,
}: {
  getRect: () => CanvasRect | null | undefined;
  getViewport: () => CanvasViewport;
  getContentSource: () => GridCellSource;
  getGridBounds?: () => { columns: number; rows: number } | null;
}): CanvasPointerContextResolver => {
  const hasCanvasRect = () => !!getRect();

  const resolveLocalPoint = (clientX: number, clientY: number) => {
    const rect = getRect();
    if (!rect) return null;
    return getLocalCanvasPoint({ clientX, clientY, rect });
  };

  const resolveRawGridPoint = (clientX: number, clientY: number) => {
    const rect = getRect();
    if (!rect) return null;
    return resolveSnappedGridPointFromScreen({
      clientX,
      clientY,
      rect,
      viewport: getViewport(),
      source: getContentSource(),
    });
  };

  const resolveGridPoint = (clientX: number, clientY: number) => {
    const point = resolveRawGridPoint(clientX, clientY);
    const bounds = getGridBounds?.();
    if (!point || !bounds) return point;
    return point.x >= 0 && point.x < bounds.columns && point.y >= 0 && point.y < bounds.rows
      ? point
      : null;
  };

  const resolveClampedGridPoint = (clientX: number, clientY: number) => {
    const point = resolveRawGridPoint(clientX, clientY);
    const bounds = getGridBounds?.();
    if (!point || !bounds) return point;
    return {
      x: Math.min(bounds.columns - 1, Math.max(0, point.x)),
      y: Math.min(bounds.rows - 1, Math.max(0, point.y)),
    };
  };

  const resolveLinkHit = (clientX: number, clientY: number) => {
    if (!resolveGridPoint(clientX, clientY)) return null;
    const rect = getRect();
    if (!rect) return null;
    const viewport = getViewport();
    return resolveCanvasLinkHit({
      clientX,
      clientY,
      rect,
      offset: viewport.offset,
      zoom: viewport.zoom,
      source: getContentSource(),
    });
  };

  const resolveHoverPoint = (
    clientX: number,
    clientY: number
  ) => {
    const rect = getRect();
    if (!rect) return null;
    const point = resolveHoverGridPoint({
      clientX,
      clientY,
      rect,
      viewport: getViewport(),
    });
    if (!point) return null;
    const bounds = getGridBounds?.();
    if (!bounds) return point;
    return point.x >= 0 && point.x < bounds.columns && point.y >= 0 && point.y < bounds.rows
      ? point
      : null;
  };

  const resolveMoveContext: CanvasPointerContextResolver["resolveMoveContext"] =
    ({
      clientX,
      clientY,
      shouldResolveStructuredSelectCursor,
      shouldResolveEraserHoverPoint,
      selectedStructuredNodeIds,
      structuredScene,
      editingStructuredTextNodeId,
    }) => {
      const point = resolveGridPoint(clientX, clientY);
      const screenPoint = shouldResolveStructuredSelectCursor
        ? resolveLocalPoint(clientX, clientY)
        : null;
      const viewport = getViewport();
      const structuredSelectCursor = shouldResolveStructuredSelectCursor
        ? resolveStructuredSelectHover({
            screenPoint,
            point,
            selectedStructuredNodeIds,
            structuredScene,
            offset: viewport.offset,
            zoom: viewport.zoom,
            editingStructuredTextNodeId,
          }).cursor
        : null;

      return {
        point,
        linkHit: resolveLinkHit(clientX, clientY),
        structuredSelectCursor,
        eraserHoverPoint: shouldResolveEraserHoverPoint
          ? resolveHoverPoint(clientX, clientY)
          : null,
      };
    };

  return {
    hasCanvasRect,
    resolveLocalPoint,
    resolveGridPoint,
    resolveClampedGridPoint,
    resolveLinkHit,
    resolveHoverPoint,
    resolveMoveContext,
  };
};


