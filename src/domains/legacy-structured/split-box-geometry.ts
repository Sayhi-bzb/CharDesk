import { BOX_CHARS } from "@/shared/lib/constants";

// Read-only geometry retained by the legacy flattening boundary.
import type { GridPoint, NodeBounds, Point } from "@/shared/types";
import { getBoxPoints } from "@/shared/utils/shapes";
import type { StructuredSplitBoxTreeNode } from "./types";

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const createDefaultSplitBoxRoot = (ratios: {
  verticalSplitRatio: number;
  topSplitRatio: number;
  bottomSplitRatio: number;
}): StructuredSplitBoxTreeNode => {
  const middleRatio =
    ratios.bottomSplitRatio > ratios.topSplitRatio
      ? (ratios.bottomSplitRatio - ratios.topSplitRatio) /
        (1 - ratios.topSplitRatio)
      : 0.67;

  return {
    type: "split",
    id: "split-top",
    axis: "horizontal",
    ratio: ratios.topSplitRatio,
    first: { type: "leaf", id: "leaf-top" },
    second: {
      type: "split",
      id: "split-bottom",
      axis: "horizontal",
      ratio: clamp(middleRatio, 0.1, 0.9),
      first: {
        type: "split",
        id: "split-middle",
        axis: "vertical",
        ratio: ratios.verticalSplitRatio,
        first: { type: "leaf", id: "leaf-middle-left" },
        second: { type: "leaf", id: "leaf-middle-right" },
      },
      second: { type: "leaf", id: "leaf-bottom" },
    },
  };
};

const isSplitBoxTreeNode = (value: unknown): value is StructuredSplitBoxTreeNode => {
  if (!value || typeof value !== "object") return false;
  const node = value as Partial<StructuredSplitBoxTreeNode>;
  if (node.type === "leaf") return typeof node.id === "string";
  if (node.type !== "split") return false;
  const split = node as Partial<Extract<StructuredSplitBoxTreeNode, { type: "split" }>>;
  return (
    typeof split.id === "string" &&
    (split.axis === "horizontal" || split.axis === "vertical") &&
    typeof split.ratio === "number" &&
    Number.isFinite(split.ratio) &&
    isSplitBoxTreeNode(split.first) &&
    isSplitBoxTreeNode(split.second)
  );
};

export const normalizeSplitBoxRoot = (
  root: unknown,
  ratios: {
    verticalSplitRatio: number;
    topSplitRatio: number;
    bottomSplitRatio: number;
  }
): StructuredSplitBoxTreeNode =>
  isSplitBoxTreeNode(root) ? root : createDefaultSplitBoxRoot(ratios);

type SplitBoxLineHandle = {
  id: string;
  axis: "horizontal" | "vertical";
  bounds: NodeBounds;
  parentBounds: NodeBounds;
};

type SplitBoxLeafBounds = {
  id: string;
  bounds: NodeBounds;
};

type SplitBoxLayout = {
  leaves: NodeBounds[];
  leafBounds: SplitBoxLeafBounds[];
  handles: SplitBoxLineHandle[];
};

const normalizeBounds = (start: Point, end: Point): NodeBounds => {
  const x1 = Math.min(start.x, end.x);
  const x2 = Math.max(start.x, end.x);
  const y1 = Math.min(start.y, end.y);
  const y2 = Math.max(start.y, end.y);
  return { x: x1, y: y1, width: x2 - x1 + 1, height: y2 - y1 + 1 };
};

const layoutSplitBoxTree = (
  root: StructuredSplitBoxTreeNode,
  bounds: NodeBounds
): SplitBoxLayout => {
  const leaves: NodeBounds[] = [];
  const leafBounds: SplitBoxLeafBounds[] = [];
  const handles: SplitBoxLineHandle[] = [];
  const visit = (node: StructuredSplitBoxTreeNode, rect: NodeBounds) => {
    if (node.type === "leaf" || rect.width < 3 || rect.height < 3) {
      leaves.push(rect);
      leafBounds.push({ id: node.id, bounds: rect });
      return;
    }

    const left = rect.x;
    const right = rect.x + rect.width - 1;
    const top = rect.y;
    const bottom = rect.y + rect.height - 1;
    const ratio = clamp(node.ratio, 0.05, 0.95);

    if (node.axis === "vertical") {
      const splitX = clamp(
        left + Math.round((rect.width - 1) * ratio),
        left + 1,
        right - 1
      );
      handles.push({
        id: node.id,
        axis: "vertical",
        bounds: { x: splitX, y: top, width: 1, height: rect.height },
        parentBounds: rect,
      });
      visit(node.first, { x: left, y: top, width: splitX - left + 1, height: rect.height });
      visit(node.second, { x: splitX, y: top, width: right - splitX + 1, height: rect.height });
      return;
    }

    const splitY = clamp(
      top + Math.round((rect.height - 1) * ratio),
      top + 1,
      bottom - 1
    );
    handles.push({
      id: node.id,
      axis: "horizontal",
      bounds: { x: left, y: splitY, width: rect.width, height: 1 },
      parentBounds: rect,
    });
    visit(node.first, { x: left, y: top, width: rect.width, height: splitY - top + 1 });
    visit(node.second, { x: left, y: splitY, width: rect.width, height: bottom - splitY + 1 });
  };

  visit(root, bounds);
  return { leaves, leafBounds, handles };
};

