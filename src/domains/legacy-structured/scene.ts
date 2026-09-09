import type { GridCell, NodeBounds, Point } from "@/shared/types";

// Read-only renderer retained to flatten retired Structured Canvas scenes.
import type { StructuredNode } from "./types";
import { normalizeCellStyle } from "@/shared/utils/ansi";
import { mergeStructuredTextStyle } from "./text-ranges";
import { getArrowLinePoints, getBoxPoints, getLShapeLinePoints } from "@/shared/utils/shapes";
import { getSplitBoxPoints } from "./split-box-geometry";
import {
  getCellOccupancy,
  splitGraphemes,
} from "@/shared/metrics";
import {
  createTextLayout,
  getTextLayoutSurfaceCells,
} from "./text-layout";

const pointWithinBounds = (x: number, y: number, bounds?: NodeBounds) =>
  !bounds || (
    x >= bounds.x &&
    x < bounds.x + bounds.width &&
    y >= bounds.y &&
    y < bounds.y + bounds.height
  );

const placeStyledCharInMap = (
  targetMap: {
    set(key: string, value: GridCell): void;
  },
  bgLayer: Map<string, string>,
  visibleForegroundKeys: Set<string>,
  x: number,
  y: number,
  char: string,
  style: StructuredNode["style"],
  clipBounds?: NodeBounds
) => {
  const key = `${x},${y}`;
  const bgColor = style.bgColor ?? bgLayer.get(key);
  if (pointWithinBounds(x, y, clipBounds)) {
    targetMap.set(
      key,
      normalizeCellStyle({ char, ...style, ...(bgColor ? { bgColor } : {}) })
    );
    visibleForegroundKeys.add(key);
  }

  const occupancy = getCellOccupancy(char);
  for (let offset = 1; offset < occupancy; offset++) {
    const followerKey = `${x + offset},${y}`;
    const followerBgColor = style.bgColor ?? bgLayer.get(followerKey);
    if (pointWithinBounds(x + offset, y, clipBounds)) {
      targetMap.set(
        followerKey,
        normalizeCellStyle({
          char: " ",
          ...style,
          ...(followerBgColor ? { bgColor: followerBgColor } : {}),
        })
      );
      visibleForegroundKeys.add(followerKey);
    }
  }
};

const toBounds = (start: Point, end: Point): NodeBounds => {
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
};

const getBoxNameTextCapacity = (bounds: NodeBounds) => Math.max(0, bounds.width - 5);

const trimTextToColumns = (text: string, maxColumns: number) => {
  if (maxColumns <= 0 || !text) return "";
  let width = 0;
  let out = "";
  for (const char of splitGraphemes(text)) {
    const charWidth = getCellOccupancy(char);
    if (width + charWidth > maxColumns) break;
    width += charWidth;
    out += char;
  }
  return out;
};

const structuredNodeBoundsCache = new WeakMap<StructuredNode, NodeBounds>();

const calculateStructuredNodeBounds = (node: StructuredNode): NodeBounds => {
  if (node.type === "box" || node.type === "splitBox" || node.type === "bg") {
    return toBounds(node.start, node.end);
  }

  if (node.type === "line") {
    const points = node.endMarker === "arrow"
      ? getArrowLinePoints(node.start, node.end, node.axis === "vertical")
      : getLShapeLinePoints(node.start, node.end, node.axis === "vertical");
    if (points.length === 0) return toBounds(node.start, node.end);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    points.forEach((point) => {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    });
    return {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    };
  }

  const layout = createTextLayout(node.text, node.position);
  const width = Math.max(1, ...layout.lineWidths);
  return {
    x: node.position.x,
    y: node.position.y,
    width,
    height: Math.max(1, layout.lineWidths.length),
  };
};

/**
 * Structured nodes are immutable editor values. Cache their derived geometry so
 * an edit can retain geometry for every structurally shared node.
 */
const getStructuredNodeBounds = (node: StructuredNode): NodeBounds => {
  const cached = structuredNodeBoundsCache.get(node);
  if (cached) return { ...cached };
  const bounds = calculateStructuredNodeBounds(node);
  structuredNodeBoundsCache.set(node, bounds);
  return { ...bounds };
};

const intersectsBounds = (a: NodeBounds, b: NodeBounds) => {
  const aRight = a.x + a.width - 1;
  const aBottom = a.y + a.height - 1;
  const bRight = b.x + b.width - 1;
  const bBottom = b.y + b.height - 1;
  return a.x <= bRight && aRight >= b.x && a.y <= bBottom && aBottom >= b.y;
};

