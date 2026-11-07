import { expect, test } from 'bun:test';
import { createTestRenderer, KeyCodes, ManualClock } from '@opentui/core/testing';
import { RGBA } from '@opentui/core';
import { attachControls } from './controller.ts';
import { TerminalCanvas } from './model.ts';
import { CanvasSurface, CANVAS_TOP } from './surface.ts';
import { TerminalSettingsStore } from './settings.ts';
import { resolveTerminalPolicy } from './terminalPolicy.ts';
import type { ClipboardTextPreparation } from '@chardesk/editor-core/clipboard/commands';
import { createTextPreparation } from './text.ts';

async function fixture(kittyKeyboard = true, prepareText?: ClipboardTextPreparation) {
  const clock = new ManualClock();
  const setup = await createTestRenderer({ width: 90, height: 26, kittyKeyboard, clock });
  const settings = new TerminalSettingsStore();
  const model = new TerminalCanvas('A🦀界B', {
    prepareText:
      prepareText ?? ((...args) => createTextPreparation(settings.values.pasteMode)(...args)),
  });
  const surface = new CanvasSurface(
    setup.renderer,
    model,
    'settings-test',
    'darwin',
    true,
    resolveTerminalPolicy({ TERM_PROGRAM: 'WarpTerminal' }),
    settings
  );
  setup.renderer.root.add(surface);
  let clipboardCalls = 0,
    quits = 0;
  const detach = attachControls(surface, () => quits++, {
    read: async () => {
      clipboardCalls++;
      return { plainText: 'BAD' };
    },
    write: async () => {
      clipboardCalls++;
      return { status: 'written' };
    },
  });
  surface.setTool('edit');
  model.commands.selectAll();
  await setup.renderOnce();
  return {
    setup,
    model,
    settings,
    surface,
    get clipboardCalls() {
      return clipboardCalls;
    },
    get quits() {
      return quits;
    },
    async escape() {
      setup.mockInput.pressEscape();
      clock.advance(40);
      await setup.renderOnce();
    },
    async dispose() {
      detach();
      await setup.dispose();
      model.dispose();
    },
  };
}

for (const kitty of [false, true]) {
  test(`Settings modal owns keyboard/paste input and preserves document and selection (Kitty ${kitty})`, async () => {
    const f = await fixture(kitty);
    try {
      const content = f.model.plane.materialize(),
        selection = structuredClone(f.model.selection),
        viewport = { ...f.model.viewport };
      f.surface.activateDock('settings');
      await f.setup.renderOnce();
      expect(f.surface.panel?.dialog).toBe(true);
      expect(f.setup.captureCharFrame()).toContain('Selection background');
      const frame = f.setup.captureCharFrame().split('\n');
      const layout = f.surface.panelLayout;
      expect(frame.slice(layout.y, layout.y + layout.height).join('\n')).not.toContain(
        'Tab section'
      );
      expect(frame[f.setup.renderer.height - 1]).toContain('Settings · Tab section · Enter change');
      expect(f.setup.renderer.getCursorState().visible).toBe(false);
      await f.setup.mockInput.typeText('SHOULD_NOT_TYPE', 0);
      await f.setup.mockInput.pasteBracketedText('SHOULD_NOT_PASTE');
      f.setup.mockInput.pressKey('y', { ctrl: true });
      f.setup.mockInput.pressKey('x', { super: true });
      f.setup.mockInput.pressKey(KeyCodes.ARROW_DOWN, { meta: true });
      expect(f.model.editor.commands.canExecute('terminal.copy', undefined)).toBe(false);
      expect(f.model.editor.commands.canExecute('terminal.undo', undefined)).toBe(false);
      expect(f.clipboardCalls).toBe(0);
      expect(f.quits).toBe(0);
      expect(f.model.plane.materialize()).toEqual(content);
      expect(f.model.selection).toEqual(selection);
      expect(f.model.viewport).toEqual(viewport);
      expect(f.model.canUndo).toBe(false);
      await f.escape();
      expect(f.surface.panel).toBeNull();
      expect(f.setup.captureCharFrame().split('\n')[f.setup.renderer.height - 1]).not.toContain(
        'Tab section'
      );
      expect(f.model.selection).toEqual(selection);
      f.setup.renderer.keyInput.processParsedKey({
        name: 'escape',
        ctrl: false,
        meta: false,
        shift: false,
        option: false,
        sequence: '\x1b',
        number: false,
        raw: '\x1b',
        eventType: 'repeat',
        source: 'kitty',
      });
      expect(f.model.selection).toEqual(selection);
    } finally {
      await f.dispose();
    }
  });
}

