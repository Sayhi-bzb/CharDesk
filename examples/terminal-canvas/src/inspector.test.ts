import { expect, test } from 'bun:test';
import { createTestRenderer, ManualClock } from '@opentui/core/testing';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TerminalWorkspace } from './workspace.ts';
import { CanvasFile } from './document.ts';
import { CANVAS_TOP, CanvasSurface } from './surface.ts';
import { attachControls } from './controller.ts';
import type { TerminalClipboardAccess } from './clipboard.ts';
import { resolveColorPickerPalettes } from '@chardesk/ui/color-presets';
import { RGBA } from '@opentui/core';
import { TerminalCanvas } from './model.ts';

async function fixture(platform: NodeJS.Platform = 'darwin', clipboard?: TerminalClipboardAccess) {
  const root = await mkdtemp(join(tmpdir(), 'chardesk-inspector-'));
  const workspace = await TerminalWorkspace.open(join(root, 'canvas.chardesk'));
  const model = workspace.model;
  model.apply({
    rows: [
      {
        y: 0,
        erase: [],
        spans: [
          {
            x: 0,
            text: '🦀',
            color: '#ff0000',
            attrs: { bold: true },
            href: 'https://example.com',
          },
          { x: 2, text: '界', color: '#0000ff', attrs: { italic: true }, bgColor: '#112233' },
        ],
      },
    ],
  });
  model.documents.clearHistory();
  await workspace.saveFile();
  const clock = new ManualClock();
  const setup = await createTestRenderer({ width: 110, height: 30, kittyKeyboard: true, clock });
  const surface = new CanvasSurface(setup.renderer, model, 'Style', platform);
  setup.renderer.root.add(surface);
  const detach = attachControls(surface, () => {}, clipboard, workspace);
  surface.inspector!.close(); // Individual cases explicitly open the toolbar.
  surface.setTool('edit');
  model.viewport = { ...model.viewport, x: 0, y: 0 };
  await setup.renderOnce();
  return {
    root,
    workspace,
    model,
    setup,
    surface,
    clock,
    get inspector() {
      return surface.inspector!;
    },
    open() {
      setup.mockInput.pressKey('F11', { shift: true });
    },
    escape() {
      setup.mockInput.pressEscape();
      clock.advance(40);
    },
    primary(key: string) {
      setup.mockInput.pressKey(key, platform === 'darwin' ? { super: true } : { ctrl: true });
    },
    async pick(index: number, custom = true) {
      const control = surface.inspector!.controls[index]!;
      await setup.mockMouse.click(control.x + 1, control.y);
      await setup.renderOnce();
      if (custom && (index === 5 || index === 6)) {
        setup.mockInput.pressKey('h');
        await setup.renderOnce();
      }
    },
    async dispose() {
      detach();
      await setup.dispose();
      workspace.dispose();
      await rm(root, { recursive: true, force: true });
    },
  };
}

for (const fresh of [true, false]) {
  test(`Style starts expanded without taking canvas focus or changing the ${fresh ? 'Hand' : 'restored'} tool`, async () => {
    const setup = await createTestRenderer({
      width: 110,
      height: 30,
      kittyKeyboard: true,
      clock: new ManualClock(),
    });
    const model = new TerminalCanvas('A🦀');
    const surface = new CanvasSurface(setup.renderer, model, 'Style startup', 'darwin', fresh);
    setup.renderer.root.add(surface);
    await setup.renderOnce();
    const tool = model.currentTool,
      view = { ...model.viewport },
      version = model.version;
    const detach = attachControls(surface, () => {});
    try {
      await setup.renderOnce();
      expect(surface.inspector!.isVisible).toBe(true);
      expect(surface.inspector!.focused).toBe(false);
      expect(model.currentTool).toBe(tool);
      expect(model.viewport).toEqual(view);
      expect(model.version).toBe(version);
      expect(model.canUndo).toBe(false);
      expect(setup.captureCharFrame()).toContain('[Text]');
      surface.activateDock('edit');
      model.commands.pointAt({ x: 0, y: 5 });
      await setup.mockInput.typeText('Z', 0);
      expect(model.plane.get({ x: 0, y: 5 })?.char).toBe('Z');
      surface.activateDock('hand');
      expect(surface.tool).toBe('hand');
      expect(surface.inspector!.isVisible).toBe(true);
      expect(surface.inspector!.focused).toBe(false);
      surface.inspector!.close();
      surface.activateDock('edit');
      expect(surface.inspector!.isOpen).toBe(false);
    } finally {
      detach();
      await setup.dispose();
      model.dispose();
    }
  });
}

