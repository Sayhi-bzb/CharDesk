import { expect, test } from 'bun:test';
import type { CellPlaneOperation } from '@chardesk/cell-plane';
import type { CanvasMutationActivityEvent } from '@chardesk/local-runtime/agents';
import { MutationPresentation } from '../../../packages/terminal/src/mutationPresentation.ts';

const operation = (x: number, text: string, href?: string): CellPlaneOperation => ({
  id: text,
  bounds: { x: -2, y: 0, width: 40, height: 1 },
  rows: [{ y: 0, erase: [{ from: -2, to: 37 }], spans: [{ x, text, color: '#eeeeee', href }] }],
});
const event = (
  before: CellPlaneOperation,
  after: CellPlaneOperation,
  writtenCells = 4
): CanvasMutationActivityEvent => ({
  kind: 'write',
  canvasId: 'canvas',
  documentId: 'document',
  pageId: 'page',
  version: 'version',
  agent: { id: 'writer', name: 'Writer' },
  bounds: before.bounds,
  before,
  after,
  writtenCells,
});
const viewport = { x: 0, y: 0, width: 40, height: 4 };

test('overlapping old and new graphemes form one indivisible reveal unit', () => {
  const presentation = new MutationPresentation(
    event(operation(0, '🦀', 'https://old.example'), operation(0, 'AB', 'https://new.example')),
    viewport
  );
  expect(presentation.units).toBe(1);
  expect(presentation.group(1, 0, 1)).toMatchObject({ x: 0, width: 2 });
  const cells: Array<{ x: number; char: string; href?: string }> = [];
  presentation.visit((x, _y, cell) => cells.push({ x, char: cell.char, href: cell.href }));
  expect(cells).toEqual([{ x: 0, char: '🦀', href: undefined }]);
  presentation.visible = 1;
  cells.length = 0;
  presentation.visit((x, _y, cell) => cells.push({ x, char: cell.char, href: cell.href }));
  expect(cells).toEqual([
    { x: 0, char: 'A', href: 'https://new.example' },
    { x: 1, char: 'B', href: 'https://new.example' },
  ]);
});

test('wide glyphs at the left viewport boundary and ZWJ emoji stay whole', () => {
  const presentation = new MutationPresentation(
    event(operation(-1, ''), operation(-1, '🦀👨‍👩‍👧‍👦界')),
    viewport
  );
  expect(presentation.units).toBe(3);
  expect(presentation.group(0, 0, 1)).toMatchObject({ x: -1, width: 2, unit: 0 });
  expect(presentation.group(2, 0, 1)).toMatchObject({ x: 1, width: 2, unit: 1 });
  presentation.visible = 2;
  const chars: string[] = [];
  presentation.visit((_x, _y, cell) => chars.push(cell.char));
  expect(chars).toEqual(['🦀', '👨‍👩‍👧‍👦']);
});

test('offscreen writes and oversized views avoid materializing a presentation', () => {
  const change = event(operation(500, ''), operation(500, 'far'));
  expect(new MutationPresentation(change, viewport).units).toBe(0);
  expect(new MutationPresentation(change, { x: 0, y: 0, width: 1000, height: 1000 }).units).toBe(0);
});

test('the read camera cell budget is the inclusive character-to-line boundary', () => {
  const before = operation(0, '');
  const after = operation(0, 'text');
  expect(new MutationPresentation(event(before, after, 4000), viewport).mode).toBe('character');
  expect(new MutationPresentation(event(before, after, 4001), viewport).mode).toBe('line');
});

test('forward render payloads do not animate unchanged glyphs outside the inverse footprint', () => {
  const before: CellPlaneOperation = {
    id: 'inverse',
    bounds: { x: 5, y: 0, width: 1, height: 1 },
    rows: [{ y: 0, erase: [], spans: [{ x: 5, text: 'A', color: '#eeeeee' }] }],
  };
  const presentation = new MutationPresentation(
    { ...event(before, operation(0, 'KEEP B')), kind: 'render' },
    viewport
  );
  expect(presentation.units).toBe(1);
  expect(presentation.group(0, 0, 1)).toBeUndefined();
  expect(presentation.feedback).toBeNull();
  presentation.visible = 1;
  expect(presentation.feedback).toEqual({ x: 5, y: 0, width: 1, height: 1 });
});

test('line feedback bridges sparse spaces and moves with changed rows; erase runs bottom-up', () => {
  const make = (first: string, second: string): CellPlaneOperation => ({
    id: first,
    bounds: { x: 0, y: 0, width: 6, height: 2 },
    rows: [first, second].map((text, y) => ({
      y,
      erase: [{ from: 0, to: 5 }],
      spans: [
        { x: 0, text: text[0]!, color: '#eeeeee' },
        { x: 5, text: text[1]!, color: '#eeeeee' },
      ],
    })),
  });
  const before = make('AZ', 'BY');
  const render = new MutationPresentation(
    { ...event(before, make('CX', 'DW')), kind: 'render' },
    viewport
  );
  expect(render.units).toBe(2);
  expect(render.cursor).toBeNull();
  render.visible = 1;
  expect(render.feedback).toEqual({ x: 0, y: 0, width: 6, height: 1 });
  expect(render.group(2, 0, 1)).toBeUndefined();
  render.visible = 2;
  expect(render.feedback).toEqual({ x: 0, y: 1, width: 6, height: 1 });
  const erased: CellPlaneOperation = {
    id: 'erase',
    bounds: before.bounds,
    rows: [0, 1].map((y) => ({ y, erase: [{ from: 0, to: 5 }], spans: [] })),
  };
  const erase = new MutationPresentation({ ...event(before, erased), kind: 'erase' }, viewport);
  erase.visible = 1;
  expect(erase.feedback).toEqual({ x: 0, y: 1, width: 6, height: 1 });
  const remaining: number[] = [];
  erase.visit((_x, y) => remaining.push(y));
  expect(remaining).toEqual([0, 0]);
});
