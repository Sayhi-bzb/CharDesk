import { intersectCellRects } from "@chardesk/cell-core";
import type { CellRect, SceneEntry, SceneSnapshot, WidgetId } from "./types.js";
import { sameWidgetValue } from "./widget-change.js";

const sameRect = (left: CellRect, right: CellRect): boolean =>
  left.x === right.x && left.y === right.y && left.width === right.width && left.height === right.height;

const sameSceneEntry = (left: SceneEntry, right: SceneEntry): boolean =>
  left.sceneParentId === right.sceneParentId
  && left.eventParentId === right.eventParentId
  && sameRect(left.layoutBounds, right.layoutBounds)
  && sameRect(left.decorationBounds, right.decorationBounds)
  && sameRect(left.contentBounds, right.contentBounds)
  && sameRect(left.paintBounds, right.paintBounds)
  && sameRect(left.hitBounds, right.hitBounds)
  && sameRect(left.outerClip, right.outerClip)
  && sameRect(left.contentClip, right.contentClip)
  && sameWidgetValue(left.scrollMetrics, right.scrollMetrics)
  && left.layer === right.layer
  && left.paintOrder === right.paintOrder
  && left.paintVisible === right.paintVisible;

export const changedSceneIds = (previous: SceneSnapshot, next: SceneSnapshot): Set<WidgetId> => {
  const changed = new Set<WidgetId>();
  for (const [id, entry] of next.entries) {
    const before = previous.entries.get(id);
    if (before !== entry && (!before || !sameSceneEntry(before, entry))) changed.add(id);
  }
  for (const id of previous.entries.keys()) if (!next.entries.has(id)) changed.add(id);
  return changed;
};

export const damagedRegions = (
  ids: Iterable<WidgetId>,
  previous: SceneSnapshot,
  next: SceneSnapshot,
): readonly CellRect[] => {
  const regions: CellRect[] = [];
  const keys = new Set<string>();
  for (const id of ids) {
    for (const entry of [previous.entries.get(id), next.entries.get(id)]) {
      if (!entry) continue;
      const region = intersectCellRects(entry.paintBounds, next.overlayViewport);
      if (!region) continue;
      const key = `${region.x}:${region.y}:${region.width}:${region.height}`;
      if (!keys.has(key)) {
        keys.add(key);
        regions.push(region);
      }
    }
  }
  return regions;
};

export const boundedDamage = (regions: readonly CellRect[], viewport: CellRect): readonly CellRect[] => {
  const expanded = regions.map((region) => {
    const left = Math.max(viewport.x, region.x - 1);
    const right = Math.min(viewport.x + viewport.width, region.x + region.width + 1);
    return { ...region, x: left, width: right - left };
  });
  const area = expanded.reduce((sum, region) => sum + region.width * region.height, 0);
  return expanded.length > 64 || area > viewport.width * viewport.height / 2 ? [viewport] : expanded;
};
