import { expect, test } from 'vitest';
import { CellPlaneIndex, cellPlanePatchToOperation } from './index.js';
import { exportToCharDesk } from './text.js';
import { parseCharDeskTextRows } from '@chardesk/protocol';
test('sparse updates invalidate resident chunks without walking the empty rectangle', () => {
  const operation = (id: string, text: string) =>
    cellPlanePatchToOperation(id, {
      rows: [0, 1_000_000].map((y) => ({
        y,
        erase: [],
        spans: [{ x: y, text, color: '#ffffff' }],
      })),
    })!;
  const plane = new CellPlaneIndex([operation('initial', 'A')]);
  try {
    expect(plane.get({ x: 0, y: 0 })?.char).toBe('A');
    expect(plane.get({ x: 1_000_000, y: 1_000_000 })?.char).toBe('A');
    expect(plane.getStats().cachedChunks).toBe(2);
    plane.append(operation('replace', 'B'));
    expect(plane.getStats().cachedChunks).toBe(0);
    expect(plane.get({ x: 0, y: 0 })?.char).toBe('B');
    expect(plane.get({ x: 1_000_000, y: 1_000_000 })?.char).toBe('B');
  } finally {
    plane.dispose();
  }
});
test('headless sparse projection and styled native export preserve Unicode', () => {
  const op = cellPlanePatchToOperation('test', {
    rows: [
      {
        y: -30,
        erase: [],
        spans: [{ x: -50, text: '界👩🏽‍💻', color: '#ff0000', href: 'https://example.com' }],
      },
    ],
  })!;
  const plane = new CellPlaneIndex([op]);
  try {
    expect(plane.getContentBounds()).toEqual({ x: -50, y: -30, width: 4, height: 1 });
    const text = exportToCharDesk(plane);
    const decoded = parseCharDeskTextRows(text, { syntax: 'ansi' });
    expect(decoded.diagnostics).toEqual([]);
    expect(decoded.rows[0]?.spans.map((s) => s.text).join('')).toBe('界👩🏽‍💻');
    expect(plane.get({ x: -50, y: -30 })?.href).toBe('https://example.com');
  } finally {
    plane.dispose();
  }
});

test('large-area visit uses the sparse chunk directory and never warms empty chunks', () => {
  const operation = cellPlanePatchToOperation('sparse-visit', {
    rows: [
      { y: -1000000000, erase: [], spans: [{ x: -1000000000, text: '界', color: '#000000' }] },
      { y: 1000000000, erase: [], spans: [{ x: 1000000000, text: '🦀', color: '#000000' }] },
    ],
  })!;
  const plane = new CellPlaneIndex([operation]);
  try {
    const cells: string[] = [];
    plane.visit(plane.getContentBounds()!, (x, y, cell) => cells.push(`${x},${y}:${cell.char}`));
    expect(cells.sort()).toEqual(['-1000000000,-1000000000:界', '1000000000,1000000000:🦀']);
    expect(plane.getStats().cachedChunks).toBeLessThanOrEqual(4);
    expect(plane.getStats().cachedCells).toBeLessThanOrEqual(4);
  } finally {
    plane.dispose();
  }
});
