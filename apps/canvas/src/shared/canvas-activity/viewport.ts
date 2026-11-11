import type { ActivityRange } from './model';

export type ActivityViewport = { left: number; top: number; right: number; bottom: number };

/** A clipped Cell is not yet observed. Keep partial rows/columns pending. */
export const visibleActivityRanges = (ranges: readonly ActivityRange[], viewport: ActivityViewport): ActivityRange[] =>
  ranges.flatMap((range) => {
    const from = Math.max(range.from, Math.ceil(viewport.left));
    const to = Math.min(range.to, Math.floor(viewport.right));
    return range.y >= Math.ceil(viewport.top) && range.y + 1 <= viewport.bottom && to > from
      ? [{ y: range.y, from, to }] : [];
  });

/** Locate a real pending Cell, rather than the empty center of a sparse bounding box. */
export function nextActivityTarget(ranges: readonly ActivityRange[], viewport: ActivityViewport) {
  const x = (viewport.left + viewport.right) / 2;
  const y = (viewport.top + viewport.bottom) / 2;
  const candidates = ranges.flatMap((range) => {
    const seen = visibleActivityRanges([range], viewport)[0];
    if (!seen) return [{ x: Math.max(range.from, Math.min(range.to - 1, Math.floor(x))) + 0.5, y: range.y + 0.5 }];
    return [
      ...(seen.from > range.from ? [{ x: seen.from - 0.5, y: range.y + 0.5 }] : []),
      ...(seen.to < range.to ? [{ x: seen.to + 0.5, y: range.y + 0.5 }] : []),
    ];
  });
  return candidates.sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
}