test('active palette brackets enclose both RGB cells, move cleanly and preserve edge borders', async () => {
  const f = await fixture();
  try {
    f.model.commands.selectAll();
    const before = f.model.plane.materialize();
    f.open();
    await f.pick(5, false);
    const first = f.inspector.paletteSwatches[0]!;
    let row = f.setup.captureCharFrame().split('\n')[first.y]!;
    expect(row[first.x - 1]).toBe('[');
    expect(row[first.x + first.width]).toBe(']');
    expect(f.setup.renderer.getCursorState().visible).toBe(false);
    f.setup.mockInput.pressArrow('right');
    await f.setup.renderOnce();
    row = f.setup.captureCharFrame().split('\n')[first.y]!;
    expect(row[first.x - 1]).toBe(' ');
    for (let i = 0; i < 7; i++) f.setup.mockInput.pressArrow('down');
    for (let i = 0; i < 3; i++) f.setup.mockInput.pressArrow('right');
    await f.setup.renderOnce();
    const last = f.inspector.paletteSwatches.find((swatch) => swatch.index === 39)!,
      layout = f.inspector.colorLayout;
    row = f.setup.captureCharFrame().split('\n')[last.y]!;
    expect(row[last.x - 1]).toBe('[');
    expect(row[last.x + last.width]).toBe(']');
    expect(row[layout.x]).toBe('│');
    expect(row[layout.x + layout.width - 1]).toBe('│');
    f.setup.renderer.currentRenderBuffer.withBuffers((cells) => {
      for (const swatch of [first, last])
        for (let dx = 0; dx < swatch.width; dx++) {
          const index = swatch.y * cells.width + swatch.x + dx;
          expect(RGBA.fromArray(cells.bg.slice(index * 4, index * 4 + 4)).toInts()).toEqual(
            RGBA.fromHex(swatch.color).toInts()
          );
        }
    });
    expect(f.model.plane.materialize()).toEqual(before);
    expect(f.model.canUndo).toBe(false);
  } finally {
    await f.dispose();
  }
});

test('Style toolbar applies shared mixed-state rules without textual status and preserves wide native content', async () => {
  const f = await fixture();
  try {
    f.model.selection = { anchor: { x: 1, y: 0 }, focus: { x: 3, y: 0 } };
    const before = f.model.plane.materialize(),
      interaction = structuredClone(f.model.getSnapshot().interaction),
      view = { ...f.model.viewport };
    f.open();
    expect(f.surface.panel).toBeNull();
    expect(f.inspector.isVisible).toBe(true);
    expect(f.model.selectionStyle.attributes?.bold).toBe('mixed');
    expect(f.model.plane.materialize()).toEqual(before);
    await f.setup.renderOnce();
    expect(f.setup.captureCharFrame()).toContain('[Text]');
    await f.pick(0);
    expect(f.model.selectionStyle.attributes?.bold).toBe('on');
    expect(f.model.plane.get({ x: 2, y: 0 })?.attrs).toMatchObject({ bold: true, italic: true });
    f.primary('z');
    expect(f.model.plane.materialize()).toEqual(before);
    expect(f.model.canUndo).toBe(false);
    await f.pick(5);
    await f.setup.mockInput.typeText('bad', 0);
    f.setup.mockInput.pressEnter();
    expect(f.inspector.colorInput?.error).toContain('#RRGGBB');
    expect(f.model.plane.materialize()).toEqual(before);
    f.primary('a');
    await f.setup.mockInput.typeText('#abcdef', 0);
    f.setup.mockInput.pressEnter();
    expect(f.inspector.colorInput).toBeNull();
    expect(f.inspector.isVisible).toBe(true);
    expect(f.inspector.focused).toBe(false);
    expect(f.model.selectionStyle.foreground).toEqual({ kind: 'color', value: '#abcdef' });
    expect(f.model.getSnapshot().interaction).toEqual(interaction);
    expect(f.model.viewport).toEqual(view);
    expect(f.model.plane.get({ x: 1, y: 0 })).toBeUndefined();
    expect(f.model.plane.get({ x: 3, y: 0 })).toBeUndefined();
    expect(f.model.plane.get({ x: 0, y: 0 })?.href).toBe('https://example.com');
    await f.workspace.saveFile();
    const reopened = await CanvasFile.open(f.workspace.active.path);
    try {
      expect(reopened.model.plane.materialize()).toEqual(f.model.plane.materialize());
    } finally {
      reopened.model.dispose();
    }
  } finally {
    await f.dispose();
  }
});

