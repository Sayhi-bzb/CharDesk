import { expect, test } from 'bun:test';
import { createTestRenderer, KeyCodes, ManualClock } from '@opentui/core/testing';
import { TerminalCanvas } from './model.ts';
import { CanvasSurface } from './surface.ts';
import { attachControls } from './controller.ts';
import { TerminalMinimap, minimapPanel } from './minimap.ts';

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

test('F4 opens floating map without resizing canvas; map click/drag preserve editor state', async () => {
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
    setup.mockInput.pressKey(KeyCodes.F4);
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
    setup.mockInput.pressKey(KeyCodes.F4);
    await setup.renderOnce();
    expect(surface.minimapFrame).toBeNull();
    setup.mockInput.pressKey(KeyCodes.F2);
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
    expect(setup.captureCharFrame()).toContain('No content');
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
    expect(setup.captureCharFrame()).toContain('Minimap needs');
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

test('viewport foreground retains occupied content background beneath its border', async () => {
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
        spans: [{ x: v.x, text: '#'.repeat(v.width), color: '#000000' }],
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
    expect(span.text).toContain('┌');
    expect(span.fg.intent).toBe('indexed');
    expect(span.fg.slot).toBe(6);
    expect(span.bg.intent).toBe('indexed');
    expect(span.bg.slot).toBe(8);
  } finally {
    await setup.dispose();
    model.dispose();
  }
});
