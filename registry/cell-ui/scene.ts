import { cellRectContainsPoint } from "@chardesk/cell-core";
import { placeAnchoredOverlay } from "./anchored-overlay.js";
import { clampScrollOffset, computeScrollMetrics, scrollOffsetFor } from "./scroll.js";
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
import { cellSliderThumbOffset, resolveCellSliderRange } from "./slider.js";

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
  contentBounds: CellRect,
  railBounds: CellRect,
): ScrollMetrics | null => {
  const node = tree.nodes.get(id);
  const entry = layout.entries.get(id);
  if (!node || !entry) return null;
  if (node.textEditor) {
    const visible = node.kind === "text-area";
    return computeScrollMetrics(contentBounds, measureCellText(node.textEditor), scrollOffsetFor(node),
      { x: visible, y: visible }, { railBounds });
  }
  if (node.kind !== "scroll-area" && node.kind !== "select-content" && node.kind !== "combobox-content") return null;
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
    if (childNode.kind === "scroll-area") return;
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
  const selectContent = node.kind === "select-content" || node.kind === "combobox-content";
  return computeScrollMetrics(
    contentBounds,
    {
      width: !selectContent && explicitHorizontalExtent ? extent.width : contentBounds.width,
      height: extent.height,
    },
    node.scrollOffset,
    { x: !selectContent && explicitHorizontalExtent, y: true },
    { fitWidth: selectContent || !explicitHorizontalExtent, railBounds,
      guard: node.sharedScrollGuard ? 1 : 0 },
  );
};

type ScrollSceneReuse = Readonly<{ previous: SceneSnapshot; roots: ReadonlySet<string> }>;