test('floating Style fills selected blank backgrounds and clears them as separate undo steps', async () => {
  const f = await fixture();
  try {
    f.model.selection = { anchor: { x: -2, y: 4 }, focus: { x: 2, y: 4 } };
    const before = f.model.plane.materialize();
    f.open();
    await f.pick(0);
    expect(f.model.canUndo).toBe(false);
    await f.pick(6);
    await f.setup.mockInput.typeText('#123456', 0);
    f.setup.mockInput.pressEnter();
    expect(f.model.plane.get({ x: -2, y: 4 })?.bgColor).toBe('#123456');
    expect(f.model.plane.get({ x: 2, y: 4 })?.bgColor).toBe('#123456');
    await f.pick(7);
    expect(f.model.plane.materialize()).toEqual(before);
    f.primary('z');
    expect(f.model.plane.get({ x: 0, y: 4 })?.bgColor).toBe('#123456');
    f.primary('z');
    expect(f.model.plane.materialize()).toEqual(before);
    expect(f.model.canUndo).toBe(false);
  } finally {
    await f.dispose();
  }
});

test('canvas selection, typing, paste and captured drags work while Style remains open', async () => {
  const f = await fixture();
  try {
    const view = { ...f.model.viewport };
    f.open();
    await f.setup.mockMouse.click(0, CANVAS_TOP);
    await f.setup.mockMouse.click(3, CANVAS_TOP, 0, { modifiers: { shift: true } });
    expect(f.model.selectionStyle.attributes?.bold).toBe('mixed');
    await f.pick(0);
    expect(f.inspector.focused).toBe(false);
    expect(f.model.selectionStyle.attributes?.bold).toBe('on');
    await f.setup.mockMouse.click(5, CANVAS_TOP + 3);
    await f.setup.mockInput.typeText('Z', 0);
    expect(f.model.plane.get({ x: 5, y: 3 })?.char).toBe('Z');
    await f.setup.mockInput.pasteBracketedText('P');
    await f.setup.waitFor(() => f.model.plane.get({ x: 6, y: 3 })?.char === 'P');
    const l = f.inspector.layout;
    await f.setup.mockMouse.pressDown(5, 14);
    await f.setup.mockMouse.emitMouseEvent('drag', l.x + 3, l.y + 3);
    await f.setup.mockMouse.release(l.x + 3, l.y + 3);
    expect(f.model.gestureState.type).toBe('idle');
    expect(f.model.selection?.focus).toEqual({ x: l.x + 3, y: l.y + 3 - CANVAS_TOP });
    expect(f.inspector.isVisible).toBe(true);
    expect(f.surface.panel).toBeNull();
    expect(f.model.viewport).toEqual(view);
  } finally {
    await f.dispose();
  }
});

test('keyboard Style focus is explicit and Esc returns to canvas without clearing its range', async () => {
  const f = await fixture();
  try {
    f.model.commands.selectAll();
    const range = structuredClone(f.model.selection);
    f.open();
    expect(f.inspector.focused).toBe(true);
    f.setup.mockInput.pressEnter();
    expect(f.model.selectionStyle.attributes?.bold).toBe('on');
    f.setup.mockInput.pressArrow('right');
    f.setup.mockInput.pressEnter();
    expect(f.model.selectionStyle.attributes?.italic).toBe('on');
    f.escape();
    expect(f.inspector.isVisible).toBe(true);
    expect(f.inspector.focused).toBe(false);
    expect(f.model.selection).toEqual(range);
    f.setup.mockInput.pressArrow('right', { shift: true });

    expect(f.model.selection).not.toEqual(range);
    f.escape();
    expect(f.inspector.isOpen).toBe(true);
    expect(f.model.selection).toBeNull();
  } finally {
    await f.dispose();
  }
});

