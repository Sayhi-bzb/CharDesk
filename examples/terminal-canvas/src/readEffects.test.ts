import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RGBA, type TerminalColors } from '@opentui/core';
import { createTestRenderer, ManualClock } from '@opentui/core/testing';
import { resolveAppPaths } from '../../../packages/local-runtime/src/appPaths.ts';
import { LocalSessions } from '../../../packages/local-runtime/src/sessions.ts';
import { TerminalWorkspace } from '../../../packages/local-runtime/src/workspace.ts';
import { localCapabilities } from '../../../packages/local-runtime/src/capabilities.ts';
import { startLocalEndpoint, callRunningSession } from '../../../packages/local-runtime/src/ipc.ts';
import type { CanvasActivityEvent } from '../../../packages/local-runtime/src/agents.ts';
import { CanvasSurface, CANVAS_TOP } from './surface.ts';
import { attachControls } from './controller.ts';

const palette = (background = '#111111'): TerminalColors => ({
  defaultForeground: '#eeeeee',
  defaultBackground: background,
  palette: ['#111111', '#ee6666', '#44bb77', '#ddbb44', '#4466aa', '#bb66cc', '#22aabb', '#dddddd'],
  cursorColor: null,
  mouseForeground: null,
  mouseBackground: null,
  tekForeground: null,
  tekBackground: null,
  highlightForeground: null,
  highlightBackground: null,
});
async function fixture(knownPalette = true, { width = 60, height = 20 } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'chardesk-read-effects-'));
  const paths = resolveAppPaths({ environment: { CHARDESK_HOME: root } });
  const sessions = await LocalSessions.open(paths),
    workspace = TerminalWorkspace.empty();
  await sessions.attach(workspace);
  const file = await sessions.create('Read effects'),
    id = sessions.forFile(file)!.id;
  const api = localCapabilities(workspace, sessions, true);
  expect(
    await api.execute('canvas_write', {
      at: [0, 0],
      content: '🦀界 text',
      style: { href: 'https://example.com' },
    })
  ).toMatchObject({ persistence: 'saved' });
  const clock = new ManualClock();
  const setup = await createTestRenderer({ width, height, clock, kittyKeyboard: true });
  const surface = new CanvasSurface(setup.renderer, workspace.model, 'Read effects', 'darwin');
  setup.renderer.root.add(surface);
  const detach = attachControls(surface, () => {}, undefined, workspace, sessions);
  if (knownPalette) surface.appearance.acceptPalette(palette(), 'dark');
  await setup.renderOnce();
  const events: CanvasActivityEvent[] = [];
  const unsubscribe = sessions.agents.subscribeActivity((event) => events.push(event));
  const endpoint = await startLocalEndpoint(paths, workspace, sessions);
  return {
    setup,
    surface,
    workspace,
    sessions,
    id,
    clock,
    api,
    events,
    mutate: (kind: 'render' | 'erase' | 'fill', input: Record<string, unknown>) =>
      callRunningSession(paths, { file: file.path }, `canvas_${kind}`, input, {
        id: 'writer',
        name: 'Writer',
      }),
    write: (at: [number, number], content: string, agent = 'writer', extra = {}) =>
      callRunningSession(
        paths,
        { file: file.path },
        'canvas_write',
        { at, content, ...extra },
        {
          id: agent,
          name: agent,
        }
      ),
    read: (viewport?: [number, number, number, number], agent = 'reader') =>
      callRunningSession(paths, { file: file.path }, 'canvas_read', viewport ? { viewport } : {}, {
        id: agent,
        name: agent,
      }),
    async advance(ms: number) {
      clock.advance(ms);
      await setup.renderOnce();
    },
    async reveal(units: number) {
      for (let elapsed = 0; elapsed < 10_000; elapsed += 50) {
        if ((surface.activityEffects?.presentation?.visible ?? -1) >= units) return;
        clock.advance(50);
        await setup.renderOnce();
      }
      throw new Error('Mutation did not reach the requested reveal step.');
    },
    bg(x: number, y = 0) {
      return setup.renderer.currentRenderBuffer.withBuffers((cells) => {
        const at =
          ((CANVAS_TOP + y - workspace.model.viewport.y) * cells.width +
            x -
            workspace.model.viewport.x) *
          4;
        return RGBA.fromArray(cells.bg.slice(at, at + 4));
      });
    },
    async dispose() {
      unsubscribe();
      await endpoint();
      detach();
      await setup.dispose();
      await sessions.dispose();
      workspace.dispose();
      await rm(root, { recursive: true, force: true });
    },
  };
}

