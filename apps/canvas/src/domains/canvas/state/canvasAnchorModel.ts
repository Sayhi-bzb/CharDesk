import type { GridCell, Point } from "@/shared/types";
import { getGridCellWidth } from "@/shared/utils/grid-occupancy";

export type CanvasAnchor = Readonly<{
  id: string;
  point: Point;
  label: string;
  order: number;
  parentId: string | null;
  detached: boolean;
}>;

export type CanvasAnchorChange = Readonly<{
  id: string;
  value: CanvasAnchor | null;
}>;

export type CanvasAnchorSeed = Readonly<{
  point: Point;
  label: string;
  level: number;
}>;

export const readCanvasAnchor = (value: unknown): CanvasAnchor | null => {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<CanvasAnchor>;
  if (
    typeof record.id !== "string" || !record.id ||
    !record.point ||
    !Number.isSafeInteger(record.point.x) ||
    !Number.isSafeInteger(record.point.y) ||
    typeof record.label !== "string" ||
    !Number.isFinite(record.order) ||
    (record.parentId != null && typeof record.parentId !== "string") ||
    typeof record.detached !== "boolean"
  ) return null;
  return {
    id: record.id,
    point: { x: record.point.x, y: record.point.y },
    label: record.label,
    order: record.order!,
    parentId: record.parentId || null,
    detached: record.detached,
  };
};

/** Read a bounded text run without treating markup characters as syntax. */
export const readCanvasAnchorLabel = (
  source: { get: (point: Point) => GridCell | undefined },
  point: Point
): string | null => {
  const first = source.get(point);
  if (!first?.char || first.char === " ") return null;
  let text = "";
  for (let x = point.x; x < point.x + 160;) {
    const cell = source.get({ x, y: point.y });
    if (!cell?.char) break;
    text += cell.char;
    x += getGridCellWidth(cell);
  }
  return text.trim() || null;
};

export const orderCanvasAnchors = (anchors: readonly CanvasAnchor[]): CanvasAnchor[] => {
  const sorted = [...anchors].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const byId = new Map(sorted.map((anchor) => [anchor.id, anchor]));
  const normalized = sorted.map((anchor) => {
    let parentId = anchor.parentId || null;
    const visited = new Set([anchor.id]);
    let depth = 0;
    let valid = parentId === anchor.parentId;
    while (parentId) {
      if (visited.has(parentId) || !byId.has(parentId) || depth === 2) {
        valid = false;
        break;
      }
      visited.add(parentId);
      parentId = byId.get(parentId)!.parentId;
      depth += 1;
    }
    return valid ? anchor : { ...anchor, parentId: null };
  });
  const children = new Map<string | null, CanvasAnchor[]>();
  for (const anchor of normalized) {
    const siblings = children.get(anchor.parentId) ?? [];
    siblings.push(anchor);
    children.set(anchor.parentId, siblings);
  }
  const ordered: CanvasAnchor[] = [];
  const visit = (parentId: string | null) => {
    for (const anchor of children.get(parentId) ?? []) {
      ordered.push(anchor);
      visit(anchor.id);
    }
  };
  visit(null);
  return ordered;
};

export const getCanvasAnchorDepth = (anchors: readonly CanvasAnchor[], id: string): number => {
  const byId = new Map(anchors.map((anchor) => [anchor.id, anchor]));
  let parentId = byId.get(id)?.parentId;
  let depth = 0;
  while (parentId) {
    depth += 1;
    parentId = byId.get(parentId)?.parentId ?? null;
  }
  return depth;
};

export const getCanvasAnchorBranchIds = (anchors: readonly CanvasAnchor[], id: string): string[] => {
  const children = new Map<string, string[]>();
  for (const anchor of anchors) {
    if (!anchor.parentId) continue;
    const siblings = children.get(anchor.parentId) ?? [];
    siblings.push(anchor.id);
    children.set(anchor.parentId, siblings);
  }
  const ids: string[] = [];
  const visit = (current: string) => {
    ids.push(current);
    for (const child of children.get(current) ?? []) visit(child);
  };
  if (anchors.some((anchor) => anchor.id === id)) visit(id);
  return ids;
};

/** Remove empty anchors while keeping surviving descendants in their visual order. */
export const removeCanvasAnchorsPromotingChildren = (
  anchors: readonly CanvasAnchor[],
  removedIds: ReadonlySet<string>
): CanvasAnchorChange[] => {
  if (removedIds.size === 0) return [];
  const ordered = orderCanvasAnchors(anchors);
  const byId = new Map(ordered.map((anchor) => [anchor.id, anchor]));
  const changes: CanvasAnchorChange[] = [];
  let order = 0;
  for (const anchor of ordered) {
    if (removedIds.has(anchor.id)) {
      changes.push({ id: anchor.id, value: null });
      continue;
    }
    let parentId = anchor.parentId;
    while (parentId && removedIds.has(parentId)) {
      parentId = byId.get(parentId)?.parentId ?? null;
    }
    const next = { ...anchor, parentId, order: order++ };
    if (anchor.parentId !== next.parentId || anchor.order !== next.order) {
      changes.push({ id: anchor.id, value: next });
    }
  }
  return changes;
};

/** siblingIndex is measured after removing the moving branch. */
export const moveCanvasAnchor = (
  anchors: readonly CanvasAnchor[],
  id: string,
  parentId: string | null,
  siblingIndex: number
): CanvasAnchor[] | null => {
  const ordered = orderCanvasAnchors(anchors);
  const byId = new Map(ordered.map((anchor) => [anchor.id, anchor]));
  const anchor = byId.get(id);
  if (!anchor || (parentId && !byId.has(parentId))) return null;
  const branchIds = getCanvasAnchorBranchIds(ordered, id);
  if (parentId && branchIds.includes(parentId)) return null;
  const branchDepth = Math.max(...branchIds.map((branchId) =>
    getCanvasAnchorDepth(ordered, branchId) - getCanvasAnchorDepth(ordered, id)
  ));
  if ((parentId ? getCanvasAnchorDepth(ordered, parentId) + 1 : 0) + branchDepth > 2) {
    return null;
  }
  const children = new Map<string | null, string[]>();
  for (const item of ordered) {
    const siblings = children.get(item.parentId) ?? [];
    siblings.push(item.id);
    children.set(item.parentId, siblings);
  }
  children.set(anchor.parentId, children.get(anchor.parentId)!.filter((itemId) => itemId !== id));
  const destination = children.get(parentId) ?? [];
  if (!Number.isInteger(siblingIndex) || siblingIndex < 0 || siblingIndex > destination.length) {
    return null;
  }
  destination.splice(siblingIndex, 0, id);
  children.set(parentId, destination);
  const moved = new Map(byId);
  moved.set(id, { ...anchor, parentId });
  const result: CanvasAnchor[] = [];
  const visit = (currentParent: string | null) => {
    for (const childId of children.get(currentParent) ?? []) {
      result.push({ ...moved.get(childId)!, order: result.length });
      visit(childId);
    }
  };
  visit(null);
  return result;
};