test('floating Style yields Dock focus and native cursor ownership to the active surface', async () => {
  const f = await fixture();
  try {
    f.model.commands.selectAll();
    const range = structuredClone(f.model.selection);
    f.open();
    f.escape();
    f.setup.mockInput.pressTab();
    expect(f.surface.focusedDockControl).not.toBeNull();
    f.escape();
    expect(f.surface.focusedDockControl).toBeNull();
    expect(f.inspector.isOpen).toBe(true);
    expect(f.model.selection).toEqual(range);
    const l = f.inspector.layout;
    f.model.commands.pointAt({ x: l.x + 4, y: l.y + 2 });
    await f.setup.renderOnce();
    expect(f.setup.renderer.getCursorState().visible).toBe(false);
    f.model.commands.pointAt({ x: 0, y: 5 });
    await f.setup.renderOnce();
    expect(f.setup.renderer.getCursorState().visible).toBe(true);
    expect(f.setup.captureCharFrame().split('\n')[CANVAS_TOP]).toContain('🦀界');
    expect(f.model.viewport.width).toBe(110);
    expect(f.model.viewport.height).toBe(30 - CANVAS_TOP - 2);
  } finally {
    await f.dispose();
  }
});

test('color popover rejects stale selection targets; outside click cancels it and selects the canvas immediately', async () => {
  const f = await fixture();
  try {
    f.model.commands.selectAll();
    f.open();
    await f.pick(6);
    const before = f.model.plane.materialize();
    await f.setup.mockInput.typeText('#123456', 0);
    f.model.commands.pointAt({ x: 20, y: 20 });
    f.setup.mockInput.pressEnter();
    expect(f.inspector.colorInput?.error).toContain('Selection changed');
    expect(f.model.plane.materialize()).toEqual(before);
    await f.setup.mockMouse.click(9, CANVAS_TOP + 4);
    expect(f.inspector.colorInput).toBeNull();
    expect(f.model.cursor).toEqual({ x: 9, y: 4 });
    expect(f.inspector.isVisible).toBe(true);
    await f.setup.mockInput.typeText('X', 0);
    expect(f.model.plane.get({ x: 9, y: 4 })?.char).toBe('X');
  } finally {
    await f.dispose();
  }
});

for (const platform of ['darwin', 'win32'] as const) {
  test(`${platform} Style and formatting remain rebindable`, async () => {
    const f = await fixture(platform);
    try {
      f.model.commands.selectAll();
      f.primary('b');
      expect(f.model.selectionStyle.attributes?.bold).toBe('on');
      f.model.editor.keymap.setUserBindings('terminal.format-bold', [['F12']]);
      f.primary('b');
      expect(f.model.selectionStyle.attributes?.bold).toBe('on');
      f.setup.mockInput.pressKey('F12');
      expect(f.model.selectionStyle.attributes?.bold).toBe('off');
      f.model.editor.keymap.setUserBindings('terminal.inspector', [['F9']]);
      f.open();
      expect(f.inspector.isOpen).toBe(false);
      f.setup.mockInput.pressKey('F9');
      expect(f.inspector.isVisible).toBe(true);
    } finally {
      await f.dispose();
    }
  });

  test(`${platform} color clipboard input is isolated and stale reads cannot populate a dismissed field`, async () => {
    const pending = Promise.withResolvers<{ plainText: string }>();
    const writes: string[] = [];
    const f = await fixture(platform, {
      read: () => pending.promise,
      write: async (value) => {
        writes.push(value.plain);
        return { status: 'dispatched' };
      },
    });
    try {
      f.model.commands.selectAll();
      f.open();
      await f.pick(5);
      const content = f.model.plane.materialize(),
        range = structuredClone(f.model.selection);
      f.primary('a');
      await f.setup.mockInput.pasteBracketedText('#334455');
      expect(f.inspector.colorInput?.input).toBe('#334455');
      f.primary('x');
      await Promise.resolve();
      await Promise.resolve();
      expect(writes).toEqual(['#334455']);
      expect(f.inspector.colorInput?.input).toBe('#334455');
      expect(f.inspector.colorInput?.error).toContain('unconfirmed');
      f.primary('v');
      await f.setup.mockMouse.click(12, 4);
      pending.resolve({ plainText: '#112233' });
      await Promise.resolve();
      await Promise.resolve();
      expect(f.inspector.colorInput).toBeNull();
      expect(f.model.plane.materialize()).toEqual(content);
      expect(f.model.selection).not.toEqual(range);
      expect(f.model.canUndo).toBe(false);
    } finally {
      pending.resolve({ plainText: '' });
      await f.dispose();
    }
  });
}

