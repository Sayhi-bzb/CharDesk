import { expect, test } from 'bun:test';
import { RGBA, createTextAttributes } from '@opentui/core';
import { createTestRenderer, KeyCodes, ManualClock } from '@opentui/core/testing';
import { TerminalCanvas } from './model.ts';
import { CanvasSurface } from './surface.ts';
import { attachControls } from './controller.ts';
import { TerminalMinimap, minimapPanel } from './minimap.ts';

test('incremental minimap reads only dirty rows and matches a cold raster through edits, erase and undo', () => {
  const model = new TerminalCanvas();
  const map = new TerminalMinimap(),
    panel = minimapPanel(90, 28)!;
  try {
    model.apply({
      rows: Array.from({ length: 100 }, (_, i) => ({
        y: i - 50,
        erase: [],
        spans: [{ x: -10, text: 'a界🦀▀▄ ', color: '#ff0000', bgColor: '#0000ff' }],
      })),
    });
    const rows = model.plane.rows.bind(model.plane);
    let visited = 0;
    model.plane.rows = function* (...args) {
      for (const row of rows(...args)) {
        visited++;
        yield row;
      }
    };
    const frame = () => map.frame(model.plane, model.plane.getRevision(), model.viewport, panel);
    const sameAsCold = () => {
      const warm = frame();
      const cold = new TerminalMinimap().frame(
        model.plane,
        model.plane.getRevision(),
        model.viewport,
        panel
      );
      expect(warm.colors).toEqual(cold.colors);
      expect(warm.pixels).toEqual(cold.pixels);
      expect(warm.transform).toEqual(cold.transform);
    };
    frame();
    model.apply({
      rows: [{ y: 0, erase: [], spans: [{ x: -10, text: '🦀Z', color: '#00ff00' }] }],
    });
    visited = 0;
    frame();
    expect(visited).toBe(1);
    sameAsCold();
    model.selection = { anchor: { x: -20, y: -50 }, focus: { x: 20, y: -45 } };
    model.erase();
    sameAsCold();
    model.undo();
    sameAsCold();
    // Outrun retained invalidations; the reader must be rebuilt safely.
    for (let i = 0; i < 300; i++)
      model.apply({
        rows: [{ y: 0, erase: [], spans: [{ x: -10, text: i % 2 ? 'X' : 'Y', color: '#00ff00' }] }],
      });
    sameAsCold();
    model.commands.selectAll();
    model.erase();
    sameAsCold();
    expect(frame().hasContent).toBe(false);
  } finally {
    model.dispose();
  }
});

test('map fits content plus viewport dynamically and caches content across pan', () => {
  const model = new TerminalCanvas('A界\n B');
  const map = new TerminalMinimap();
  try {
    const panel = minimapPanel(90, 28)!;
    const plane = model.plane;
    const rows = plane.rows.bind(plane);
    let scans = 0;
    plane.rows = (...args) => {
      scans++;
      return rows(...args);
    };
    const first = map.frame(plane, plane.getRevision(), model.viewport, panel);
    expect(first.transform.contentBounds).toEqual({ x: 0, y: 0, width: 3, height: 4 });
    model.pan(1_000_000, -1_000_000);
    const far = map.frame(plane, plane.getRevision(), model.viewport, panel);
    expect(scans).toBe(1);
    expect(far.transform.scale).toBeLessThan(first.transform.scale);
    expect(far.pixels.some(Boolean)).toBe(true);
    expect(far.viewport.width).toBeGreaterThanOrEqual(2);
    model.commands.beginInsert();
    model.commands.insert('Z');
    map.frame(model.plane, model.plane.getRevision(), model.viewport, panel);
    expect(scans).toBeGreaterThan(1);
  } finally {
    model.dispose();
  }
});

