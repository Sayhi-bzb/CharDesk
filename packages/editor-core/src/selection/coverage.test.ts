import { expect, test } from 'vitest';
import { FreeformEditorSession } from '../runtime.js';
import {
  resolveGridSelectionCoverage,
  getGridSelectionCoverageGeometry,
} from './grid-selection-geometry.js';

const point = (x: number, y = 0) => ({ x, y });

test('coverage preserves rowwise grapheme expansion without selecting holes in its envelope', () => {
  const session = new FreeformEditorSession('A界\nABC');
  try {
    const coverage = resolveGridSelectionCoverage(
      [{ start: point(1, 1), end: point(0) }],
      session.plane
    );
    expect(coverage.spans).toEqual([
      { y: 0, minX: 0, maxX: 2 },
      { y: 1, minX: 0, maxX: 1 },
    ]);
    expect(coverage.bounds).toEqual({ start: point(0), end: point(2, 1) });
    expect(coverage.contains(point(2))).toBe(true);
    expect(coverage.contains(point(2, 1))).toBe(false);
    expect(coverage.contains(point(-1))).toBe(false);
    expect(getGridSelectionCoverageGeometry(coverage).bounds).toEqual(coverage.bounds);
  } finally {
    session.dispose();
  }
});

test('coverage merges overlapping ranges but keeps disjoint gaps and negative coordinates', () => {
  const coverage = resolveGridSelectionCoverage([
    { start: point(-4, -2), end: point(-2, -2) },
    { start: point(-3, -2), end: point(-1, -2) },
    { start: point(2, -2), end: point(3, -2) },
  ]);
  expect(coverage.spans).toEqual([
    { y: -2, minX: -4, maxX: -1 },
    { y: -2, minX: 2, maxX: 3 },
  ]);
  expect(coverage.contains(point(0, -2))).toBe(false);
  expect(coverage.contains(point(-2, -2))).toBe(true);
  const empty = resolveGridSelectionCoverage([]);
  expect(empty.bounds).toBeNull();
  expect(empty.areas).toEqual([]);
  expect(empty.contains(point(0))).toBe(false);
  expect(getGridSelectionCoverageGeometry(empty)).toEqual({ bounds: null, polygons: [] });
});

test('replacement previews can shrink a range; only append previews retain earlier coverage', async () => {
  const { resolveGridSelectionPresentation } = await import('./presentation.js');
  const session = new FreeformEditorSession('ABCDE');
  try {
    const ranges = [{ start: point(0), end: point(4) }];
    const draggingRange = { start: point(0), end: point(2) };
    const replacement = resolveGridSelectionPresentation({
      source: session.plane,
      ranges,
      draggingRange,
    });
    const appended = resolveGridSelectionPresentation({
      source: session.plane,
      ranges,
      draggingRange: { ...draggingRange, append: true },
    });
    expect(replacement.phase).toBe('selecting');
    expect(replacement.coverage.contains(point(3))).toBe(false);
    expect(appended.coverage.contains(point(3))).toBe(true);
  } finally {
    session.dispose();
  }
});
