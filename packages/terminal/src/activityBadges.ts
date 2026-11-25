import { intersectCellRects, type CellRect } from '@chardesk/cell-core';

export type ActivityLocation = { id: string; bounds: CellRect };
export type ActivityBadge = CellRect & {
  id: string;
  label: string;
  target: { x: number; y: number };
};
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

export function activityBadges(
  locations: readonly ActivityLocation[],
  viewport: CellRect,
  blocked: (rect: CellRect) => boolean = () => false
): ActivityBadge[] {
  if (viewport.width < 3 || viewport.height < 1) return [];
  const badges: ActivityBadge[] = [];
  const halfX = (viewport.width - 3) / 2,
    halfY = (viewport.height - 1) / 2;
  const center = { x: viewport.x + (viewport.width - 1) / 2, y: viewport.y + halfY };
  for (const { id, bounds } of locations) {
    if (intersectCellRects(bounds, viewport)) continue;
    const target = {
      x: Math.floor(
        bounds.width <= viewport.width
          ? bounds.x + bounds.width / 2
          : clamp(center.x, bounds.x, bounds.x + bounds.width - 1)
      ),
      y: Math.floor(
        bounds.height <= viewport.height
          ? bounds.y + bounds.height / 2
          : clamp(center.y, bounds.y, bounds.y + bounds.height - 1)
      ),
    };
    const dx = target.x - center.x,
      dy = target.y - center.y;
    const horizontal = Math.abs(dx) / Math.max(0.5, halfX),
      vertical = Math.abs(dy) / Math.max(0.5, halfY);
    const scale = 1 / Math.max(horizontal, vertical);
    const x = clamp(Math.round(halfX + dx * scale), 0, viewport.width - 3);
    const y = clamp(Math.round(halfY + dy * scale), 0, viewport.height - 1);
    const sideX =
      bounds.x + bounds.width <= viewport.x ? -1 : bounds.x >= viewport.x + viewport.width ? 1 : 0;
    const sideY =
      bounds.y + bounds.height <= viewport.y
        ? -1
        : bounds.y >= viewport.y + viewport.height
          ? 1
          : 0;
    const arrow =
      sideY < 0
        ? sideX < 0
          ? '↖'
          : sideX > 0
            ? '↗'
            : '↑'
        : sideY > 0
          ? sideX < 0
            ? '↙'
            : sideX > 0
              ? '↘'
              : '↓'
          : sideX < 0
            ? '←'
            : '→';
    const alongY = horizontal >= vertical;
    const limit = alongY ? viewport.height : Math.ceil(viewport.width / 4);
    for (let attempt = 0; attempt < limit * 2; attempt++) {
      const offset = Math.ceil(attempt / 2) * (attempt % 2 ? 1 : -1);
      const position = {
        x: alongY ? x : x + offset * 4,
        y: alongY ? y + offset : y,
        width: 3,
        height: 1,
      };
      if (
        position.x < 0 ||
        position.x + 3 > viewport.width ||
        position.y < 0 ||
        position.y >= viewport.height
      )
        continue;
      if (blocked(position) || badges.some((badge) => intersectCellRects(badge, position)))
        continue;
      badges.push({ ...position, id, label: `${arrow} ●`, target });
      break;
    }
  }
  return badges;
}
