import type { CliRenderer } from '@opentui/core';
import { expect, test } from 'bun:test';
import { createTestRenderer, KeyCodes, MouseButtons } from '@opentui/core/testing';
import { attachControls } from './controller.ts';
import { TerminalCanvas } from './model.ts';
import { CANVAS_TOP, CanvasSurface } from './surface.ts';
import type { TerminalClipboardAccess } from './clipboard.ts';
import type { ClipboardWriteResult } from '@chardesk/editor-core/clipboard/commands';

test('a theme change during PNG delivery invalidates its clipboard guard without changing the document', async () => {
  const pending = Promise.withResolvers<{ status: 'written' | 'failed' | 'unavailable' }>();
  let guard: (() => boolean) | undefined;
  const f = await fixture(undefined, true, true, undefined, {
    canWriteImage: () => true,
    writeImage: async (_image, current) => {
      guard = current;
      return pending.promise;
    },
  });
  const terminal = {
    palette: [],
    defaultForeground: '#eeeeee',
    defaultBackground: '#111111',
    cursorColor: null,
    mouseForeground: null,
    mouseBackground: null,
    tekForeground: null,
    tekBackground: null,
    highlightForeground: null,
    highlightBackground: null,
  };
  try {
    f.setup.renderer.emit('palette', terminal);
    f.model.commands.selectAll();
    const content = f.model.plane.materialize(),
      selection = structuredClone(f.model.selection);
    const request = f.model.editor.commands.execute('terminal.snapshot-png', undefined);
    await f.setup.waitFor(() => Boolean(guard));
    expect(guard!()).toBe(true);
    f.setup.renderer.emit('palette', {
      ...terminal,
      defaultForeground: '#111111',
      defaultBackground: '#ffffff',
    });
    expect(guard!()).toBe(false);
    pending.resolve({ status: 'failed' });
    if (request.status === 'pending') await request.completion;
    expect(f.surface.status).toContain('cancelled');
    expect(f.model.plane.materialize()).toEqual(content);
    expect(f.model.selection).toEqual(selection);
    expect(f.model.canUndo).toBe(false);
  } finally {
    pending.resolve({ status: 'failed' });
    await f.dispose();
  }
});

