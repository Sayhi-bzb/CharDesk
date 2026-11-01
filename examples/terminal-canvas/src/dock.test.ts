import { expect, test } from 'bun:test';
import { createTextAttributes } from '@opentui/core';
import { createTestRenderer, ManualClock } from '@opentui/core/testing';
import { TerminalCanvas } from './model.ts';
import { CanvasSurface } from './surface.ts';
import { attachControls } from './controller.ts';

async function fixture(kittyKeyboard = true, platform: NodeJS.Platform = 'darwin') {
  const clock = new ManualClock();
  const setup = await createTestRenderer({ width: 110, height: 30, kittyKeyboard, clock });
  const model = new TerminalCanvas('A🦀界B');
  const surface = new CanvasSurface(setup.renderer, model, 'dock-test', platform);
  setup.renderer.root.add(surface);
  let quits = 0,
    clipboardCalls = 0;
  const detach = attachControls(
    surface,
    () => {
      quits++;
    },
    {
      read: async () => {
        clipboardCalls++;
        return { plainText: 'BAD' };
      },
      write: async () => {
        clipboardCalls++;
        return { status: 'written' };
      },
    }
  );
  await setup.renderOnce();
  return {
    clock,
    setup,
    model,
    surface,
    detach,
    get quits() {
      return quits;
    },
    get clipboardCalls() {
      return clipboardCalls;
    },
    escape() {
      setup.mockInput.pressEscape();
      clock.advance(40);
    },
    repeat(name: string, sequence = '') {
      setup.renderer.keyInput.processParsedKey({
        name,
        sequence,
        raw: sequence,
        ctrl: false,
        meta: false,
        shift: false,
        option: false,
        number: false,
        eventType: 'repeat',
        source: 'kitty',
      });
    },
    async dispose() {
      detach();
      await setup.dispose();
      model.dispose();
    },
  };
}

for (const kitty of [false, true]) {
  for (const platform of ['darwin', 'win32'] as const) {
    test(`dock navigation preserves content, view, selection, tool and history (${platform}, Kitty ${kitty})`, async () => {
      const f = await fixture(kitty, platform);
      try {
        f.surface.setTool('edit');
        f.model.commands.insert('Z');
        f.model.commands.selectAll();
        f.model.pan(8, -4);
        const content = f.model.plane.materialize(),
          interaction = structuredClone(f.model.getSnapshot().interaction),
          view = { ...f.model.viewport },
          version = f.model.version;
        const controls = f.surface.focusableDockControls;
        const anchor = controls.findIndex((control) => control.id === 'edit');
        for (const control of [...controls.slice(anchor), ...controls.slice(0, anchor)]) {
          f.setup.mockInput.pressTab();
          expect(f.surface.focusedDockControl?.id).toBe(control.id);
          expect(f.surface.panel).toBeNull();
          expect(f.surface.minimapOpen).toBe(false);
        }
        f.setup.mockInput.pressTab();
        expect(f.surface.focusedDockControl?.id).toBe('edit');
        await f.setup.mockInput.typeText('ihmXYZ', 0);
        await f.setup.mockInput.pasteBracketedText('must not paste');
        f.setup.mockInput.pressArrow('right');
        f.setup.mockInput.pressArrow('up', { meta: true });
        f.setup.mockInput.pressBackspace();
        f.setup.mockInput.pressKey('z', platform === 'darwin' ? { super: true } : { ctrl: true });
        expect(f.clipboardCalls).toBe(0);
        await f.setup.renderOnce();
        expect(f.setup.renderer.getCursorState().visible).toBe(false);
        expect(f.setup.captureCharFrame()).toContain('Esc canvas');
        const focused = f.surface.focusedDockControl!;
        f.setup.renderer.currentRenderBuffer.withBuffers((cells) => {
          expect(
            cells.attributes[focused.y * cells.width + focused.x]! &
              createTextAttributes({ bold: true })
          ).not.toBe(0);
        });
        f.setup.mockInput.pressTab({ shift: true });
        expect(f.surface.focusedDockControl?.id).toBe(controls[anchor - 1]!.id);
        f.escape();
        expect(f.surface.focusedDockControl).toBeNull();
        expect(f.model.plane.materialize()).toEqual(content);
        expect(f.model.getSnapshot().interaction).toEqual(interaction);
        expect(f.model.viewport).toEqual(view);
        expect(f.model.version).toBe(version);
        expect(f.model.canUndo).toBe(true);
        expect(f.surface.tool).toBe('edit');
      } finally {
        await f.dispose();
      }
    });
  }
}

test('Enter and Space activate the same dock commands without leaking repeat keys into the canvas or dialog', async () => {
  const f = await fixture();
  try {
    const content = f.model.plane.materialize();
    f.surface.setTool('edit');
    f.setup.mockInput.pressTab();
    expect(f.surface.focusedDockControl?.id).toBe('edit');
    f.setup.mockInput.pressEnter();
    f.repeat('return', '\r');
    expect(f.surface.tool).toBe('edit');
    expect(f.surface.focusedDockControl).toBeNull();
    expect(f.model.plane.materialize()).toEqual(content);
    await f.setup.renderOnce();
    expect(f.setup.renderer.getCursorState().visible).toBe(true);
    f.setup.mockInput.pressTab();
    f.setup.mockInput.pressKey(' ');
    f.repeat('space', ' ');
    expect(f.model.plane.materialize()).toEqual(content);
    f.setup.mockInput.pressTab();
    f.setup.mockInput.pressTab({ shift: true });
    f.setup.mockInput.pressEnter();
    expect(f.surface.panel?.title).toBe('Settings');
    f.repeat('return', '\r');
    expect(f.surface.settings.values.cursorStyle).toBe('block');
    f.setup.mockInput.pressTab();
    expect(f.surface.panel?.selectedTab).toBe(1);
    expect(f.surface.focusedDockControl).toBeNull();
    f.escape();
    f.setup.mockInput.pressKey('F10', { shift: true });
    expect(f.surface.contextMenu?.isOpen).toBe(true);
    f.setup.mockInput.pressTab();
    expect(f.surface.contextMenu?.isOpen).toBe(true);
    expect(f.surface.focusedDockControl).toBeNull();
    f.escape();
    f.setup.mockInput.pressTab();
    f.setup.mockInput.pressKey('q', { ctrl: true });
    expect(f.quits).toBe(1);
  } finally {
    await f.dispose();
  }
});