for (const exit of ['blur', 'resize', 'settings', 'hand', 'document'] as const) {
  test(`${exit} relinquishes Style input without a stale color mutation`, async () => {
    const f = await fixture();
    try {
      f.model.commands.selectAll();
      f.open();
      await f.pick(5);
      await f.setup.mockInput.typeText('#123456', 0);
      const address = f.model.documents.getActiveAddress(),
        content = f.model.plane.materialize();
      if (exit === 'blur') f.setup.renderer.emit('blur');
      else if (exit === 'resize') {
        f.setup.resize(20, 9);
        await f.setup.renderOnce();
      } else if (exit === 'settings') {
        const dock = f.surface.headerControls.find((item) => item.id === 'settings')!;
        await f.setup.mockMouse.click(dock.x + 1, dock.y);
        expect(f.surface.panel?.title).toBe('Settings');
        f.escape();
      } else if (exit === 'hand') f.surface.setTool('hand');
      else await f.workspace.openFile(join(f.root, 'other.chardesk'));
      expect(f.inspector.colorInput).toBeNull();
      expect(f.inspector.focused).toBe(false);
      if (exit === 'document') f.model.switchDocument(address.documentId, address.pageId);
      expect(f.model.plane.materialize()).toEqual(content);
      expect(f.model.canUndo).toBe(false);
      expect(f.inspector.isOpen).toBe(true);
      if (exit === 'resize') {
        expect(f.setup.captureCharFrame()).toContain('[Style]');
        await f.setup.mockMouse.click(1, CANVAS_TOP + 3);
        await f.setup.mockInput.typeText('N', 0);
        expect(f.model.plane.get({ x: 1, y: 3 })?.char).toBe('N');
        f.setup.resize(110, 30);
        await f.setup.renderOnce();
        expect(f.setup.captureCharFrame()).toContain('[Text]');
      }
    } finally {
      await f.dispose();
    }
  });
}

test('footer Dock toggles the Style toolbar at 80 columns; context menu has no Style entry', async () => {
  const f = await fixture();
  try {
    f.model.commands.selectAll();
    const range = structuredClone(f.model.selection),
      content = f.model.plane.materialize();
    f.setup.resize(80, 24);
    await f.setup.renderOnce();
    for (let repeat = 0; repeat < 2; repeat++) {
      const button = f.surface.dockControls.find((control) => control.id === 'inspector')!;
      expect(button.label).toBe('[Style]');
      await f.setup.mockMouse.click(button.x + 1, button.y);
      expect(f.inspector.isVisible).toBe(true);
      expect(f.surface.panel).toBeNull();
      await f.setup.renderOnce();
      const frame = f.setup.captureCharFrame();
      for (const label of ['[B]', '[I]', '[U]', '[S]', '[Inv]', '[Text]', '[Fill]', '[Clear]'])
        expect(frame).toContain(label);
      for (const status of ['mixed', 'Unavailable', 'text cells', 'Select a range', '#ff0000'])
        expect(frame).not.toContain(status);
      expect(f.inspector.layout.height).toBe(4);
      expect(f.model.selection).toEqual(range);
      expect(f.model.plane.materialize()).toEqual(content);
      expect(f.model.canUndo).toBe(false);
      await f.setup.mockMouse.click(button.x + 1, button.y);
      expect(f.inspector.isOpen).toBe(false);
    }
    await f.setup.mockMouse.click(2, CANVAS_TOP, 2);
    expect(f.surface.contextMenu!.items.some((item) => item.id === 'inspector')).toBe(false);
    expect(f.inspector.isOpen).toBe(false);
  } finally {
    await f.dispose();
  }
});

