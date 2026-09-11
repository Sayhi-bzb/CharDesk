import {
  getGridSelectionGeometry,
  gridRangeFromSelectionArea,
} from "@/domains/selection/public";
import { DEFAULT_CANVAS_CELL_METRICS } from "@/shared/fonts/canvas-profile";
import type { GridCellSource, Point } from "@/shared/types";

type RemoteSelection = { mode: "freeform"; areas: Array<{ start: Point; end: Point }> };

type RemotePeer = {
  clientId: number;
  name: string;
  color: string;
  selection?: RemoteSelection;
};

type ScreenRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type RemoteSelectionVisual = {
  clientId: number;
  name: string;
  color: string;
  path: string;
  regions: ScreenRect[];
  bounds: ScreenRect;
  center: Point;
};

type RemoteSelectionLayout = {
  visible: Array<RemoteSelectionVisual & { labelAnchor: Point }>;
  indicators: Array<RemoteSelectionVisual & {
    edge: "top" | "right" | "bottom" | "left";
    position: Point;
  }>;
};

const INDICATOR_SIZE = 20;
const INDICATOR_GAP = 4;
const INDICATOR_EDGE_GAP = 4;

const toScreenPoint = (
  point: Point,
  viewport: { offset: Point; zoom: number }
): Point => ({
  x:
    viewport.offset.x +
    point.x * DEFAULT_CANVAS_CELL_METRICS.cellWidth * viewport.zoom,
  y:
    viewport.offset.y +
    point.y * DEFAULT_CANVAS_CELL_METRICS.cellHeight * viewport.zoom,
});

const ringsToPath = (
  rings: Point[][],
  viewport: { offset: Point; zoom: number }
) =>
  rings
    .map(
      (ring) =>
        `${ring
          .map((point, index) => {
            const screen = toScreenPoint(point, viewport);
            return `${index === 0 ? "M" : "L"}${screen.x} ${screen.y}`;
          })
          .join(" ")} Z`
    )
    .join(" ");

const pointsToScreenRect = (
  points: Point[],
  viewport: { offset: Point; zoom: number }
): ScreenRect => {
  const screenPoints = points.map((point) => toScreenPoint(point, viewport));
  return {
    left: Math.min(...screenPoints.map((point) => point.x)),
    top: Math.min(...screenPoints.map((point) => point.y)),
    right: Math.max(...screenPoints.map((point) => point.x)),
    bottom: Math.max(...screenPoints.map((point) => point.y)),
  };
};

const unionScreenRects = (regions: ScreenRect[]): ScreenRect => ({
  left: Math.min(...regions.map((region) => region.left)),
  top: Math.min(...regions.map((region) => region.top)),
  right: Math.max(...regions.map((region) => region.right)),
  bottom: Math.max(...regions.map((region) => region.bottom)),
});

const createVisual = (
  peer: RemotePeer,
  path: string,
  regions: ScreenRect[]
): RemoteSelectionVisual => {
  const bounds = unionScreenRects(regions);
  return {
    clientId: peer.clientId,
    name: peer.name,
    color: peer.color,
    path,
    regions,
    bounds,
    center: {
      x: (bounds.left + bounds.right) / 2,
      y: (bounds.top + bounds.bottom) / 2,
    },
  };
};

export const resolveRemoteSelectionVisuals = ({
  peers,
  grid,
  viewport,
}: {
  peers: RemotePeer[];
  grid: GridCellSource;
  viewport: { offset: Point; zoom: number };
}): RemoteSelectionVisual[] => peers.flatMap((peer) => {
  if (peer.selection?.mode === "freeform") {
    const geometry = getGridSelectionGeometry(
      peer.selection.areas.map(gridRangeFromSelectionArea),
      grid
    );
    if (!geometry.bounds) return [];
    const regions = geometry.polygons.flatMap(({ rings }) =>
      rings.map((ring) => pointsToScreenRect(ring, viewport))
    );
    return [createVisual(
      peer,
      geometry.polygons
        .map(({ rings }) => ringsToPath(rings, viewport))
        .join(" "),
      regions
    )];
  }

  return [];
});

const intersects = (left: ScreenRect, right: ScreenRect) =>
  left.right > right.left &&
  left.left < right.right &&
  left.bottom > right.top &&
  left.top < right.bottom;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const getIndicatorEdge = (
  target: Point,
  rect: ScreenRect
): "top" | "right" | "bottom" | "left" => {
  const center = {
    x: (rect.left + rect.right) / 2,
    y: (rect.top + rect.bottom) / 2,
  };
  const dx = target.x - center.x;
  const dy = target.y - center.y;
  const horizontalScale = dx === 0
    ? Number.POSITIVE_INFINITY
    : (rect.right - rect.left) / 2 / Math.abs(dx);
  const verticalScale = dy === 0
    ? Number.POSITIVE_INFINITY
    : (rect.bottom - rect.top) / 2 / Math.abs(dy);
  return horizontalScale < verticalScale
    ? (dx < 0 ? "left" : "right")
    : (dy < 0 ? "top" : "bottom");
};

