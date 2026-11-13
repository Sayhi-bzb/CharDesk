import { expect, test } from 'bun:test';
import { createTestRenderer, ManualClock } from '@opentui/core/testing';
import { TerminalCanvas } from './model.ts';
import { CanvasSurface } from './surface.ts';
import { attachControls } from './controller.ts';
import { resolveTerminalPolicy } from './terminalPolicy.ts';

async function fixture() {
  const clock = new ManualClock();
  const setup = await createTestRenderer({ width: 90, height: 24, kittyKeyboard: true, clock });
  const model = new TerminalCanvas('A界B');
  const surface = new CanvasSurface(
    setup.renderer,
    model,
    'View status',
    'darwin',
    true,
    resolveTerminalPolicy({ TERM_PROGRAM: 'WarpTerminal' })
  );
  setup.renderer.root.add(surface);
  let clipboardCalls = 0;
  const detach = attachControls(surface, () => {}, {
    read: async () => ({}),
    write: async () => {
      clipboardCalls++;
      return { status: 'written' };
    },
  });
  let active = true;
  const stop = () => {
    if (active) {
      active = false;
      detach();
    }
  };
  await setup.renderOnce();
  return {
    setup,
    model,
    surface,
    stop,
    get clipboardCalls() {
      return clipboardCalls;
    },
    row: () => setup.captureCharFrame().split('\n')[surface.footerBounds.y + 1]!.trim(),
    escape: () => {
      setup.mockInput.pressEscape();
      clock.advance(40);
    },
    async dispose() {
      stop();
      await setup.dispose();
      model.dispose();
    },
  };
}

test('view status remains stable across tools, selection, feedback and dialogs; its entry opens the guide', async () => {
  const f = await fixture();
  try {
    expect(f.row()).toBe('F1 for shortcuts');
    const content = f.model.plane.materialize();
    f.surface.setTool('edit');
    f.model.commands.selectAll();
    const selection = structuredClone(f.model.selection);
    f.surface.feedback.show('Copied');
    await f.setup.renderOnce();
    expect(f.row()).toBe('F1 for shortcuts');
    expect(f.row()).not.toContain('Copy');
    f.surface.activateDock('settings');
    await f.setup.renderOnce();
    expect(f.row()).toBe('F1 for shortcuts');
    const entry = f.surface.viewStatusControls.find(({ id }) => id === 'shortcuts')!;
    await f.setup.mockMouse.click(entry.x + 1, entry.y);
    await f.setup.renderOnce();
    expect(f.surface.panel).toMatchObject({ dialog: true, title: 'Shortcuts' });
    expect(f.surface.help).toBe(true);
    expect(f.surface.helpLines[0]).toContain('Ctrl+Y Copy');
    expect(f.row()).toBe('F1 for shortcuts');
    expect(f.model.selection).toEqual(selection);
    expect(f.model.plane.materialize()).toEqual(content);
    expect(f.clipboardCalls).toBe(0);
  } finally {
    await f.dispose();
  }
});

test('F1 and Ctrl+/ open view shortcuts across dialogs while Command+/ and question marks stay unbound', async () => {
  const f = await fixture();
  try {
    f.surface.setTool('hand');
    f.setup.mockInput.pressKey('?');
    expect(f.surface.help).toBe(false);
    f.setup.mockInput.pressKey('\x1b[47;5u'); // Ctrl+/ needs no Shift modifier.
    expect(f.surface.help).toBe(true);
    f.escape();
    f.surface.setTool('edit');
    const cursor = { ...f.model.cursor };
    f.setup.mockInput.pressKey('?');
    expect(f.surface.help).toBe(false);
    expect(f.model.plane.get(cursor)?.char).toBe('?');
    f.surface.activateDock('settings');
    f.surface.panel!.onTab!(3);
    f.setup.mockInput.pressKey('?');
    expect(f.surface.help).toBe(false);
    expect(f.surface.panel?.input).toBe('?');
    f.setup.mockInput.pressKey('\x1b[47;9u'); // Command+/ stays with the terminal.
    expect(f.surface.help).toBe(false);
    expect(f.surface.panel?.title).toBe('Settings');
    f.setup.mockInput.pressKey('F1');
    expect(f.surface.panel).toMatchObject({ dialog: true, title: 'Shortcuts' });
    expect(f.surface.help).toBe(true);
  } finally {
    await f.dispose();
  }
});

