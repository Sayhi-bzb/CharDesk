import { expect, test } from 'bun:test';
import { createTestRenderer, ManualClock } from '@opentui/core/testing';
import { TerminalCanvas } from './model.ts';
import { CanvasSurface, CANVAS_TOP } from './surface.ts';
import { attachControls } from './controller.ts';
import { resolveTerminalPolicy } from './terminalPolicy.ts';

async function fixture() {
  const clock = new ManualClock();
  const setup = await createTestRenderer({ width: 100, height: 30, kittyKeyboard: true, clock });
  const model = new TerminalCanvas('Underlay 界🦀');
  const surface = new CanvasSurface(
    setup.renderer,
    model,
    'Guide',
    'darwin',
    true,
    resolveTerminalPolicy({ TERM_PROGRAM: 'WarpTerminal' })
  );
  setup.renderer.root.add(surface);
  let clipboardCalls = 0;
  const detach = attachControls(surface, () => {}, {
    read: async () => {
      clipboardCalls++;
      return {};
    },
    write: async () => {
      clipboardCalls++;
      return { status: 'written' };
    },
  });
  surface.setTool('edit');
  model.viewport = { ...model.viewport, x: 0, y: 0 };
  await setup.renderOnce();
  return {
    setup,
    model,
    surface,
    get clipboardCalls() {
      return clipboardCalls;
    },
    open: () => setup.mockInput.pressKey('F1'),
    escape: () => {
      setup.mockInput.pressEscape();
      clock.advance(40);
    },
    async dispose() {
      detach();
      await setup.dispose();
      model.dispose();
    },
  };
}

test('shortcut guide reuses Settings dialog geometry and renders aligned labels and effective keys over the canvas', async () => {
  const f = await fixture();
  try {
    f.surface.activateDock('settings');
    const settings = f.surface.panelLayout;
    f.escape();
    const viewport = { ...f.model.viewport };
    f.open();
    await f.setup.renderOnce();
    expect(f.surface.panel).toMatchObject({ dialog: true, title: 'Shortcuts', selectedTab: 0 });
    expect(f.surface.panelLayout).toMatchObject({
      x: settings.x,
      y: settings.y,
      width: settings.width,
      height: settings.height,
    });
    expect(f.surface.panel?.tabs).toEqual(['Edit', 'Canvas', 'App']);
    expect(f.surface.panel?.items[0]).toBe('Copy');
    expect(f.surface.panel?.itemHints?.[0]).toBe('Ctrl+Y');
    const frame = f.setup.captureCharFrame().split('\n'),
      l = f.surface.panelLayout;
    expect(frame[l.y]).toContain('┌ Shortcuts');
    expect(frame[l.itemsY]).toContain('Copy');
    expect(frame[l.itemsY]).toContain('Ctrl+Y');
    expect(frame[CANVAS_TOP]).toContain('Underlay');
    expect(frame[f.surface.footerBounds.y]).toContain('Tab section');
    expect(f.model.viewport).toEqual(viewport);
    expect(f.setup.renderer.getCursorState().visible).toBe(false);
    f.open();
    expect(f.surface.help).toBe(false);
    expect(f.surface.panel).toBeNull();
  } finally {
    await f.dispose();
  }
});

