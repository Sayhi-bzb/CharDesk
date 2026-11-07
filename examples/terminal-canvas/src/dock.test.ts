import { expect, test } from 'bun:test';
import { createTextAttributes, RGBA, type TerminalColors } from '@opentui/core';
import { createTestRenderer, ManualClock } from '@opentui/core/testing';
import { TerminalCanvas } from './model.ts';
import { CANVAS_TOP, CanvasSurface } from './surface.ts';
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
        expect(controls.map((control) => control.id)).toEqual(['edit', 'hand', 'inspector']);
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
          const at = focused.y * cells.width + focused.x;
          expect(cells.attributes[at]! & createTextAttributes({ bold: true, inverse: true })).toBe(
            0
          );
          expect(RGBA.fromArray(cells.bg.slice(at * 4, at * 4 + 4)).toInts()).toEqual(
            f.surface.colors.selection.toInts()
          );
        });
        f.setup.mockInput.pressTab({ shift: true });
        expect(f.surface.focusedDockControl?.id).toBe(
          controls[(anchor - 1 + controls.length) % controls.length]!.id
        );
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
    expect(f.surface.focusedDockControl?.id).toBe('inspector');
    f.setup.mockInput.pressEnter();
    expect(f.surface.inspector?.isOpen).toBe(false);
    expect(f.surface.panel).toBeNull();
    const settings = f.surface.headerControls.find((control) => control.id === 'settings')!;
    await f.setup.mockMouse.click(settings.x + 1, settings.y);
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
    expect(f.surface.headerControls.some((control) => control.id === 'documents')).toBe(true);
    expect(f.surface.focusableDockControls.some((control) => control.id === 'documents')).toBe(
      false
    );
    f.setup.mockInput.pressTab({ shift: true });
    expect(f.surface.focusedDockControl?.id).toBe('hand');
    f.setup.mockInput.pressTab({ shift: true });
    f.setup.mockInput.pressTab({ shift: true });
    f.setup.mockInput.pressTab({ shift: true });
    expect(f.surface.focusedDockControl?.id).toBe('hand');
    await f.setup.resize(10, 20);
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
    expect(f.surface.focusedDockControl?.id).toBe('inspector');
    f.model.editor.keymap.setUserBindings('terminal.dock-activate', [['F9', 'F9']]);
    f.setup.mockInput.pressKey('F9');
    expect(f.surface.panel).toBeNull();
    f.setup.mockInput.pressKey('F9');
    expect(f.surface.inspector?.isOpen).toBe(false);
    expect(f.surface.focusedDockControl).toBeNull();
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

for (const kitty of [false, true]) {
  test(`Edit and Hand use Dock navigation without default function keys (Kitty ${kitty})`, async () => {
    const f = await fixture(kitty);
    try {
      const content = f.model.plane.materialize();
      expect(f.surface.tool).toBe('hand');
      expect(f.surface.dockControls.map((control) => control.label)).toContain('[Edit]');
      expect(f.surface.dockControls.map((control) => control.label)).toContain('[Hand]');
      for (const key of ['F2', 'F3']) f.setup.mockInput.pressKey(key);
      expect(f.surface.tool).toBe('hand');
      f.setup.mockInput.pressTab({ shift: true });
      expect(f.surface.focusedDockControl?.id).toBe('hand');
      f.setup.mockInput.pressTab({ shift: true });
      expect(f.surface.focusedDockControl?.id).toBe('edit');
      f.setup.mockInput.pressEnter();
      expect(f.surface.tool).toBe('edit');
      expect(f.surface.focusedDockControl).toBeNull();
      for (const key of ['F2', 'F3']) f.setup.mockInput.pressKey(key);
      expect(f.surface.tool).toBe('edit');
      f.setup.mockInput.pressTab();
      expect(f.surface.focusedDockControl?.id).toBe('edit');
      f.setup.mockInput.pressTab();
      expect(f.surface.focusedDockControl?.id).toBe('hand');
      f.setup.mockInput.pressKey(' ');
      expect(f.surface.tool).toBe('hand');
      expect(f.surface.focusedDockControl).toBeNull();
      expect(f.model.plane.materialize()).toEqual(content);
      expect(f.model.canUndo).toBe(false);
    } finally {
      await f.dispose();
    }
  });
}