test('preset swatches share Web colors, paint their RGB and apply one wide selection command', async () => {
  const f = await fixture();
  try {
    f.model.selection = { anchor: { x: 1, y: 0 }, focus: { x: 3, y: 0 } };
    const before = f.model.plane.materialize(),
      range = structuredClone(f.model.selection),
      view = { ...f.model.viewport };
    f.open();
    await f.pick(5, false);
    const mode = f.surface.appearance.getSnapshot().mode;
    const colors = resolveColorPickerPalettes(mode === 'dark' ? 'dark' : 'light').presets;
    expect(f.inspector.paletteSwatches.map((swatch) => swatch.color)).toEqual([...colors]);
    const swatch = f.inspector.paletteSwatches[11]!;
    f.setup.renderer.currentRenderBuffer.withBuffers((cells) => {
      const index = swatch.y * cells.width + swatch.x;
      expect(RGBA.fromArray(cells.bg.slice(index * 4, index * 4 + 4)).toInts()).toEqual(
        RGBA.fromHex(swatch.color).toInts()
      );
    });
    expect(f.model.plane.materialize()).toEqual(before);
    expect(f.model.canUndo).toBe(false);
    await f.setup.mockMouse.click(swatch.x, swatch.y);
    expect(f.model.selectionStyle.foreground).toEqual({ kind: 'color', value: colors[11] });
    expect(f.model.plane.get({ x: 0, y: 0 })?.href).toBe('https://example.com');
    expect(f.model.plane.get({ x: 1, y: 0 })).toBeUndefined();
    expect(f.model.plane.get({ x: 3, y: 0 })).toBeUndefined();
    expect(f.model.selection).toEqual(range);
    expect(f.model.viewport).toEqual(view);
    expect(f.inspector.paletteSwatches).toEqual([]);
    expect(f.inspector.isVisible).toBe(true);
    f.primary('z');
    expect(f.model.plane.materialize()).toEqual(before);
    expect(f.model.canUndo).toBe(false);
  } finally {
    await f.dispose();
  }
});

test('ANSI16 swatches fill blank backgrounds and reset through the existing shared command', async () => {
  const f = await fixture();
  try {
    f.model.selection = { anchor: { x: -2, y: 4 }, focus: { x: 2, y: 4 } };
    const before = f.model.plane.materialize();
    f.open();
    await f.pick(6, false);
    const tab = f.inspector.paletteControls.find((control) => control.id === 'ansi16')!;
    await f.setup.mockMouse.click(tab.x + 1, tab.y);
    await f.setup.renderOnce();
    expect(f.inspector.paletteSwatches.map((swatch) => swatch.color)).toEqual(
      resolveColorPickerPalettes('light').ansi16
    );
    const red = f.inspector.paletteSwatches[9]!;
    await f.setup.mockMouse.click(red.x, red.y);
    for (let x = -2; x <= 2; x++) expect(f.model.plane.get({ x, y: 4 })?.bgColor).toBe('#ff0000');
    await f.pick(6, false);
    const reset = f.inspector.paletteControls.find((control) => control.id === 'reset')!;
    await f.setup.mockMouse.click(reset.x + 1, reset.y);
    expect(f.model.plane.materialize()).toEqual(before);
    f.primary('z');
    expect(f.model.plane.get({ x: 0, y: 4 })?.bgColor).toBe('#ff0000');
    await f.pick(6, false);
    f.setup.mockInput.pressKey('r');
    const resetVersion = f.model.version;
    f.setup.renderer.keyInput.processParsedKey({
      name: 'r',
      sequence: 'r',
      raw: 'r',
      ctrl: false,
      meta: false,
      shift: false,
      option: false,
      number: false,
      eventType: 'repeat',
      source: 'kitty',
    });
    expect(f.model.version).toBe(resetVersion);
    expect(f.model.plane.materialize()).toEqual(before);
    f.primary('z');
    expect(f.model.plane.get({ x: 0, y: 4 })?.bgColor).toBe('#ff0000');
    f.primary('z');
    expect(f.model.plane.materialize()).toEqual(before);
    expect(f.model.canUndo).toBe(false);
  } finally {
    await f.dispose();
  }
});

