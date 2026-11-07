import { expect, test } from 'bun:test';
import { createTestRenderer, KeyCodes, ManualClock } from '@opentui/core/testing';
import type { ClipboardPort } from '@chardesk/editor-core/clipboard/commands';
import { CanvasSurface, CANVAS_TOP } from './surface.ts';
import { TerminalCanvas } from './model.ts';
import { attachControls } from './controller.ts';
import { helpLines } from './copy.ts';

async function fixture(
  platform: NodeJS.Platform = 'darwin',
  kittyKeyboard = true,
  source = '',
  delivery: 'written' | 'dispatched' = 'written'
) {
  const clock = new ManualClock();
  const setup = await createTestRenderer({ width: 100, height: 30, kittyKeyboard, clock });
  const model = new TerminalCanvas(source);
  const surface = new CanvasSurface(setup.renderer, model, 'test.chardesk', platform);
  let clipboardText = '',
    writes = 0,
    reads = 0,
    quits = 0;
  const clipboard: ClipboardPort = {
    write: async (payload) => {
      writes++;
      clipboardText = payload.plain;
      return { status: delivery };
    },
    read: async () => {
      reads++;
      return { plainText: clipboardText };
    },
  };
  setup.renderer.root.add(surface);
  const detach = attachControls(
    surface,
    () => {
      quits++;
    },
    clipboard
  );
  await setup.renderOnce();
  return {
    setup,
    model,
    surface,
    clock,
    get reads() {
      return reads;
    },
    get writes() {
      return writes;
    },
    get text() {
      return clipboardText;
    },
    get quits() {
      return quits;
    },
    async dispose() {
      detach();
      await setup.dispose();
      model.dispose();
    },
  };
}