test('header Minimap opens floating map without resizing canvas; map click/drag preserve editor state', async () => {
  const clock = new ManualClock();
  const setup = await createTestRenderer({ width: 90, height: 28, clock });
  const model = new TerminalCanvas('A界B');
  model.apply({
    rows: [{ y: 100, erase: [], spans: [{ x: 220, text: 'FAR', color: '#000000' }] }],
  });
  model.markSaved();
  let detach = () => {};
  try {
    const surface = new CanvasSurface(setup.renderer, model, 'test.chardesk');
    setup.renderer.root.add(surface);
    detach = attachControls(surface, () => {});
    await setup.renderOnce();
    const dimensions = { width: model.viewport.width, height: model.viewport.height };
    const cursor = { ...model.cursor },
      selection = structuredClone(model.selection),
      version = model.version;
    const history = model.documents.getHistoryAvailability();
    surface.activateDock('minimap');
    await setup.renderOnce();
    expect(surface.minimapFrame).not.toBeNull();
    expect(setup.captureCharFrame()).toContain('Minimap');
    expect({ width: model.viewport.width, height: model.viewport.height }).toEqual(dimensions);
    const before = surface.minimapFrame!;
    const x = before.panel.x + before.panel.width - 3,
      y = before.panel.y + before.panel.height - 3;
    await setup.mockMouse.click(x, y);
    await setup.renderOnce();
    expect(model.viewport.x).toBeGreaterThan(0);
    const frame = surface.minimapFrame!;
    const vx = frame.panel.x + 1 + frame.viewport.x;
    const vy = frame.panel.y + 1 + frame.viewport.y;
    const start = { ...model.viewport };
    await setup.mockMouse.pressDown(vx, vy);
    expect(model.viewport).toEqual(start);
    await setup.mockMouse.emitMouseEvent('drag', vx - 2, vy - 1);
    expect(model.viewport.x).not.toBe(start.x);
    await setup.mockMouse.release(vx - 2, vy - 1);
    const end = { ...model.viewport };
    await setup.mockMouse.emitMouseEvent('drag', vx, vy);
    expect(model.viewport).toEqual(end);
    expect(model.cursor).toEqual(cursor);
    expect(model.selection).toEqual(selection);
    expect(model.version).toBe(version);
    expect(model.dirty).toBe(false);
    expect(model.documents.getHistoryAvailability()).toEqual(history);
    surface.activateDock('minimap');
    await setup.renderOnce();
    expect(surface.minimapFrame).toBeNull();
    surface.activateDock('edit');
    setup.mockInput.pressKey('m');
    expect(surface.minimapOpen).toBe(false);
    setup.mockInput.pressKey(KeyCodes.ESCAPE);
    clock.advance(40);
  } finally {
    detach();
    await setup.dispose();
    model.dispose();
  }
});

test('empty map and its border intercept clicks; resize hides the overlay and cancels dragging', async () => {
  const setup = await createTestRenderer({ width: 80, height: 24 });
  const model = new TerminalCanvas();
  let detach = () => {};
  try {
    const surface = new CanvasSurface(setup.renderer, model, 'test.chardesk');
    setup.renderer.root.add(surface);
    detach = attachControls(surface, () => {});
    surface.minimapOpen = true;
    await setup.renderOnce();
    const empty = surface.minimapFrame!;
    expect(setup.captureCharFrame().split('\n')[empty.panel.y]).toContain('No content');
    // The empty label stays on the frame; the complete viewport interior retains its fill.
    const emptyLines = setup.captureSpans().lines;
    for (let row = empty.viewport.y; row < empty.viewport.y + empty.viewport.height; row++) {
      let start = 0;
      for (const span of emptyLines[empty.panel.y + 1 + row]!.spans) {
        const end = start + span.width;
        if (
          start < empty.panel.x + 1 + empty.viewport.x + empty.viewport.width &&
          end > empty.panel.x + 1 + empty.viewport.x
        )
          expect(span.bg.equals(surface.colors.minimapViewport)).toBe(true);
        start = end;
      }
    }
    const panel = surface.minimapFrame!.panel,
      cursor = { ...model.cursor },
      view = { ...model.viewport };
    await setup.mockMouse.click(panel.x + 3, panel.y + 3);
    await setup.mockMouse.click(panel.x, panel.y);
    expect(model.cursor).toEqual(cursor);
    expect(model.viewport).toEqual(view);
    model.commands.beginInsert();
    model.commands.insert('Content');
    model.commands.escape();
    await setup.renderOnce();
    const f = surface.minimapFrame!;
    await setup.mockMouse.pressDown(f.panel.x + 1 + f.viewport.x, f.panel.y + 1 + f.viewport.y);
    setup.resize(40, 12);
    await setup.renderOnce();
    expect(surface.minimapFrame).toBeNull();
    expect(setup.captureCharFrame()).toContain('No map');
    const current = { ...model.viewport };
    await setup.mockMouse.emitMouseEvent('drag', 30, 8);
    expect(model.viewport).toEqual(current);
    setup.resize(80, 24);
    await setup.renderOnce();
    expect(surface.minimapFrame).not.toBeNull();
  } finally {
    detach();
    await setup.dispose();
    model.dispose();
  }
});

