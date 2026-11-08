import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CellPlaneIndex, type CellPlaneOperation } from '@/domains/canvas/public';
import { MinimapManager } from './MinimapManager';
import { buildDefaultDemoGrid } from '@chardesk/canvas-templates/welcome';
import { createGridSurfaceReader } from '@chardesk/cell-plane';
import { projectWelcomeSurface } from '@/shared/canvas-appearance/welcome';

class MockPath2D {
  rect = vi.fn();
}

const createContext = () => ({
  beginPath: vi.fn(),
  fill: vi.fn(),
  fillRect: vi.fn(),
  rect: vi.fn(),
  resetTransform: vi.fn(),
  roundRect: vi.fn(),
  setTransform: vi.fn(),
  stroke: vi.fn(),
  fillStyle: '',
  strokeStyle: '',
  globalAlpha: 1,
  lineWidth: 1,
});

const operation = (id: string, x: number): CellPlaneOperation => ({
  id,
  bounds: { x, y: 0, width: 1, height: 1 },
  rows: [
    {
      y: 0,
      erase: [],
      spans: [{ x, text: id, color: '#fff' }],
    },
  ],
});

const colors = {
  artifact: {
    background: 'background',
    color: 'foreground',
    grid: 'grid',
  },
  viewportFill: 'viewport-fill',
  viewportStroke: 'viewport-stroke',
};