test('real IPC read paints a transient fill including an emoji follower, preserving native text, links and state', async () => {
  const f = await fixture();
  try {
    const model = f.workspace.model;
    const before = structuredClone({
      cursor: model.cursor,
      selection: model.selection,
      viewport: model.viewport,
      version: model.documents.getContentVersion(),
      grid: model.plane.materialize(),
    });
    const canvasFrame = () =>
      f.setup.captureCharFrame().split('\n').slice(CANVAS_TOP, f.surface.footerBounds.y).join('\n');
    const frame = canvasFrame();
    expect(model.plane.get({ x: 0, y: 0 })?.href).toBe('https://example.com');
    await f.read([1, 0, 5, 2]);
    expect(f.events).toHaveLength(1);
    expect(f.events[0]).toMatchObject({
      kind: 'read',
      canvasId: f.id,
      agent: { id: 'reader' },
      bounds: { x: 1, y: 0, width: 5, height: 2 },
    });
    await f.advance(300);
    expect(f.bg(0).intent).toBe('rgb');
    expect(f.bg(0).equals(f.bg(1))).toBe(true);
    expect(f.bg(4, 1).intent).toBe('rgb');
    expect(f.bg(7, 1).intent).toBe('default');
    expect(canvasFrame()).toBe(frame);
    const linked = f.setup
      .captureSpans()
      .lines[CANVAS_TOP - model.viewport.y]!.spans.find((span) => span.text.includes('🦀'))!;
    expect(linked.fg.intent).toBe('default');
    await f.advance(1500);
    expect(f.bg(0).intent).toBe('default');
    expect(f.bg(4, 1).intent).toBe('default');
    expect({
      cursor: model.cursor,
      selection: model.selection,
      viewport: model.viewport,
      version: model.documents.getContentVersion(),
      grid: model.plane.materialize(),
    }).toEqual(before);
    expect(f.sessions.agents.count(f.id)).toBe(1);
  } finally {
    await f.dispose();
  }
});

test('real write commits and saves atomically while its character presentation reveals whole glyphs', async () => {
  const f = await fixture();
  try {
    const model = f.workspace.model;
    const cursor = structuredClone(model.cursor);
    const reply = await f.write([10, 2], '🦀界ABC', 'writer', {
      style: { href: 'https://example.org' },
    });
    expect(reply).toMatchObject({ result: { persistence: 'saved' } });
    expect(f.events.at(-1)).toMatchObject({
      kind: 'write',
      agent: { id: 'writer' },
      writtenCells: 7,
    });
    const presentation = f.surface.activityEffects!.presentation!;
    expect(presentation.mode).toBe('character');
    expect(presentation.units).toBe(5);
    expect(presentation.visible).toBe(0);
    const version = model.documents.getContentVersion();
    expect(model.plane.get({ x: 10, y: 2 })?.char).toBe('🦀');
    expect(model.plane.get({ x: 12, y: 2 })?.char).toBe('界');
    await f.setup.renderOnce();
    expect(f.setup.captureCharFrame()).not.toContain('🦀界ABC');
    await f.advance(600);
    expect(presentation.visible).toBeGreaterThan(0);
    expect(presentation.visible).toBeLessThan(5);
    expect(f.bg(10, 2).equals(f.bg(11, 2))).toBe(true);
    expect(f.bg(10, 2).intent).toBe('rgb');
    const chars: string[] = [];
    presentation.visit((_x, _y, cell) => chars.push(cell.char));
    expect(chars).toEqual(['🦀', '界']);
    await f.advance(2000);
    expect(f.surface.activityEffects!.presentation).toBeUndefined();
    expect(f.setup.captureCharFrame()).toContain('🦀界ABC');
    expect(f.bg(10, 2).intent).toBe('default');
    expect(model.documents.getContentVersion()).toBe(version);
    expect(model.cursor).toEqual(cursor);
    model.commands.undo();
    expect(model.plane.get({ x: 10, y: 2 })).toBeUndefined();
    expect(model.plane.get({ x: 0, y: 0 })?.char).toBe('🦀');
  } finally {
    await f.dispose();
  }
});