async function fixture(
  source = 'A🦀B',
  kittyKeyboard = true,
  canRead = true,
  write?: () => Promise<ClipboardWriteResult>,
  imageClipboard: Pick<TerminalClipboardAccess, 'canWriteImage' | 'writeImage'> = {}
) {
  const setup = await createTestRenderer({
    width: 80,
    height: 24,
    kittyKeyboard,
    screenMode: 'alternate-screen',
  });
  const model = new TerminalCanvas(source);
  const surface = new CanvasSurface(setup.renderer, model, 'menu-test', 'darwin');
  setup.renderer.root.add(surface);
  const writes: string[] = [];
  let delivery: ClipboardWriteResult['status'] = 'written',
    reads = 0;
  const detach = attachControls(surface, () => {}, {
    ...imageClipboard,
    canRead: () => canRead,
    read: async () => {
      reads++;
      return { plainText: 'PASTE' };
    },
    write: async (payload) => {
      writes.push(payload.plain);
      return write ? write() : { status: delivery };
    },
  });
  surface.setTool('edit');
  model.viewport = { ...model.viewport, x: 0, y: 0 };
  await setup.renderOnce();
  const menu = surface.contextMenu!;
  return {
    setup,
    model,
    surface,
    menu,
    writes,
    set delivery(value: ClipboardWriteResult['status']) {
      delivery = value;
    },
    get reads() {
      return reads;
    },
    async right(x: number, y = 0) {
      await setup.mockMouse.click(
        x - model.viewport.x,
        CANVAS_TOP + y - model.viewport.y,
        MouseButtons.RIGHT
      );
      await setup.renderOnce();
    },
    async item(id: string) {
      const index = menu.items.findIndex((item) => item.id === id),
        layout = menu.layout;
      expect(index).toBeGreaterThanOrEqual(layout.scroll);
      expect(index).toBeLessThan(layout.scroll + layout.rows);
      await setup.mockMouse.click(layout.x + 2, layout.y + 1 + index - layout.scroll);
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
  test(`right-click preserves a wide selection and menu Copy uses the shared clipboard command (Kitty ${kitty})`, async () => {
    const f = await fixture(undefined, kitty);
    try {
      f.model.commands.selectAll();
      const selection = structuredClone(f.model.selection),
        original = f.model.plane.materialize();
      await f.right(2); // crab follower
      expect(f.menu.isOpen).toBe(true);
      expect(f.model.selection).toEqual(selection);
      expect(f.model.editor.commands.canExecute('terminal.copy', undefined)).toBe(true);
      expect(f.setup.captureCharFrame()).toContain('Copy as ANSI');
      await f.item('copy');
      await f.setup.waitFor(() => f.surface.status === 'Copied');
      expect(f.writes).toEqual(['A🦀B']);
      expect(f.menu.isOpen).toBe(false);
      expect(f.model.plane.materialize()).toEqual(original);
      expect(f.model.selection).toEqual(selection);
      expect(f.model.canUndo).toBe(false);
    } finally {
      await f.dispose();
    }
  });
}

test('right-clicking outside a selection targets Paste there without switching Hand', async () => {
  const f = await fixture('AB');
  try {
    f.model.commands.selectAll();
    f.surface.setTool('hand');
    await f.right(10, 2);
    expect(f.model.cursor).toEqual({ x: 10, y: 2 });
    expect(f.model.selection).toBeNull();
    expect(f.menu.items.find((item) => item.id === 'copy')?.enabled).toBe(false);
    await f.item('paste');
    await f.setup.waitFor(() => f.model.plane.get({ x: 10, y: 2 })?.char === 'P');
    expect(f.surface.tool).toBe('hand');
    expect(f.model.canUndo).toBe(true);
    expect(f.reads).toBe(1);
  } finally {
    await f.dispose();
  }
});

test('selection envelope holes are outside; wide followers resolve to the linked anchor', async () => {
  const f = await fixture('A界\nABCDE');
  try {
    await f.setup.mockMouse.click(0, CANVAS_TOP);
    await f.setup.mockMouse.click(1, CANVAS_TOP + 1, 0, { modifiers: { alt: true } });
    await f.right(2, 1);
    expect(f.model.selection).toBeNull();
    expect(f.model.cursor).toEqual({ x: 2, y: 1 });
    f.menu.close();
    await f.right(2, 0);
    expect(f.model.cursor).toEqual({ x: 1, y: 0 });
    expect(f.model.canUndo).toBe(false);
  } finally {
    await f.dispose();
  }
});

test('keyboard opens the menu without a dock button; menu focus blocks typing, paste and other shortcuts', async () => {
  const f = await fixture();
  try {
    f.model.commands.selectAll();
    const original = f.model.plane.materialize(),
      selection = structuredClone(f.model.selection);
    f.setup.mockInput.pressKey(KeyCodes.F10, { shift: true });
    expect(f.menu.isOpen).toBe(true);
    await f.setup.mockInput.typeText('SHOULD_NOT_TYPE', 0);
    await f.setup.mockInput.pasteBracketedText('SHOULD_NOT_PASTE');
    f.setup.mockInput.pressKey('z', { super: true });
    expect(f.model.plane.materialize()).toEqual(original);
    expect(f.model.selection).toEqual(selection);
    expect(f.model.canUndo).toBe(false);
    f.setup.mockInput.pressEscape();
    expect(f.menu.isOpen).toBe(false);
    expect(f.surface.dockControls.map((control) => control.id)).not.toContain('context-menu');
    f.setup.mockInput.pressKey(KeyCodes.F10, { shift: true });
    expect(f.menu.isOpen).toBe(true);
    const before = structuredClone(f.model.cursor);
    await f.setup.mockMouse.click(79, CANVAS_TOP + 10);
    expect(f.menu.isOpen).toBe(false);
    expect(f.model.cursor).toEqual(before);
    expect(f.model.selection).toEqual(selection);
  } finally {
    await f.dispose();
  }
});

test('disabled items cannot execute; keyboard navigation skips them and Enter executes once', async () => {
  const f = await fixture();
  try {
    await f.right(15);
    for (const id of ['copy', 'copy-ansi', 'snapshot-png', 'delete-selection'])
      expect(f.menu.items.find((item) => item.id === id)?.enabled).toBe(false);
    await f.item('copy-ansi');
    expect(f.menu.isOpen).toBe(true);
    expect(f.writes).toHaveLength(0);
    // Only Paste is enabled; navigation wraps past disabled actions and separator.
    f.setup.mockInput.pressArrow('down');
    f.setup.mockInput.pressEnter();
    expect(f.menu.isOpen).toBe(false);
    await f.setup.waitFor(() => f.reads === 1);
    expect(f.model.plane.get({ x: 15, y: 0 })?.char).toBe('P');
    expect(f.model.canUndo).toBe(true);
  } finally {
    await f.dispose();
  }
});

test('unconfirmed or failed keyboard Cut preserves content, selection and history', async () => {
  for (const delivery of ['dispatched', 'failed'] as const) {
    const f = await fixture();
    try {
      f.delivery = delivery;
      f.model.commands.selectAll();
      const original = f.model.plane.materialize(),
        selection = structuredClone(f.model.selection);
      await f.right(1);
      f.menu.close();
      f.setup.mockInput.pressKey('x', { super: true });
      await f.setup.waitFor(() => f.surface.status !== 'Working with clipboard…');
      expect(f.model.plane.materialize()).toEqual(original);
      expect(f.model.selection).toEqual(selection);
      expect(f.model.canUndo).toBe(false);
      expect(f.surface.status).toContain(
        delivery === 'dispatched' ? 'selection kept' : 'unavailable'
      );
    } finally {
      await f.dispose();
    }
  }
});

test('menu Delete and keyboard Undo share history and preserve the selected tool', async () => {
  const f = await fixture();
  try {
    f.model.commands.selectAll();
    f.surface.setTool('hand');
    await f.right(1);
    await f.item('delete-selection');
    expect(f.model.plane.materialize().size).toBe(0);
    expect(f.surface.tool).toBe('hand');
    f.setup.mockInput.pressKey('z', { super: true });
    expect(f.model.plane.get({ x: 1, y: 0 })?.char).toBe('🦀');
    expect(f.surface.tool).toBe('hand');
  } finally {
    await f.dispose();
  }
});

test('menu matches the Web action order and preserves linked text when copying', async () => {
  const href = 'https://example.com/linked-crab';
  const f = await fixture(`A \x1b]8;;${href}\x1b\\🦀\x1b]8;;\x1b\\`);
  try {
    f.model.commands.selectAll();
    const selection = structuredClone(f.model.selection);
    await f.right(3);
    expect(f.menu.items.map((item) => item.id)).toEqual([
      'copy',
      'copy-ansi',
      'snapshot-png',
      'paste',
      'separator',
      'delete-selection',
    ]);
    expect(f.menu.items[4]?.separator).toBe(true);
    await f.item('copy');
    await f.setup.waitFor(() => f.surface.status === 'Copied');
    expect(f.writes).toEqual(['A 🦀']);
    expect(f.model.selection).toEqual(selection);
    expect(f.model.canUndo).toBe(false);
  } finally {
    await f.dispose();
  }
});

test('rebinding opening and Copy updates execution and menu hints', async () => {
  const f = await fixture();
  try {
    f.model.commands.selectAll();
    f.model.editor.keymap.setUserBindings('terminal.context-menu', [['F11']]);
    f.model.editor.keymap.setUserBindings('terminal.copy', [['F12']]);
    f.setup.mockInput.pressKey(KeyCodes.F10, { shift: true });
    expect(f.menu.isOpen).toBe(false);
    f.setup.mockInput.pressKey(KeyCodes.F11);
    expect(f.menu.isOpen).toBe(true);
    expect(f.menu.items.find((item) => item.id === 'copy')?.shortcut).toBe('F12');
    f.setup.mockInput.pressEnter();
    await f.setup.waitFor(() => f.surface.status === 'Copied');
    expect(f.writes).toEqual(['A🦀B']);
    const original = f.model.plane.materialize();
    f.setup.renderer.keyInput.processParsedKey({
      name: 'return',
      ctrl: false,
      meta: false,
      shift: false,
      option: false,
      sequence: '\r',
      number: false,
      raw: '\r',
      eventType: 'repeat',
      source: 'kitty',
    });
    expect(f.model.plane.materialize()).toEqual(original);
    expect(f.writes).toHaveLength(1);
  } finally {
    await f.dispose();
  }
});

test('menus close on target changes, blur, resize and disposal; narrow menus fit and scroll', async () => {
  const f = await fixture();
  try {
    for (const change of [
      () => f.model.commands.pointAt({ x: 5, y: 0 }),
      () => f.model.commands.insert('X'),
      () => f.surface.setTool(f.surface.tool === 'edit' ? 'hand' : 'edit'),
      () => f.model.pan(1, 0),
      () => f.setup.renderer.emit('blur'),
      () => f.setup.resize(18, 9),
    ]) {
      f.menu.open();
      expect(f.menu.isOpen).toBe(true);
      change();
      await f.setup.renderOnce();
      expect(f.menu.isOpen).toBe(false);
    }
    await f.setup.renderOnce();
    f.model.commands.selectAll();
    f.menu.open(undefined, { x: 17, y: 6 });
    const l = f.menu.layout;
    expect(l.x).toBeGreaterThanOrEqual(0);
    expect(l.x + l.width).toBeLessThanOrEqual(18);
    expect(l.y + l.height).toBeLessThanOrEqual(7);
    for (let i = 0; i < 3; i++) f.setup.mockInput.pressArrow('down');
    await f.setup.renderOnce();
    expect(f.menu.layout.scroll).toBeGreaterThan(0);
  } finally {
    await f.dispose();
  }
  expect(f.surface.contextMenu).toBeNull();
});

test('unavailable clipboard reads disable menu Paste without reading; terminal paste resumes after closing', async () => {
  const f = await fixture('AB', true, false);
  try {
    await f.right(0);
    const paste = f.menu.items.find((item) => item.id === 'paste')!;
    expect(paste.enabled).toBe(false);
    expect(paste.label).toContain('terminal paste');
    await f.item('paste');
    expect(f.reads).toBe(0);
    f.setup.mockInput.pressEscape();
    await f.setup.mockInput.pasteBracketedText('Z');
    expect(f.model.plane.get({ x: 0, y: 0 })?.char).toBe('Z');
  } finally {
    await f.dispose();
  }
});

test('opening a menu invalidates an older pending Cut before its acknowledgement can delete content', async () => {
  const pending = Promise.withResolvers<ClipboardWriteResult>();
  const f = await fixture(undefined, true, true, () => pending.promise);
  try {
    f.model.commands.selectAll();
    const original = f.model.plane.materialize(),
      selection = structuredClone(f.model.selection);
    const result = f.model.commands.cut();
    expect(result.status).toBe('pending');
    f.menu.open();
    pending.resolve({ status: 'written' });
    if (result.status !== 'pending') throw new Error('Expected pending Cut');
    await result.completion;
    expect(f.model.plane.materialize()).toEqual(original);
    expect(f.model.selection).toEqual(selection);
    expect(f.model.canUndo).toBe(false);
    expect(f.menu.isOpen).toBe(true);
  } finally {
    pending.resolve({ status: 'failed' });
    await f.dispose();
  }
});

test('document switches and modal surfaces close menus; link metadata cannot remain active beneath the menu', async () => {
  const href = 'https://example.com';
  const f = await fixture(`\x1b]8;;${href}\x1b\\LINK\x1b]8;;\x1b\\`);
  try {
    await f.right(0);
    expect(f.setup.renderer.getLinkAt(2, CANVAS_TOP)).toBeNull();
    f.menu.close();
    await f.setup.renderOnce();
    expect(f.setup.renderer.getLinkAt(2, CANVAS_TOP)).toBe(href);
    f.menu.open();
    f.surface.help = true;
    await f.setup.renderOnce();
    expect(f.menu.isOpen).toBe(false);
    f.surface.help = false;
    f.menu.open();
    f.surface.panel = { title: 'Panel', hint: '', items: [], selected: 0 };
    await f.setup.renderOnce();
    expect(f.menu.isOpen).toBe(false);
    expect(f.model.editor.commands.canExecute('terminal.context-menu', undefined)).toBe(false);
    f.surface.panel = null;
    f.menu.open();
    f.model.documents.activateDocument('other', { grid: [] });
    expect(f.menu.isOpen).toBe(false);
    expect(f.model.plane.materialize().size).toBe(0);
  } finally {
    await f.dispose();
  }
});

test('English menu labels fit a narrow terminal and route the same Copy command', async () => {
  const f = await fixture(undefined, true, true, undefined);
  try {
    f.setup.resize(20, 12);
    await f.setup.renderOnce();
    f.model.commands.selectAll();
    f.menu.open();
    await f.setup.renderOnce();
    expect(f.setup.captureCharFrame()).toContain('Delete');
    expect(f.menu.layout.x + f.menu.layout.width).toBeLessThanOrEqual(20);
    await f.item('copy');
    await f.setup.waitFor(() => f.surface.status === 'Copied');
    expect(f.writes).toEqual(['A🦀B']);
  } finally {
    await f.dispose();
  }
});

test('Copy as ANSI preserves styled wide graphemes through the core clipboard workflow', async () => {
  const f = await fixture('\x1b[1;38;2;255;0;0m界🦀\x1b[0m');
  try {
    f.model.commands.selectAll();
    const original = f.model.plane.materialize();
    f.menu.open();
    await f.item('copy-ansi');
    await f.setup.waitFor(() => f.surface.status === 'Copied');
    expect(f.writes).toHaveLength(1);
    expect(f.writes[0]).toContain('界🦀');
    expect(f.writes[0]).toBe('[1;91m界🦀[m');
    expect(f.writes[0]).not.toContain('\x1b');
    expect(f.model.plane.materialize()).toEqual(original);
    expect(f.model.canUndo).toBe(false);
  } finally {
    await f.dispose();
  }
});

for (const delivery of ['written', 'failed', 'unavailable'] as const) {
  test(`PNG menu copies a native image with accurate ${delivery} status and no document mutation`, async () => {
    const images: Array<{ width: number; height: number; rgba: Buffer }> = [];
    const f = await fixture(undefined, true, true, undefined, {
      canWriteImage: () => true,
      writeImage: async (image) => {
        images.push(image);
        return { status: delivery };
      },
    });
    const originalGetPalette = f.setup.renderer.getPalette;
    f.setup.renderer.getPalette = async () => ({
      palette: [],
      defaultForeground: '#eeeeee',
      defaultBackground: '#223344',
      cursorColor: null,
      mouseForeground: null,
      mouseBackground: null,
      tekForeground: null,
      tekBackground: null,
      highlightBackground: null,
      highlightForeground: null,
    });
    try {
      f.model.commands.selectAll();
      const original = f.model.plane.materialize(),
        selection = structuredClone(f.model.selection);
      f.menu.open();
      expect(f.menu.items[2]?.enabled).toBe(true);
      // Navigation skips the separator and reaches Delete, then wraps to Copy.
      for (let n = 0; n < 4; n++) f.setup.mockInput.pressArrow('down');
      f.setup.mockInput.pressArrow('down');
      await f.item('snapshot-png');
      await f.setup.waitFor(
        () => images.length === 1 && f.surface.status !== 'Working with clipboard…'
      );
      expect(f.surface.status).toBe(
        delivery === 'written' ? 'PNG image copied' : 'Clipboard unavailable.'
      );
      expect(images[0]?.width).toBe(108);
      expect(images[0]?.height).toBe(120);
      expect([...images[0]!.rgba.subarray(0, 4)]).toEqual([0x22, 0x33, 0x44, 255]);
      expect(f.writes).toHaveLength(0);
      expect(f.model.plane.materialize()).toEqual(original);
      expect(f.model.selection).toEqual(selection);
      expect(f.model.canUndo).toBe(false);
    } finally {
      f.setup.renderer.getPalette = originalGetPalette;
      await f.dispose();
    }
  });
}

test('PNG cancels before writing when selection changes or the terminal palette is unavailable', async () => {
  for (const stale of [false, true]) {
    const palette = Promise.withResolvers<Awaited<ReturnType<CliRenderer['getPalette']>>>();
    let writes = 0;
    const f = await fixture(undefined, true, true, undefined, {
      canWriteImage: () => true,
      writeImage: async () => {
        writes++;
        return { status: 'written' };
      },
    });
    const originalGetPalette = f.setup.renderer.getPalette;
    f.setup.renderer.getPalette = () => palette.promise;
    try {
      f.model.commands.selectAll();
      f.menu.open();
      const result = f.model.editor.commands.execute('terminal.snapshot-png', undefined);
      if (stale) f.model.commands.pointAt({ x: 7, y: 0 });
      palette.resolve({
        palette: [],
        defaultForeground: null,
        defaultBackground: null,
        cursorColor: null,
        mouseForeground: null,
        mouseBackground: null,
        tekForeground: null,
        tekBackground: null,
        highlightBackground: null,
        highlightForeground: null,
      });
      expect(result.status).toBe('pending');
      if (result.status === 'pending') await result.completion;
      expect(writes).toBe(0);
      expect(f.surface.status).toContain(stale ? 'cancelled' : 'terminal colors are unavailable');
    } finally {
      f.setup.renderer.getPalette = originalGetPalette;
      await f.dispose();
    }
  }
});