describe('MinimapManager incremental content', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('Path2D', MockPath2D);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('rebuilds only chunks touched since the cached revision', () => {
    const canvas = document.createElement('canvas');
    const context = createContext();
    vi.spyOn(canvas, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
    const plane = new CellPlaneIndex([operation('A', 0)]);
    const rows = vi.spyOn(plane, 'rows');
    const manager = new MinimapManager(
      canvas,
      document.createElement('div'),
      { width: 220, height: 140 },
      4
    );
    const viewport = {
      reader: plane,
      offset: { x: 0, y: 0 },
      zoom: 1,
      viewportSize: { width: 1000, height: 700 },
    };
    manager.update({ colors, ...viewport, contentRevision: plane.getRevision() });
    rows.mockClear();

    plane.append(operation('B', 200));
    manager.update({ colors, ...viewport, contentRevision: plane.getRevision() });
    vi.advanceTimersByTime(160);

    expect(rows).toHaveBeenCalledTimes(1);
    expect(rows).toHaveBeenCalledWith({
      x: 128,
      y: 0,
      width: 128,
      height: 64,
    });
    manager.close();
  });

  it('accepts observer events before its first render snapshot', () => {
    let resize!: ResizeObserverCallback;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          resize = callback;
        }
        observe = vi.fn();
        disconnect = vi.fn();
      }
    );
    const canvas = document.createElement('canvas');
    const context = createContext();
    vi.spyOn(canvas, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
    const manager = new MinimapManager(
      canvas,
      document.createElement('div'),
      { width: 220, height: 140 },
      4
    );

    expect(() => resize([], {} as ResizeObserver)).not.toThrow();
    expect(context.fillRect).not.toHaveBeenCalled();

    const plane = new CellPlaneIndex([operation('A', 0)]);
    manager.update({
      colors,
      reader: plane,
      contentRevision: plane.getRevision(),
      offset: { x: 0, y: 0 },
      zoom: 1,
      viewportSize: { width: 1000, height: 700 },
    });

    expect(context.fillRect).toHaveBeenCalledOnce();
    manager.close();
  });

  it('uses shared colors for full, incremental and theme rebuilds', () => {
    const canvas = document.createElement('canvas');
    const context = createContext();
    const painted: string[] = [];
    context.fill.mockImplementation(() => {
      painted.push(context.fillStyle);
    });
    vi.spyOn(canvas, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
    const plane = new CellPlaneIndex([
      {
        id: 'colored',
        bounds: { x: 0, y: 0, width: 6, height: 1 },
        rows: [
          {
            y: 0,
            erase: [],
            spans: [
              { x: 0, text: '界', color: '#000000' },
              { x: 2, text: '🦀', color: '#dd2233' },
              { x: 4, text: ' ', color: '#ff0000', bgColor: '#112233' },
              { x: 5, text: ' ', color: '#ff0000' },
            ],
          },
        ],
      },
    ]);
    const manager = new MinimapManager(
      canvas,
      document.createElement('div'),
      { width: 220, height: 140 },
      4
    );
    const update = (foreground: string) =>
      manager.update({
        reader: plane,
        contentRevision: plane.getRevision(),
        offset: { x: 0, y: 0 },
        zoom: 1,
        viewportSize: { width: 1000, height: 700 },
        colors: { ...colors, artifact: { ...colors.artifact, color: foreground } },
      });
    try {
      update('#eeeeee');
      expect(painted).toEqual(expect.arrayContaining(['#eeeeee', '#dd2233', '#112233']));
      expect(painted).not.toContain('#ff0000');
      painted.length = 0;
      plane.append({
        id: 'recolor',
        bounds: { x: 2, y: 0, width: 2, height: 1 },
        rows: [{ y: 0, erase: [], spans: [{ x: 2, text: '🦀', color: '#22aa88' }] }],
      });
      update('#eeeeee');
      vi.advanceTimersByTime(160);
      expect(painted).toContain('#22aa88');
      expect(painted).not.toContain('#dd2233');
      painted.length = 0;
      update('#333333');
      expect(painted).toEqual(expect.arrayContaining(['#333333', '#22aa88', '#112233']));
    } finally {
      manager.close();
    }
  });
  it('reprojects Welcome immediately when only the host background changes', () => {
    const canvas = document.createElement('canvas');
    const context = createContext();
    const painted: string[] = [];
    context.fill.mockImplementation(() => painted.push(context.fillStyle));
    vi.spyOn(canvas, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
    const source = createGridSurfaceReader(new Map(buildDefaultDemoGrid()));
    const manager = new MinimapManager(canvas, document.createElement('div'), { width: 220, height: 140 }, 4);
    try {
      for (const [index, background] of ['#111111', '#333333'].entries()) {
        const artifact = { color: '#eeeeee', background, grid: '#777777' };
        const reader = projectWelcomeSurface(source, artifact);
        painted.length = 0;
        manager.update({ reader, contentRevision: index, offset: { x: 0, y: 0 }, zoom: 1,
          viewportSize: { width: 1000, height: 700 }, colors: { ...colors, artifact } });
        expect(painted).toContain(reader.get({ x: 35, y: 1 })!.color);
      }
    } finally { manager.close(); }
  });

  it('draws both half-block colors in adjacent fractional rectangles after incremental edits', () => {
    const canvas = document.createElement('canvas');
    const context = createContext();
    const painted: { color: string; rects: number[][] }[] = [];
    context.fill.mockImplementation((path?: MockPath2D) => {
      if (path) painted.push({ color: context.fillStyle, rects: path.rect.mock.calls });
    });
    vi.spyOn(canvas, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
    const plane = new CellPlaneIndex([
      {
        id: 'half',
        bounds: { x: 0, y: 0, width: 1, height: 1 },
        rows: [
          { y: 0, erase: [], spans: [{ x: 0, text: '▀', color: '#ee5500', bgColor: '#2255bb' }] },
        ],
      },
    ]);
    const manager = new MinimapManager(
      canvas,
      document.createElement('div'),
      { width: 220, height: 140 },
      4
    );
    const update = () =>
      manager.update({
        reader: plane,
        contentRevision: plane.getRevision(),
        offset: { x: 0, y: 0 },
        zoom: 1,
        viewportSize: { width: 1000, height: 700 },
        colors,
      });
    try {
      update();
      const upper = painted.find((p) => p.color === '#ee5500')!.rects[0]!;
      const lower = painted.find((p) => p.color === '#2255bb')!.rects[0]!;
      expect(upper[0]).toBe(lower[0]);
      expect(upper[2]).toBe(lower[2]);
      expect(upper[3]).toBe(lower[3]);
      expect(upper[1]! + upper[3]!).toBe(lower[1]);
      painted.length = 0;
      plane.append({
        id: 'flip',
        bounds: { x: 0, y: 0, width: 1, height: 1 },
        rows: [
          { y: 0, erase: [], spans: [{ x: 0, text: '▄', color: '#ee5500', bgColor: '#2255bb' }] },
        ],
      });
      update();
      vi.advanceTimersByTime(160);
      const flippedUpper = painted.find((p) => p.color === '#2255bb')!.rects[0]!;
      const flippedLower = painted.find((p) => p.color === '#ee5500')!.rects[0]!;
      expect(flippedUpper).toEqual(upper);
      expect(flippedLower).toEqual(lower);
    } finally {
      manager.close();
    }
  });
});