test('entering Dock focus keeps the visible drag range even before mouse release', async () => {
  const f = await fixture();
  try {
    f.surface.activateDock('edit');
    f.model.viewport = { ...f.model.viewport, x: 0, y: 0 };
    await f.setup.renderOnce();
    const content = f.model.plane.materialize();
    await f.setup.mockMouse.pressDown(0, CANVAS_TOP);
    await f.setup.mockMouse.emitMouseEvent('drag', 3, CANVAS_TOP);
    const range = structuredClone(f.model.selection);
    expect(f.model.gestureState.type).toBe('selecting');
    f.setup.mockInput.pressTab();
    expect(f.model.gestureState.type).toBe('idle');
    expect(f.surface.focusedDockControl?.id).toBe('edit');
    expect(f.model.selection).toEqual(range);
    await f.setup.mockMouse.release(15, 4);
    f.setup.mockInput.pressTab();
    f.setup.mockInput.pressEnter();
    expect(f.surface.tool).toBe('hand');
    expect(f.model.selection).toEqual(range);
    expect(f.model.plane.materialize()).toEqual(content);
    expect(f.model.canUndo).toBe(false);
  } finally {
    await f.dispose();
  }
});

for (const mode of ['unknown', 'light', 'dark'] as const) {
  test(`Tab focus uses terminal palette colors without bold, bracket changes or double inversion (${mode})`, async () => {
    const f = await fixture();
    try {
      if (mode !== 'unknown')
        f.surface.appearance.acceptPalette(
          {
            defaultForeground: mode === 'dark' ? '#eeeeee' : '#111111',
            defaultBackground: mode === 'dark' ? '#111111' : '#eeeeee',
            palette: [
              '#111111',
              '#cc5555',
              '#55aa66',
              '#bbaa44',
              '#4466aa',
              '#aa55aa',
              '#44aaaa',
              '#dddddd',
              '#777777',
              '#ff7777',
              '#77cc88',
              '#eedd66',
              '#6688dd',
              '#cc77cc',
              '#66cccc',
              '#eeeeee',
            ],
            cursorColor: null,
            mouseForeground: null,
            mouseBackground: null,
            tekForeground: null,
            tekBackground: null,
            highlightForeground: null,
            highlightBackground: null,
          } satisfies TerminalColors,
          mode
        );
      const content = f.model.plane.materialize();
      for (const tool of ['hand', 'edit'] as const) {
        f.surface.setTool(tool);
        for (let i = 0; i < 3; i++) {
          f.setup.mockInput.pressTab();
          await f.setup.renderOnce();
          const focused = f.surface.focusedDockControl!;
          expect(f.setup.captureCharFrame()).toContain('[Edit] [Hand] [Style]');
          f.setup.renderer.currentRenderBuffer.withBuffers((cells) => {
            for (const control of f.surface.dockControls) {
              const active = control.id === tool || control.id === 'inspector';
              const hasFocus = control.id === focused.id;
              const at = control.y * cells.width + control.x;
              expect(cells.attributes[at]! & createTextAttributes({ inverse: true })).toBe(
                active && !hasFocus ? createTextAttributes({ inverse: true }) : 0
              );
              expect(cells.attributes[at]! & createTextAttributes({ bold: true })).toBe(0);
              expect(RGBA.fromArray(cells.fg.slice(at * 4, at * 4 + 4)).toInts()).toEqual(
                (hasFocus
                  ? f.surface.colors.selectionForeground
                  : f.surface.colors.foreground
                ).toInts()
              );
              expect(RGBA.fromArray(cells.bg.slice(at * 4, at * 4 + 4)).toInts()).toEqual(
                (hasFocus ? f.surface.colors.selection : f.surface.colors.chrome).toInts()
              );
            }
          });
        }
        f.escape();
        await f.setup.renderOnce();
        expect(f.setup.captureCharFrame()).toContain('[Edit] [Hand] [Style]');
      }
      expect(f.model.plane.materialize()).toEqual(content);
      expect(f.model.canUndo).toBe(false);
    } finally {
      await f.dispose();
    }
  });
}
