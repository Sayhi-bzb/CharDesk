import { cellRectContainsPoint } from "@chardesk/cell-core";
import { placeAnchoredOverlay } from "./anchored-overlay.js";
import { computeScrollMetrics, scrollOffsetFor } from "./scroll.js";
import { measureCellText } from "./text.js";
import type {
  CellPoint,
  CellRect,
  LayoutSnapshot,
  SceneEntry,
  SceneSnapshot,
  ScrollMetrics,
  WidgetTree,
} from "./types.js";
import { isPortalKind } from "./widget-capabilities.js";

export const intersectSceneRects = (left: CellRect, right: CellRect): CellRect => {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const rightEdge = Math.min(left.x + left.width, right.x + right.width);
  const bottomEdge = Math.min(left.y + left.height, right.y + right.height);
  return {
    x,
    y,
    width: Math.max(0, rightEdge - x),
    height: Math.max(0, bottomEdge - y),
  };
};

const isEmpty = (rect: CellRect) => rect.width === 0 || rect.height === 0;

const scrollMetricsFor = (
  tree: WidgetTree,
  layout: LayoutSnapshot,
  id: string,
  contentBounds: CellRect
): ScrollMetrics | null => {
  const node = tree.nodes.get(id);
  const entry = layout.entries.get(id);
  if (!node || !entry) return null;
  if (node.textEditor) {
    const visible = node.kind === "text-area";
    return computeScrollMetrics(contentBounds, measureCellText(node.textEditor), scrollOffsetFor(node), { x: visible, y: visible });
  }
  if (node.kind !== "scroll-area" && node.kind !== "select-content") return null;
  let explicitHorizontalExtent = false;
  const extent = { width: 0, height: 0 };
  const measureDescendant = (childId: string, origin: CellPoint): void => {
    const child = layout.entries.get(childId)?.rect;
    const childNode = tree.nodes.get(childId);
    if (!child || !childNode) return;
    if (isPortalKind(childNode.kind)) return;
    const x = origin.x + child.x;
    const y = origin.y + child.y;
    const explicitWidth = childNode.style.width !== undefined
      || childNode.style.minWidth !== undefined;
    if (explicitWidth) {
      explicitHorizontalExtent = true;
      extent.width = Math.max(extent.width, x + child.width);
    }
    extent.height = Math.max(extent.height, y + child.height);
    childNode.children.forEach((grandchildId) => {
      measureDescendant(grandchildId, { x, y });
    });
  };
  node.children.forEach((childId) => {
    measureDescendant(childId, {
      x: -entry.contentRect.x,
      y: -entry.contentRect.y,
    });
  });
  const selectContent = node.kind === "select-content";
  return computeScrollMetrics(
    contentBounds,
    {
      width: !selectContent && explicitHorizontalExtent ? extent.width : contentBounds.width,
      height: extent.height,
    },
    node.scrollOffset,
    { x: !selectContent && explicitHorizontalExtent, y: true },
    selectContent || !explicitHorizontalExtent,
  );
};

