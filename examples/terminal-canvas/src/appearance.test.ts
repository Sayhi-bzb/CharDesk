import { expect, test } from 'bun:test';
import { RGBA, type TerminalColors } from '@opentui/core';
import { createTestRenderer } from '@opentui/core/testing';
import { TerminalAppearanceRuntime } from './appearance.ts';
import { TerminalSettingsStore } from './settings.ts';
import { TerminalCanvas } from './model.ts';
import { CanvasSurface, CANVAS_TOP } from './surface.ts';
import { attachControls } from './controller.ts';
import { createTextPreparation } from './text.ts';

const palette = (foreground = '#eeeeee', background = '#111111'): TerminalColors => ({
  defaultForeground: foreground,
  defaultBackground: background,
  palette: [
    '#111111',
    '#ee6666',
    '#44bb77',
    '#ddbb44',
    '#4466aa',
    '#bb66cc',
    '#22aabb',
    '#dddddd',
    '#111111',
    '#ff7777',
    '#55cc88',
    '#eecc55',
    '#5577bb',
    '#cc77dd',
    '#33bbcc',
    '#eeeeee',
  ],
  cursorColor: null,
  mouseForeground: null,
  mouseBackground: null,
  tekForeground: null,
  tekBackground: null,
  highlightForeground: null,
  highlightBackground: null,
});
async function paste(model: TerminalCanvas, source: string) {
  const result = model.commands.pasteProvided(source);
  if (result.status !== 'pending') throw new Error(`Expected pending, got ${result.status}`);
  expect((await result.completion).succeeded).toBe(true);
}

test('one appearance snapshot preserves native color intent and derives content colors from the terminal', () => {
  const settings = new TerminalSettingsStore();
  const appearance = new TerminalAppearanceRuntime(settings);
  try {
    const unknown = appearance.getSnapshot();
    expect(unknown.mode).toBe('unknown');
    expect(unknown.palette).toBeNull();
    expect(unknown.colors.minimapViewport.intent).toBe('indexed');
    expect(unknown.colors.minimapViewport.slot).toBe(8);
    appearance.acceptPalette(palette(), 'dark');
    const snapshot = appearance.getSnapshot();
    expect(snapshot.mode).toBe('dark');
    expect(snapshot.colors.foreground.intent).toBe('default');
    expect(snapshot.colors.background.intent).toBe('default');
    expect(snapshot.colors.accent.intent).toBe('indexed');
    expect(snapshot.colors.minimapViewport.intent).toBe('rgb');
    expect(snapshot.colors.minimapViewport.r).toBeGreaterThan(snapshot.colors.background.r);
    expect(snapshot.colors.minimapViewport.r).toBeLessThan(snapshot.colors.foreground.r);
    expect(snapshot.colors.selection.intent).toBe('indexed');
    expect(snapshot.colors.selection.slot).not.toBe(8); // slot 8 equals the background
    expect(snapshot.colors.muted.intent).toBe('default');
    expect(snapshot.contentTheme.accent).toBe('#4466aa');
    expect(snapshot.contentTheme.background).toBe('#111111');
    settings.set('selectionColor', 8); // explicit choices win over automatic contrast
    expect(appearance.getSnapshot().colors.selection.slot).toBe(8);
    settings.set('cursorStyle', 'line');
    expect(appearance.getSnapshot().cursor.style).toBe('line');
    const revision = appearance.getSnapshot().revision;
    settings.set('panStep', 20);
    expect(appearance.getSnapshot().revision).toBe(revision);
  } finally {
    appearance.dispose();
  }
});

test('same-mode palette changes publish once and snapshots do not retain mutable query results', () => {
  const appearance = new TerminalAppearanceRuntime(new TerminalSettingsStore());
  try {
    appearance.acceptPalette(palette(), 'dark');
    const first = appearance.getSnapshot();
    const next = palette('#ddeeff', '#151515');
    appearance.acceptPalette(next, 'dark');
    const second = appearance.getSnapshot();
    expect(second.revision).toBeGreaterThan(first.revision);
    expect(second.mode).toBe('dark');
    appearance.acceptPalette(palette('#ddeeff', '#151515'), 'dark');
    expect(appearance.getSnapshot()).toBe(second);
    next.palette[4] = '#abcdef';
    expect(second.contentTheme.accent).toBe('#4466aa');
    expect(second.palette?.slots[4]).toBe('#4466aa');
    expect(first.palette?.background).toBe('#111111');
    expect(second.colors.minimapViewport.equals(first.colors.minimapViewport)).toBe(false);
  } finally {
    appearance.dispose();
  }
});