test('visible background spaces count; viewport grab offset stays stable in the current transform', () => {
  const model = new TerminalCanvas('   A');
  const map = new TerminalMinimap();
  try {
    const panel = minimapPanel(90, 28)!;
    let frame = map.frame(model.plane, model.plane.getRevision(), model.viewport, panel);
    expect(frame.transform.contentBounds).toEqual({ x: 3, y: 0, width: 1, height: 2 });
    model.apply({
      rows: [
        { y: -4, erase: [], spans: [{ x: -6, text: ' ', color: '#000000', bgColor: '#ff0000' }] },
      ],
    });
    frame = map.frame(model.plane, model.plane.getRevision(), model.viewport, panel);
    expect(frame.transform.contentBounds?.x).toBe(-6);
    expect(frame.transform.contentBounds?.y).toBe(-8);
    // Measure grab translation away from the shared navigation clamps.
    model.apply({
      rows: [
        { y: -100, erase: [], spans: [{ x: -100, text: 'edge', color: '#000000' }] },
        { y: 200, erase: [], spans: [{ x: 300, text: 'edge', color: '#000000' }] },
      ],
    });
    frame = map.frame(model.plane, model.plane.getRevision(), model.viewport, panel);
    const x = panel.x + 1 + frame.viewport.x,
      y = panel.y + 1 + frame.viewport.y;
    const point = map.worldPoint(frame, x, y),
      v = frame.transform.viewportBounds;
    const grab = { x: point.x - v.x - v.width / 2, y: point.y - v.y - v.height / 2 };
    const target = map.cameraOrigin(frame, x + 1, y, grab);
    expect(Math.abs(target.x - model.viewport.x - 1 / frame.transform.scale)).toBeLessThanOrEqual(
      0.5
    );
    expect(target.y).toBe(model.viewport.y);
  } finally {
    model.dispose();
  }
});

test('filled viewport and content use independent colors without internal border glyphs', async () => {
  const setup = await createTestRenderer({ width: 80, height: 24 });
  const model = new TerminalCanvas();
  try {
    const surface = new CanvasSurface(setup.renderer, model, 'test.chardesk');
    setup.renderer.root.add(surface);
    await setup.renderOnce();
    const v = model.viewport;
    model.apply({
      rows: Array.from({ length: v.height }, (_, y) => ({
        y: v.y + y,
        erase: [],
        spans: [{ x: v.x, text: '#'.repeat(v.width), color: '#113355' }],
      })),
    });
    surface.minimapOpen = true;
    surface.requestRender();
    await setup.renderOnce();
    const map = surface.minimapFrame!;
    const x = map.panel.x + 1 + map.viewport.x;
    const y = map.panel.y + 1 + map.viewport.y;
    let column = 0;
    const span = setup.captureSpans().lines[y]!.spans.find((span) => {
      const contains = column <= x && x < column + span.width;
      column += span.width;
      return contains;
    })!;
    expect(span.text).toMatch(/[▀▄█]/u);
    expect(span.fg.toInts()).not.toEqual(RGBA.fromHex('#113355').toInts());
    expect(span.fg.b).toBeGreaterThan(span.fg.g);
    expect(span.fg.g).toBeGreaterThan(span.fg.r);
    expect(span.bg.equals(surface.colors.minimapViewport)).toBe(true);
    const lines = setup.captureCharFrame().split('\n');
    for (let row = map.panel.y + 1; row < map.panel.y + map.panel.height - 1; row++)
      expect(lines[row]!.slice(map.panel.x + 1, map.panel.x + map.panel.width - 1)).not.toMatch(
        /[┌┐└┘─│]/u
      );
  } finally {
    await setup.dispose();
    model.dispose();
  }
});

const tinyPanel = { x: 0, y: 0, width: 3, height: 3 };
const collapsed = (model: TerminalCanvas, foreground: string | null = null) =>
  new TerminalMinimap().frame(
    model.plane,
    model.plane.getRevision(),
    { x: 0, y: 0, width: 12, height: 1 },
    tinyPanel,
    foreground
  );
const firstColor = (frame: ReturnType<TerminalMinimap['frame']>) =>
  frame.colors[frame.pixels.find((id) => id > 0)! - 1];