test('the view shortcut follows user bindings while the entry remains available when unbound', async () => {
  const f = await fixture();
  try {
    f.surface.setTool('hand');
    f.model.editor.keymap.setUserBindings('terminal.view-shortcuts', [['Control+F12']]);
    await f.setup.renderOnce();
    expect(f.row()).toContain('F12');
    expect(f.row()).not.toContain('F1 for shortcuts');
    f.setup.mockInput.pressKey('F1');
    expect(f.surface.help).toBe(false);
    f.setup.mockInput.pressKey('/', { ctrl: true });
    expect(f.surface.help).toBe(false);
    f.setup.mockInput.pressKey('F12', { ctrl: true });
    expect(f.surface.help).toBe(true);
    f.escape();
    f.model.editor.keymap.setUserBindings('terminal.view-shortcuts', []);
    await f.setup.renderOnce();
    expect(f.row()).toBe('Shortcuts');
    const entry = f.surface.viewStatusControls[0]!;
    await f.setup.mockMouse.click(entry.x, entry.y);
    expect(f.surface.help).toBe(true);
  } finally {
    await f.dispose();
  }
});

test('independent view contributors align, update and dispose without touching document state', async () => {
  const f = await fixture();
  try {
    f.surface.setTool('edit');
    f.model.commands.selectAll();
    const selection = structuredClone(f.model.selection),
      content = f.model.plane.materialize();
    let opens = 0;
    const old = f.surface.viewStatus.set({
      id: 'agents',
      text: 'agents: working',
      align: 'right',
      onPick: () => {
        opens++;
      },
    });
    await f.setup.renderOnce();
    const agents = f.surface.viewStatusControls.find(({ id }) => id === 'agents')!;
    expect(agents.x + agents.width).toBe(f.setup.renderer.width - 1);
    expect(f.row()).toContain('F1 for shortcuts');
    await f.setup.mockMouse.click(agents.x, agents.y);
    expect(opens).toBe(1);
    const current = f.surface.viewStatus.set({
      id: 'agents',
      text: 'agents: idle',
      align: 'right',
    });
    old(); // A stale owner cannot remove the replacement contribution.
    await f.setup.resize(32, 12);
    f.surface.settings.set('language', 'zh-CN');
    await f.setup.renderOnce();
    expect(f.row()).toContain('F1 查看快捷键');
    const controls = f.surface.viewStatusControls.sort((a, b) => a.x - b.x);
    expect(controls).toHaveLength(2);
    expect(controls[0]!.x + controls[0]!.width).toBeLessThan(controls[1]!.x);
    expect(controls[1]!.x + controls[1]!.width).toBeLessThanOrEqual(31);
    current();
    await f.setup.renderOnce();
    expect(f.surface.viewStatusControls.map(({ id }) => id)).toEqual(['shortcuts']);
    expect(f.model.selection).toEqual(selection);
    expect(f.model.plane.materialize()).toEqual(content);
    expect(f.model.canUndo).toBe(false);
  } finally {
    await f.dispose();
  }
});

test('disposal releases only the default view entry and blank view cells never activate the canvas', async () => {
  const f = await fixture();
  try {
    f.surface.setTool('edit');
    const cursor = { ...f.model.cursor };
    await f.setup.mockMouse.click(89, f.surface.footerBounds.y + 1);
    expect(f.model.cursor).toEqual(cursor);
    const remove = f.surface.viewStatus.set({
      id: 'other-view',
      text: 'owned elsewhere',
      align: 'right',
    });
    f.stop();
    expect(f.surface.viewStatusControls.map(({ id }) => id)).toEqual(['other-view']);
    remove();
    expect(f.surface.viewStatusControls).toEqual([]);
  } finally {
    await f.dispose();
  }
});