test('newer queries win even when older success or failure arrives last', async () => {
  for (const failOld of [false, true]) {
    const appearance = new TerminalAppearanceRuntime(new TerminalSettingsStore());
    const old = Promise.withResolvers<TerminalColors>(),
      recent = Promise.withResolvers<TerminalColors>();
    let calls = 0;
    appearance.connect({
      mode: () => 'dark',
      read: () => (++calls === 1 ? old.promise : recent.promise),
    });
    try {
      const first = appearance.refresh();
      await Promise.resolve();
      const second = appearance.refresh();
      await Promise.resolve();
      recent.resolve(palette('#ffffff', '#222222'));
      await second;
      const current = appearance.getSnapshot();
      if (failOld) old.reject(new Error('old failure'));
      else old.resolve(palette());
      await first;
      expect(appearance.getSnapshot()).toBe(current);
      expect(current.palette?.background).toBe('#222222');
      expect(current.status).toBe('ready');
    } finally {
      old.resolve(palette());
      recent.resolve(palette());
      appearance.dispose();
    }
  }
});

test('query failure, missing RGB and disposal keep native drawing available without stale publication', async () => {
  const settings = new TerminalSettingsStore(),
    appearance = new TerminalAppearanceRuntime(settings);
  let calls = 0;
  const detach = appearance.connect({
    mode: () => null,
    read: async () => {
      if (++calls === 1) throw new Error('query failed');
      return { ...palette(), defaultBackground: null };
    },
  });
  await appearance.refresh();
  expect(appearance.getSnapshot().error).toBe('query failed');
  expect(appearance.getSnapshot().colors.foreground.intent).toBe('default');
  await appearance.ensurePalette();
  expect(appearance.getSnapshot().palette).toBeNull();
  expect(appearance.getSnapshot().mode).toBe('unknown');
  detach();
  const late = Promise.withResolvers<TerminalColors>();
  appearance.connect({ mode: () => 'dark', read: () => late.promise });
  const request = appearance.refresh();
  await Promise.resolve();
  appearance.dispose();
  const last = appearance.getSnapshot();
  late.resolve(palette());
  await request;
  settings.set('cursorStyle', 'line');
  expect(appearance.getSnapshot()).toBe(last);
});

test('OpenTUI palette/theme/focus events, Settings refresh and every overlay use the same runtime', async () => {
  const setup = await createTestRenderer({ width: 90, height: 26, kittyKeyboard: true });
  const model = new TerminalCanvas('A🦀\x1b[38;2;201;70;30mB\x1b[0m');
  const surface = new CanvasSurface(setup.renderer, model, 'appearance-test');
  setup.renderer.root.add(surface);
  const detach = attachControls(surface, () => {});
  let queries = 0,
    current = palette();
  setup.renderer.getPalette = async () => {
    queries++;
    return current;
  };
  surface.setTool('edit');
  model.viewport = { ...model.viewport, x: 0, y: 0 };
  await setup.renderOnce();
  model.commands.selectAll();
  const content = model.plane.materialize(),
    selection = structuredClone(model.selection),
    version = model.version;
  try {
    setup.renderer.emit('focus');
    await setup.waitFor(() => surface.appearance.getSnapshot().status === 'ready');
    expect(queries).toBe(1);
    current = palette('#ffffff', '#222222');
    setup.renderer.emit('theme_mode', 'dark');
    await setup.waitFor(() => surface.appearance.getSnapshot().palette?.background === '#222222');
    expect(queries).toBe(2);
    const newer = palette('#101010', '#fafafa');
    setup.renderer.emit('palette', newer);
    expect(surface.appearance.getSnapshot().palette?.background).toBe('#fafafa');
    surface.settings.set('selectionColor', 6);
    surface.contextMenu!.open();
    await setup.renderOnce();
    const menu = surface.contextMenu!.layout;
    setup.renderer.currentRenderBuffer.withBuffers((cells) => {
      const index = (menu.y + 1) * cells.width + menu.x + 2;
      const bg = RGBA.fromArray(cells.bg.slice(index * 4, index * 4 + 4));
      expect(bg.intent).toBe('indexed');
      expect(bg.slot).toBe(6);
    });
    surface.contextMenu!.close();
    surface.activateDock('settings');
    const refresh = surface.panel!.items.indexOf('Refresh terminal colors');
    surface.panel!.onPick!(refresh);
    await setup.waitFor(() => queries === 3 && surface.appearance.getSnapshot().status === 'ready');
    expect(model.plane.materialize()).toEqual(content);
    expect(model.selection).toEqual(selection);
    expect(model.version).toBe(version);
    expect(model.canUndo).toBe(false);
    expect(model.dirty).toBe(false);
  } finally {
    detach();
    const calls = queries;
    await setup.dispose();
    setup.renderer.emit('focus');
    expect(queries).toBe(calls);
    model.dispose();
  }
});