test('compressed colors accumulate area across separate runs and count a wide glyph completely', () => {
  for (const wide of [false, true]) {
    const model = new TerminalCanvas();
    try {
      model.apply({
        rows: [
          {
            y: 0,
            erase: [],
            spans: wide
              ? [
                  { x: 0, text: '界', color: '#ff0000' },
                  { x: 2, text: 'B', color: '#0000ff' },
                ]
              : [
                  { x: 0, text: 'R', color: '#ff0000' },
                  { x: 1, text: 'B', color: '#0000ff' },
                  { x: 2, text: 'R', color: '#ff0000' },
                ],
          },
        ],
      });
      expect(firstColor(collapsed(model))).toEqual({ kind: 'literal', value: '#ff0000' });
    } finally {
      model.dispose();
    }
  }
});

test('equal-area ties are independent of spatial and operation order', () => {
  for (const colors of [
    ['#ff0000', '#0000ff'],
    ['#0000ff', '#ff0000'],
  ]) {
    const model = new TerminalCanvas();
    try {
      model.apply({
        rows: [{ y: 0, erase: [], spans: colors.map((color, x) => ({ x, text: 'X', color })) }],
      });
      expect(firstColor(collapsed(model))).toEqual({ kind: 'literal', value: '#0000ff' });
    } finally {
      model.dispose();
    }
  }
});

test('known default foreground joins matching authored RGB; theme reprojection never rescans content', () => {
  const model = new TerminalCanvas(),
    map = new TerminalMinimap();
  try {
    model.apply({
      rows: [
        {
          y: 0,
          erase: [],
          spans: [
            { x: 0, text: 'AAA', color: '#000000' },
            { x: 3, text: 'BBB', color: '#eeeeee' },
            { x: 6, text: 'RRRR', color: '#ff0000' },
          ],
        },
      ],
    });
    const rows = model.plane.rows.bind(model.plane);
    let scans = 0;
    model.plane.rows = (...args) => {
      scans++;
      return rows(...args);
    };
    const frame = (foreground: string) =>
      map.frame(
        model.plane,
        model.plane.getRevision(),
        { x: 0, y: 0, width: 12, height: 1 },
        tinyPanel,
        foreground
      );
    const light = frame('#eeeeee');
    expect(firstColor(light)).toEqual({ kind: 'foreground' });
    expect(frame('#eeeeee').pixels).toBe(light.pixels);
    expect(firstColor(frame('#111111'))).toEqual({ kind: 'literal', value: '#ff0000' });
    expect(scans).toBe(1);
    model.commands.selectAll();
    model.commands.style({ kind: 'foreground', color: '#445566' });
    const afterEdit = scans;
    expect(firstColor(frame('#111111'))).toEqual({ kind: 'literal', value: '#445566' });
    expect(scans).toBe(afterEdit + 1);
    model.commands.undo();
    expect(firstColor(frame('#eeeeee'))).toEqual({ kind: 'foreground' });
  } finally {
    model.dispose();
  }
});

test('tiny distant colored glyphs survive sparse projection without expanding empty coordinates', () => {
  const model = new TerminalCanvas(),
    map = new TerminalMinimap();
  try {
    model.apply({
      rows: [
        {
          y: -1_000_000_000,
          erase: [],
          spans: [{ x: -1_000_000_000, text: '🦀', color: '#ff0000' }],
        },
        {
          y: 1_000_000_000,
          erase: [],
          spans: [{ x: 1_000_000_000, text: '界', color: '#0000ff' }],
        },
      ],
    });
    const frame = map.frame(
      model.plane,
      model.plane.getRevision(),
      model.viewport,
      minimapPanel(90, 28)!
    );
    expect(frame.colors).toEqual(
      expect.arrayContaining([
        { kind: 'literal', value: '#ff0000' },
        { kind: 'literal', value: '#0000ff' },
      ])
    );
    expect(frame.pixels.length).toBe(26 * 16);
    expect(frame.pixels.filter(Boolean).length).toBeGreaterThanOrEqual(2);
  } finally {
    model.dispose();
  }
});