const distributeIndicators = (
  indicators: RemoteSelectionLayout["indicators"],
  edge: "top" | "right" | "bottom" | "left",
  rect: ScreenRect
) => {
  if (indicators.length === 0) return [];
  const horizontal = edge === "top" || edge === "bottom";
  const min = horizontal ? rect.left : rect.top;
  const max = horizontal ? rect.right : rect.bottom;
  const sorted = [...indicators]
    .sort((left, right) => {
      const leftAxis = horizontal ? left.position.x : left.position.y;
      const rightAxis = horizontal ? right.position.x : right.position.y;
      return leftAxis - rightAxis || left.clientId - right.clientId;
    });
  const axes = sorted.map((indicator) => clamp(
    horizontal ? indicator.position.x : indicator.position.y,
    min,
    max
  ));
  for (let index = 1; index < axes.length; index++) {
    axes[index] = Math.max(
      axes[index],
      axes[index - 1] + INDICATOR_SIZE + INDICATOR_GAP
    );
  }
  const overflow = Math.max(0, (axes.at(-1) ?? max) - max);
  if (overflow > 0) axes.forEach((axis, index) => { axes[index] = axis - overflow; });

  return sorted.map((indicator, index) => {
    const axis = axes[index];
    return {
      ...indicator,
      position: horizontal
        ? { ...indicator.position, x: axis }
        : { ...indicator.position, y: axis },
    };
  });
};

export const resolveRemoteSelectionLayout = (
  visuals: RemoteSelectionVisual[],
  usableRect: { x: number; y: number; width: number; height: number }
): RemoteSelectionLayout => {
  if (usableRect.width <= 0 || usableRect.height <= 0) {
    return { visible: [], indicators: [] };
  }
  const viewportRect = {
    left: usableRect.x,
    top: usableRect.y,
    right: usableRect.x + usableRect.width,
    bottom: usableRect.y + usableRect.height,
  };
  const indicatorRect = {
    left: viewportRect.left + INDICATOR_EDGE_GAP + INDICATOR_SIZE / 2,
    top: viewportRect.top + INDICATOR_EDGE_GAP + INDICATOR_SIZE / 2,
    right: viewportRect.right - INDICATOR_EDGE_GAP - INDICATOR_SIZE / 2,
    bottom: viewportRect.bottom - INDICATOR_EDGE_GAP - INDICATOR_SIZE / 2,
  };
  const visible: RemoteSelectionLayout["visible"] = [];
  const offscreen: RemoteSelectionLayout["indicators"] = [];

  visuals.forEach((visual) => {
    const visibleRegion = visual.regions.find((region) => intersects(region, viewportRect));
    if (visibleRegion) {
      visible.push({
        ...visual,
        labelAnchor: {
          x: clamp(visibleRegion.left, viewportRect.left + 2, viewportRect.right - 2),
          y: clamp(visibleRegion.top - 16, viewportRect.top, viewportRect.bottom - 16),
        },
      });
      return;
    }

    const center = {
      x: (indicatorRect.left + indicatorRect.right) / 2,
      y: (indicatorRect.top + indicatorRect.bottom) / 2,
    };
    const visualCenterInside =
      visual.center.x >= viewportRect.left && visual.center.x <= viewportRect.right &&
      visual.center.y >= viewportRect.top && visual.center.y <= viewportRect.bottom;
    const directionTarget = (visualCenterInside
      ? visual.regions
        .map((region) => ({
          x: (region.left + region.right) / 2,
          y: (region.top + region.bottom) / 2,
        }))
        .sort((left, right) =>
          (left.x - center.x) ** 2 + (left.y - center.y) ** 2 -
          ((right.x - center.x) ** 2 + (right.y - center.y) ** 2)
        )[0]
      : visual.center) ?? visual.center;
    const edge = getIndicatorEdge(directionTarget, indicatorRect);
    const dx = directionTarget.x - center.x;
    const dy = directionTarget.y - center.y;
    const scale = edge === "left" || edge === "right"
      ? (edge === "left" ? indicatorRect.left - center.x : indicatorRect.right - center.x) / dx
      : (edge === "top" ? indicatorRect.top - center.y : indicatorRect.bottom - center.y) / dy;
    offscreen.push({
      ...visual,
      edge,
      position: {
        x: edge === "left" || edge === "right"
          ? (edge === "left" ? indicatorRect.left : indicatorRect.right)
          : center.x + dx * scale,
        y: edge === "top" || edge === "bottom"
          ? (edge === "top" ? indicatorRect.top : indicatorRect.bottom)
          : center.y + dy * scale,
      },
    });
  });

  const indicators = (["top", "right", "bottom", "left"] as const).flatMap((edge) =>
    distributeIndicators(
      offscreen.filter((indicator) => indicator.edge === edge),
      edge,
      indicatorRect
    )
  );
  return { visible, indicators };
};

export const resolveRemoteSelectionRevealViewport = (
  viewport: { offset: Point; zoom: number },
  targetCenter: Point,
  selectionCenter: Point
) => ({
  zoom: viewport.zoom,
  offset: {
    x: viewport.offset.x + targetCenter.x - selectionCenter.x,
    y: viewport.offset.y + targetCenter.y - selectionCenter.y,
  },
});