const connectionGlyph = (
  up: boolean,
  right: boolean,
  down: boolean,
  left: boolean,
  outerCorner: string | null
) => {
  if (outerCorner) return outerCorner;
  const count = Number(up) + Number(right) + Number(down) + Number(left);
  if (count >= 4) return "┼";
  if (up && right && down) return "├";
  if (up && down && left) return "┤";
  if (right && down && left) return "┬";
  if (up && right && left) return "┴";
  if (up && down) return BOX_CHARS.VERTICAL;
  if (left && right) return BOX_CHARS.HORIZONTAL;
  if (right && down) return "┌";
  if (down && left) return "┐";
  if (up && right) return "└";
  if (up && left) return "┘";
  if (up || down) return BOX_CHARS.VERTICAL;
  return BOX_CHARS.HORIZONTAL;
};

const getLineGraphPoints = (rects: NodeBounds[]): GridPoint[] => {
  const connections = new Map<string, { up: boolean; right: boolean; down: boolean; left: boolean }>();
  const ensure = (x: number, y: number) => {
    const key = `${x},${y}`;
    const existing = connections.get(key);
    if (existing) return existing;
    const next = { up: false, right: false, down: false, left: false };
    connections.set(key, next);
    return next;
  };
  const connect = (x1: number, y1: number, x2: number, y2: number) => {
    const a = ensure(x1, y1);
    const b = ensure(x2, y2);
    if (x2 > x1) {
      a.right = true;
      b.left = true;
    } else if (x2 < x1) {
      a.left = true;
      b.right = true;
    } else if (y2 > y1) {
      a.down = true;
      b.up = true;
    } else if (y2 < y1) {
      a.up = true;
      b.down = true;
    }
  };

  rects.forEach((rect) => {
    const left = rect.x;
    const right = rect.x + rect.width - 1;
    const top = rect.y;
    const bottom = rect.y + rect.height - 1;
    for (let x = left; x < right; x++) {
      connect(x, top, x + 1, top);
      connect(x, bottom, x + 1, bottom);
    }
    for (let y = top; y < bottom; y++) {
      connect(left, y, left, y + 1);
      connect(right, y, right, y + 1);
    }
  });

  const allBounds = rects.reduce<NodeBounds | null>((acc, rect) => {
    if (!acc) return { ...rect };
    const left = Math.min(acc.x, rect.x);
    const top = Math.min(acc.y, rect.y);
    const right = Math.max(acc.x + acc.width - 1, rect.x + rect.width - 1);
    const bottom = Math.max(acc.y + acc.height - 1, rect.y + rect.height - 1);
    return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
  }, null);

  return Array.from(connections.entries()).map(([key, value]) => {
    const [x, y] = key.split(",").map(Number);
    const outerCorner =
      allBounds && x === allBounds.x && y === allBounds.y
        ? BOX_CHARS.TOP_LEFT
        : allBounds && x === allBounds.x + allBounds.width - 1 && y === allBounds.y
          ? BOX_CHARS.TOP_RIGHT
          : allBounds && x === allBounds.x && y === allBounds.y + allBounds.height - 1
            ? BOX_CHARS.BOTTOM_LEFT
            : allBounds && x === allBounds.x + allBounds.width - 1 && y === allBounds.y + allBounds.height - 1
              ? BOX_CHARS.BOTTOM_RIGHT
              : null;
    return {
      x,
      y,
      char: connectionGlyph(value.up, value.right, value.down, value.left, outerCorner),
    };
  });
};

export function getSplitBoxPoints(
  start: Point,
  end: Point,
  ratios: {
    verticalSplitRatio: number;
    topSplitRatio: number;
    bottomSplitRatio: number;
    root?: StructuredSplitBoxTreeNode;
  }
): GridPoint[] {
  const bounds = normalizeBounds(start, end);

  if (bounds.width < 3 || bounds.height < 3) return getBoxPoints(start, end);

  const root = normalizeSplitBoxRoot(ratios.root, ratios);
  return getLineGraphPoints(layoutSplitBoxTree(root, bounds).leaves);
}
