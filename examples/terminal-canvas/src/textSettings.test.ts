import { expect, test } from 'bun:test';
import { createTestRenderer, ManualClock } from '@opentui/core/testing';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TerminalCanvas } from './model.ts';
import { CanvasSurface } from './surface.ts';
import { attachControls } from './controller.ts';
import { TerminalSettingsStore } from './settings.ts';
import { createTextPreparation } from './text.ts';

test('Rendering settings validate, persist and drive actual paste features, colors, wrapping and heading anchors', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chardesk-render-settings-')),
    path = join(directory, 'settings.json');
  const settings = await TerminalSettingsStore.load(path);
  const clock = new ManualClock(),
    setup = await createTestRenderer({ width: 110, height: 30, kittyKeyboard: true, clock });
  const model: TerminalCanvas = new TerminalCanvas('', {
    prepareText: (...args) =>
      createTextPreparation(
        settings.values.pasteMode,
        () => surface.appearance.ensurePalette(),
        settings.renderProfile
      )(...args),
    autoAnchors: () => settings.renderProfile.markdownAutoAnchorsEnabled,
  });
  const surface = new CanvasSurface(
    setup.renderer,
    model,
    'Rendering',
    'darwin',
    true,
    undefined,
    settings
  );
  setup.renderer.root.add(surface);
  const detach = attachControls(surface, () => {}, {
    read: async () => ({}),
    write: async () => ({ status: 'written' }),
  });
  surface.setTool('edit');
  await setup.renderOnce();
  const pick = (index: number) => {
    surface.panel!.onPick!(index);
  };
  const escape = () => {
    setup.mockInput.pressEscape();
    clock.advance(40);
  };
  const open = () => {
    surface.activateDock('settings');
    surface.panel!.onTab!(4);
  };
  const paste = async (text: string) => {
    const result = model.commands.pasteProvided(text);
    if (result.status !== 'pending') throw new Error('Expected async render');
    expect((await result.completion).succeeded).toBe(true);
  };
  try {
    open();
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain('Wrap Markdown prose');
    pick(1);
    await setup.mockInput.typeText('40', 0);
    setup.mockInput.pressEnter();
    expect(surface.panel?.error).toContain('60');
    setup.mockInput.pressKey('a', { super: true });
    await setup.mockInput.typeText('60', 0);
    setup.mockInput.pressEnter();
    expect(settings.renderProfile.markdownWrapWidth).toBe(60);
    pick(2);
    expect(settings.renderProfile.markdownAutoAnchorsEnabled).toBe(false);
    pick(3);
    pick(0); // strong off
    expect(settings.renderProfile.features['markdown.strong']!.enabled).toBe(false);
    escape();
    pick(4); // semantic light foreground
    pick(1);
    await setup.mockInput.typeText('#123456', 0);
    setup.mockInput.pressEnter();
    expect(settings.renderProfile.renderThemes.light.foreground).toBe('#123456');
    escape();
    pick(5); // feature colors
    const linkIndex = surface.panel!.items.findIndex((item) => item === 'link');
    pick(linkIndex);
    pick(1);
    await setup.mockInput.typeText('#abcdef', 0);
    setup.mockInput.pressEnter();
    expect(settings.renderProfile.features['markdown.link']!.colors.light.foreground).toBe(
      '#abcdef'
    );
    escape();
    escape();
    escape();
    expect(surface.panel).toBeNull();
    settings.set('pasteMode', 'markdown');
    await paste('# First\n\n**Bold** [link](https://example.com)');
    expect(model.anchors).toHaveLength(0);
    const cells = [...model.plane.materialize().values()];
    expect(cells.some((cell) => cell.color === '#123456')).toBe(true);
    expect(
      cells
        .filter((cell) => cell.href === 'https://example.com')
        .every((cell) => cell.color === '#abcdef')
    ).toBe(true);
    expect(cells.some((cell) => cell.char === 'B' && cell.attrs?.bold)).toBe(false);
    model.commands.undo();
    expect(model.plane.materialize().size).toBe(0);
    open();
    pick(2);
    escape();
    await paste('# Second');
    expect(model.anchors.map((anchor) => anchor.label)).toContain('# Second');
    model.commands.undo();
    expect(model.anchors).toHaveLength(0);
    const prose = 'word '.repeat(30);
    const state = {
      target: 'profile',
      reader: model.plane,
      selections: [],
      cursor: { x: 0, y: 0 },
      foreground: '#000000',
      selectResult: true,
    };
    const wrapped = await createTextPreparation(
      'markdown',
      undefined,
      settings.renderProfile
    )(prose, state);
    settings.setRenderProfile({ markdownWrapEnabled: false });
    const unwrapped = await createTextPreparation(
      'markdown',
      undefined,
      settings.renderProfile
    )(prose, state);
    expect(wrapped.richRows!.length).toBeGreaterThan(unwrapped.richRows!.length);
    for (const background of ['#445566', '#000000']) {
      const profile = settings.renderProfile,
        config = profile.features['markdown.inline-code']!;
      settings.setRenderProfile({
        features: {
          ...profile.features,
          'markdown.inline-code': {
            ...config,
            colors: { ...config.colors, light: { background } },
          },
        },
      });
      const code = await createTextPreparation(
        'markdown',
        () => surface.appearance.capture(),
        settings.renderProfile
      )('`code`', state);
      expect(
        code.richRows!.flatMap((row) => row.spans).some((span) => span.bgColor === background)
      ).toBe(true);
    }
    await settings.flush();
    expect((await TerminalSettingsStore.load(path)).renderProfile).toEqual(settings.renderProfile);
    open();
    pick(6);
    expect(settings.renderProfile.markdownWrapWidth).toBe(80);
    expect(settings.renderProfile.features['markdown.strong']!.enabled).toBe(true);
    expect(settings.renderProfile.renderThemes.light).toEqual({});
    expect(model.canUndo).toBe(false);
  } finally {
    detach();
    await setup.dispose();
    model.dispose();
    await settings.flush();
    await rm(directory, { recursive: true, force: true });
  }
});
