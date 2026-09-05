import type {
  CellPoint,
  CellRect,
  LayoutSnapshot,
  SceneEntry,
  SceneSnapshot,
  ScrollMetrics,
  WidgetTree,
} from "./types.js";

export const intersectCellRects = (left: CellRect, right: CellRect): CellRect => {
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

const contains = (rect: CellRect, point: CellPoint) =>
  point.x >= rect.x
  && point.y >= rect.y
  && point.x < rect.x + rect.width
  && point.y < rect.y + rect.height;

const scrollMetricsFor = (
  tree: WidgetTree,
  layout: LayoutSnapshot,
  id: string,
  contentBounds: CellRect
): ScrollMetrics | null => {
  const node = tree.nodes.get(id);
  const entry = layout.entries.get(id);
  if (!node || !entry || node.kind !== "scroll-area") return null;
  let explicitHorizontalExtent = false;
  const extent = { width: contentBounds.width, height: 0 };
  const measureDescendant = (childId: string, origin: CellPoint): void => {
    const child = layout.entries.get(childId)?.rect;
    const childNode = tree.nodes.get(childId);
    if (!child || !childNode) return;
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
  let horizontal = extent.width > contentBounds.width;
  let vertical = extent.height > contentBounds.height;
  for (let pass = 0; pass < 2; pass += 1) {
    horizontal = extent.width > Math.max(
      0,
      contentBounds.width - (vertical && explicitHorizontalExtent ? 1 : 0)
    );
    vertical = extent.height > Math.max(0, contentBounds.height - (horizontal ? 1 : 0));
  }
  const viewport: CellRect = {
    ...contentBounds,
    width: Math.max(0, contentBounds.width - (vertical ? 1 : 0)),
    height: Math.max(0, contentBounds.height - (horizontal ? 1 : 0)),
  };
  const horizontalTrack = horizontal
    ? { x: viewport.x, y: viewport.y + viewport.height, width: viewport.width, height: 1 }
    : null;
  const verticalTrack = vertical
    ? { x: viewport.x + viewport.width, y: viewport.y, width: 1, height: viewport.height }
    : null;
  const thumbAxis = (track: number, visible: number, content: number, offset: number) => {
    const length = Math.max(1, Math.min(track, Math.floor(track * visible / content)));
    const maxOffset = Math.max(0, content - visible);
    return {
      start: maxOffset === 0 ? 0 : Math.round((track - length) * Math.max(0, Math.min(maxOffset, offset)) / maxOffset),
      length,
    };
  };
  const horizontalThumbAxis = horizontalTrack
    ? thumbAxis(horizontalTrack.width, viewport.width, extent.width, node.scrollOffset.x)
    : null;
  const verticalThumbAxis = verticalTrack
    ? thumbAxis(verticalTrack.height, viewport.height, extent.height, node.scrollOffset.y)
    : null;
  return {
    viewport,
    contentSize: extent,
    maxOffset: {
      x: horizontal ? Math.max(0, extent.width - viewport.width) : 0,
      y: vertical ? Math.max(0, extent.height - viewport.height) : 0,
    },
    horizontalTrack,
    verticalTrack,
    horizontalThumb: horizontalTrack && horizontalThumbAxis
      ? { ...horizontalTrack, x: horizontalTrack.x + horizontalThumbAxis.start, width: horizontalThumbAxis.length }
      : null,
    verticalThumb: verticalTrack && verticalThumbAxis
      ? { ...verticalTrack, y: verticalTrack.y + verticalThumbAxis.start, height: verticalThumbAxis.length }
      : null,
    corner: horizontal && vertical
      ? { x: viewport.x + viewport.width, y: viewport.y + viewport.height, width: 1, height: 1 }
      : null,
  };
};

export const composeScene = (
  tree: WidgetTree,
  layout: LayoutSnapshot
): SceneSnapshot => {
  const entries = new Map<string, SceneEntry>();
  const paintList: string[] = [];
  if (!tree.rootId) return { viewport: layout.viewport, entries, paintList };

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
    const portal = widget.kind === "overlay";
    const origin = portal ? { x: 0, y: 0 } : parentOrigin;
    const clip = portal ? layout.viewport : inheritedClip;
    const layer = portal ? inheritedLayer + 1 : inheritedLayer;
    const bounds: CellRect = {
      x: portal ? widget.overlayPosition!.x : origin.x + layoutEntry.rect.x,
      y: portal ? widget.overlayPosition!.y : origin.y + layoutEntry.rect.y,
      width: layoutEntry.rect.width,
      height: layoutEntry.rect.height,
    };
    const contentBounds: CellRect = {
      x: bounds.x + layoutEntry.contentRect.x,
      y: bounds.y + layoutEntry.contentRect.y,
      width: layoutEntry.contentRect.width,
      height: layoutEntry.contentRect.height,
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
    const outerClip = intersectCellRects(clip, bounds);
    const scrollMetrics = scrollMetricsFor(tree, layout, id, contentBounds);
    const contentClip = intersectCellRects(outerClip, scrollMetrics?.viewport ?? contentBounds);
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
    const childOrigin = widget.kind === "scroll-area"
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
  return { viewport: layout.viewport, entries, paintList };
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
      ? contains(entry.hitBounds, point) && contains(entry.outerClip, point)
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
  const part = metrics?.horizontalTrack && contains(metrics.horizontalTrack, point)
    ? "scrollbar-x"
    : metrics?.verticalTrack && contains(metrics.verticalTrack, point)
      ? "scrollbar-y"
      : metrics?.corner && contains(metrics.corner, point)
        ? "scrollbar-corner"
        : contains(entry.contentBounds, point)
          ? "content"
          : "chrome";
  return { ownerId, part, point };
};
