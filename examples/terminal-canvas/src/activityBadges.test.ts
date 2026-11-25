import { expect, test } from 'bun:test';
import { intersectCellRects } from '@chardesk/cell-core';
import { activityBadges } from '../../../packages/terminal/src/activityBadges.ts';

test('activity badges point in eight directions, stay at the viewport edge and target actual cells', () => {
  const viewport = { x: 0, y: 0, width: 40, height: 18 };
  for (const [x, y, arrow] of [
    [-10, 6, '←'],
    [100, 6, '→'],
    [10, -10, '↑'],
    [10, 100, '↓'],
    [-10, -10, '↖'],
    [100, -10, '↗'],
    [-10, 100, '↙'],
    [100, 100, '↘'],
  ] as const) {
    const bounds = { x, y, width: 2, height: 2 };
    const badge = activityBadges([{ id: 'one', bounds }], viewport)[0]!;
    expect(badge.label).toBe(`${arrow} ●`);
    expect(badge.x).toBeGreaterThanOrEqual(0);
    expect(badge.x + badge.width).toBeLessThanOrEqual(viewport.width);
    expect(badge.y).toBeGreaterThanOrEqual(0);
    expect(badge.y + badge.height).toBeLessThanOrEqual(viewport.height);
    expect(
      badge.x === 0 ||
        badge.x + 3 === viewport.width ||
        badge.y === 0 ||
        badge.y + 1 === viewport.height
    ).toBe(true);
    expect(intersectCellRects(bounds, { ...badge.target, width: 1, height: 1 })).not.toBeNull();
  }
  expect(
    activityBadges([{ id: 'visible', bounds: { x: 39, y: 3, width: 10, height: 2 } }], viewport)
  ).toEqual([]);
});

test('edge placement separates peers and avoids occupied overlays without moving the canvas', () => {
  const viewport = { x: -20, y: -15, width: 40, height: 18 };
  const blocked = { x: 30, y: 2, width: 10, height: 8 };
  const locations = Array.from({ length: 8 }, (_, id) => ({
    id: String(id),
    bounds: { x: 100, y: -8, width: 3, height: 3 },
  }));
  const badges = activityBadges(locations, viewport, (rect) =>
    Boolean(intersectCellRects(rect, blocked))
  );
  expect(badges).toHaveLength(8);
  for (const [index, badge] of badges.entries()) {
    expect(intersectCellRects(badge, blocked)).toBeNull();
    for (const other of badges.slice(index + 1))
      expect(intersectCellRects(badge, other)).toBeNull();
  }
  expect(activityBadges(locations, viewport, () => true)).toEqual([]);
  expect(activityBadges(locations, { ...viewport, width: 2 })).toEqual([]);
  expect(activityBadges(locations, { ...viewport, width: 3, height: 1 })).toHaveLength(1);
});

test('large distant regions select a nearby in-region target without enumerating world cells', () => {
  const viewport = { x: -1_000_000, y: -1_000_000, width: 80, height: 24 };
  const bounds = { x: 1_000_000, y: -2_000_000, width: 1_000_000, height: 3_000_000 };
  const badge = activityBadges([{ id: 'large', bounds }], viewport)[0]!;
  expect(badge.label).toBe('→ ●');
  expect(badge.target.x).toBe(bounds.x);
  expect(badge.target.y).toBeGreaterThanOrEqual(viewport.y);
  expect(badge.target.y).toBeLessThan(viewport.y + viewport.height);
});
