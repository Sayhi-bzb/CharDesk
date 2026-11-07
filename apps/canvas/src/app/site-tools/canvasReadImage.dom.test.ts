import { afterEach, expect, it, vi } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import { createCanvas } from '@napi-rs/canvas';
import { createGridSurfaceReader } from '@chardesk/cell-plane';
import { captureCanvasReadImage } from '@chardesk/canvas-capabilities/readImage';
import { renderBrowserReadImage } from './canvasReadImage';
import { loadCharDeskCanvasFonts } from '@chardesk/rendering/canvas';
import { toWebMcpTool } from './modelContext';

vi.mock('@chardesk/rendering/canvas', async (original) => ({
  ...(await original<typeof import('@chardesk/rendering/canvas')>()),
  loadCharDeskCanvasFonts: vi.fn(async () => ({ text: true, emoji: true })),
}));
afterEach(() => vi.restoreAllMocks());

it('browser encoding paints the shared plan and WebMCP preserves the image block', async () => {
  const plan = captureCanvasReadImage(
    createGridSurfaceReader(
      new Map([['0,0', { char: '▀', color: '#ff0000', bgColor: '#0000ff' }]])
    ),
    [0, 0, 1, 1],
    'low',
    { color: '#000000', background: '#ffffff' }
  );
  const native = createCanvas(plan.width, plan.height);
  const canvas = document.createElement('canvas');
  vi.spyOn(canvas, 'getContext').mockReturnValue(
    native.getContext('2d') as unknown as CanvasRenderingContext2D
  );
  vi.spyOn(canvas, 'toBlob').mockImplementation((callback) => {
    callback(new NodeBlob([native.toBuffer('image/png')]) as unknown as Blob);
  });
  const createElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) =>
    tag === 'canvas' ? canvas : createElement(tag)) as typeof document.createElement);
  const bytes = await renderBrowserReadImage(plan);
  expect([...bytes!.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const context = native.getContext('2d');
  expect([...context.getImageData(4, 2, 1, 1).data]).toEqual([255, 0, 0, 255]);
  expect([...context.getImageData(4, 18, 1, 1).data]).toEqual([0, 0, 255, 255]);
  expect(loadCharDeskCanvasFonts).toHaveBeenCalledOnce();
  const result = {
    contentBlocks: [
      {
        type: 'image',
        mimeType: 'image/png',
        data: Buffer.from(bytes!).toString('base64'),
        width: plan.width,
        height: plan.height,
        scale: plan.scale,
      },
    ],
  };
  const execute = vi.fn(async () => result);
  const web = toWebMcpTool(
    { name: 'canvas_read', description: 'Read', inputSchema: {}, execute },
    execute
  );
  expect(await web.execute({ representation: 'image' })).toBe(result);
});
