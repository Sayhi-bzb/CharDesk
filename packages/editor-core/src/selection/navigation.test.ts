import { expect, test } from 'vitest';
import { createGridMapSource } from '@chardesk/cell-plane/grid-source';
import { resolveGridSlot } from '@chardesk/cell-plane/grid-occupancy';
import type { GridCell } from '@chardesk/cell-plane/types';
import { moveGridAddressToContentBoundary } from './static-grid.js';
import { FreeformEditorSession } from '../runtime.js';

test('sparse content jumps cross billion-cell gaps with work bounded by occupied anchors', () => {
  const source = createGridMapSource(
    new Map<string, GridCell>([
      ['0,0', { char: '界', color: '#000000' }],
      ['2,0', { char: 'A', color: '#000000' }],
      ['1000000000,0', { char: '🦀', color: '#000000' }],
      ['0,1000000000', { char: 'B', color: '#000000' }],
    ])
  );
  let reads = 0;
  const grid = {
    ...source,
    visit: source.visit.bind(source),
    getContentBounds: source.getContentBounds.bind(source),
    get: (point: { x: number; y: number }) => {
      reads++;
      return source.get(point);
    },
  };
  const jump = (x: number, y: number, edge: 'left' | 'right' | 'top' | 'bottom') =>
    moveGridAddressToContentBoundary({ grid, address: { x, y }, edge });
  expect(jump(0, 0, 'right')).toEqual({ x: 2, y: 0 });
  expect(jump(2, 0, 'right')).toEqual({ x: 1000000000, y: 0 });
  expect(jump(1000000000, 0, 'left')).toEqual({ x: 2, y: 0 });
  expect(jump(2, 0, 'left')).toEqual({ x: 0, y: 0 });
  expect(jump(0, 0, 'bottom')).toEqual({ x: 0, y: 1000000000 });
  expect(jump(0, 1000000000, 'top')).toEqual({ x: 0, y: 0 });
  expect(reads).toBeLessThan(30);
});

test('interval navigation matches slot-wise semantics for dense text, gaps, wide followers and fixed bounds', () => {
  const grid = createGridMapSource(
    new Map<string, GridCell>([
      ['-3,0', { char: '界', color: '#000000' }],
      ['-1,0', { char: 'A', color: '#000000' }],
      ['2,0', { char: 'B', color: '#000000' }],
      ['3,0', { char: '🦀', color: '#000000' }],
      ['2,-2', { char: '界', color: '#000000' }],
      ['2,-1', { char: 'C', color: '#000000' }],
      ['2,2', { char: ' ', color: '#000000', bgColor: '#ffffff' }],
      ['1,3', { char: '界', color: '#000000' }],
    ])
  );
  const fixedBounds = { start: { x: -6, y: -4 }, end: { x: 7, y: 5 } };
  for (const edge of ['left', 'right', 'top', 'bottom'] as const) {
    const dx = edge === 'left' ? -1 : Number(edge === 'right');
    const dy = edge === 'top' ? -1 : Number(edge === 'bottom');
    for (let x = -6; x <= 7; x++)
      for (let y = -4; y <= 5; y++) {
        const address = { x, y },
          cell = grid.get(address);
        let cursor = { x: x + dx, y: y + dy };
        if (dx > 0 && cell?.char.trim())
          cursor.x = x + (resolveGridSlot(grid, address)?.width ?? 1);
        const inside = (point: typeof cursor) =>
          point.x >= -6 && point.x <= 7 && point.y >= -4 && point.y <= 5;
        const occupied = (point: typeof cursor) =>
          Boolean(resolveGridSlot(grid, point)?.cell.char.trim());
        let expected = address;
        if (inside(cursor)) {
          const contiguous = occupied(cursor);
          if (contiguous) {
            while (inside(cursor) && occupied(cursor)) {
              expected = resolveGridSlot(grid, cursor)!.anchor;
              cursor = { x: cursor.x + dx, y: cursor.y + dy };
            }
          } else {
            while (inside(cursor) && !occupied(cursor))
              cursor = { x: cursor.x + dx, y: cursor.y + dy };
            if (inside(cursor)) expected = resolveGridSlot(grid, cursor)!.anchor;
            else if (dx) expected = { x: dx < 0 ? -6 : 7, y };
            else expected = { x, y: dy < 0 ? -4 : 5 };
          }
        }
        expect(moveGridAddressToContentBoundary({ grid, address, edge, fixedBounds })).toEqual(
          expected
        );
      }
  }
});

test('Session rows, columns, edge extension and page movement retain history and reveal the moving extent', () => {
  const model = new FreeformEditorSession('界AB\nC');
  try {
    const original = model.plane.materialize(),
      version = model.version;
    model.commands.pointAt({ x: 2, y: 0 });
    model.commands.selectRow();
    expect(model.selectionBounds).toMatchObject({ x: 0, y: 0, width: 4, height: 1 });
    model.commands.selectColumn();
    expect(model.selectionBounds).toMatchObject({ y: 0, height: 2 });
    model.commands.pointAt({ x: 0, y: 0 });
    model.commands.navigateToEdge('bottom-right', true);
    expect(model.selectionBounds).toMatchObject({ width: 4, height: 2 });
    model.resize(10, 5);
    model.commands.pointAt({ x: 0, y: 0 });
    model.commands.navigate(0, 30, true);
    expect(model.cursor).toEqual({ x: 0, y: 0 });
    expect(model.selection?.focus.y).toBe(30);
    expect(model.viewport.y + model.viewport.height).toBeGreaterThan(30);
    expect(model.plane.materialize()).toEqual(original);
    expect(model.version).toBe(version);
    expect(model.canUndo).toBe(false);
  } finally {
    model.dispose();
  }
});
