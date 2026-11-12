import { expect, test } from 'bun:test';
import { createTestRenderer, ManualClock } from '@opentui/core/testing';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TerminalCanvas } from './model.ts';
import { CanvasSurface } from './surface.ts';
import { attachControls } from './controller.ts';
import { TerminalSettingsStore } from './settings.ts';

async function fixture(settings: TerminalSettingsStore, platform: NodeJS.Platform = 'darwin') {
  const clock = new ManualClock();
  const setup = await createTestRenderer({ width: 110, height: 30, kittyKeyboard: true, clock });
  const model = new TerminalCanvas('AB🦀');
  const surface = new CanvasSurface(
    setup.renderer,
    model,
    'Shortcuts',
    platform,
    true,
    undefined,
    settings
  );
  setup.renderer.root.add(surface);
  let copies = 0;
  const detach = attachControls(surface, () => {}, {
    read: async () => ({}),
    write: async () => {
      copies++;
      return { status: 'written' };
    },
  });
  surface.setTool('edit');
  model.commands.selectAll();
  await setup.renderOnce();
  const open = () => {
    surface.activateDock('settings');
    surface.panel!.onTab!(3);
  };
  const search = async (query: string) => {
    await setup.mockInput.typeText(query, 0);
    expect(surface.panel!.items[0]).not.toContain('Restore all');
    setup.mockInput.pressEnter();
  };
  return {
    setup,
    model,
    surface,
    open,
    search,
    clock,
    get copies() {
      return copies;
    },
    async dispose() {
      detach();
      await setup.dispose();
      model.dispose();
    },
  };
}

test('Settings records, saves, reloads and dispatches a binding through the existing catalog without editing canvas', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chardesk-keymap-')),
    path = join(directory, 'settings.json');
  const settings = await TerminalSettingsStore.load(path);
  const f = await fixture(settings);
  try {
    const before = f.model.plane.materialize(),
      selection = structuredClone(f.model.selection);
    f.open();
    await f.setup.mockInput.typeText('terminal.copy', 0);
    f.setup.mockInput.pressKey('🦀');
    expect(f.surface.panel?.input).toBe('terminal.copy🦀');
    f.setup.mockInput.pressKey('\x7f');
    expect(f.surface.panel?.input).toBe('terminal.copy');
    f.setup.mockInput.pressEnter();
    f.setup.mockInput.pressKey('F5');
    f.setup.mockInput.pressKey('F12');
    expect(f.surface.panel?.input).toBe('F12');
    f.setup.mockInput.pressEnter();
    expect(settings.keybindings['terminal.copy']).toEqual([['F12']]);
    expect(f.surface.shortcuts.copy.label).toBe('F12');
    f.setup.mockInput.pressEscape();
    f.clock.advance(40);
    f.setup.mockInput.pressKey('F12');
    await Bun.sleep(10);
    expect(f.copies).toBe(1);
    expect(f.model.plane.materialize()).toEqual(before);
    expect(f.model.selection).toEqual(selection);
    expect(f.model.canUndo).toBe(false);
    await settings.flush();
    expect(JSON.parse(await readFile(path, 'utf8')).shortcuts['terminal.copy']).toEqual([['F12']]);
    const reopened = await fixture(await TerminalSettingsStore.load(path));
    try {
      reopened.setup.mockInput.pressKey('F12');
      await Bun.sleep(10);
      expect(reopened.copies).toBe(1);
      expect(reopened.surface.shortcuts.copy.label).toBe('F12');
    } finally {
      await reopened.dispose();
    }
  } finally {
    await f.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});