test('native default text follows themes while literal colors and wide selection coverage survive', async () => {
  const setup = await createTestRenderer({ width: 70, height: 22 });
  const model = new TerminalCanvas('A🦀\x1b[38;2;201;70;30mB\x1b[0m');
  const surface = new CanvasSurface(setup.renderer, model, 'native-colors');
  setup.renderer.root.add(surface);
  try {
    model.viewport = { ...model.viewport, x: 0, y: 0 };
    for (const colors of [palette(), palette('#111111', '#ffffff')]) {
      setup.renderer.emit('palette', colors);
      await setup.renderOnce();
      setup.renderer.currentRenderBuffer.withBuffers((cells) => {
        const at = CANVAS_TOP * cells.width;
        expect(RGBA.fromArray(cells.fg.slice(at * 4, at * 4 + 4)).intent).toBe('default');
        const explicit = RGBA.fromArray(cells.fg.slice((at + 3) * 4, (at + 4) * 4));
        expect(explicit.intent).toBe('rgb');
        expect(explicit.toInts().slice(0, 3)).toEqual([201, 70, 30]);
      });
    }
    model.commands.selectAll();
    await setup.renderOnce();
    setup.renderer.currentRenderBuffer.withBuffers((cells) => {
      for (const x of [0, 1, 2, 3]) {
        const at = CANVAS_TOP * cells.width + x;
        const bg = RGBA.fromArray(cells.bg.slice(at * 4, at * 4 + 4));
        expect(bg.slot).toBe(surface.colors.selection.slot);
        expect(bg.intent).toBe('indexed');
      }
    });
    expect(model.canUndo).toBe(false);
  } finally {
    await setup.dispose();
    model.dispose();
  }
});

test('new Markdown uses one captured terminal palette and leaves inherited prose and authored colors intact', async () => {
  const appearance = new TerminalAppearanceRuntime(new TerminalSettingsStore());
  appearance.acceptPalette(palette(), 'dark');
  let captures = 0;
  const model = new TerminalCanvas('', {
    prepareText: createTextPreparation('markdown', async () => {
      captures++;
      return appearance.getSnapshot();
    }),
  });
  try {
    await paste(
      model,
      'plain [link](https://example.com)\n\n```typescript\nconst value = "hi";\n```'
    );
    expect(captures).toBe(1);
    expect(model.plane.get({ x: 0, y: 0 })?.color).toBe('#000000');
    const cells = [...model.plane.materialize().values()];
    expect([...new Set(cells.map((cell) => cell.color.toLowerCase()))]).toContain('#4466aa');
    const before = model.plane.materialize();
    appearance.acceptPalette(palette('#111111', '#ffffff'), 'light');
    expect(model.plane.materialize()).toEqual(before);
    model.commands.pointAt({ x: 0, y: 15 });
    const literal = createTextPreparation('ansi', () => {
      throw new Error('ANSI should not query appearance');
    });
    const other = new TerminalCanvas('', { prepareText: literal });
    try {
      await paste(other, '\x1b[38;2;201;70;30mX\x1b[0m');
      expect(other.plane.get({ x: 0, y: 0 })?.color).toBe('#c9461e');
    } finally {
      other.dispose();
    }
  } finally {
    model.dispose();
    appearance.dispose();
  }
});

test('unavailable RGB gives Markdown inherited colors, attributes and a diagnostic', async () => {
  const appearance = new TerminalAppearanceRuntime(new TerminalSettingsStore());
  const model = new TerminalCanvas('', {
    prepareText: createTextPreparation('markdown', () => appearance.capture()),
  });
  try {
    await paste(model, '**bold**\n\n```typescript\nconst value = 1;\n```');
    const cells = [...model.plane.materialize().values()];
    expect(cells.every((cell) => cell.color === '#000000' && !cell.bgColor)).toBe(true);
    expect(cells.some((cell) => cell.attrs?.bold)).toBe(true);
    expect(
      model
        .getSnapshot()
        .pasteDiagnostics.some((item) => item.code === 'terminal-colors-unavailable')
    ).toBe(true);
  } finally {
    model.dispose();
    appearance.dispose();
  }
});

test('template tokens use the captured terminal palette and identity templates retain literal colors', () => {
  const appearance = new TerminalAppearanceRuntime(new TerminalSettingsStore());
  try {
    const inherited = appearance.materializeTemplate('button');
    expect(inherited.source.get({ x: 0, y: 0 })).toMatchObject({ color: '#000000' });
    expect(inherited.source.get({ x: 0, y: 0 })?.bgColor).toBeUndefined();
    appearance.acceptPalette(palette(), 'dark');
    expect(appearance.materializeTemplate('button').source.get({ x: 0, y: 0 })).toMatchObject({
      color: '#eeeeee',
      bgColor: '#111111',
    });
    const identity = appearance.materializeTemplate('spotify').rows;
    appearance.acceptPalette(palette('#111111', '#ffffff'), 'light');
    expect(appearance.materializeTemplate('spotify').rows).toEqual(identity);
  } finally {
    appearance.dispose();
  }
});