test('guide tabs, row scrolling and contextual descriptions share the panel input and geometry', async () => {
  const f = await fixture();
  try {
    f.open();
    f.setup.mockInput.pressTab();
    expect(f.surface.panel?.selectedTab).toBe(1);
    f.surface.panel!.selected = f.surface.panel!.items.indexOf('Pan');
    f.surface.settings.set('panStep', 20);
    await f.setup.renderOnce();
    expect(f.surface.panel?.status).toContain('pan 20 cells');
    f.setup.mockInput.pressKey('END');
    expect(f.surface.panel!.selected).toBe(f.surface.panel!.items.length - 1);
    f.setup.mockInput.pressKey('\x1b[5~');
    expect(f.surface.panel!.selected).toBeLessThan(f.surface.panel!.items.length - 1);
    f.setup.mockInput.pressTab({ shift: true });
    expect(f.surface.panel?.selectedTab).toBe(0);
    await f.setup.renderOnce();
    const app = f.surface.panelTabControls[2]!;
    await f.setup.mockMouse.click(app.x + 1, app.y);
    expect(f.surface.panel?.selectedTab).toBe(2);
    expect(f.surface.panel?.items).toContain('Sessions');
    f.setup.mockInput.pressTab();
    await f.setup.renderOnce();
    const layout = f.surface.panelLayout;
    await f.setup.mockMouse.scroll(layout.x + 3, layout.itemsY + 1, 'down');
    expect(f.surface.panel!.selected).toBeGreaterThan(0);
  } finally {
    await f.dispose();
  }
});

test('read-only shortcut rows cannot execute clipboard commands, type, paste or click through to canvas', async () => {
  const f = await fixture();
  try {
    f.model.commands.selectAll();
    const content = f.model.plane.materialize(),
      selection = structuredClone(f.model.selection);
    f.open();
    await f.setup.renderOnce();
    f.setup.mockInput.pressEnter();
    f.setup.mockInput.pressKey('y', { ctrl: true });
    await f.setup.mockInput.typeText('should not type', 0);
    await f.setup.mockInput.pasteBracketedText('should not paste');
    const layout = f.surface.panelLayout;
    await f.setup.mockMouse.click(layout.x + 3, layout.itemsY);
    expect(f.surface.help).toBe(true);
    expect(f.clipboardCalls).toBe(0);
    expect(f.model.plane.materialize()).toEqual(content);
    expect(f.model.selection).toEqual(selection);
    await f.setup.mockMouse.click(0, CANVAS_TOP);
    expect(f.surface.panel).toBeNull();
    expect(f.model.selection).toEqual(selection);
    expect(f.model.canUndo).toBe(false);
  } finally {
    await f.dispose();
  }
});

test('open guide tracks binding and language changes without keeping a second help state', async () => {
  const f = await fixture();
  try {
    f.open();
    f.model.editor.keymap.setUserBindings('terminal.copy', [['Control+F12']]);
    f.surface.settings.set('language', 'zh-CN');
    await f.setup.renderOnce();
    expect(f.surface.panel?.title).toBe('快捷键');
    expect(f.surface.panel?.tabs).toEqual(['编辑', '画布', '应用']);
    expect(f.surface.panel?.items[0]).toBe('复制');
    expect(f.surface.panel?.itemHints?.[0]).toContain('F12');
    expect(f.surface.panel?.itemHints?.[0]).not.toContain('Ctrl+Y');
    f.surface.panel = { dialog: true, title: 'Other dialog', hint: '', items: [], selected: 0 };
    expect(f.surface.help).toBe(false);
    expect(f.surface.panel?.title).toBe('Other dialog');
    f.surface.help = false;
    expect(f.surface.panel?.title).toBe('Other dialog');
  } finally {
    await f.dispose();
  }
});

test('shortcut dialog consumes input in tiny terminals and recovers its tabs and columns after resize', async () => {
  const f = await fixture();
  try {
    f.open();
    const content = f.model.plane.materialize();
    await f.setup.resize(22, 9);
    await f.setup.renderOnce();
    expect(f.setup.captureCharFrame()).toContain('Enlarge terminal');
    f.setup.mockInput.pressTab();
    f.setup.mockInput.pressArrow('down');
    expect(f.surface.panel?.selectedTab).toBe(0);
    expect(f.surface.panel?.selected).toBe(0);
    await f.setup.resize(32, 16);
    await f.setup.renderOnce();
    expect(f.surface.panelTabControls).toHaveLength(3);
    for (const tab of f.surface.panelTabControls) expect(tab.x + tab.width).toBeLessThanOrEqual(32);
    f.escape();
    expect(f.surface.help).toBe(false);
    expect(f.model.plane.materialize()).toEqual(content);
  } finally {
    await f.dispose();
  }
});