const composeSceneInternal = (
  tree: WidgetTree,
  layout: LayoutSnapshot,
  overlayViewport: CellRect,
  reuse?: ScrollSceneReuse,
): SceneSnapshot => {
  const entries = new Map<string, SceneEntry>();
  const paintList: string[] = [];
  if (!tree.rootId) return { viewport: layout.viewport, overlayViewport, entries, paintList };

  let traversalOrder = 0;
  const orders = new Map<string, number>();
  const deferredTooltips: string[] = [];
  const affectedAncestors = new Set<string>();
  if (reuse) for (const rootId of reuse.roots) {
    let id: string | null = rootId;
    while (id) {
      affectedAncestors.add(id);
      id = tree.nodes.get(id)?.parentId ?? null;
    }
  }
  const reuseSubtree = (id: string): void => {
    const previousEntry = reuse?.previous.entries.get(id);
    if (!previousEntry) return;
    entries.set(id, previousEntry);
    orders.set(id, traversalOrder++);
    if (previousEntry.paintVisible) paintList.push(id);
    for (const childId of tree.nodes.get(id)?.children ?? []) reuseSubtree(childId);
  };
  const scopedOverlayViewport = (id: string): CellRect => {
    let parentId = tree.nodes.get(id)?.parentId;
    while (parentId) {
      const parent = tree.nodes.get(parentId);
      const entry = entries.get(parentId);
      if (parent?.overlayScope && entry) return entry.contentBounds;
      parentId = parent?.parentId ?? null;
    }
    return overlayViewport;
  };
  const visit = (
    id: string,
    parentOrigin: CellPoint,
    inheritedClip: CellRect,
    inheritedLayer: number,
    deferred = false,
    dirtySubtree = false,
  ): void => {
    if (reuse && !dirtySubtree && !affectedAncestors.has(id)) {
      reuseSubtree(id);
      return;
    }
    const widget = tree.nodes.get(id);
    const layoutEntry = layout.entries.get(id);
    if (!widget || !layoutEntry) throw new Error(`Scene input is missing ${id}.`);
    if ((widget.kind === "accordion-content" || widget.kind === "select-content"
      || widget.kind === "combobox-content") && !widget.expanded) return;
    if (widget.hidden) return;
    if (widget.kind === "tooltip" && !deferred) {
      deferredTooltips.push(id);
      return;
    }
    if (widget.kind === "tooltip" && !widget.tooltipOpen) return;
    const portal = isPortalKind(widget.kind);
    const portalViewport = portal ? scopedOverlayViewport(id) : overlayViewport;
    const origin = portal ? { x: 0, y: 0 } : parentOrigin;
    const clip = portal ? portalViewport : inheritedClip;
    const layer = portal ? inheritedLayer + 1 : inheritedLayer;
    const dropdownContent = widget.kind === "select-content" || widget.kind === "combobox-content";
    const anchorKind = widget.kind === "combobox-content" ? "combobox-input" : "select-trigger";
    const selectAnchor = dropdownContent
      ? widget.parentId
        ? tree.nodes.get(widget.parentId)?.children
          .map((childId) => tree.nodes.get(childId))
          .find((child) => child?.kind === anchorKind)
        : undefined
      : undefined;
    const anchorBounds = selectAnchor ? entries.get(selectAnchor.id)?.layoutBounds : undefined;
    if (dropdownContent && !anchorBounds) {
      throw new TypeError("Dropdown content must follow its input or trigger.");
    }
    const selectPlacement = anchorBounds
      ? placeAnchoredOverlay(anchorBounds, layoutEntry.rect, portalViewport)
      : undefined;
    const tooltipAnchor = widget.kind === "tooltip" && widget.tooltipTargetId
      ? entries.get(widget.tooltipTargetId)
      : undefined;
    if (widget.kind === "tooltip" && (!tooltipAnchor || !tooltipAnchor.paintVisible)) return;
    const tooltipPlacement = tooltipAnchor
      ? placeAnchoredOverlay(tooltipAnchor.layoutBounds, layoutEntry.rect, portalViewport,
          { preferredSide: "above", gap: 0 })
      : undefined;
    if (tooltipPlacement && tooltipPlacement.bounds.height < (widget.frame === "bordered" ? 3 : 1)) return;
    const placement = tooltipPlacement ?? selectPlacement;
    const rangeSliderParent = widget.kind === "range-slider-thumb" && widget.parentId
      ? tree.nodes.get(widget.parentId)
      : undefined;
    const rangeSliderParentEntry = rangeSliderParent?.kind === "range-slider"
      ? entries.get(rangeSliderParent.id)
      : undefined;
    const rangeThumbX = rangeSliderParent && rangeSliderParentEntry
      ? rangeSliderParentEntry.decorationBounds.x + cellSliderThumbOffset(
          widget.sliderValue,
          rangeSliderParentEntry.decorationBounds.width,
          resolveCellSliderRange(
            rangeSliderParent.sliderMin,
            rangeSliderParent.sliderMax,
            rangeSliderParent.sliderStep,
          ),
        )
      : undefined;
    const bounds: CellRect = {
      x: rangeThumbX ?? (widget.kind === "overlay"
        ? widget.overlayPosition?.x !== undefined
          ? portalViewport.x + widget.overlayPosition.x
          : portalViewport.x + Math.max(0, Math.floor((portalViewport.width - layoutEntry.rect.width) / 2))
        : placement
          ? placement.bounds.x
          : origin.x + layoutEntry.rect.x),
      y: rangeSliderParentEntry?.decorationBounds.y ?? (widget.kind === "overlay"
        ? widget.overlayPosition?.y !== undefined
          ? portalViewport.y + widget.overlayPosition.y
          : portalViewport.y + Math.max(0, Math.floor((portalViewport.height - layoutEntry.rect.height) / 2))
        : placement
          ? placement.bounds.y
          : origin.y + layoutEntry.rect.y),
      width: placement?.bounds.width ?? layoutEntry.rect.width,
      height: placement?.bounds.height ?? layoutEntry.rect.height,
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
          + Math.max(layoutEntry.railInsets?.right ?? 0, widget.sharedScrollGuard ? 1 : 0)
      ),
      height: Math.max(
        0,
        bounds.height - layoutEntry.contentRect.y - contentBottomInset
          + Math.max(layoutEntry.railInsets?.bottom ?? 0, widget.sharedScrollGuard ? 1 : 0)
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
    const scrollMetrics = scrollMetricsFor(tree, layout, id, contentBounds, decorationBounds);
    const contentClip = intersectSceneRects(outerClip, scrollMetrics?.viewport ?? contentBounds);
    const entry: SceneEntry = {
      id,
      sceneParentId: portal ? tree.rootId : widget.parentId,
      eventParentId: widget.parentId,
      layoutBounds: bounds,
      decorationBounds,
      contentBounds,
      paintBounds: bounds,
      hitBounds: widget.kind === "tooltip"
        ? { ...bounds, width: 0, height: 0 }
        : widget.kind === "tab" && widget.tabsVariant === "underline"
        ? { ...bounds, height: Math.min(1, bounds.height) }
        : bounds,
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

    const childClip = widget.kind === "range-slider" ? outerClip : contentClip;
    const offset = scrollMetrics ? clampScrollOffset(widget.scrollOffset, scrollMetrics) : widget.scrollOffset;
    const childOrigin = widget.kind === "scroll-area" || dropdownContent
      ? {
          x: bounds.x - offset.x,
          y: bounds.y - offset.y,
        }
      : { x: bounds.x, y: bounds.y };
    for (const childId of widget.children) {
      visit(childId, childOrigin, childClip, layer, false, dirtySubtree || !!reuse?.roots.has(id));
    }
  };

  visit(tree.rootId, { x: 0, y: 0 }, layout.viewport, 0);
  for (const id of deferredTooltips) {
    const targetId = tree.nodes.get(id)?.tooltipTargetId;
    const target = targetId ? entries.get(targetId) : undefined;
    visit(id, { x: 0, y: 0 }, overlayViewport, target?.layer ?? 0, true);
  }
  paintList.sort((left, right) => {
    const leftEntry = entries.get(left)!;
    const rightEntry = entries.get(right)!;
    return leftEntry.layer - rightEntry.layer
      || orders.get(left)! - orders.get(right)!;
  });
  paintList.forEach((id, paintOrder) => {
    const entry = entries.get(id)!;
    if (entry.paintOrder !== paintOrder) entries.set(id, { ...entry, paintOrder });
  });
  return { viewport: layout.viewport, overlayViewport, entries, paintList };
};

export const composeScene = (
  tree: WidgetTree,
  layout: LayoutSnapshot,
  overlayViewport: CellRect = layout.viewport,
): SceneSnapshot => composeSceneInternal(tree, layout, overlayViewport);

/** Reuses scene entries outside scroll subtrees; callers must prove the frame is scroll-only. */
export const composeSceneForScroll = (
  tree: WidgetTree,
  layout: LayoutSnapshot,
  overlayViewport: CellRect,
  previous: SceneSnapshot,
  roots: ReadonlySet<string>,
): SceneSnapshot => composeSceneInternal(tree, layout, overlayViewport, { previous, roots });

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
