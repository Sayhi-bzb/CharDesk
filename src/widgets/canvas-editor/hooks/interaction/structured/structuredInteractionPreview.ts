import type { GridMap, Point } from "@/shared/types";
import type { StructuredNode } from "@/domains/structured-content/public";
import { GridManager } from "@/shared/utils/grid";
import {
  createStructuredSceneSurface,
  getSplitBoxPoints,
} from "@/domains/structured-content/public";
import { materializeGridSource } from "@/shared/utils/grid-source";
import {
  moveStructuredNode,
  resizeStructuredSplitBox,
  type StructuredBoxResizeHandle,
  type StructuredLineResizeHandle,
  type StructuredSplitBoxHandle,
} from "@/domains/structured-content/public";

export type StructuredMovePreview = {
  baseScene: StructuredNode[];
  movingNodes: StructuredNode[];
  baseGrid: GridMap;
  movingGrid: GridMap;
};

type StructuredMovePreviewDrag = {
  selectedNodes: StructuredNode[];
  baseScene: StructuredNode[];
  baseGrid: GridMap;
};

type StructuredSplitBoxResizePreviewDrag = {
  node: StructuredNode;
  baseScene: StructuredNode[];
  baseGrid: GridMap;
  handle:
    | StructuredBoxResizeHandle
    | StructuredLineResizeHandle
    | StructuredSplitBoxHandle
    | null;
};

export const createStructuredSplitBoxGrid = (
  node: Extract<StructuredNode, { type: "splitBox" }>
): GridMap => {
  const grid: GridMap = new Map();
  getSplitBoxPoints(node.start, node.end, {
    verticalSplitRatio: node.verticalSplitRatio,
    topSplitRatio: node.topSplitRatio,
    bottomSplitRatio: node.bottomSplitRatio,
    root: node.root,
  }).forEach((point) => {
    grid.set(GridManager.toKey(point.x, point.y), {
      char: point.char,
      color: node.style.color,
      bgColor: node.style.bgColor,
      attrs: node.style.attrs,
    });
  });
  return grid;
};

const getMovedStructuredNodes = (
  selectedNodes: StructuredNode[],
  delta: Point
): Map<string, StructuredNode> =>
  new Map(
    selectedNodes.map((node) => [
      node.id,
      moveStructuredNode(node, delta),
    ])
  );

export const buildStructuredMovePreview = (
  drag: StructuredMovePreviewDrag,
  delta: Point
): StructuredMovePreview => {
  const movingNodes = Array.from(
    getMovedStructuredNodes(drag.selectedNodes, delta).values()
  );
  return {
    baseScene: drag.baseScene,
    movingNodes,
    baseGrid: drag.baseGrid,
    movingGrid: materializeGridSource(createStructuredSceneSurface(movingNodes)),
  };
};

export const buildStructuredMoveCommitScene = (
  scene: StructuredNode[],
  selectedNodes: StructuredNode[],
  delta: Point
): StructuredNode[] => {
  const movingNodes = getMovedStructuredNodes(selectedNodes, delta);
  return scene.map((node) => movingNodes.get(node.id) ?? node);
};

const resizeStructuredSplitBoxForPreview = (
  drag: StructuredSplitBoxResizePreviewDrag,
  point: Point
) => {
  if (drag.node.type !== "splitBox" || !drag.handle) return null;
  return resizeStructuredSplitBox(
    drag.node,
    drag.handle as StructuredSplitBoxHandle,
    point
  );
};

export const buildStructuredSplitBoxResizePreview = (
  drag: StructuredSplitBoxResizePreviewDrag,
  point: Point
): StructuredMovePreview | null => {
  const resizedNode = resizeStructuredSplitBoxForPreview(drag, point);
  if (!resizedNode) return null;
  return {
    baseScene: drag.baseScene,
    movingNodes: [resizedNode],
    baseGrid: drag.baseGrid,
    movingGrid: createStructuredSplitBoxGrid(resizedNode),
  };
};

export const buildStructuredSplitBoxResizeCommitScene = (
  scene: StructuredNode[],
  drag: StructuredSplitBoxResizePreviewDrag,
  point: Point
): StructuredNode[] | null => {
  const resizedNode = resizeStructuredSplitBoxForPreview(drag, point);
  if (!resizedNode) return null;
  return scene.map((node) => (node.id === resizedNode.id ? resizedNode : node));
};
