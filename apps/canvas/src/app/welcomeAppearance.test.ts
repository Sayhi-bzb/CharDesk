import { expect, test } from 'vitest';
import { buildDefaultDemoGrid } from '@chardesk/canvas-templates/welcome';
import { WelcomeAppearance } from '@chardesk/canvas-templates/welcome-appearance';
import { createGridSurfaceReader } from '@chardesk/cell-plane';
import { createGridMapSource } from '@chardesk/cell-plane/grid-source';
import { projectWelcomeSurface } from '@/shared/canvas-appearance/welcome';
import { createCanvasCellFrame } from '@/widgets/canvas-editor/rendering/canvasCellFrame';
import { createCanvasReadTool } from '@/app/site-tools/canvasTools';
import { createTextRenderingRuntime } from '@/domains/document/public';
import type { CanvasRuntime } from '@/domains/canvas/public';

test('Web and terminal adapters share exact Welcome colors for the same opaque palette', () => {
  const raw = createGridSurfaceReader(new Map(buildDefaultDemoGrid()));
  for (const palette of [
    { color: '#111', background: '#fff' },
    { color: 'rgb(238, 238, 238)', background: 'rgb(17, 17, 17)' },
  ]) {
    const web = projectWelcomeSurface(raw, palette);
    const dark = palette.color.startsWith('rgb');
    const terminal = new WelcomeAppearance(() => ({
      revision: 0,
      palette: dark
        ? { foreground: '#eeeeee', background: '#111111' }
        : { foreground: '#111111', background: '#ffffff' },
    })).project(raw);
    for (const at of [
      { x: 37, y: 2 },
      { x: 37, y: 3 },
      { x: 35, y: 1 },
      { x: 112, y: 8 },
    ])
      expect(web.get(at)).toEqual(terminal.get(at));
    const frame = createCanvasCellFrame(
      raw,
      { x: 0, y: 0, width: 150, height: 10 },
      'full',
      undefined,
      { ...palette, grid: '#888' }
    );
    expect(frame.source.get({ x: 37, y: 2 })?.visual.color).toBe(palette.color);
    expect(raw.get({ x: 37, y: 2 })?.color).toBe('#0f172a');
  }
});

test('Web range preview keeps Welcome styling after glyphs move outside their source coordinates', () => {
  const raw = createGridSurfaceReader(new Map(buildDefaultDemoGrid()));
  const cell = raw.get({ x: 37, y: 2 })!;
  const frame = createCanvasCellFrame(
    raw,
    { x: 0, y: 0, width: 150, height: 10 },
    'full',
    {
      hiddenSpans: [{ y: 2, minX: 37, maxX: 37 }],
      overlay: createGridMapSource(new Map([['42,4', cell]])),
    },
    { color: '#eeeeee', background: '#111111', grid: '#888888' }
  );
  expect(frame.source.get({ x: 42, y: 4 })?.visual.color).toBe('#eeeeee');
  expect(raw.get({ x: 37, y: 2 })?.color).toBe('#0f172a');
});

test('browser agent reads use the current host palette and the same Welcome projection as the canvas', async () => {
  const raw = createGridSurfaceReader(new Map(buildDefaultDemoGrid()));
  const palette = { color: '#eeeeee', background: '#111111' };
  const text = createTextRenderingRuntime({ storage: false });
  const canvas = {
    ready: Promise.resolve(),
    getState: () => ({ activeCanvasId: 'welcome' }) as ReturnType<CanvasRuntime['getState']>,
    materializeSession: async () => ({
      id: 'welcome',
      name: 'Welcome',
      mode: 'freeform' as const,
      surface: raw,
      slideDeck: null,
    }),
  };
  const read = createCanvasReadTool(canvas, {
    render: text.renderCompact,
    getProfile: text.getProfile,
    getContext: () => ({ themeMode: 'dark' }),
    getArtifactPalette: () => palette,
  });
  const reply = (await read.execute({ viewport: [37, 2, 15, 2], representation: 'cells' })) as {
    cells: Array<{ x: number; y: number; color: string }>;
  };
  const shown = projectWelcomeSurface(raw, palette);
  expect(reply.cells.find((cell) => cell.x === 37 && cell.y === 3)?.color).toBe(
    shown.get({ x: 37, y: 3 })!.color
  );
  expect(reply.cells.find((cell) => cell.x === 37 && cell.y === 2)?.color).toBe('#000000');
  expect(raw.get({ x: 37, y: 2 })!.color).toBe('#0f172a');
});
