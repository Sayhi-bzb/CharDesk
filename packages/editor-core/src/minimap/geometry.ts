import type { CellPoint as Point } from '@chardesk/cell-core';
export type MinimapDimensions = {
  width: number;
  height: number;
};

export type MinimapRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type MinimapTransform = {
  dimensions: MinimapDimensions;
  contentBounds: MinimapRect | null;
  viewportBounds: MinimapRect;
  worldBounds: MinimapRect;
  drawableRect: MinimapRect;
  scale: number;
};

const computeViewportWorldBounds = (
  offset: Point,
  zoom: number,
  viewportSize: MinimapDimensions
): MinimapRect => ({
  x: -offset.x / zoom,
  y: -offset.y / zoom,
  width: viewportSize.width / zoom,
  height: viewportSize.height / zoom,
});

export const unionMinimapRects = (first: MinimapRect, second: MinimapRect): MinimapRect => {
  const minX = Math.min(first.x, second.x);
  const minY = Math.min(first.y, second.y);
  const maxX = Math.max(first.x + first.width, second.x + second.width);
  const maxY = Math.max(first.y + first.height, second.y + second.height);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

const fitWorldBoundsToFrame = (
  bounds: MinimapRect,
  dimensions: MinimapDimensions,
  padding: number
) => {
  const drawableRect = {
    x: padding,
    y: padding,
    width: Math.max(dimensions.width - padding * 2, 1),
    height: Math.max(dimensions.height - padding * 2, 1),
  };
  const aspectRatio = drawableRect.width / drawableRect.height;
  let width = Math.max(bounds.width, Number.EPSILON);
  let height = width / aspectRatio;
  if (height < bounds.height) {
    height = Math.max(bounds.height, Number.EPSILON);
    width = height * aspectRatio;
  }
  return {
    drawableRect,
    worldBounds: {
      x: bounds.x + (bounds.width - width) / 2,
      y: bounds.y + (bounds.height - height) / 2,
      width,
      height,
    },
    scale: drawableRect.width / width,
  };
};

export const computeMinimapTransformFromBounds = ({
  contentBounds,
  offset,
  zoom,
  viewportSize,
  dimensions,
  padding,
}: {
  contentBounds: MinimapRect | null;
  offset: Point;
  zoom: number;
  viewportSize: MinimapDimensions;
  dimensions: MinimapDimensions;
  padding: number;
}): MinimapTransform | null => {
  if (
    zoom <= 0 ||
    viewportSize.width <= 0 ||
    viewportSize.height <= 0 ||
    dimensions.width <= 0 ||
    dimensions.height <= 0
  ) {
    return null;
  }
  const viewportBounds = computeViewportWorldBounds(offset, zoom, viewportSize);
  const commonBounds = contentBounds
    ? unionMinimapRects(contentBounds, viewportBounds)
    : viewportBounds;
  const fitted = fitWorldBoundsToFrame(commonBounds, dimensions, padding);
  return {
    dimensions,
    contentBounds,
    viewportBounds,
    ...fitted,
  };
};

export const worldPointToMinimap = (point: Point, transform: MinimapTransform): Point => ({
  x: transform.drawableRect.x + (point.x - transform.worldBounds.x) * transform.scale,
  y: transform.drawableRect.y + (point.y - transform.worldBounds.y) * transform.scale,
});

export const minimapPointToWorld = (
  point: Point,
  transform: MinimapTransform,
  clampToWorld = false
): Point => {
  let x = point.x;
  let y = point.y;
  if (clampToWorld) {
    x = Math.max(
      transform.drawableRect.x,
      Math.min(transform.drawableRect.x + transform.drawableRect.width, x)
    );
    y = Math.max(
      transform.drawableRect.y,
      Math.min(transform.drawableRect.y + transform.drawableRect.height, y)
    );
  }
  return {
    x: transform.worldBounds.x + (x - transform.drawableRect.x) / transform.scale,
    y: transform.worldBounds.y + (y - transform.drawableRect.y) / transform.scale,
  };
};

export const computeMinimapViewportRect = (transform: MinimapTransform): MinimapRect => {
  const point = worldPointToMinimap(transform.viewportBounds, transform);
  return {
    ...point,
    width: transform.viewportBounds.width * transform.scale,
    height: transform.viewportBounds.height * transform.scale,
  };
};

export const clampMinimapCameraCenter = (
  point: Point,
  contentBounds: MinimapRect | null,
  viewportBounds: MinimapRect
): Point => {
  if (!contentBounds) return point;
  const minX = contentBounds.x - viewportBounds.width / 2;
  const maxX = contentBounds.x + contentBounds.width + viewportBounds.width / 2;
  const minY = contentBounds.y - viewportBounds.height / 2;
  const maxY = contentBounds.y + contentBounds.height + viewportBounds.height / 2;

  let x = point.x;
  let y = point.y;
  const left = Math.max(0, minX + viewportBounds.width - x);
  const right = Math.max(0, -(maxX - viewportBounds.width - x));
  const top = Math.max(0, minY + viewportBounds.height - y);
  const bottom = Math.max(0, -(maxY - viewportBounds.height - y));
  x += (left - right) / 2;
  y += (top - bottom) / 2;
  return {
    x: Math.max(minX, Math.min(maxX, x)),
    y: Math.max(minY, Math.min(maxY, y)),
  };
};

export const lockMinimapPointToAxis = (point: Point, origin: Point): Point => {
  const dx = Math.abs(point.x - origin.x);
  const dy = Math.abs(point.y - origin.y);
  return dx > dy ? { x: point.x, y: origin.y } : { x: origin.x, y: point.y };
};

export const cameraCenterToOffset = (
  center: Point,
  zoom: number,
  viewportSize: MinimapDimensions
): Point => ({
  x: viewportSize.width / 2 - center.x * zoom,
  y: viewportSize.height / 2 - center.y * zoom,
});

export const getRectCenter = (rect: MinimapRect): Point => ({
  x: rect.x + rect.width / 2,
  y: rect.y + rect.height / 2,
});

export const expandMinimapRect = (rect: MinimapRect, x: number, y: number): MinimapRect => ({
  x: rect.x - x,
  y: rect.y - y,
  width: rect.width + x * 2,
  height: rect.height + y * 2,
});

export const isPointInMinimapRect = (point: Point, rect: MinimapRect, hitSlop = 0) =>
  point.x >= rect.x - hitSlop &&
  point.x <= rect.x + rect.width + hitSlop &&
  point.y >= rect.y - hitSlop &&
  point.y <= rect.y + rect.height + hitSlop;