test('theme changes update curated swatches without recoloring authored cells', async () => {
  const f = await fixture();
  const palette = (mode: 'light' | 'dark') => ({
    palette: [],
    defaultForeground: mode === 'dark' ? '#eeeeee' : '#111111',
    defaultBackground: mode === 'dark' ? '#111111' : '#eeeeee',
    cursorColor: null,
    mouseForeground: null,
    mouseBackground: null,
    tekForeground: null,
    tekBackground: null,
    highlightForeground: null,
    highlightBackground: null,
  });
  try {
    f.surface.appearance.acceptPalette(palette('light'), 'light');
    f.model.commands.selectAll();
    const before = f.model.plane.materialize();
    f.open();
    await f.pick(5, false);
    expect(f.inspector.paletteSwatches[30]?.color).toBe('#fee2e2');
    f.surface.appearance.acceptPalette(palette('dark'), 'dark');
    await f.setup.renderOnce();
    expect(f.inspector.paletteSwatches[30]?.color).toBe('#fca5a5');
    expect(f.model.plane.materialize()).toEqual(before);
    const swatch = f.inspector.paletteSwatches[30]!;
    await f.setup.mockMouse.click(swatch.x, swatch.y);
    expect(f.model.selectionStyle.foreground).toEqual({ kind: 'color', value: '#fca5a5' });
    const chosen = f.model.plane.materialize();
    f.surface.appearance.acceptPalette(palette('light'), 'light');
    await f.setup.renderOnce();
    expect(f.model.plane.materialize()).toEqual(chosen);
  } finally {
    await f.dispose();
  }
});

test('short terminals scroll palette rows with keyboard navigation and still reach the last presets', async () => {
  const f = await fixture();
  try {
    f.model.commands.selectAll();
    const before = f.model.plane.materialize();
    f.setup.resize(30, 10);
    await f.setup.renderOnce();
    f.open();
    await f.pick(5, false);
    expect(f.inspector.paletteSwatches.length).toBeLessThan(40);
    for (let i = 0; i < 7; i++) f.setup.mockInput.pressArrow('down');
    await f.setup.renderOnce();
    expect(f.inspector.paletteSwatches.some((swatch) => swatch.index === 35)).toBe(true);
    expect(f.model.plane.materialize()).toEqual(before);
    const selected = f.inspector.paletteSwatches.find((swatch) => swatch.index === 35)!;
    f.setup.mockInput.pressEnter();
    expect(f.model.selectionStyle.foreground).toEqual({ kind: 'color', value: selected.color });
    expect(f.model.gestureState.type).toBe('idle');
  } finally {
    await f.dispose();
  }
});

test('palette rejects a stale target and terminal paste edits only its custom color input', async () => {
  const f = await fixture();
  try {
    f.model.commands.selectAll();
    const before = f.model.plane.materialize();
    f.open();
    await f.pick(5, false);
    await f.setup.mockInput.pasteBracketedText('#445566');
    expect(f.inspector.colorInput?.input).toBe('#445566');
    expect(f.model.plane.materialize()).toEqual(before);
    f.setup.mockInput.pressEnter();
    expect(f.model.selectionStyle.foreground).toEqual({ kind: 'color', value: '#445566' });
    await f.pick(5, false);
    const swatch = f.inspector.paletteSwatches[1]!,
      chosen = f.model.plane.materialize();
    f.model.commands.pointAt({ x: 20, y: 20 });
    await f.setup.mockMouse.click(swatch.x, swatch.y);
    expect(f.inspector.hint).toContain('Selection changed');
    expect(f.model.plane.materialize()).toEqual(chosen);
    f.escape();
    expect(f.inspector.paletteSwatches).toEqual([]);
  } finally {
    await f.dispose();
  }
});
