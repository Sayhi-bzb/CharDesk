import { describe, expect, it, vi } from 'vitest';
import { createGridSurfaceReader } from '@chardesk/cell-plane';
import type { GridCell } from '@chardesk/cell-plane';
import { parseCanvasReadRequest, readCanvasSurface } from '@chardesk/canvas-capabilities/read';
import {
  CANVAS_READ_IMAGE_LIMITS,
  captureCanvasReadImage,
} from '@chardesk/canvas-capabilities/readImage';

const palette = { color: '#eeeeee', background: '#111111' };
const source = () =>
  createGridSurfaceReader(
    new Map<string, GridCell>([
      ['-2,-1', { char: '🦀', color: '#000000', bgColor: '#123456', attrs: { bold: true } }],
      ['0,-1', { char: '界', color: '#ff0000' }],
    ])
  );
const request = (input: Record<string, unknown>) => parseCanvasReadRequest(input)!;
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]);

describe('shared Canvas read pipeline', () => {
  it('validates one contract without coercing malformed options', () => {
    expect(parseCanvasReadRequest({})).toMatchObject({
      representation: 'text',
      style: 'none',
      detail: 'auto',
    });
    for (const input of [
      { representation: ['text'] },
      { detail: ['low'] },
      { style: null },
      { viewport: [Number.MAX_SAFE_INTEGER, 0, 1, 1] },
      { unknown: true },
    ])
      expect(parseCanvasReadRequest(input)).toBeNull();
  });

  it('shares content blocks and metadata while skipping raster work for text and cells', async () => {
    const renderImage = vi.fn(async () => png);
    const surface = source();
    const host = {
      theme: 'dark' as const,
      palette,
      renderImage,
      target: { canvasId: 'a', pageId: 'page' },
    };
    const text = await readCanvasSurface(surface, request({ style: 'appearance' }), host);
    expect(text).toMatchObject({
      appearance: {
        theme: 'dark',
        regions: [
          { bounds: [-2, -1, 2, 1], style: { color: '#000000', bgColor: '#123456' } },
          { bounds: [0, -1, 2, 1], style: { color: '#ff0000' } },
        ],
      },
      image: null,
      contentBlocks: [{ type: 'text' }],
    });
    const cells = await readCanvasSurface(surface, request({ representation: 'cells' }), host);
    expect(cells.cells).toMatchObject([
      { x: -2, y: -1, char: '🦀', attrs: { bold: true } },
      { x: 0, y: -1, char: '界' },
    ]);
    expect(cells.content).toBe('');
    expect(renderImage).not.toHaveBeenCalled();
    const both = await readCanvasSurface(
      surface,
      request({ representation: 'both', detail: 'low' }),
      host
    );
    expect(renderImage).toHaveBeenCalledOnce();
    expect(both.content).toContain('🦀界');
    expect(both.contentBlocks.map(({ type }) => type)).toEqual(['text', 'image']);
    expect(both).toMatchObject({
      canvasId: 'a',
      pageId: 'page',
      image: { mimeType: 'image/png', width: 36, height: 20, scale: 1 },
    });
    expect(both.structuredContent).not.toHaveProperty('contentBlocks');
    expect(both.structuredContent).not.toHaveProperty('data');
  });

  it('captures wide-cell owners, attributes and palette before asynchronous host work', async () => {
    const surface = source();
    const plan = captureCanvasReadImage(surface, [-1, -1, 3, 1], 'low', palette);
    expect(plan.entries[0]).toMatchObject({
      x: -9,
      y: 0,
      cell: { text: '🦀', width: 2, color: '#000000', bgColor: '#123456', attrs: { bold: true } },
    });
    expect(plan.entries[1]).toMatchObject({ x: 9, cell: { text: '界', color: '#ff0000' } });
    expect([plan.width, plan.height]).toEqual([27, 20]);
    let resume!: (bytes: Uint8Array) => void;
    let captured = plan;
    const pending = readCanvasSurface(surface, request({ representation: 'both' }), {
      theme: 'dark',
      palette,
      renderImage: (next) => {
        captured = next;
        return new Promise((resolve) => {
          resume = resolve;
        });
      },
    });
    delete surface.get({ x: -2, y: -1 })!.attrs!.bold;
    resume(png);
    const result = await pending;
    expect(captured.entries[0].cell.attrs?.bold).toBe(true);
    expect(result.content).toContain('🦀界');
  });

  it('caps large sparse viewports before allocation and retains text when raster fails or exceeds budget', async () => {
    const surface = source();
    const plan = captureCanvasReadImage(
      surface,
      [-100, -100, 1_000_000_000, 1_000_000_000],
      'original',
      palette
    );
    expect(plan.width).toBeLessThanOrEqual(CANVAS_READ_IMAGE_LIMITS.edge);
    expect(plan.height).toBeLessThanOrEqual(CANVAS_READ_IMAGE_LIMITS.edge);
    expect(plan.width * plan.height).toBeLessThanOrEqual(CANVAS_READ_IMAGE_LIMITS.pixels);
    expect(plan.entries).toHaveLength(2);
    for (const renderImage of [
      async () => null,
      async () => {
        throw new Error('Host unavailable');
      },
      async () => new Uint8Array(CANVAS_READ_IMAGE_LIMITS.bytes + 1),
    ]) {
      const result = await readCanvasSurface(surface, request({ representation: 'both' }), {
        theme: 'dark',
        palette,
        renderImage,
      });
      expect(result.image).toBeNull();
      expect(result.content).toContain('🦀界');
      expect(result.contentBlocks.map(({ type }) => type)).toEqual(['text', 'note']);
    }
    const renderImage = vi.fn(async () => png);
    const empty = await readCanvasSurface(
      createGridSurfaceReader(new Map()),
      request({ representation: 'image' }),
      { theme: 'dark', palette, renderImage }
    );
    expect(empty.viewport).toBeNull();
    expect(empty.contentBlocks).toMatchObject([
      { type: 'note', text: expect.stringContaining('No Canvas content') },
    ]);
    expect(renderImage).not.toHaveBeenCalled();
  });

  it('budgets the complete response including text, appearance and base64 overhead', async () => {
    const result = await readCanvasSurface(
      source(),
      request({ representation: 'both', style: 'appearance' }),
      {
        theme: 'dark',
        palette,
        renderingNote: 'context '.repeat(20_000),
        renderImage: async () => new Uint8Array(CANVAS_READ_IMAGE_LIMITS.bytes),
      }
    );
    expect(result.image).toBeNull();
    expect(result.structuredContent.image).toBeNull();
    expect(result.content).toContain('🦀界');
    expect(result.contentBlocks.at(-1)).toMatchObject({
      type: 'note',
      text: expect.stringContaining('response budget'),
    });
    expect(new TextEncoder().encode(JSON.stringify(result)).length).toBeLessThan(
      CANVAS_READ_IMAGE_LIMITS.responseBytes
    );
  });
});