test('shortcut conflicts, malformed sequences, recording cancellation, reset and search paste stay in the modal', async () => {
  const f = await fixture(new TerminalSettingsStore());
  try {
    f.open();
    await f.search('terminal.copy');
    await f.setup.mockInput.pasteBracketedText('F1 ');
    expect(f.surface.panel?.input).toBe('F1 ');
    f.setup.mockInput.pressEnter();
    expect(f.surface.panel?.error).toContain('terminal.help');
    expect(f.model.editor.keymap.getUserBindings()['terminal.copy']).toBeUndefined();
    f.setup.mockInput.pressKey('a', { super: true });
    await f.setup.mockInput.typeText('Control+InvalidKey', 0);
    f.setup.mockInput.pressEnter();
    expect(f.surface.panel?.error).toContain('valid shortcut');
    f.setup.mockInput.pressKey('F5');
    f.setup.mockInput.pressKey('F12');
    f.setup.renderer.emit('blur');
    expect(f.surface.panel?.input).toBe('Control+InvalidKey');
    f.setup.mockInput.pressKey('F5');
    f.setup.mockInput.pressKey('k', { ctrl: true });
    f.setup.mockInput.pressKey('j', { ctrl: true });
    expect(f.surface.panel?.input).toBe('Control+K Control+J');
    f.setup.mockInput.pressEnter();
    expect(f.model.editor.keymap.getUserBindings()['terminal.copy']).toEqual([
      ['Control+K', 'Control+J'],
    ]);
    f.setup.mockInput.pressEscape();
    f.clock.advance(40);
    f.setup.mockInput.pressKey('k', { ctrl: true });
    f.setup.mockInput.pressKey('j', { ctrl: true });
    await Bun.sleep(10);
    expect(f.copies).toBe(1);
    f.open();
    f.surface.panel!.onInput!('terminal.hand');
    f.setup.mockInput.pressEnter();
    await f.setup.mockInput.typeText('Control+K', 0);
    f.setup.mockInput.pressEnter();
    expect(f.surface.panel?.error).toContain('terminal.copy');
    f.setup.mockInput.pressEscape();
    f.clock.advance(40);
    f.surface.panel!.onInput!('terminal.copy');
    f.setup.mockInput.pressEnter();
    await f.setup.mockInput.typeText('Control+K / Control+K Control+J', 0);
    f.setup.mockInput.pressEnter();
    expect(f.surface.panel?.error).toContain('terminal.copy');
    f.setup.mockInput.pressKey('a', { super: true });
    await f.setup.mockInput.typeText('Control+K', 0);
    f.setup.mockInput.pressEnter();
    expect(f.model.editor.keymap.getUserBindings()['terminal.copy']).toEqual([['Control+K']]);
    f.surface.panel!.input = '';
    f.surface.panel!.onInput!('');
    f.surface.panel!.onPick!(f.surface.panel!.items.length - 1);
    expect(f.model.editor.keymap.getUserBindings()).toEqual({});
    expect(f.model.canUndo).toBe(false);
  } finally {
    await f.dispose();
  }
});

test('invalid persisted shortcut files are protected and unbound/future-owner bindings round-trip', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chardesk-keymap-file-')),
    path = join(directory, 'settings.json');
  try {
    const source = JSON.stringify({
      version: 1,
      values: {},
      shortcuts: { 'terminal.copy': [['invalid key names']] },
    });
    await writeFile(path, source);
    const broken = await TerminalSettingsStore.load(path);
    broken.setKeybindings({ 'terminal.copy': [['F12']] });
    await broken.flush();
    expect(broken.error).toContain('preserved');
    expect(await readFile(path, 'utf8')).toBe(source);
    await rm(path);
    const valid = await TerminalSettingsStore.load(path);
    valid.setKeybindings({ 'terminal.copy': [], 'future.action': [['Control+K', 'Control+J']] });
    await valid.flush();
    expect((await TerminalSettingsStore.load(path)).keybindings).toEqual(valid.keybindings);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

for (const [platform, modifiers, expected] of [
  ['darwin', { ctrl: true }, 'Control+F12'],
  ['darwin', { meta: true }, 'Alt+F12'],
  ['darwin', { super: true }, 'Meta+F12'],
  ['win32', { ctrl: true }, 'Control+F12'],
] as const) {
  test(`${platform} recording preserves ${expected} as a physical binding`, async () => {
    const f = await fixture(new TerminalSettingsStore(), platform);
    try {
      f.open();
      await f.search('terminal.copy');
      f.setup.mockInput.pressKey('F5');
      f.setup.mockInput.pressKey('F12', modifiers);
      expect(f.surface.panel?.input).toBe(expected);
      f.setup.mockInput.pressEnter();
      expect(f.model.editor.keymap.getUserBindings()['terminal.copy']).toEqual([[expected]]);
    } finally {
      await f.dispose();
    }
  });
}

test('Settings can bind an unassigned tool and resetting it restores Dock-only activation', async () => {
  const settings = new TerminalSettingsStore();
  const f = await fixture(settings);
  try {
    expect(f.surface.shortcuts.hand.keys).toEqual([]);
    f.open();
    await f.search('terminal.hand');
    f.setup.mockInput.pressKey('F5');
    f.setup.mockInput.pressKey('F3');
    f.setup.mockInput.pressEnter();
    expect(settings.keybindings['terminal.hand']).toEqual([['F3']]);
    f.setup.mockInput.pressEscape();
    f.clock.advance(40);
    f.setup.mockInput.pressKey('F3');
    expect(f.surface.tool).toBe('hand');
    expect(f.surface.dockControls.find((control) => control.id === 'hand')?.label).toBe('[Hand]');
    f.model.editor.keymap.setUserBindings('terminal.hand', null);
    expect(f.surface.shortcuts.hand.keys).toEqual([]);
    f.surface.activateDock('edit');
    f.setup.mockInput.pressKey('F3');
    expect(f.surface.tool).toBe('edit');
  } finally {
    await f.dispose();
  }
});