const renderStructuredScene = (
  scene: readonly StructuredNode[],
  clipBounds?: NodeBounds
) => {
  const grid = new Map<string, GridCell>();
  const bgLayer = new Map<string, string>();
  const visibleForegroundKeys = new Set<string>();
  const ordered = scene
    .filter((node) => !clipBounds || intersectsBounds(getStructuredNodeBounds(node), clipBounds))
    .sort((a, b) => a.order - b.order);

  ordered.forEach((node) => {
    if (node.type === "box") {
      const points = getBoxPoints(node.start, node.end);
      points.forEach((point) => {
        placeStyledCharInMap(
          grid,
          bgLayer,
          visibleForegroundKeys,
          point.x,
          point.y,
          point.char,
          node.style,
          clipBounds
        );
      });
      if (node.name) {
        const bounds = getStructuredNodeBounds(node);
        const label = trimTextToColumns(node.name, getBoxNameTextCapacity(bounds));
        if (!label) return;
        let writeX = bounds.x + 2;
        for (const char of splitGraphemes(` ${label} `)) {
          placeStyledCharInMap(
            grid,
            bgLayer,
            visibleForegroundKeys,
            writeX,
            bounds.y,
            char,
            node.style,
            clipBounds
          );
          writeX += getCellOccupancy(char);
          if (writeX >= bounds.x + bounds.width - 1) break;
        }
      }
      return;
    }

    if (node.type === "line") {
      const points = node.endMarker === "arrow"
        ? getArrowLinePoints(node.start, node.end, node.axis === "vertical")
        : getLShapeLinePoints(node.start, node.end, node.axis === "vertical");
      points.forEach((point) => {
        placeStyledCharInMap(
          grid,
          bgLayer,
          visibleForegroundKeys,
          point.x,
          point.y,
          point.char,
          node.style,
          clipBounds
        );
      });
      return;
    }

    if (node.type === "splitBox") {
      const points = getSplitBoxPoints(node.start, node.end, {
        verticalSplitRatio: node.verticalSplitRatio,
        topSplitRatio: node.topSplitRatio,
        bottomSplitRatio: node.bottomSplitRatio,
        root: node.root,
      });
      points.forEach((point) => {
        placeStyledCharInMap(
          grid,
          bgLayer,
          visibleForegroundKeys,
          point.x,
          point.y,
          point.char,
          node.style,
          clipBounds
        );
      });
      return;
    }

    if (node.type === "bg") {
      const bounds = getStructuredNodeBounds(node);
      const startY = clipBounds ? Math.max(bounds.y, clipBounds.y) : bounds.y;
      const endY = clipBounds
        ? Math.min(bounds.y + bounds.height, clipBounds.y + clipBounds.height)
        : bounds.y + bounds.height;
      const startX = clipBounds ? Math.max(bounds.x, clipBounds.x) : bounds.x;
      const endX = clipBounds
        ? Math.min(bounds.x + bounds.width, clipBounds.x + clipBounds.width)
        : bounds.x + bounds.width;
      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const key = `${x},${y}`;
          if (node.style.bgColor) bgLayer.set(key, node.style.bgColor);
          visibleForegroundKeys.delete(key);
          grid.set(key, normalizeCellStyle({ char: " ", ...node.style }));
        }
      }
      return;
    }

    getTextLayoutSurfaceCells(
      createTextLayout(node.text, node.position),
      (offset) => mergeStructuredTextStyle(node.style, node.styleRanges, offset)
    ).forEach((cell) => {
      if (!pointWithinBounds(cell.x, cell.y, clipBounds)) return;
      const key = `${cell.x},${cell.y}`;
      const bgColor = cell.bgColor ?? bgLayer.get(key);
      grid.set(
        key,
        normalizeCellStyle({
          char: cell.char,
          color: cell.color,
          ...(bgColor ? { bgColor } : {}),
          ...(cell.attrs ? { attrs: cell.attrs } : {}),
        })
      );
      visibleForegroundKeys.add(key);
    });
  });

  return grid;
};

type SceneGridEntriesCacheEntry = {
  scene: readonly StructuredNode[];
  entries: Array<[string, GridCell]>;
};

const SCENE_GRID_CACHE_CELL_LIMIT = 10_000;

const sceneGridEntriesCache = new WeakMap<
  readonly StructuredNode[],
  SceneGridEntriesCacheEntry
>();

export const sceneToGridEntries = (scene: readonly StructuredNode[]) => {
  const cached = sceneGridEntriesCache.get(scene);
  if (
    cached &&
    cached.scene.length === scene.length &&
    scene.every((node, index) => node === cached.scene[index])
  ) {
    return cached.entries;
  }
  const entries = Array.from(renderStructuredScene(scene).entries());
  if (entries.length <= SCENE_GRID_CACHE_CELL_LIMIT) {
    sceneGridEntriesCache.set(scene, { scene: [...scene], entries });
  } else {
    sceneGridEntriesCache.delete(scene);
  }
  return entries;
};

export const normalizeScene = (scene: StructuredNode[]): StructuredNode[] => {
  return [...scene].sort((a, b) => a.order - b.order);
};