test('keyboard sections change live cursor, selection palette, navigation and paste preferences', async () => {
  const f = await fixture();
  try {
    f.surface.activateDock('settings');
    f.setup.mockInput.pressArrow('right');
    expect(f.settings.values.cursorStyle).toBe('line');
    expect(f.setup.renderer.getCursorState().style).toBe('line');
    f.setup.mockInput.pressArrow('down');
    f.setup.mockInput.pressEnter();
    expect(f.settings.values.cursorBlink).toBe(false);
    expect(f.setup.renderer.getCursorState().blinking).toBe(false);
    f.setup.mockInput.pressArrow('down');
    f.setup.mockInput.pressArrow('right');
    expect(f.settings.values.selectionColor).toBe(8);
    f.setup.mockInput.pressArrow('right');
    expect(f.settings.values.selectionColor).toBe(4);
    f.setup.mockInput.pressTab();
    expect(f.surface.panel?.selectedTab).toBe(1);
    f.setup.mockInput.pressArrow('right');
    expect(f.settings.values.panStep).toBe(20);
    f.setup.mockInput.pressTab();
    f.setup.mockInput.pressArrow('right');
    expect(f.settings.values.pasteMode).toBe('plain');
    f.setup.mockInput.pressTab({ shift: true });
    expect(f.surface.panel?.selectedTab).toBe(1);
    await f.escape();
    const before = { ...f.model.viewport };
    f.setup.mockInput.pressKey(KeyCodes.ARROW_UP, { meta: true });
    expect(f.model.viewport.y).toBe(before.y - 20);
    expect(f.surface.helpLines.join('\n')).toContain('pan 20 cells');
    f.model.viewport = { ...before, x: 0, y: 0 };
    await f.setup.renderOnce();
    const row = f.setup.captureSpans().lines[CANVAS_TOP]!;
    for (const span of row.spans.filter((span) => /[A🦀界B]/u.test(span.text)))
      expect(span.bg.toInts()).toEqual(RGBA.fromIndex(4).toInts());
    expect(f.model.canUndo).toBe(false);
  } finally {
    await f.dispose();
  }
});

test('the shared status bar follows focused panels, menus, help and canvas without duplicate hints or errors', async () => {
  const f = await fixture();
  try {
    const { surface, setup } = f;
    surface.panel = {
      title: 'Open file',
      hint: 'Enter confirm · Esc cancel',
      input: 'example.chardesk',
      items: [],
      selected: 0,
      error: 'File unavailable',
    };
    await setup.renderOnce();
    let lines = setup.captureCharFrame().split('\n');
    const body = lines.slice(CANVAS_TOP, setup.renderer.height - 1).join('\n');
    expect(body).toContain('example.chardesk');
    expect(body).not.toContain('Enter confirm');
    expect(body).toContain('File unavailable');
    expect(lines[setup.renderer.height - 1]?.trim()).toBe('Open file · Enter confirm · Esc cancel');
    surface.panel = null;
    surface.contextMenu!.open();
    await setup.renderOnce();
    expect(surface.statusBar).toMatchObject({ context: 'Context menu' });
    expect(surface.statusBar.hint).toContain('Enter run');
    surface.contextMenu!.close();
    setup.mockInput.pressKey(KeyCodes.F1);
    await setup.renderOnce();
    lines = setup.captureCharFrame().split('\n');
    expect(surface.statusBar.context).toBe('Help');
    expect(lines[setup.renderer.height - 1]?.trim()).toBe('Help · Esc close');
    await f.escape();
    expect(surface.statusBar.context).toBe('');
    expect(surface.statusBar.status).toBeUndefined();
    expect(surface.statusBar.hint).toBe('');
  } finally {
    await f.dispose();
  }
});

test('toolbar, tabs, value rows, reset and close targets work without click-through', async () => {
  const f = await fixture();
  try {
    const button = f.surface.headerControls.find((item) => item.id === 'settings')!;
    expect(button.label).toBe('[Settings]');
    await f.setup.mockMouse.click(button.x + 1, button.y);
    await f.setup.renderOnce();
    const selection = structuredClone(f.model.selection);
    const navigation = f.surface.panelTabControls[1]!;
    await f.setup.mockMouse.click(navigation.x + 1, navigation.y);
    expect(f.surface.panel?.selectedTab).toBe(1);
    const l = f.surface.panelLayout;
    await f.setup.mockMouse.click(l.x + 3, l.itemsY);
    expect(f.settings.values.panStep).toBe(20);
    await f.setup.mockMouse.click(l.x + 3, l.itemsY + 1);
    expect(f.settings.values.panStep).toBe(10);
    await f.setup.mockMouse.click(l.x + l.width - 3, l.y);
    expect(f.surface.panel?.dialog).toBe(true);
    await f.setup.renderOnce();
    expect(f.setup.captureCharFrame().split('\n')[l.y]).not.toContain('×');
    await f.setup.mockMouse.click(0, CANVAS_TOP + 1);
    expect(f.surface.panel).toBeNull();
    expect(f.model.selection).toEqual(selection);
    expect(f.model.canUndo).toBe(false);
  } finally {
    await f.dispose();
  }
});