test('large writes use lines, and human input ends presentation without another mutation', async () => {
  const f = await fixture(false);
  try {
    await f.write([5, 3], Array.from({ length: 101 }, () => 'x'.repeat(40)).join('\n'));
    const presentation = f.surface.activityEffects!.presentation!;
    expect(presentation.mode).toBe('line');
    expect(presentation.units).toBeGreaterThan(6);
    expect(presentation.cursor).toBeNull();
    await f.advance(700);
    expect(presentation.visible).toBeGreaterThan(0);
    expect(presentation.visible).toBeLessThan(presentation.units);
    const feedback = presentation.feedback!;
    expect(f.bg(feedback.x, feedback.y).intent).toBe('indexed');
    const version = f.workspace.model.documents.getContentVersion();
    f.setup.mockInput.pressKey('F2');
    await f.setup.renderOnce();
    expect(f.surface.activityEffects!.presentation).toBeUndefined();
    expect(f.setup.captureCharFrame()).toContain('x'.repeat(40));
    expect(f.workspace.model.documents.getContentVersion()).toBe(version);
  } finally {
    await f.dispose();
  }
});

test('a full read camera write animates all 4000 glyphs within the activity lifetime', async () => {
  const f = await fixture(true, { width: 120, height: 55 });
  try {
    f.surface.inspector!.close();
    await f.write([0, 2], Array.from({ length: 40 }, () => 'x'.repeat(100)).join('\n'));
    const presentation = f.surface.activityEffects!.presentation!;
    expect(presentation.mode).toBe('character');
    expect(presentation.units).toBe(4000);
    await f.advance(4500);
    expect(presentation.visible).toBe(2000);
    expect(f.bg(99, 41).intent).toBe('default');
    await f.advance(5200);
    expect(f.surface.activityEffects!.presentation).toBeUndefined();
    expect(
      f.setup
        .captureCharFrame()
        .split('\n')
        .filter((row) => row.includes('x'.repeat(100)))
    ).toHaveLength(40);
  } finally {
    await f.dispose();
  }
});

test('new writes, Undo and document switches invalidate old write projections', async () => {
  const f = await fixture();
  try {
    await f.write([10, 2], 'FIRST');
    const first = f.surface.activityEffects!.presentation;
    await f.write([10, 2], 'SECOND');
    expect(f.surface.activityEffects!.presentation).not.toBe(first);
    f.workspace.model.commands.undo();
    expect(f.surface.activityEffects!.presentation).toBeUndefined();
    await f.advance(3000);
    expect(f.setup.captureCharFrame()).toContain('FIRST');
    expect(f.setup.captureCharFrame()).not.toContain('SECOND');
    await f.write([10, 2], 'THIRD');
    expect(f.surface.activityEffects!.presentation).toBeDefined();
    await f.sessions.create('Another');
    await f.advance(3000);
    expect(f.surface.activityEffects!.presentation).toBeUndefined();
    expect(f.setup.captureCharFrame()).not.toContain('THIRD');
  } finally {
    await f.dispose();
  }
});