test('native map updates authored color and default theme colors without changing navigation or history', async () => {
  const setup = await createTestRenderer({ width: 90, height: 28 });
  const model = new TerminalCanvas('A🦀界');
  const surface = new CanvasSurface(setup.renderer, model, 'colored map');
  model.viewport = { ...model.viewport, x: 200, y: 100 };
  setup.renderer.root.add(surface);
  const detach = attachControls(surface, () => {});
  const palette = (foreground: string) => ({
    palette: [],
    defaultForeground: foreground,
    defaultBackground: '#101010',
    cursorColor: null,
    mouseForeground: null,
    mouseBackground: null,
    tekForeground: null,
    tekBackground: null,
    highlightForeground: null,
    highlightBackground: null,
  });
  const expectColor = (hex: string) => {
    const frame = surface.minimapFrame!,
      index = frame.pixels.findIndex(Boolean),
      width = frame.panel.width - 2;
    expect(index).toBeGreaterThanOrEqual(0);
    setup.renderer.currentRenderBuffer.withBuffers((cells) => {
      const at =
        (frame.panel.y + 1 + Math.floor(index / width / 2)) * cells.width +
        frame.panel.x +
        1 +
        (index % width);
      expect(RGBA.fromArray(cells.fg.slice(at * 4, at * 4 + 4)).toInts()).toEqual(
        RGBA.fromHex(hex).toInts()
      );
    });
  };
  try {
    surface.appearance.acceptPalette(palette('#eeeeee'), 'dark');
    surface.minimapOpen = true;
    await setup.renderOnce();
    expectColor('#eeeeee');
    const original = model.plane.materialize(),
      view = { ...model.viewport };
    surface.appearance.acceptPalette(palette('#222222'), 'light');
    await setup.renderOnce();
    expectColor('#222222');
    expect(model.plane.materialize()).toEqual(original);
    expect(model.canUndo).toBe(false);
    model.commands.selectAll();
    model.commands.style({ kind: 'foreground', color: '#22bb77' });
    await setup.renderOnce();
    expectColor('#22bb77');
    surface.appearance.acceptPalette(palette('#dddddd'), 'dark');
    await setup.renderOnce();
    expectColor('#22bb77');
    model.commands.undo();
    await setup.renderOnce();
    expectColor('#dddddd');
    expect(model.plane.materialize()).toEqual(original);
    expect(model.viewport).toEqual(view);
    expect(model.canUndo).toBe(false);
  } finally {
    detach();
    await setup.dispose();
    model.dispose();
  }
});

test('unknown default RGB remains native foreground on content while viewport fills the background', async () => {
  const setup = await createTestRenderer({ width: 80, height: 24 });
  const model = new TerminalCanvas();
  try {
    const surface = new CanvasSurface(setup.renderer, model, 'unknown RGB map');
    setup.renderer.root.add(surface);
    await setup.renderOnce();
    const v = model.viewport;
    model.apply({
      rows: Array.from({ length: v.height }, (_, y) => ({
        y: v.y + y,
        erase: [],
        spans: [{ x: v.x, text: 'A'.repeat(v.width), color: '#000000' }],
      })),
    });
    surface.minimapOpen = true;
    await setup.renderOnce();
    expect(surface.appearance.getSnapshot().palette).toBeNull();
    const frame = surface.minimapFrame!;
    const x = frame.panel.x + 1 + frame.viewport.x,
      y = frame.panel.y + 1 + frame.viewport.y;
    const at = (column: number, row: number) => {
      let start = 0;
      return setup.captureSpans().lines[row]!.spans.find((span) => {
        const contains = start <= column && column < start + span.width;
        start += span.width;
        return contains;
      })!;
    };
    const corner = at(x, y),
      interior = at(x + 1, y + 1);
    expect(corner.text).toMatch(/[▀▄█]/u);
    expect(interior.text).toMatch(/[▀▄█]/u);
    for (const span of [corner, interior]) {
      expect(span.fg.intent).toBe('default');
      expect(span.bg.intent).toBe('indexed');
      expect(span.bg.slot).toBe(8);
      expect(span.attributes & createTextAttributes({ inverse: true })).toBe(0);
    }
    expect(interior.attributes & createTextAttributes({ dim: true })).not.toBe(0);
  } finally {
    await setup.dispose();
    model.dispose();
  }
});