test('unconfirmed terminal Cut reports dispatch and retains the logical range and history', async () => {
  const f = await fixture('darwin', true, 'A界B', 'dispatched');
  try {
    f.surface.activateDock('edit');
    f.setup.mockInput.pressKey('a', { super: true });
    const before = f.model.plane.materialize();
    const range = f.model.selectionBounds;
    f.setup.mockInput.pressKey('x', { super: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(f.surface.status).toContain('selection kept');
    expect(f.model.plane.materialize()).toEqual(before);
    expect(f.model.selectionBounds).toEqual(range);
    expect(f.model.canUndo).toBe(false);
  } finally {
    await f.dispose();
  }
});

test('rebinding changes execution and toolbar/help hints from the same catalog', async () => {
  const f = await fixture();
  try {
    f.model.editor.keymap.setUserBindings('terminal.edit', [['F11']]);
    f.setup.mockInput.pressKey(KeyCodes.F2);
    expect(f.surface.tool).toBe('hand');
    f.setup.mockInput.pressKey(KeyCodes.F11);
    expect(f.surface.tool).toBe('edit');
    expect(f.surface.dockControls.find((control) => control.id === 'edit')?.label).toBe('[Edit]');
    expect(helpLines(f.surface.shortcuts).join('\n')).toContain('F11 Edit');
  } finally {
    await f.dispose();
  }
});

for (const kitty of [false, true]) {
  test.each(['canvas', 'settings', 'recording', 'help', 'menu', 'style', 'color', 'busy'])(
    `Quit has application scope over %s input (Kitty ${kitty})`,
    async (owner) => {
      const f = await fixture('darwin', kitty, 'A🦀');
      try {
        f.surface.setTool('edit');
        f.model.commands.selectAll();
        const content = f.model.plane.materialize(),
          selection = structuredClone(f.model.selection);
        if (owner === 'settings' || owner === 'recording') {
          f.surface.activateDock('settings');
          if (owner === 'recording') {
            f.surface.panel!.onTab!(3);
            await f.setup.mockInput.typeText('terminal.copy', 0);
            f.setup.mockInput.pressEnter();
            f.setup.mockInput.pressKey('F5');
          }
        } else if (owner === 'help') f.setup.mockInput.pressKey(KeyCodes.F1);
        else if (owner === 'menu') f.surface.contextMenu!.open();
        else if (owner === 'style' || owner === 'color') {
          f.surface.inspector!.show();
          expect(f.surface.inspector!.focused).toBe(true);
          if (owner === 'color') {
            const control = f.surface.inspector!.controls[5]!;
            await f.setup.mockMouse.click(control.x + 1, control.y);
            f.setup.mockInput.pressKey('h');
            expect(f.surface.inspector!.colorInput).not.toBeNull();
          }
        } else if (owner === 'busy') {
          f.surface.panel = {
            title: 'Busy',
            hint: '',
            items: [],
            selected: 0,
            busy: true,
          };
        }
        expect(f.model.editor.commands.canExecute('terminal.quit', undefined)).toBe(true);
        expect(
          f.model.editor.keymap.list().find((entry) => entry.id === 'terminal.quit')?.scope
        ).toBe('application');
        f.setup.mockInput.pressKey('q', { ctrl: true });
        expect(f.quits).toBe(1);
        for (const eventType of ['repeat', 'release'] as const)
          f.setup.renderer.keyInput.processParsedKey({
            name: 'q',
            ctrl: true,
            meta: false,
            shift: false,
            option: false,
            sequence: '\x11',
            raw: '\x11',
            number: false,
            eventType,
            source: 'kitty',
          });
        expect(f.quits).toBe(1);
        expect(f.model.plane.materialize()).toEqual(content);
        expect(f.model.selection).toEqual(selection);
        expect(f.writes).toBe(0);
        expect(f.reads).toBe(0);
      } finally {
        await f.dispose();
      }
    }
  );
}

test('modal Quit honors rebinding, disabling and sequence dispatch without leaking prefixes', async () => {
  const f = await fixture();
  try {
    const keymap = f.model.editor.keymap;
    f.surface.activateDock('settings');
    keymap.setUserBindings('terminal.quit', [['F12']]);
    f.setup.mockInput.pressKey('q', { ctrl: true });
    expect(f.quits).toBe(0);
    f.setup.mockInput.pressKey('F12');
    expect(f.quits).toBe(1);
    keymap.setUserBindings('terminal.quit', []);
    f.setup.mockInput.pressKey('q', { ctrl: true });
    f.setup.mockInput.pressKey('F12');
    expect(f.quits).toBe(1);
    keymap.setUserBindings('terminal.quit', [['F12', 'Ctrl+Q']]);
    const panel = structuredClone({
      input: f.surface.panel?.input,
      selected: f.surface.panel?.selected,
    });
    f.setup.mockInput.pressKey('F12');
    expect(f.quits).toBe(1);
    expect({ input: f.surface.panel?.input, selected: f.surface.panel?.selected }).toEqual(panel);
    f.setup.mockInput.pressKey('q', { ctrl: true });
    expect(f.quits).toBe(2);
    expect(f.model.plane.materialize().size).toBe(0);
  } finally {
    await f.dispose();
  }
});

for (const kitty of [false, true]) {
  test(`default Hand ignores text; Edit accepts lower/upper-case tool letters (Kitty ${kitty})`, async () => {
    const f = await fixture('darwin', kitty);
    try {
      expect(f.surface.tool).toBe('hand');
      await f.setup.mockInput.typeText('ihmIHM', 0);
      f.setup.mockInput.pressEnter();
      f.setup.mockInput.pressBackspace();
      expect(f.model.plane.materialize().size).toBe(0);
      expect(f.model.canUndo).toBe(false);
      f.surface.activateDock('edit');
      await f.setup.renderOnce();
      expect(f.setup.renderer.getCursorState().visible).toBe(true);
      await f.setup.mockInput.typeText('ihmIHM', 0);
      expect([...f.model.plane.materialize().values()].map((c) => c.char).join('')).toBe('ihmIHM');
      expect(f.surface.tool).toBe('edit');
      expect(f.surface.minimapOpen).toBe(false);
      f.setup.mockInput.pressEscape();
      f.clock.advance(40);
      expect(f.surface.tool).toBe('edit');
      await f.setup.mockInput.typeText('Z', 0);
      expect(f.model.plane.get({ x: 6, y: 0 })?.char).toBe('Z');
      f.surface.activateDock('hand');
      const content = f.model.plane.materialize();
      await f.setup.mockInput.typeText('i', 0);
      expect(f.surface.tool).toBe('hand');
      expect(f.model.plane.materialize()).toEqual(content);
    } finally {
      await f.dispose();
    }
  });
  test(`click, selection, Escape and undo never require re-entering Edit (Kitty ${kitty})`, async () => {
    const f = await fixture('win32', kitty, 'AB');
    try {
      f.surface.activateDock('edit');
      const x = 10,
        y = CANVAS_TOP + 5;
      await f.setup.mockMouse.click(x, y);
      const at = { ...f.model.cursor };
      await f.setup.mockInput.typeText('界', 0);
      expect(f.model.plane.get(at)?.char).toBe('界');
      f.setup.mockInput.pressKey('z', { ctrl: true });
      await f.setup.mockInput.typeText('Q', 0);
      expect(f.model.plane.get({ x: at.x + 2, y: at.y })?.char).toBe('Q');
      await f.setup.mockMouse.drag(x, y, x + 2, y);
      expect(f.model.selection).not.toBeNull();
      f.setup.mockInput.pressEscape();
      f.clock.advance(40);
      expect(f.model.selection).toBeNull();
      expect(f.surface.tool).toBe('edit');
      await f.setup.mockInput.typeText('Z', 0);
      expect(f.model.plane.get(at)?.char).toBe('Z');
    } finally {
      await f.dispose();
    }
  });
  test(`Escape cancels a live move then clears selection while keeping Edit (Kitty ${kitty})`, async () => {
    const f = await fixture('darwin', kitty, 'ABCD');
    try {
      f.surface.activateDock('edit');
      const x = -f.model.viewport.x,
        y = CANVAS_TOP - f.model.viewport.y;
      await f.setup.mockMouse.drag(x, y, x + 1, y);
      const selection = structuredClone(f.model.selection),
        content = f.model.plane.materialize();
      await f.setup.mockMouse.pressDown(x, y);
      await f.setup.mockMouse.emitMouseEvent('drag', x + 2, y + 1);
      f.setup.mockInput.pressEscape();
      f.clock.advance(40);
      expect(f.model.rangePreview).toBeNull();
      expect(f.model.selection).toEqual(selection);
      expect(f.model.plane.materialize()).toEqual(content);
      expect(f.surface.tool).toBe('edit');
      await f.setup.mockMouse.release(x + 2, y + 1);
      f.setup.mockInput.pressEscape();
      f.clock.advance(40);
      expect(f.model.selection).toBeNull();
      expect(f.surface.tool).toBe('edit');
    } finally {
      await f.dispose();
    }
  });
}

test('dock buttons execute registered tool commands and preserve selection', async () => {
  const f = await fixture('darwin', true, 'AB');
  try {
    const click = async (id: 'edit' | 'hand' | 'minimap') => {
      const control = f.surface.chromeControls.find((c) => c.id === id)!;
      await f.setup.mockMouse.click(control.x + 1, control.y);
      await f.setup.renderOnce();
    };
    await click('edit');
    expect(f.surface.tool).toBe('edit');
    f.model.commands.selectAll();
    const selection = structuredClone(f.model.selection);
    await click('hand');
    expect(f.surface.tool).toBe('hand');
    expect(f.model.selection).toEqual(selection);
    await click('minimap');
    expect(f.surface.minimapOpen).toBe(true);
    expect(f.surface.tool).toBe('hand');
    await click('edit');
    expect(f.surface.tool).toBe('edit');
    expect(f.model.selection).toEqual(selection);
    expect(f.model.canUndo).toBe(false);
    f.surface.activateDock('minimap');
    expect(f.surface.minimapOpen).toBe(false);
  } finally {
    await f.dispose();
  }
});

for (const platform of ['darwin', 'win32'] as const) {
  test(`${platform}: native modifier routes editing shortcuts while manual Save is unavailable`, async () => {
    const f = await fixture(platform, true, 'A界B');
    const modifier = platform === 'darwin' ? { super: true } : { ctrl: true };
    try {
      const help = helpLines(f.surface.shortcuts).join('\n');
      expect(help).toContain(
        platform === 'darwin'
          ? '⌘C / Ctrl+Y Copy · ⌘X Cut · ⌘V Paste'
          : 'Ctrl+C Copy · Ctrl+X Cut · Ctrl+V Paste'
      );
      f.setup.mockInput.pressKey('a', modifier);
      f.setup.mockInput.pressKey('c', modifier);
      await Promise.resolve();
      expect(f.text).toBe('A界B');
      expect(f.writes).toBe(1);
      f.setup.mockInput.pressKey('x', modifier);
      await Promise.resolve();
      expect(f.model.plane.materialize().size).toBe(0);
      f.setup.mockInput.pressKey('z', modifier);
      expect(f.model.plane.get({ x: 1, y: 0 })?.char).toBe('界');
      if (platform === 'darwin') f.setup.mockInput.pressKey('z', { super: true, shift: true });
      else f.setup.mockInput.pressKey('y', modifier);
      expect(f.model.plane.materialize().size).toBe(0);
      f.setup.mockInput.pressKey('v', modifier);
      await Promise.resolve();
      expect(f.model.plane.get({ x: 1, y: 0 })?.char).toBe('界');
      expect(f.surface.tool).toBe('hand');
      const beforeSaveKey = f.model.plane.materialize();
      f.setup.mockInput.pressKey('s', modifier);
      expect(f.model.plane.materialize()).toEqual(beforeSaveKey);
      expect(f.model.editor.commands.canExecute('terminal.save', undefined)).toBe(false);
      f.surface.activateDock('edit');
      f.setup.mockInput.pressKey('c', { meta: true });
      expect(f.writes).toBe(2); // Option/Alt is not Command.
      expect(f.model.plane.get({ x: 1, y: 0 })?.char).toBe('界');
    } finally {
      await f.dispose();
    }
  });
}

test('bracketed paste works in either tool and keeps the chosen tool', async () => {
  const f = await fixture();
  try {
    f.setup.renderer.keyInput.processPaste(new TextEncoder().encode('界'));
    await Bun.sleep(0);
    expect(f.surface.tool).toBe('hand');
    expect(f.model.plane.get({ x: 0, y: 0 })?.char).toBe('界');
    f.surface.activateDock('edit');
    f.setup.mockInput.pressEscape();
    f.setup.renderer.keyInput.processPaste(new TextEncoder().encode('Z'));
    await Bun.sleep(0);
    expect(f.surface.tool).toBe('edit');
    expect(f.model.plane.get({ x: 0, y: 0 })?.char).toBe('Z');
  } finally {
    await f.dispose();
  }
});

test('Kitty repeat events do not toggle controls or repeat an automatic-save exit', async () => {
  const f = await fixture('darwin', true, 'AB');
  try {
    f.model.editor.keymap.setUserBindings('terminal.minimap', [['F4']]);
    f.surface.activateDock('edit');
    await f.setup.mockInput.typeText('X', 0);
    const repeat = (name: string, ctrl = false) =>
      f.setup.renderer.keyInput.processParsedKey({
        name,
        ctrl,
        meta: false,
        shift: false,
        option: false,
        sequence: '',
        raw: '',
        number: false,
        eventType: 'repeat',
        source: 'kitty',
      });
    f.setup.mockInput.pressKey(KeyCodes.F4);
    repeat('f4');
    expect(f.surface.minimapOpen).toBe(true);
    f.setup.mockInput.pressKey('q', { ctrl: true });
    repeat('q', true);
    expect(f.quits).toBe(1);
    expect(f.surface.status).not.toContain('⌘S');
  } finally {
    await f.dispose();
  }
});

test('exit requests do not require a second press after dock actions', async () => {
  const f = await fixture();
  try {
    f.surface.activateDock('edit');
    await f.setup.mockInput.typeText('X', 0);
    f.setup.mockInput.pressKey('q', { ctrl: true });
    expect(f.quits).toBe(1);
    const control = f.surface.dockControls.find((c) => c.id === 'hand')!;
    await f.setup.mockMouse.click(control.x + 1, control.y);
    f.setup.mockInput.pressKey('q', { ctrl: true });
    expect(f.quits).toBe(2);
  } finally {
    await f.dispose();
  }
});

for (const kitty of [false, true]) {
  for (const tool of ['hand', 'edit'] as const) {
    test(`Option+arrows pan the viewport by 10 cells (${tool}, Kitty ${kitty})`, async () => {
      const f = await fixture('darwin', kitty, 'A界B');
      try {
        if (tool === 'edit') f.surface.activateDock('edit');
        f.model.commands.selectAll();
        const before = { ...f.model.viewport };
        const interaction = structuredClone(f.model.getSnapshot().interaction);
        const content = f.model.plane.materialize(),
          version = f.model.version;
        const seen: number[] = [];
        const stop = f.model.subscribe(() => seen.push(f.model.viewport.x));
        f.setup.mockInput.pressArrow('right', { meta: true });
        expect(f.model.viewport.x).toBe(before.x + 10);
        f.setup.mockInput.pressArrow('left', { meta: true });
        expect(f.model.viewport).toEqual(before);
        f.setup.mockInput.pressArrow('down', { meta: true });
        expect(f.model.viewport.y).toBe(before.y + 10);
        expect(f.model.viewport.x).toBe(before.x);
        f.setup.mockInput.pressArrow('up', { meta: true });
        expect(f.model.viewport).toEqual(before);
        stop();
        expect(seen).toEqual([before.x + 10, before.x, before.x, before.x]);
        expect(f.surface.tool).toBe(tool);
        expect(f.model.getSnapshot().interaction).toEqual(interaction);
        expect(f.model.plane.materialize()).toEqual(content);
        expect(f.model.version).toBe(version);
        expect(f.model.canUndo).toBe(false);
        if (tool === 'edit') {
          f.setup.mockInput.pressEscape();
          f.clock.advance(40);
          f.setup.mockInput.pressArrow('right', { shift: true });
          expect(f.model.selection).not.toBeNull();
          expect(f.model.viewport.x).toBe(before.x);
        }
      } finally {
        await f.dispose();
      }
    });
  }
}

test('macOS Ctrl editing shortcuts stay distinct from Command except the explicit Ctrl+Y copy fallback', async () => {
  const f = await fixture('darwin', true, 'AB');
  try {
    f.surface.activateDock('edit');
    await f.setup.mockInput.typeText('X', 0);
    const before = f.model.plane.materialize(),
      interaction = f.model.getSnapshot().interaction;
    for (const key of ['c', 'x', 'v', 'a', 's', 'z'])
      f.setup.mockInput.pressKey(key, { ctrl: true });
    await Promise.resolve();
    expect(f.writes).toBe(0);
    expect(f.reads).toBe(0);
    expect(f.model.editor.commands.canExecute('terminal.save', undefined)).toBe(false);
    expect(f.model.plane.materialize()).toEqual(before);
    expect(f.model.getSnapshot().interaction).toEqual(interaction);
    f.setup.mockInput.pressKey('a', { super: true });
    f.setup.mockInput.pressKey('c', { super: true });
    await Promise.resolve();
    expect(f.writes).toBe(1);
    expect(f.text).toBe('XB');
  } finally {
    await f.dispose();
  }
});

for (const sequence of ['\x1b[99;9u', '\x1b[99;9;99u']) {
  test(`macOS Command+C wire sequence ${JSON.stringify(sequence)} copies the logical range`, async () => {
    const f = await fixture('darwin', true, 'A界B');
    try {
      f.surface.activateDock('edit');
      f.model.commands.selectAll();
      const before = f.model.plane.materialize();
      f.setup.mockInput.pressKey(sequence);
      for (let i = 0; i < 8; i++) await Promise.resolve();
      expect(f.writes).toBe(1);
      expect(f.text).toBe('A界B');
      expect(f.surface.status).toBe('Copied');
      expect(f.model.plane.materialize()).toEqual(before);
      f.setup.mockInput.pressKey('\x1b[99;9:3u');
      expect(f.writes).toBe(1);
    } finally {
      await f.dispose();
    }
  });
}

for (const releaseBeforeDelete of [true, false]) {
  for (const sequence of ['\x7f', '\x08', '\x1b[127u', '\x1b[127;1u', '\x1b[3~']) {
    test(`Edit deletes a wide pointer range via ${JSON.stringify(sequence)} (released: ${releaseBeforeDelete})`, async () => {
      const f = await fixture('darwin', true, 'A界🦀Z');
      try {
        f.surface.activateDock('edit');
        f.model.viewport = { ...f.model.viewport, x: 0, y: 0 };
        await f.setup.renderOnce();
        const original = f.model.plane.materialize();
        // The real Warp trace delivers Delete while the pointer is still selecting.
        await f.setup.mockMouse.pressDown(1, CANVAS_TOP);
        await f.setup.mockMouse.emitMouseEvent('drag', 4, CANVAS_TOP);
        if (releaseBeforeDelete) await f.setup.mockMouse.release(4, CANVAS_TOP);
        expect(f.model.gestureState.type).toBe(releaseBeforeDelete ? 'idle' : 'selecting');
        expect(f.surface.tool).toBe('edit');
        expect(f.model.selection).not.toBeNull();
        await f.setup.mockInput.pressKeys([sequence]);
        expect(f.model.plane.get({ x: 1, y: 0 })).toBeUndefined();
        expect(f.model.plane.get({ x: 3, y: 0 })).toBeUndefined();
        expect(f.model.plane.get({ x: 0, y: 0 })?.char).toBe('A');
        expect(f.model.plane.get({ x: 5, y: 0 })?.char).toBe('Z');
        expect(f.model.gestureState.type).toBe('idle');
        expect(f.model.selection).not.toBeNull();
        expect(f.model.canUndo).toBe(true);
        const selection = structuredClone(f.model.selection);
        const version = f.model.version;
        await f.setup.mockMouse.emitMouseEvent('drag', 20, CANVAS_TOP + 3);
        await f.setup.mockMouse.release(20, CANVAS_TOP + 3);
        expect(f.model.selection).toEqual(selection);
        expect(f.model.version).toBe(version);
        f.model.commands.undo();
        expect(f.model.plane.materialize()).toEqual(original);
        expect(f.model.canUndo).toBe(false);
      } finally {
        await f.dispose();
      }
    });
  }
}

for (const action of ['fill', 'copy', 'cut'] as const) {
  test(`${action} consumes the visible drag selection before release through the terminal Host`, async () => {
    const f = await fixture('darwin', true, '0123456789');
    try {
      f.surface.activateDock('edit');
      f.model.viewport = { ...f.model.viewport, x: 0, y: 0 };
      await f.setup.renderOnce();
      f.model.commands.pointAt({ x: 40, y: 0 });
      const original = f.model.plane.materialize();
      await f.setup.mockMouse.pressDown(2, CANVAS_TOP);
      await f.setup.mockMouse.emitMouseEvent('drag', 4, CANVAS_TOP);
      if (action === 'fill') await f.setup.mockInput.typeText('X', 0);
      else f.setup.mockInput.pressKey(action === 'copy' ? 'c' : 'x', { super: true });
      for (let i = 0; i < 12; i++) await Promise.resolve();
      expect(f.model.gestureState.type).toBe('idle');
      if (action === 'copy' || action === 'cut') expect(f.text).toBe('234');
      if (action === 'copy') expect(f.model.plane.materialize()).toEqual(original);
      else {
        for (let x = 2; x <= 4; x++) {
          if (action === 'fill') expect(f.model.plane.get({ x, y: 0 })?.char).toBe('X');
          else expect(f.model.plane.get({ x, y: 0 })).toBeUndefined();
        }
        f.model.commands.undo();
        expect(f.model.plane.materialize()).toEqual(original);
      }
      expect(f.model.canUndo).toBe(false);
    } finally {
      await f.dispose();
    }
  });
}