test('real render replaces changed rows while preserving unchanged text and moving a continuous background', async () => {
  const f = await fixture();
  try {
    f.surface.inspector!.close();
    await f.api.execute('canvas_write', { at: [10, 2], content: 'KEEP A   B\nMID 🦀\nBOTTOM' });
    const reply = await f.mutate('render', {
      at: [10, 2],
      source: 'KEEP C   D\nMID 界\nBOTTOM',
      format: 'raw',
    });
    expect(reply).toMatchObject({ result: { persistence: 'saved' } });
    expect(f.events.at(-1)).toMatchObject({ kind: 'render' });
    const model = f.workspace.model;
    const version = model.documents.getContentVersion();
    const presentation = f.surface.activityEffects!.presentation!;
    expect(presentation.mode).toBe('line');
    expect(presentation.units).toBe(2);
    expect(presentation.group(10, 2, 1)).toBeUndefined();
    expect(presentation.group(10, 4, 1)).toBeUndefined();
    expect(presentation.feedback).toBeNull();
    expect(model.plane.get({ x: 15, y: 2 })?.char).toBe('C');
    await f.setup.renderOnce();
    expect(f.setup.captureCharFrame()).toContain('KEEP A   B');
    expect(f.bg(17, 2).intent).toBe('default');
    await f.reveal(1);
    expect(presentation.visible).toBe(1);
    expect(f.setup.captureCharFrame()).toContain('KEEP C   D');
    expect(f.bg(17, 2).intent).toBe('rgb');
    expect(f.bg(10, 2).intent).toBe('default');
    expect(f.bg(14, 3).intent).toBe('default');
    const color = f.bg(17, 2);
    await f.advance(30);
    expect(f.bg(17, 2).equals(color)).toBe(true);
    await f.reveal(2);
    expect(presentation.visible).toBe(2);
    expect(presentation.feedback).toMatchObject({ y: 3, height: 1 });
    expect(f.bg(17, 2).intent).toBe('default');
    expect(f.bg(14, 3).equals(f.bg(15, 3))).toBe(true);
    expect(f.bg(14, 3).intent).toBe('rgb');
    await f.advance(presentation.duration + 800);
    expect(f.surface.activityEffects!.presentation).toBeUndefined();
    expect(f.bg(14, 3).intent).toBe('default');
    expect(model.documents.getContentVersion()).toBe(version);
    model.commands.undo();
    expect(model.plane.get({ x: 15, y: 2 })?.char).toBe('A');
    expect(model.plane.get({ x: 14, y: 3 })?.char).toBe('🦀');
  } finally {
    await f.dispose();
  }
});

test('real erase clears bottom-up, highlighting the removed row including spaces without stale glyphs', async () => {
  const f = await fixture(false);
  try {
    f.surface.inspector!.close();
    await f.api.execute('canvas_write', { at: [10, 3], content: 'A   🦀\nB   界\nC   Z' });
    expect(await f.mutate('erase', { at: [10, 3], size: [6, 3] })).toMatchObject({
      result: { persistence: 'saved' },
    });
    expect(f.events.at(-1)).toMatchObject({ kind: 'erase' });
    const presentation = f.surface.activityEffects!.presentation!;
    expect(presentation.units).toBe(3);
    expect(f.workspace.model.plane.get({ x: 10, y: 3 })).toBeUndefined();
    await f.setup.renderOnce();
    expect(f.setup.captureCharFrame()).toContain('A   🦀');
    await f.reveal(1);
    expect(presentation.visible).toBe(1);
    expect(presentation.feedback).toEqual({ x: 10, y: 5, width: 5, height: 1 });
    expect(f.bg(12, 5).intent).toBe('indexed');
    expect(f.bg(12, 4).intent).toBe('default');
    expect(f.setup.captureCharFrame()).not.toContain('C   Z');
    expect(f.setup.captureCharFrame()).toContain('A   🦀');
    await f.reveal(2);
    expect(presentation.visible).toBe(2);
    expect(f.bg(12, 5).intent).toBe('default');
    expect(f.bg(14, 4).equals(f.bg(15, 4))).toBe(true);
    f.setup.mockInput.pressKey('F2');
    await f.setup.renderOnce();
    expect(f.surface.activityEffects!.presentation).toBeUndefined();
    expect(f.setup.captureCharFrame()).not.toContain('A   🦀');
    f.workspace.model.commands.undo();
    expect(f.workspace.model.plane.get({ x: 14, y: 3 })?.char).toBe('🦀');
  } finally {
    await f.dispose();
  }
});

