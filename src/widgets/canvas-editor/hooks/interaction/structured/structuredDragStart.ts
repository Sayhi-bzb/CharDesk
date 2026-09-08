import type { Point } from "@/shared/types";
import type { StructuredNode } from "@/domains/structured-content/public";
import { createStructuredSceneSurface } from "@/domains/structured-content/public";
import { materializeGridSource } from "@/shared/utils/grid-source";
import {
  isStructuredSplitBoxLineHandle,
  type StructuredNodeHit,
  type StructuredSplitBoxHandle,
} from "@/domains/structured-content/public";
import type {
  StructuredNodeDragPayload,
  CanvasInteractionState,
} from "@/domains/editor/public";

export type { StructuredNodeDragPayload } from "@/domains/editor/public";

export type StructuredDragStartDecision = {
  selectedIds: string[];
  contextPoint: Point | null;
  splitHandle: { nodeId: string; handle: StructuredSplitBoxHandle } | null;
  drag: StructuredNodeDragPayload;
  state: CanvasInteractionState;
};

export const resolveStructuredDragStartDecision = ({
  hit,
  start,
  selectedStructuredNodeIds,
  structuredScene,
}: {
  hit: StructuredNodeHit;
  start: Point;
  selectedStructuredNodeIds: string[];
  structuredScene: StructuredNode[];
}): StructuredDragStartDecision => {
  const isRectResize =
    (hit.kind === "box" || hit.kind === "bg") && !!hit.handle;
  const isSplitDividerResize =
    hit.kind === "splitBox" &&
    !!hit.handle &&
    isStructuredSplitBoxLineHandle(hit.handle);
  const isSplitBoxResize = hit.kind === "splitBox" && !!hit.handle;
  const isLineResize = hit.kind === "line" && !!hit.handle;
  const shouldMoveSelection =
    !isRectResize &&
    !isSplitBoxResize &&
    !isLineResize &&
    selectedStructuredNodeIds.includes(hit.node.id);
  const selectedIds = shouldMoveSelection
    ? [...selectedStructuredNodeIds]
    : [hit.node.id];
  const selectedIdSet = new Set(selectedIds);
  const selectedNodes = structuredScene.filter((node) =>
    selectedIdSet.has(node.id)
  );
  const baseScene = structuredScene.filter((node) => !selectedIdSet.has(node.id));
  const drag = {
    node: hit.node,
    selectedIds,
    selectedNodes: selectedNodes.length > 0 ? selectedNodes : [hit.node],
    baseScene,
    baseGrid: materializeGridSource(createStructuredSceneSurface(baseScene)),
    handle: hit.handle,
  };

  let state: CanvasInteractionState;
  if (isSplitDividerResize) {
    state = {
      type: "structuredSplitBoxResizePending",
      anchor: start,
      drag,
    };
  } else if (isSplitBoxResize) {
    state = {
      type: "structuredSplitBoxResizing",
      anchor: start,
      drag,
    };
  } else if (isRectResize) {
    state = {
      type: "structuredRectResizing",
      anchor: start,
      drag,
    };
  } else if (isLineResize) {
    state = {
      type: "structuredLineResizing",
      anchor: start,
      drag,
    };
  } else {
    state = {
      type: "structuredMoving",
      anchor: start,
      drag,
    };
  }

  return {
    selectedIds,
    contextPoint: hit.kind === "splitBox" ? start : null,
    splitHandle:
      hit.kind === "splitBox" &&
      hit.handle &&
      isStructuredSplitBoxLineHandle(hit.handle)
        ? { nodeId: hit.node.id, handle: hit.handle }
        : null,
    drag,
    state,
  };
};