export const composeScene = (
  tree: WidgetTree,
  layout: LayoutSnapshot,
  overlayViewport: CellRect = layout.viewport
): SceneSnapshot => {
  const entries = new Map<string, SceneEntry>();
  const paintList: string[] = [];
  if (!tree.rootId) return { viewport: layout.viewport, overlayViewport, entries, paintList };

  let traversalOrder = 0;
  const orders = new Map<string, number>();
  const visit = (
    id: string,
    parentOrigin: CellPoint,
    inheritedClip: CellRect,
    inheritedLayer: number
  ): void => {
    const widget = tree.nodes.get(id);
    const layoutEntry = layout.entries.get(id);
    if (!widget || !layoutEntry) throw new Error(`Scene input is missing ${id}.`);
    const portal = isPortalKind(widget.kind);
    const origin = portal ? { x: 0, y: 0 } : parentOrigin;
    const clip = portal ? overlayViewport : inheritedClip;
    const layer = portal ? inheritedLayer + 1 : inheritedLayer;
    const selectAnchor = widget.kind === "select-content"
      ? widget.parentId
        ? tree.nodes.get(widget.parentId)?.children
          .map((childId) => tree.nodes.get(childId))
          .find((child) => child?.kind === "select-trigger")
        : undefined
      : undefined;
    const anchorBounds = selectAnchor ? entries.get(selectAnchor.id)?.layoutBounds : undefined;
    if (widget.kind === "select-content" && !anchorBounds) {
      throw new TypeError("SelectContent must follow SelectTrigger inside the same Select.");
    }
    const selectPlacement = anchorBounds
      ? placeAnchoredOverlay(anchorBounds, layoutEntry.rect, overlayViewport)
      : undefined;
    const bounds: CellRect = {
      x: widget.kind === "overlay"
        ? widget.overlayPosition!.x
        : widget.kind === "select-content"
          ? selectPlacement!.bounds.x
          : origin.x + layoutEntry.rect.x,
      y: widget.kind === "overlay"
        ? widget.overlayPosition!.y
        : widget.kind === "select-content"
          ? selectPlacement!.bounds.y
          : origin.y + layoutEntry.rect.y,
      width: selectPlacement?.bounds.width ?? layoutEntry.rect.width,
      height: selectPlacement?.bounds.height ?? layoutEntry.rect.height,
    };
    const contentRightInset = layoutEntry.rect.width
      - layoutEntry.contentRect.x
      - layoutEntry.contentRect.width;
    const contentBottomInset = layoutEntry.rect.height
      - layoutEntry.contentRect.y
      - layoutEntry.contentRect.height;
    const contentBounds: CellRect = {
      x: bounds.x + layoutEntry.contentRect.x,
      y: bounds.y + layoutEntry.contentRect.y,
      width: Math.max(
        0,
        bounds.width - layoutEntry.contentRect.x - contentRightInset
      ),
      height: Math.max(
        0,
        bounds.height - layoutEntry.contentRect.y - contentBottomInset
      ),
    };
    const decorationBounds: CellRect = {
      x: bounds.x + layoutEntry.borderInsets.left,
      y: bounds.y + layoutEntry.borderInsets.top,
      width: Math.max(
        0,
        bounds.width - layoutEntry.borderInsets.left - layoutEntry.borderInsets.right
      ),
      height: Math.max(
        0,
        bounds.height - layoutEntry.borderInsets.top - layoutEntry.borderInsets.bottom
      ),
    };
    const outerClip = intersectSceneRects(clip, bounds);
    const scrollMetrics = scrollMetricsFor(tree, layout, id, contentBounds);
    const contentClip = intersectSceneRects(outerClip, scrollMetrics?.viewport ?? contentBounds);
    const entry: SceneEntry = {
      id,
      sceneParentId: portal ? tree.rootId : widget.parentId,
      eventParentId: widget.parentId,
      layoutBounds: bounds,
      decorationBounds,
      contentBounds,
      paintBounds: bounds,
      hitBounds: bounds,
      outerClip,
      contentClip,
      scrollMetrics,
      layer,
      paintOrder: traversalOrder,
      paintVisible: !isEmpty(outerClip),
    };
    orders.set(id, traversalOrder);
    traversalOrder += 1;
    entries.set(id, entry);
    if (entry.paintVisible) paintList.push(id);

    const childClip = contentClip;
    const childOrigin = widget.kind === "scroll-area" || widget.kind === "select-content"
      ? {
          x: bounds.x - widget.scrollOffset.x,
          y: bounds.y - widget.scrollOffset.y,
        }
      : { x: bounds.x, y: bounds.y };
    for (const childId of widget.children) visit(childId, childOrigin, childClip, layer);
  };

  visit(tree.rootId, { x: 0, y: 0 }, layout.viewport, 0);
  paintList.sort((left, right) => {
    const leftEntry = entries.get(left)!;
    const rightEntry = entries.get(right)!;
    return leftEntry.layer - rightEntry.layer
      || orders.get(left)! - orders.get(right)!;
  });
  paintList.forEach((id, paintOrder) => {
    entries.set(id, { ...entries.get(id)!, paintOrder });
  });
  return { viewport: layout.viewport, overlayViewport, entries, paintList };
};

export const getEventPath = (
  scene: SceneSnapshot,
  targetId: string
): readonly string[] => {
  const path: string[] = [];
  let id: string | null = targetId;
  while (id) {
    const entry = scene.entries.get(id);
    if (!entry) break;
    path.push(id);
    id = entry.eventParentId;
  }
  return path;
};

export const hitTest = (
  scene: SceneSnapshot,
  point: CellPoint
): readonly string[] => scene.paintList
  .slice()
  .reverse()
  .filter((id) => {
    const entry = scene.entries.get(id);
    return entry
      ? cellRectContainsPoint(entry.hitBounds, point)
        && cellRectContainsPoint(entry.outerClip, point)
      : false;
  });

export const hitTestCell = (
  scene: SceneSnapshot,
  point: CellPoint
): import("./types.js").CellHit | null => {
  const ownerId = hitTest(scene, point)[0];
  if (!ownerId) return null;
  const entry = scene.entries.get(ownerId);
  if (!entry) return null;
  const metrics = entry.scrollMetrics;
  const part = metrics?.horizontalTrack && cellRectContainsPoint(metrics.horizontalTrack, point)
    ? "scrollbar-x"
    : metrics?.verticalTrack && cellRectContainsPoint(metrics.verticalTrack, point)
      ? "scrollbar-y"
      : metrics?.corner && cellRectContainsPoint(metrics.corner, point)
        ? "scrollbar-corner"
        : cellRectContainsPoint(entry.contentBounds, point)
          ? "content"
          : "chrome";
  return { ownerId, part, point };
};