test('dock Escape preserves a range even when held; canvas clicks restore immediate typing', async () => {
  const f = await fixture();
  try {
    f.surface.setTool('edit');
    f.model.commands.selectAll();
    const range = structuredClone(f.model.selection);
    f.setup.mockInput.pressTab();
    f.escape();
    f.repeat('escape', '\x1b');
    expect(f.model.selection).toEqual(range);
    f.setup.mockInput.pressTab();
    await f.setup.renderOnce();
    await f.setup.mockMouse.click(9, 4);
    expect(f.surface.focusedDockControl).toBeNull();
    const cursor = { ...f.model.cursor };
    await f.setup.mockInput.typeText('X', 0);
    expect(f.model.plane.get(cursor)?.char).toBe('X');
    f.setup.mockInput.pressTab();
    const hand = f.surface.dockControls.find((control) => control.id === 'hand')!;
    await f.setup.mockMouse.click(hand.x + 1, hand.y);
    expect(f.surface.focusedDockControl).toBeNull();
    expect(f.surface.tool).toBe('hand');
  } finally {
    await f.dispose();
  }
});

test('focus skips unavailable commands and hidden buttons, and clears on resize, blur, document change and detach', async () => {
  const f = await fixture();
  try {
    expect(f.surface.dockControls.some((control) => control.id === 'documents')).toBe(true);
    expect(f.surface.focusableDockControls.some((control) => control.id === 'documents')).toBe(
      false
    );
    f.setup.mockInput.pressTab({ shift: true });
    expect(f.surface.focusedDockControl?.id).toBe('hand');
    f.setup.mockInput.pressTab({ shift: true });
    f.setup.mockInput.pressTab({ shift: true });
    f.setup.mockInput.pressTab({ shift: true });
    expect(f.surface.focusedDockControl?.id).toBe('minimap');
    await f.setup.resize(20, 20);
    await f.setup.renderOnce();
    expect(f.surface.focusedDockControl).toBeNull();
    expect(f.surface.focusableDockControls.some((control) => control.id === 'hand')).toBe(false);
    f.setup.mockInput.pressTab({ shift: true });
    expect(f.surface.focusedDockControl?.id).toBe(f.surface.focusableDockControls.at(-1)?.id);
    f.setup.renderer.emit('blur');
    expect(f.surface.focusedDockControl).toBeNull();
    f.setup.mockInput.pressTab();
    f.model.documents.activateDocument('other', { grid: [] });
    expect(f.surface.focusedDockControl).toBeNull();
    f.setup.mockInput.pressTab();
    f.detach();
    expect(f.surface.focusedDockControl).toBeNull();
  } finally {
    await f.dispose();
  }
});

test('dock shortcuts, sequences and hints follow the shared keymap; pasted tabs still reach the editor', async () => {
  const f = await fixture();
  try {
    f.surface.setTool('edit');
    f.model.editor.keymap.setUserBindings('terminal.dock-next', [['F12']]);
    f.setup.mockInput.pressTab();
    expect(f.surface.focusedDockControl).toBeNull();
    expect(f.model.canUndo).toBe(false);
    f.setup.mockInput.pressKey('F12');
    expect(f.surface.focusedDockControl?.id).toBe('edit');
    expect(f.surface.statusBar.hint).toContain('F12');
    f.setup.mockInput.pressTab({ shift: true });
    expect(f.surface.focusedDockControl?.id).toBe('settings');
    f.model.editor.keymap.setUserBindings('terminal.dock-activate', [['F9', 'F9']]);
    f.setup.mockInput.pressKey('F9');
    expect(f.surface.panel).toBeNull();
    f.setup.mockInput.pressKey('F9');
    expect(f.surface.panel?.title).toBe('Settings');
    f.escape();
    f.model.commands.pointAt({ x: 0, y: 5 });
    await f.setup.mockInput.pasteBracketedText('A\tB');
    for (let i = 0; i < 30 && !f.model.plane.get({ x: 4, y: 5 }); i++) await Bun.sleep(2);
    expect(f.model.plane.get({ x: 4, y: 5 })?.char).toBe('B');
  } finally {
    await f.dispose();
  }
});

test('entering dock focus follows the current tool in both directions, including after returning to canvas', async () => {
  const f = await fixture();
  try {
    f.surface.minimapOpen = true;
    for (const tool of ['hand', 'edit'] as const) {
      f.surface.setTool(tool);
      for (const shift of [false, true]) {
        f.setup.mockInput.pressTab({ shift });
        expect(f.surface.focusedDockControl?.id).toBe(tool);
        const controls = f.surface.focusableDockControls;
        const anchor = controls.findIndex((control) => control.id === tool);
        f.setup.mockInput.pressTab({ shift });
        expect(f.surface.focusedDockControl?.id).toBe(
          controls[(anchor + (shift ? -1 : 1) + controls.length) % controls.length]!.id
        );
        f.escape();
        expect(f.surface.tool).toBe(tool);
        expect(f.surface.minimapOpen).toBe(true);
      }
    }
  } finally {
    await f.dispose();
  }
});
