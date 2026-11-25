import { expect, test } from 'bun:test';
import { createTestRenderer, ManualClock } from '@opentui/core/testing';
import { TerminalCanvas } from './model.ts';
import { CanvasSurface } from './surface.ts';
import { attachControls } from './controller.ts';
import { resolveTerminalPolicy } from './terminalPolicy.ts';
import type { TerminalUpdates, UpdateState } from '../../../packages/terminal/src/updates.ts';

async function fixture(updates?: TerminalUpdates) {
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
  let clipboardText = '';
  const detach = attachControls(
    surface,
    () => {},
    {
      read: async () => ({}),
      write: async (data) => {
        clipboardCalls++;
        clipboardText = data.plain;
        return { status: 'written' };
      },
    },
    undefined,
    undefined,
    updates
  );
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
    get clipboardText() {
      return clipboardText;
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

function fakeUpdates() {
  let state: UpdateState = { current: '0.6.11', phase: 'idle' };
  const listeners = new Set<() => void>();
  let checks = 0,
    notes = 0,
    automatic = false;
  const port: TerminalUpdates = {
    get state() {
      return state;
    },
    commands: [
      { label: 'npm (global)', command: 'npm install -g @chardesk/cli@latest' },
      { label: 'Bun (global)', command: 'bun add -g @chardesk/cli@latest' },
    ],
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setAutomatic(enabled) {
      automatic = enabled;
    },
    async check() {
      checks++;
    },
    async openReleaseNotes() {
      notes++;
    },
  };
  return {
    port,
    get checks() {
      return checks;
    },
    get notes() {
      return notes;
    },
    get automatic() {
      return automatic;
    },
    get listeners() {
      return listeners.size;
    },
    publish(next: Partial<UpdateState>) {
      state = { ...state, ...next };
      for (const listener of listeners) listener();
    },
  };
}

test('update status opens the shared settings dialog, copies the chosen command and preserves editing state', async () => {
  const updates = fakeUpdates(),
    f = await fixture(updates.port);
  try {
    expect(f.row()).toBe('F1 for shortcuts');
    expect(updates.automatic).toBe(true);
    f.surface.setTool('edit');
    f.model.commands.selectAll();
    const selection = structuredClone(f.model.selection),
      content = f.model.plane.materialize();
    updates.publish({ phase: 'available', latest: '0.6.12', available: true });
    await f.setup.renderOnce();
    expect(f.row()).toContain('Update available v0.6.12');
    const entry = f.surface.viewStatusControls.find(({ id }) => id === 'updates')!;
    expect(entry.x + entry.width).toBe(89);
    await f.setup.mockMouse.click(entry.x, entry.y);
    const panel = f.surface.panel!;
    expect(panel).toMatchObject({ dialog: true, title: 'Settings', selectedTab: 5 });
    expect(panel.status).toContain('0.6.11');
    panel.onPick!(2);
    panel.onPick!(3);
    await Promise.resolve();
    expect(f.clipboardText).toBe('bun add -g @chardesk/cli@latest');
    panel.onPick!(1);
    expect(updates.checks).toBe(1);
    panel.onPick!(4);
    expect(updates.notes).toBe(1);
    panel.onPick!(0);
    expect(updates.automatic).toBe(false);
    f.escape();
    expect(f.surface.panel).toBeNull();
    expect(f.model.selection).toEqual(selection);
    expect(f.model.plane.materialize()).toEqual(content);
    expect(f.model.canUndo).toBe(false);
    f.stop();
    expect(updates.listeners).toBe(0);
    expect(f.surface.viewStatusControls).toEqual([]);
  } finally {
    await f.dispose();
  }
});

test('update state supports narrow and Chinese layouts, keyboard settings entry and retry without a false update badge', async () => {
  const updates = fakeUpdates(),
    f = await fixture(updates.port);
  try {
    updates.publish({ phase: 'current', latest: '0.6.11', available: false });
    updates.publish({ phase: 'error' });
    expect(f.surface.viewStatusControls.map(({ id }) => id)).toEqual(['shortcuts']);
    f.surface.activateDock('settings');
    const panel = f.surface.panel!;
    panel.onTab!(5);
    f.setup.mockInput.pressArrow('down');
    f.setup.mockInput.pressEnter();
    expect(updates.checks).toBe(1);
    expect(panel.error).toContain('Could not check');
    f.escape();
    updates.publish({ phase: 'available', latest: '0.6.12', available: true });
    await f.setup.resize(32, 12);
    f.surface.settings.set('language', 'zh-CN');
    await f.setup.renderOnce();
    expect(f.row()).toContain('F1 查看快捷键');
    expect(f.row()).toContain('更新 v0.6.12');
    const controls = f.surface.viewStatusControls.sort((a, b) => a.x - b.x);
    expect(controls[0]!.x + controls[0]!.width).toBeLessThan(controls[1]!.x);
    await f.setup.resize(24, 12);
    await f.setup.renderOnce();
    expect(f.row()).toContain('更新 v0.6.12');
    const entry = f.surface.viewStatusControls.find(({ id }) => id === 'updates')!;
    await f.setup.mockMouse.click(entry.x, entry.y);
    expect(f.surface.panel?.selectedTab).toBe(5);
    updates.publish({ phase: 'current', latest: '0.6.11', available: false });
    expect(f.surface.viewStatusControls.map(({ id }) => id)).toEqual(['shortcuts']);
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
    f.setup.mockInput.pressKey('\x1b[47;5u');
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
    f.setup.mockInput.pressKey('\x1b[47;9u');
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
    old();
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