test('real fill projects old and new styles by row and never tints the whole target', async () => {
  const f = await fixture();
  try {
    await f.api.execute('canvas_write', { at: [10, 3], content: 'A   🦀\nB   界\nC   Z' });
    const style = { color: '#55aa88', attrs: { bold: true } };
    expect(await f.mutate('fill', { at: [10, 3], size: [6, 3], style })).toMatchObject({
      result: { persistence: 'saved' },
    });
    expect(f.events.at(-1)).toMatchObject({ kind: 'fill' });
    const presentation = f.surface.activityEffects!.presentation!;
    expect(presentation.mode).toBe('line');
    const version = f.workspace.model.documents.getContentVersion();
    expect(f.workspace.model.plane.get({ x: 10, y: 5 })).toMatchObject(style);
    await f.reveal(1);
    expect(presentation.visible).toBe(1);
    expect(presentation.feedback).toEqual({ x: 10, y: 3, width: 6, height: 1 });
    expect(f.bg(12, 3).intent).toBe('rgb');
    expect(f.bg(12, 4).intent).toBe('default');
    const projected: Array<{ y: number; color: string }> = [];
    presentation.visit((_x, y, cell) => projected.push({ y, color: cell.color }));
    expect(
      projected.filter((cell) => cell.y === 3).every((cell) => cell.color === style.color)
    ).toBe(true);
    expect(
      projected.filter((cell) => cell.y === 5).some((cell) => cell.color !== style.color)
    ).toBe(true);
    await f.advance(presentation.duration + 800);
    expect(f.surface.activityEffects!.presentation).toBeUndefined();
    expect(f.bg(12, 3).intent).toBe('default');
    expect(f.workspace.model.documents.getContentVersion()).toBe(version);
    f.workspace.model.commands.undo();
    expect(f.workspace.model.plane.get({ x: 10, y: 5 })?.attrs?.bold).toBeUndefined();
  } finally {
    await f.dispose();
  }
});

test('unchanged and rejected render, fill and erase calls do not animate or retain subscriptions', async () => {
  const f = await fixture();
  try {
    await f.api.execute('canvas_render', { at: [10, 3], source: 'SAME', format: 'raw' });
    await f.mutate('render', { at: [10, 3], source: 'SAME', format: 'raw' });
    await f.mutate('fill', { at: [10, 3], size: [4, 1], style: {} });
    await f.mutate('erase', { at: [30, 5], size: [1, 1] });
    await f.mutate('fill', { at: [10, 3], size: [0, 1], style: { color: '#55aa88' } });
    expect(f.events).toHaveLength(0);
    expect(f.surface.activityEffects!.presentation).toBeUndefined();
    await f.mutate('erase', { at: [10, 3], size: [4, 1] });
    expect(f.events).toHaveLength(1);
    expect(f.surface.activityEffects!.presentation).toBeDefined();
  } finally {
    await f.dispose();
  }
});

test('anonymous, unchanged and failed writes do not start presentation', async () => {
  const f = await fixture();
  try {
    await f.api.execute('canvas_write', { at: [10, 2], content: 'SAME' });
    expect(f.events).toHaveLength(0);
    await f.write([10, 2], 'SAME');
    expect(f.events).toHaveLength(0);
    await f.write([10, 2], 'FAIL', 'writer', { baseVersion: 'stale' });
    expect(f.events).toHaveLength(0);
    expect(f.surface.activityEffects!.presentation).toBeUndefined();
  } finally {
    await f.dispose();
  }
});

