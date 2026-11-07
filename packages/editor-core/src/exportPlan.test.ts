import { describe, it, expect } from 'vitest';
import { createGridMapSource } from '@chardesk/cell-plane/grid-source';
import type { GridCell } from '@chardesk/cell-plane/types';
import {
  captureCanvasExport,
  prepareCanvasTextExport,
  resolveExportRasterLayout,
} from './exportPlan.js';
import { parseCanvasDocument } from './documentText.js';

describe('shared export preparation', () => {
  it('captures whole wide glyphs, excludes range holes and isolates later edits', () => {
    const grid = new Map<string, GridCell>([
      [
        '-3,2',
        { char: '🦀', color: '#ff0000', attrs: { bold: true }, href: 'https://example.com' },
      ],
      ['0,2', { char: 'X', color: '#000000' }],
      ['2,2', { char: '界', color: '#00ff00', bgColor: '#112233' }],
    ]);
    const snapshot = captureCanvasExport(createGridMapSource(grid), [
      { start: { x: -2, y: 2 }, end: { x: -2, y: 2 } },
      { start: { x: 3, y: 2 }, end: { x: 3, y: 2 } },
    ]);
    expect(snapshot.bounds).toEqual({ x: -3, y: 2, width: 7, height: 1 });
    expect([...snapshot.cells.keys()]).toEqual(['-3,2', '2,2']);
    expect(
      captureCanvasExport(
        createGridMapSource(grid),
        [
          { start: { x: -2, y: 2 }, end: { x: -2, y: 2 } },
          { start: { x: 3, y: 2 }, end: { x: 3, y: 2 } },
        ],
        'envelope'
      ).source.get({ x: 0, y: 2 })?.char
    ).toBe('X');
    grid.get('-3,2')!.attrs!.bold = undefined;
    grid.delete('2,2');
    const content = prepareCanvasTextExport({ snapshot, format: 'chardesk' });
    const page = parseCanvasDocument(content).document.pages[0]!;
    expect(new Map(page.grid).get('-3,2')).toMatchObject({
      char: '🦀',
      attrs: { bold: true },
      href: 'https://example.com',
    });
    expect(new Map(page.grid).get('0,2')?.char).not.toBe('X');
    expect(prepareCanvasTextExport({ snapshot, format: 'txt' })).toBe('🦀   界');
    expect(prepareCanvasTextExport({ snapshot, format: 'ansi' })).toContain('\u001b[');
  });

  it('preserves complete native documents and protects dense formats from sparse extents', () => {
    const grid = new Map<string, GridCell>([
      ['0,0', { char: 'A', color: '#000000' }],
      ['0,1000000000', { char: 'B', color: '#000000' }],
    ]);
    const snapshot = captureCanvasExport(createGridMapSource(grid));
    const document = {
      id: 'test',
      mode: 'freeform' as const,
      activePageId: 'page',
      pages: [
        { id: 'page', kind: 'cell-plane' as const, grid: [...grid] },
        {
          id: 'other',
          kind: 'cell-plane' as const,
          grid: [['2,3', { char: 'Z', color: '#000000' }]] as [string, GridCell][],
        },
      ],
    };
    const source = prepareCanvasTextExport({ snapshot, document, format: 'chardesk' });
    expect(parseCanvasDocument(source).document).toEqual(document);
    expect(() => prepareCanvasTextExport({ snapshot, format: 'txt' })).toThrow(/too large/);
    expect(() => resolveExportRasterLayout(5, snapshot.bounds.height, 9, 20)).toThrow(
      'image-too-large'
    );
    expect(() =>
      captureCanvasExport(snapshot.source, [
        { start: { x: 0, y: 0 }, end: { x: 0, y: 1000000000 } },
      ])
    ).toThrow(/too large/);
    expect(resolveExportRasterLayout(400, 200, 9, 20).scale).toBe(1);
  });

  it('exports a selected anchor branch without dangling parents and keeps empty documents serializable', () => {
    const source = createGridMapSource(
      new Map<string, GridCell>([
        ['0,0', { char: 'A', color: '#000000' }],
        ['2,0', { char: 'B', color: '#000000' }],
      ])
    );
    const parent = {
      id: 'parent',
      point: { x: 0, y: 0 },
      label: 'A',
      order: 0,
      parentId: null,
      detached: false,
    };
    const child = {
      id: 'child',
      point: { x: 2, y: 0 },
      label: 'B',
      order: 1,
      parentId: 'parent',
      detached: false,
    };
    const document = {
      id: 'doc',
      mode: 'freeform' as const,
      activePageId: 'page',
      pages: [{ id: 'page', kind: 'cell-plane' as const, anchors: [parent, child] }],
    };
    const snapshot = captureCanvasExport(source, [{ start: child.point, end: child.point }]);
    const result = parseCanvasDocument(
      prepareCanvasTextExport({ snapshot, document, format: 'chardesk' })
    );
    expect(result.document.pages[0]!.anchors).toEqual([{ ...child, parentId: null }]);
    expect(child.parentId).toBe('parent');
    const empty = captureCanvasExport(createGridMapSource(new Map()));
    expect(prepareCanvasTextExport({ snapshot: empty, format: 'txt' })).toBe('');
    expect(
      parseCanvasDocument(
        prepareCanvasTextExport({
          snapshot: empty,
          document: { ...document, pages: [{ id: 'page', kind: 'cell-plane', grid: [] }] },
          format: 'chardesk',
        })
      ).document.pages[0]!.grid
    ).toEqual([]);
    expect(() => resolveExportRasterLayout(0.5, 1, 9, 20)).toThrow('image-too-large');
  });
});