test('small terminals consume changes safely and recover the dialog after resizing', async () => {
  const f = await fixture();
  try {
    f.surface.activateDock('settings');
    f.setup.resize(22, 9);
    await f.setup.renderOnce();
    expect(f.setup.captureCharFrame()).toContain('Enlarge terminal');
    f.setup.mockInput.pressArrow('right');
    expect(f.settings.values.cursorStyle).toBe('block');
    f.setup.resize(22, 26);
    await f.setup.renderOnce();
    const hidden = f.surface.panelLayout;
    await f.setup.mockMouse.click(hidden.x + 3, hidden.itemsY);
    expect(f.settings.values.cursorStyle).toBe('block');
    f.setup.resize(90, 26);
    await f.setup.renderOnce();
    expect(f.setup.captureCharFrame()).toContain('Appearance');
    f.setup.mockInput.pressArrow('right');
    expect(f.settings.values.cursorStyle).toBe('line');
    await f.escape();
    expect(f.surface.panel).toBeNull();
  } finally {
    await f.dispose();
  }
});

test('settings command and toolbar follow shared shortcut rebinding', async () => {
  const f = await fixture();
  try {
    f.model.editor.keymap.setUserBindings('terminal.settings', [['Ctrl+,']]);
    expect(f.surface.headerControls.find((item) => item.id === 'settings')?.label).toBe(
      '[Settings]'
    );
    f.setup.mockInput.pressKey(KeyCodes.F11);
    expect(f.surface.panel).toBeNull();
    f.setup.mockInput.pressKey(',', { ctrl: true });
    expect(f.surface.panel?.dialog).toBe(true);
  } finally {
    await f.dispose();
  }
});

test('opening Settings cancels an older asynchronous paste before it can mutate the canvas', async () => {
  const pending = Promise.withResolvers<Awaited<ReturnType<ClipboardTextPreparation>>>();
  const f = await fixture(true, () => pending.promise);
  try {
    const content = f.model.plane.materialize(),
      selection = structuredClone(f.model.selection);
    const result = f.model.commands.pasteProvided('LATE');
    expect(result.status).toBe('pending');
    f.surface.activateDock('settings');
    pending.resolve({ plainText: 'LATE' });
    if (result.status === 'pending') await result.completion;
    expect(f.surface.panel?.dialog).toBe(true);
    expect(f.model.plane.materialize()).toEqual(content);
    expect(f.model.selection).toEqual(selection);
    expect(f.model.canUndo).toBe(false);
  } finally {
    pending.resolve({ plainText: '' });
    await f.dispose();
  }
});

test('changing Paste settings affects the next real paste without restarting the session', async () => {
  const f = await fixture();
  try {
    f.surface.activateDock('settings');
    f.setup.mockInput.pressTab();
    f.setup.mockInput.pressTab();
    f.setup.mockInput.pressArrow('right'); // auto → plain
    await f.escape();
    f.model.commands.pointAt({ x: 0, y: 3 });
    await f.setup.mockInput.pasteBracketedText('**literal**');
    await f.setup.waitFor(() => f.model.plane.get({ x: 0, y: 3 })?.char === '*');
    f.surface.activateDock('settings');
    f.setup.mockInput.pressArrow('left'); // plain → auto; section retained
    await f.escape();
    f.model.commands.pointAt({ x: 0, y: 5 });
    await f.setup.mockInput.pasteBracketedText('**bold**');
    await f.setup.waitFor(() => f.model.plane.get({ x: 0, y: 5 })?.char === 'b');
    expect(f.model.plane.get({ x: 0, y: 5 })?.attrs?.bold).toBe(true);
    expect(f.model.plane.get({ x: 0, y: 3 })?.char).toBe('*');
    expect(f.model.canUndo).toBe(true);
  } finally {
    await f.dispose();
  }
});