test('writing over an emoji follower captures the old whole glyph and never replays an offscreen write', async () => {
  const f = await fixture();
  try {
    await f.write([1, 0], 'A');
    const presentation = f.surface.activityEffects!.presentation!;
    expect(presentation.units).toBe(1);
    const cells: string[] = [];
    presentation.visit((_x, _y, cell) => cells.push(cell.char));
    expect(cells).toEqual(['🦀']);
    expect(f.workspace.model.plane.get({ x: 0, y: 0 })).toBeUndefined();
    expect(f.workspace.model.plane.get({ x: 1, y: 0 })?.char).toBe('A');
    await f.advance(2500);
    await f.write([500, 500], 'FAR🦀');
    expect(f.surface.activityEffects!.presentation).toBeUndefined();
    await f.advance(1500);
    expect(f.surface.activityBadgeControls).toHaveLength(1);
    f.surface.activityEffects!.locate('writer');
    await f.advance(300);
    expect(f.setup.captureCharFrame()).toContain('FAR🦀');
    expect(f.surface.activityEffects!.presentation).toBeUndefined();
    expect(f.bg(500, 500).intent).toBe('rgb');
  } finally {
    await f.dispose();
  }
});

test('human selection wins; role colors and theme reprojection do not overwrite document colors', async () => {
  const f = await fixture();
  try {
    f.workspace.model.commands.selectAll();
    await f.read([0, 0, 15, 2], 'alpha');
    await f.advance(300);
    expect(f.bg(0).equals(f.surface.colors.selection)).toBe(true);
    const alpha = f.bg(12, 1);
    await f.read([10, 1, 4, 1], 'beta');
    await f.advance(300);
    expect(f.bg(12, 1).equals(alpha)).toBe(false);
    f.surface.appearance.acceptPalette(palette('#eeeeee'), 'light');
    await f.setup.renderOnce();
    expect(f.bg(12, 1).equals(alpha)).toBe(false);
    expect(f.bg(0).equals(f.surface.colors.selection)).toBe(true);
  } finally {
    await f.dispose();
  }
});

test('new content and document switches invalidate old read effects; anonymous and invalid reads publish nothing', async () => {
  const f = await fixture();
  try {
    await f.read([0, 0, 8, 2]);
    await f.advance(300);
    expect(f.bg(0).intent).toBe('rgb');
    f.workspace.model.commands.insert('NEW');
    await f.setup.renderOnce();
    expect(f.bg(0).intent).toBe('default');
    const count = f.events.length;
    await f.api.execute('canvas_read', { viewport: [0, 0, 8, 2] });
    await f.api.execute(
      'canvas_read',
      { viewport: [0, 0, 0, 2] },
      { agent: { id: 'invalid', name: 'Invalid' } }
    );
    expect(f.events).toHaveLength(count);
    await f.read([0, 0, 8, 2]);
    await f.advance(300);
    await f.sessions.create('Other');
    await f.setup.renderOnce();
    expect(f.bg(0).intent).toBe('default');
    f.sessions.agents.publishActivity(f.events[0]!);
    await f.advance(300);
    expect(f.bg(0).intent).toBe('default');
  } finally {
    await f.dispose();
  }
});

test('read tint follows the displayed background of inverse text and restores authored style', async () => {
  const f = await fixture();
  try {
    expect(
      await f.api.execute('canvas_write', {
        at: [12, 0],
        content: '界',
        style: { color: '#88aaee', bgColor: '#223344', attrs: { inverse: true } },
      })
    ).toMatchObject({ persistence: 'saved' });
    await f.setup.renderOnce();
    const original = f.workspace.model.plane.get({ x: 12, y: 0 });
    const foreground = () =>
      f.setup.renderer.currentRenderBuffer.withBuffers((cells) => {
        const index =
          ((CANVAS_TOP - f.workspace.model.viewport.y) * cells.width +
            12 -
            f.workspace.model.viewport.x) *
          4;
        return RGBA.fromArray(cells.fg.slice(index, index + 4));
      });
    const before = foreground();
    await f.read([13, 0, 1, 1]);
    await f.advance(300);
    expect(foreground().equals(before)).toBe(false);
    expect(f.bg(12).toInts()).toEqual(RGBA.fromHex('#223344').toInts());
    expect(f.bg(12).equals(f.bg(13))).toBe(true);
    await f.advance(1500);
    expect(foreground().equals(before)).toBe(true);
    expect(f.workspace.model.plane.get({ x: 12, y: 0 })).toEqual(original);
  } finally {
    await f.dispose();
  }
});