test('viewport tints preview colors and follows pan without changing document or history', async () => {
  const setup = await createTestRenderer({ width: 90, height: 28 });
  const model = new TerminalCanvas();
  const surface = new CanvasSurface(setup.renderer, model, 'viewport fill');
  setup.renderer.root.add(surface);
  const detach = attachControls(surface, () => {});
  model.apply({
    rows: [
      { y: 0, erase: [], spans: [{ x: 0, text: '界🦀', color: '#dd3311' }] },
      { y: 100, erase: [], spans: [{ x: 300, text: 'FAR', color: '#2299dd' }] },
    ],
  });
  model.documents.clearHistory();
  model.viewport = { ...model.viewport, x: 0, y: 0 };
  surface.minimapOpen = true;
  const original = model.plane.materialize();
  const inspect = () => {
    const frame = surface.minimapFrame!;
    let insideEmpty = 0,
      outsideEmpty = 0,
      occupied = 0;
    const lines = setup.captureSpans().lines;
    for (let y = 0; y < frame.panel.height - 2; y++) {
      for (let x = 0; x < frame.panel.width - 2; x++) {
        const column = frame.panel.x + 1 + x;
        let start = 0;
        const span = lines[frame.panel.y + 1 + y]!.spans.find((span) => {
          const contains = start <= column && column < start + span.width;
          start += span.width;
          return contains;
        })!;
        const inside =
          x >= frame.viewport.x &&
          x < frame.viewport.x + frame.viewport.width &&
          y >= frame.viewport.y &&
          y < frame.viewport.y + frame.viewport.height;
        const w = frame.panel.width - 2;
        const top = frame.pixels[y * 2 * w + x]!,
          bottom = frame.pixels[(y * 2 + 1) * w + x]!;
        if (!top || !bottom || top === bottom)
          expect(
            span.bg.equals(inside ? surface.colors.minimapViewport : surface.colors.chrome)
          ).toBe(true);
        const id = top || bottom;
        if (id) {
          occupied++;
          const color = frame.colors[id - 1]!;
          expect(color.kind).toBe('literal');
          if (color.kind === 'literal') {
            if (inside) expect(span.fg.toInts()).not.toEqual(RGBA.fromHex(color.value).toInts());
            else expect(span.fg.toInts()).toEqual(RGBA.fromHex(color.value).toInts());
          }
          expect(span.text).toMatch(/[▀▄█]/u);
        } else if (inside) insideEmpty++;
        else outsideEmpty++;
      }
    }
    expect(insideEmpty).toBeGreaterThan(0);
    expect(outsideEmpty).toBeGreaterThan(0);
    expect(occupied).toBeGreaterThan(0);
    return frame.viewport;
  };
  try {
    await setup.renderOnce();
    const before = inspect();
    model.pan(180, 60);
    surface.requestRender();
    await setup.renderOnce();
    expect(inspect()).not.toEqual(before);
    expect(model.plane.materialize()).toEqual(original);
    expect(model.canUndo).toBe(false);
  } finally {
    detach();
    await setup.dispose();
    model.dispose();
  }
});

test('partial projected footprints vote independently in adjacent minimap cells', () => {
  const model = new TerminalCanvas(),
    map = new TerminalMinimap();
  try {
    model.apply({
      rows: [
        {
          y: 0,
          erase: [],
          spans: [
            { x: 0, text: 'R', color: '#ff0000' },
            { x: 1, text: '界', color: '#0000ff' },
            { x: 3, text: 'RR', color: '#ff0000' },
          ],
        },
      ],
    });
    const frame = map.frame(
      model.plane,
      model.plane.getRevision(),
      { x: 0, y: 0, width: 5, height: 1 },
      { x: 0, y: 0, width: 4, height: 3 }
    );
    expect([...frame.pixels].map((id) => frame.colors[id - 1])).toEqual([
      { kind: 'literal', value: '#0000ff' },
      { kind: 'literal', value: '#ff0000' },
      { kind: 'literal', value: '#0000ff' },
      { kind: 'literal', value: '#ff0000' },
    ]);
  } finally {
    model.dispose();
  }
});

test('miniature raster retains both half-block colors at their exact sample coordinates', () => {
  const model = new TerminalCanvas();
  try {
    model.apply({
      rows: [
        {
          y: 0,
          erase: [],
          spans: [
            { x: 0, text: '▀', color: '#ff0000', bgColor: '#0000ff' },
            { x: 1, text: '▄', color: '#ffff00', bgColor: '#00ff00' },
          ],
        },
      ],
    });
    const frame = new TerminalMinimap().frame(
      model.plane,
      model.plane.getRevision(),
      { x: 0, y: 0, width: 4, height: 2 },
      { x: 0, y: 0, width: 6, height: 4 }
    );
    const paint = (x: number, y: number) => frame.colors[frame.pixels[y * 4 + x]! - 1];
    expect(paint(0, 0)).toEqual({ kind: 'literal', value: '#ff0000' });
    expect(paint(0, 1)).toEqual({ kind: 'literal', value: '#0000ff' });
    expect(paint(1, 0)).toEqual({ kind: 'literal', value: '#00ff00' });
    expect(paint(1, 1)).toEqual({ kind: 'literal', value: '#ffff00' });
  } finally {
    model.dispose();
  }
});