test('unknown terminal RGB uses native indexed fill; bursts stay bounded and repeated reads use the latest range', async () => {
  const f = await fixture(false);
  try {
    await f.read([0, 0, 8, 2]);
    await f.advance(300);
    expect(f.bg(0).intent).toBe('indexed');
    f.surface.appearance.acceptPalette(palette(), 'dark');
    for (let i = 0; i < 20; i++) await f.read([0, 0, 8, 2], `reader-${i}`);
    await f.advance(300);
    expect(f.bg(0).intent).toBe('rgb');
    await f.read([12, 1, 3, 1], 'latest');
    await f.read([20, 1, 3, 1], 'latest');
    await f.advance(300);
    expect(f.bg(12, 1).intent).toBe('default');
    expect(f.bg(20, 1).intent).toBe('rgb');
    await f.advance(1500);
    expect(f.bg(0).intent).toBe('default');
    expect(f.bg(20, 1).intent).toBe('default');
  } finally {
    await f.dispose();
  }
});

test('edge badges outlive the fill, locate without editing and expire without acknowledging records', async () => {
  const f = await fixture();
  try {
    const model = f.workspace.model;
    model.commands.selectAll();
    const before = structuredClone({
      cursor: model.cursor,
      selection: model.selection,
      tool: model.currentTool,
      version: model.documents.getContentVersion(),
    });
    await f.read([500, 500, 10, 4]);
    await f.advance(1600);
    const badge = f.surface.activityBadgeControls[0]!;
    expect(badge.label).toBe('↘ ●');
    expect(f.setup.captureCharFrame()).toContain(badge.label);
    expect(badge.color.intent).toBe('indexed');
    await f.setup.mockMouse.click(badge.x, badge.y);
    await f.advance(300);
    expect(f.surface.activityBadgeControls).toEqual([]);
    expect(model.viewport.x).toBeLessThanOrEqual(505);
    expect(model.viewport.x + model.viewport.width).toBeGreaterThan(505);
    expect(f.bg(505, 502).intent).toBe('rgb');
    expect({
      cursor: model.cursor,
      selection: model.selection,
      tool: model.currentTool,
      version: model.documents.getContentVersion(),
    }).toEqual(before);
    model.editor.transact(() => model.pan(1000, 0));
    await f.setup.renderOnce();
    expect(f.surface.activityBadgeControls).toHaveLength(1);
    await f.advance(9000);
    expect(f.surface.activityBadgeControls).toEqual([]);
    expect(f.sessions.agents.count(f.id)).toBe(1);
  } finally {
    await f.dispose();
  }
});

test('badges work without RGB, stay outside chrome, and yield to dialogs and content changes', async () => {
  const f = await fixture(false);
  try {
    await f.read([-300, -300, 6, 4]);
    await f.advance(1600);
    const badge = f.surface.activityBadgeControls[0]!;
    expect(badge.color.intent).toBe('indexed');
    expect(badge.y).toBeGreaterThanOrEqual(CANVAS_TOP);
    expect(badge.y).toBeLessThan(f.surface.footerBounds.y);
    const viewport = structuredClone(f.workspace.model.viewport);
    f.surface.help = true;
    await f.setup.renderOnce();
    expect(f.surface.activityBadgeControls).toEqual([]);
    await f.setup.mockMouse.click(badge.x, badge.y);
    expect(f.workspace.model.viewport).toEqual(viewport);
    f.surface.help = false;
    await f.setup.renderOnce();
    expect(f.surface.activityBadgeControls).toHaveLength(1);
    f.workspace.model.commands.insert('CHANGED');
    await f.setup.renderOnce();
    expect(f.surface.activityBadgeControls).toEqual([]);
  } finally {
    await f.dispose();
  }
});
