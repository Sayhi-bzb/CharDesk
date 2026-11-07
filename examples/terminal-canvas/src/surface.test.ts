import { createTextAttributes } from '@opentui/core';
import { expect, test } from 'bun:test';
import { createTestRenderer, KeyCodes, ManualClock, MouseButtons } from '@opentui/core/testing';
import { attachControls } from './controller.ts';
import { TerminalCanvas } from './model.ts';
import { CANVAS_TOP, CanvasSurface } from './surface.ts';
import { resolveTerminalPolicy } from './terminalPolicy.ts';

test('header actions reserve one row while footer tools and canvas follow resize without click-through', async () => {
  const clock = new ManualClock();
  const setup = await createTestRenderer({ width: 100, height: 26, kittyKeyboard: true, clock });
  const model = new TerminalCanvas('Top 🦀');
  const surface = new CanvasSurface(setup.renderer, model, 'dock-demo.chardesk');
  setup.renderer.root.add(surface);
  const detach = attachControls(surface, () => {});
  try {
    surface.setTool('edit');
    model.viewport = { ...model.viewport, x: 0, y: 0 };
    await setup.renderOnce();
    const lines = setup.captureCharFrame().split('\n');
    expect(lines[0]?.trimEnd()).toBe('[Settings] [Minimap] [Sessions]');
    expect(lines[CANVAS_TOP]?.startsWith('Top 🦀')).toBe(true);
    expect(lines[24]).toContain('[Edit] [Hand] [Style]');
    expect(lines[24]).not.toContain('dock-demo.chardesk');
    expect(lines[24]).not.toContain('unchanged');
    expect(lines[24]?.trimEnd()).toBe(
      surface.dockControls.map((control) => control.label).join(' ')
    );
    expect(model.viewport.height).toBe(23);
    const content = model.plane.materialize();
    const hand = surface.dockControls.find((control) => control.id === 'hand')!;
    await setup.mockMouse.click(hand.x + 1, hand.y);
    expect(surface.tool).toBe('hand');
    expect(model.plane.materialize()).toEqual(content);
    expect(model.canUndo).toBe(false);
    const settings = surface.headerControls.find((control) => control.id === 'settings')!;
    await setup.mockMouse.click(settings.x + 1, settings.y);
    await setup.renderOnce();
    expect(surface.panel?.title).toBe('Settings');
    expect(surface.dockControls).toEqual([]);
    expect(setup.captureCharFrame().split('\n')[24]).toContain(
      'Settings · Tab section · Enter change'
    );
    setup.mockInput.pressEscape();
    clock.advance(40);
    setup.resize(110, 30);
    await setup.renderOnce();
    const edit = surface.dockControls.find((control) => control.id === 'edit')!;
    expect(edit.y).toBe(28);
    expect(model.viewport.height).toBe(30 - CANVAS_TOP - 2);
    await setup.mockMouse.click(edit.x + 1, edit.y);
    await setup.renderOnce();
    await setup.mockMouse.click(0, CANVAS_TOP);
    setup.mockInput.pressKey('Z');
    expect(model.plane.get({ x: 0, y: 0 })?.char).toBe('Z');
    const cursor = { ...model.cursor },
      after = model.plane.materialize();
    await setup.mockMouse.click(109, 29);
    expect(model.cursor).toEqual(cursor);
    expect(model.plane.materialize()).toEqual(after);
  } finally {
    detach();
    await setup.dispose();
    model.dispose();
  }
});

test('active cells use one native block cursor without injecting inverse or underline into text, wide followers or spaces', async () => {
  const setup = await createTestRenderer({ width: 70, height: 20 });
  const model = new TerminalCanvas('A界🦀');
  try {
    setup.renderer.setCursorStyle({ style: 'underline' });
    const surface = new CanvasSurface(setup.renderer, model, 'cursor', 'darwin');
    setup.renderer.root.add(surface);
    surface.setTool('edit');
    model.viewport = { ...model.viewport, x: -3, y: -2 };
    for (const x of [0, 1, 3, 5]) {
      model.commands.pointAt({ x, y: 0 });
      await setup.renderOnce();
      expect(setup.renderer.getCursorState()).toMatchObject({
        x: x - model.viewport.x + 1,
        y: CANVAS_TOP - model.viewport.y + 1,
        visible: true,
        style: 'block',
      });
      setup.renderer.currentRenderBuffer.withBuffers((cells) => {
        const row = (CANVAS_TOP - model.viewport.y) * cells.width;
        const mask = createTextAttributes({ inverse: true, underline: true });
        for (let cellX = 0; cellX <= 5; cellX++)
          expect(cells.attributes[row + cellX - model.viewport.x]! & mask).toBe(0);
      });
    }
    model.commands.selectAll();
    await setup.renderOnce();
    expect(setup.renderer.getCursorState().visible).toBe(false);
    model.commands.escape();
    surface.setTool('hand');
    await setup.renderOnce();
    expect(setup.renderer.getCursorState().visible).toBe(false);
    expect(model.canUndo).toBe(false);
  } finally {
    await setup.dispose();
    model.dispose();
  }
});

test('native active cursor preserves underline and inverse that belong to document content', async () => {
  const setup = await createTestRenderer({ width: 70, height: 20 });
  const model = new TerminalCanvas('\x1b[4mU\x1b[0m \x1b[7mI\x1b[0m');
  try {
    const surface = new CanvasSurface(setup.renderer, model, 'cursor-styles', 'darwin');
    setup.renderer.root.add(surface);
    surface.setTool('edit');
    model.viewport = { ...model.viewport, x: 0, y: 0 };
    for (const x of [0, 2]) {
      model.commands.pointAt({ x, y: 0 });
      await setup.renderOnce();
      const spans = setup.captureSpans().lines[CANVAS_TOP]!.spans;
      expect(
        spans.find((span) => span.text.includes('U'))!.attributes &
          createTextAttributes({ underline: true })
      ).not.toBe(0);
      expect(
        spans.find((span) => span.text.includes('I'))!.attributes &
          createTextAttributes({ inverse: true })
      ).not.toBe(0);
    }
  } finally {
    await setup.dispose();
    model.dispose();
  }
});

for (const kittyKeyboard of [false, true]) {
  test(`Warp copy fallback and rebindings work without a footer Copy button (Kitty ${kittyKeyboard})`, async () => {
    const setup = await createTestRenderer({ width: 110, height: 28, kittyKeyboard });
    const model = new TerminalCanvas('A界B');
    const copied: string[] = [];
    let detach = () => {};
    try {
      const surface = new CanvasSurface(
        setup.renderer,
        model,
        'test.chardesk',
        'darwin',
        true,
        resolveTerminalPolicy({ TERM_PROGRAM: 'WarpTerminal' })
      );
      setup.renderer.root.add(surface);
      detach = attachControls(surface, () => {}, {
        read: async () => ({ plainText: copied.at(-1) ?? '' }),
        write: async (payload) => {
          copied.push(payload.plain);
          return { status: 'written' };
        },
      });
      surface.setTool('edit');
      model.commands.selectAll();
      await setup.renderOnce();
      const selection = structuredClone(model.selection);
      expect(surface.dockControls.map((control) => control.id)).not.toContain('copy');
      expect(setup.captureCharFrame().split('\n')[surface.footerBounds.y]).not.toContain('Copy');
      setup.mockInput.pressKey('y', { ctrl: true });
      await setup.waitFor(() => copied.length === 1);
      expect(copied).toEqual(['A界B']);
      expect(model.selection).toEqual(selection);
      expect(model.canUndo).toBe(false);
      // User overrides still replace the compatibility key.
      model.editor.keymap.setUserBindings('terminal.copy', [['F11']]);
      setup.mockInput.pressKey('y', { ctrl: true });
      expect(copied).toHaveLength(1);
      setup.mockInput.pressKey(KeyCodes.F11);
      await setup.waitFor(() => copied.length === 2);
    } finally {
      detach();
      await setup.dispose();
      model.dispose();
    }
  });
}

for (const kittyKeyboard of [false, true]) {
  test(`Hand drags both axes and preserves selection, cursor and history (Kitty keyboard: ${kittyKeyboard})`, async () => {
    const setup = await createTestRenderer({ width: 90, height: 28, kittyKeyboard });
    const model = new TerminalCanvas('A界B');
    let detach = () => {};
    try {
      const surface = new CanvasSurface(setup.renderer, model, 'test.chardesk');
      setup.renderer.root.add(surface);
      detach = attachControls(surface, () => {});
      await setup.renderOnce();
      model.selection = { anchor: { x: 0, y: 0 }, focus: { x: 3, y: 0 } };
      const selection = structuredClone(model.selection);
      const cursor = { ...model.cursor };
      const before = { ...model.viewport };
      const version = model.version;
      const content = model.plane.materialize();
      surface.activateDock('hand');
      await setup.renderOnce();
      expect(setup.captureCharFrame()).toContain('[Hand]');
      await setup.mockMouse.drag(20, 10, 30, 15);
      expect(model.viewport.x).toBe(before.x - 10);
      expect(model.viewport.y).toBe(before.y - 5);
      await setup.renderOnce();
      const footer = setup
        .captureCharFrame()
        .split('\n')
        .slice(surface.height - 2, surface.height)
        .join('\n');
      expect(footer).toContain('Hand');
      expect(footer).not.toMatch(/\b(?:View|Cursor|selection)\b|\(-?\d+, -?\d+\)/);
      expect(model.cursor).toEqual(cursor);
      expect(model.selection).toEqual(selection);
      expect(model.version).toBe(version);
      expect(model.plane.materialize()).toEqual(content);
      expect(model.canUndo).toBe(false);
      await setup.renderOnce();
      await setup.mockMouse.drag(30, 15, 20, 10);
      expect(model.viewport).toEqual(before);
      surface.activateDock('edit');
      await setup.renderOnce();
      expect(surface.tool).toBe('edit');
      await setup.mockMouse.drag(20, 10, 25, 12);
      expect(model.viewport).toEqual(before);
      expect(model.selection).not.toEqual(selection);
      await setup.renderOnce();
      expect(
        setup
          .captureCharFrame()
          .split('\n')
          .slice(surface.height - 2, surface.height)
          .join('\n')
      ).not.toMatch(/\b(?:View|Cursor|selection)\b|\(-?\d+, -?\d+\)/);
      surface.activateDock('hand');
      surface.activateDock('edit');
      expect(surface.tool).toBe('edit');
      setup.mockInput.pressKey(KeyCodes.HOME);
      const insertion = { ...model.cursor };
      setup.mockInput.pressKey('h');
      setup.mockInput.pressKey(' ');
      expect(model.plane.get(insertion)?.char).toBe('h');
      expect(model.plane.get({ x: insertion.x + 1, y: insertion.y })?.char).toBe(' ');
      expect(model.inserting).toBe(true);
    } finally {
      detach();
      await setup.dispose();
      model.dispose();
    }
  });
}

test('Hand and Option+arrows pan; wheel and middle-drag do not', async () => {
  const clock = new ManualClock();
  const setup = await createTestRenderer({ width: 80, height: 24, clock });
  const model = new TerminalCanvas('界');
  let detach = () => {};
  try {
    const surface = new CanvasSurface(setup.renderer, model, 'test.chardesk');
    setup.renderer.root.add(surface);
    detach = attachControls(surface, () => {});
    await setup.renderOnce();
    const before = { ...model.viewport };
    setup.mockInput.pressKey(KeyCodes.ARROW_LEFT, { meta: true });
    expect(model.viewport.x).toBe(before.x - 10);
    setup.mockInput.pressKey(KeyCodes.ARROW_RIGHT, { meta: true });
    expect(model.viewport).toEqual(before);
    setup.mockInput.pressKey(' ');
    await setup.mockMouse.scroll(20, 10, 'left');
    await setup.mockMouse.scroll(20, 10, 'right');
    await setup.mockMouse.scroll(20, 10, 'up');
    await setup.mockMouse.scroll(20, 10, 'down', { modifiers: { shift: true } });
    await setup.mockMouse.drag(20, 10, 25, 12, MouseButtons.MIDDLE);
    expect(model.viewport).toEqual(before);
    expect(surface.tool).toBe('hand');
    surface.activateDock('hand');
    await setup.renderOnce();
    await setup.mockMouse.drag(20, 10, 3, 0);
    expect(model.viewport.x).toBe(before.x + 17);
    expect(model.viewport.y).toBe(before.y + 10);
    expect(model.selection).toBeNull();
    expect(model.dirty).toBe(false);
    setup.mockInput.pressKey(KeyCodes.ESCAPE);
    // A bare legacy Escape waits for the terminal sequence timeout.
    clock.advance(40);
    await setup.renderOnce();
    expect(surface.tool).toBe('hand');
    surface.activateDock('edit');
    const end = { ...model.viewport };
    await setup.mockMouse.drag(20, 10, 25, 12);
    expect(model.viewport).toEqual(end);
    expect(model.selection).not.toBeNull();
  } finally {
    detach();
    await setup.dispose();
    model.dispose();
  }
});

test('focus loss, resize and Escape cancel a live Hand drag', async () => {
  const clock = new ManualClock();
  const setup = await createTestRenderer({ width: 80, height: 24, clock });
  const model = new TerminalCanvas();
  let detach = () => {};
  try {
    const surface = new CanvasSurface(setup.renderer, model, 'test.chardesk');
    setup.renderer.root.add(surface);
    detach = attachControls(surface, () => {});
    await setup.renderOnce();
    surface.activateDock('hand');
    for (const cancel of [() => setup.renderer.emit('blur'), () => setup.resize(90, 28)]) {
      await setup.renderOnce();
      await setup.mockMouse.pressDown(20, 10);
      cancel();
      const before = { ...model.viewport };
      await setup.mockMouse.emitMouseEvent('drag', 25, 15);
      expect(model.viewport.x).toBe(before.x);
      expect(model.viewport.y).toBe(before.y);
      await setup.mockMouse.release(25, 15);
    }
    setup.mockInput.pressKey(KeyCodes.ESCAPE);
    clock.advance(40);
    expect(surface.tool).toBe('hand');
    expect(model.gestureState.type).toBe('idle');
  } finally {
    detach();
    await setup.dispose();
    model.dispose();
  }
});

test('native frame keeps CJK and joined Emoji aligned through clipping and resize', async () => {
  const setup = await createTestRenderer({ width: 72, height: 24 });
  const model = new TerminalCanvas('A界👩🏽‍💻\x1b[38;2;19;87;143;48;2;223;217;199;7mB\x1b[0m');
  try {
    const surface = new CanvasSurface(setup.renderer, model, 'test.chardesk');
    setup.renderer.root.add(surface);
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain('A界👩🏽‍💻B');
    expect(surface.widthFallbacks).toBe(0);
    const frame = setup.captureSpans();
    const unicodeSpan = frame.lines
      .flatMap((line) => line.spans)
      .find((span) => span.text.includes('界'))!;
    expect(unicodeSpan.fg.intent).toBe('default');
    expect(unicodeSpan.bg.intent).toBe('default');
    const styledSpan = frame.lines
      .flatMap((line) => line.spans)
      .find((span) => span.text.includes('B'))!;
    expect(styledSpan.fg.toInts()).toEqual([19, 87, 143, 255]);
    expect(styledSpan.bg.toInts()).toEqual([223, 217, 199, 255]);
    expect(styledSpan.attributes & createTextAttributes({ inverse: true })).not.toBe(0);

    expect(frame.lines[CANVAS_TOP + 3]!.spans.every((span) => span.bg.intent === 'default')).toBe(
      true
    );
    model.viewport.x = 0;
    model.viewport.y = 0;
    surface.requestRender();
    await setup.renderOnce();
    expect(setup.captureCharFrame().split('\n')[CANVAS_TOP]?.startsWith('A界👩🏽‍💻B')).toBe(true);
    expect(model.viewport.width).toBe(72);
    model.beginInsert();
    surface.requestRender();
    await setup.renderOnce();
    const cursor = setup.renderer.getCursorState();
    expect(cursor.x).toBe(-model.viewport.x + 1);
    expect(cursor.y).toBe(CANVAS_TOP - model.viewport.y + 1);
    model.escape();
    model.viewport.x = 2;
    model.viewport.y = 0;
    surface.requestRender();
    await setup.renderOnce();
    const line = setup.captureCharFrame().split('\n')[CANVAS_TOP]!;
    expect(line).not.toContain('界');
    expect(line).toContain('👩🏽‍💻B');
    setup.resize(36, 12);
    await setup.renderOnce();
    expect(model.viewport.width).toBe(36);
    expect(model.viewport.height).toBe(setup.renderer.height - CANVAS_TOP - 2);
    expect(setup.captureCharFrame()).toContain('Edit');
  } finally {
    await setup.dispose();
    model.dispose();
  }
});

test('real key and mouse events edit, select, move, undo and request automatic-save exit', async () => {
  const setup = await createTestRenderer({ width: 90, height: 28, kittyKeyboard: true });
  const model = new TerminalCanvas();
  let quitCount = 0;
  let detach = () => {};
  try {
    const surface = new CanvasSurface(setup.renderer, model, 'test.chardesk', 'darwin');
    setup.renderer.root.add(surface);
    detach = attachControls(surface, () => {
      quitCount += 1;
    });
    await setup.renderOnce();
    surface.activateDock('edit');
    setup.renderer.keyInput.processPaste(new TextEncoder().encode('界👩🏽‍💻'));
    await Bun.sleep(0);
    expect(model.selectionBounds?.width).toBe(4);
    expect(model.cursor.x).toBe(0);
    setup.mockInput.pressKey(KeyCodes.ESCAPE);
    setup.mockInput.pressKey(KeyCodes.ARROW_RIGHT);
    setup.mockInput.pressKey(KeyCodes.ARROW_RIGHT);
    expect(model.cursor.x).toBe(4);
    setup.mockInput.pressKey(KeyCodes.ARROW_LEFT, { shift: true });
    expect(model.selectionBounds?.width).toBe(3);
    setup.mockInput.pressKey(KeyCodes.ARROW_DOWN, { ctrl: true });
    expect(model.plane.get({ x: 2, y: 1 })?.char).toBe('👩🏽‍💻');
    setup.mockInput.pressKey('z', { super: true });
    expect(model.plane.get({ x: 2, y: 0 })?.char).toBe('👩🏽‍💻');
    await setup.renderOnce();
    const screenX = -model.viewport.x;
    const screenY = CANVAS_TOP - model.viewport.y;
    await setup.mockMouse.drag(screenX, screenY, screenX + 3, screenY);
    expect(model.selectionBounds?.width).toBe(4);
    await setup.renderOnce();
    setup.mockInput.pressKey('q', { ctrl: true });
    expect(quitCount).toBe(1);
    expect(surface.status).not.toContain('Unsaved');
    expect(model.dirty).toBe(true);
  } finally {
    detach();
    await setup.dispose();
    model.dispose();
  }
});

test('English help is rendered and dismisses with Escape', async () => {
  const setup = await createTestRenderer({ width: 80, height: 30, kittyKeyboard: true });
  const model = new TerminalCanvas();
  let detach = () => {};
  try {
    const surface = new CanvasSurface(setup.renderer, model, 'test.chardesk');
    setup.renderer.root.add(surface);
    detach = attachControls(surface, () => {});
    setup.mockInput.pressKey(KeyCodes.F1);
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain('select a rectangle');
    setup.mockInput.pressKey(KeyCodes.ESCAPE);
    expect(surface.help).toBe(false);
  } finally {
    detach();
    await setup.dispose();
    model.dispose();
  }
});

test('tiny terminals preserve content and recover after resize', async () => {
  const setup = await createTestRenderer({ width: 8, height: 3 });
  const model = new TerminalCanvas('界');
  try {
    setup.renderer.root.add(new CanvasSurface(setup.renderer, model, 'test.chardesk'));
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain('Resize');
    setup.resize(50, 15);
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain('界');
    expect(model.dirty).toBe(false);
  } finally {
    await setup.dispose();
    model.dispose();
  }
});

test('terminal keymap copies instead of quitting, cuts safely, pastes and redoes with Shift+Z', async () => {
  const setup = await createTestRenderer({ width: 90, height: 28, kittyKeyboard: true });
  const model = new TerminalCanvas('A界B');
  let copied = '';
  let quits = 0;
  let detach = () => {};
  try {
    const surface = new CanvasSurface(setup.renderer, model, 'test.chardesk', 'darwin');
    setup.renderer.root.add(surface);
    detach = attachControls(
      surface,
      () => {
        quits++;
      },
      {
        write: async (payload) => {
          copied = payload.plain;
          return { status: 'written' };
        },
        read: async () => ({ plainText: copied }),
      }
    );
    await setup.renderOnce();
    setup.mockInput.pressKey('a', { super: true });
    setup.mockInput.pressKey('c', { super: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(copied).toBe('A界B');
    expect(quits).toBe(0);
    setup.mockInput.pressKey('x', { super: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(model.plane.materialize().size).toBe(0);
    setup.mockInput.pressKey('z', { super: true });
    expect(model.plane.get({ x: 1, y: 0 })?.char).toBe('界');
    setup.mockInput.pressKey('z', { super: true, shift: true });
    expect(model.plane.materialize().size).toBe(0);
    setup.mockInput.pressKey('v', { super: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(model.plane.get({ x: 1, y: 0 })?.char).toBe('界');
    expect(model.selectionBounds?.width).toBe(4);
  } finally {
    detach();
    await setup.dispose();
    model.dispose();
  }
});

test('native Shift+click and range drag use shared preview, cancel and one-step undo', async () => {
  const setup = await createTestRenderer({ width: 90, height: 28, kittyKeyboard: true });
  const model = new TerminalCanvas('A界B');
  let detach = () => {};
  try {
    const surface = new CanvasSurface(setup.renderer, model, 'test.chardesk', 'darwin');
    setup.renderer.root.add(surface);
    detach = attachControls(surface, () => {});
    await setup.renderOnce();
    surface.activateDock('edit');
    await setup.renderOnce();
    const x = -model.viewport.x,
      y = CANVAS_TOP - model.viewport.y;
    await setup.mockMouse.click(x, y);
    await setup.mockMouse.click(x + 2, y, 0, { modifiers: { shift: true } });
    expect(model.selectionBounds?.width).toBe(3);
    const before = model.plane.materialize();
    await setup.mockMouse.pressDown(x + 1, y);
    await setup.mockMouse.emitMouseEvent('drag', x + 3, y + 2);
    expect(model.gestureState.type).toBe('movingRange');
    expect(model.frame().source.get({ x: 3, y: 2 })?.char).toBe('界');
    expect(model.plane.materialize()).toEqual(before);
    expect(model.canUndo).toBe(false);
    setup.renderer.emit('blur');
    await setup.mockMouse.release(x + 3, y + 2);
    expect(model.rangePreview).toBeNull();
    expect(model.selectionBounds?.width).toBe(3);
    await setup.mockMouse.drag(x + 1, y, x + 3, y + 2);
    expect(model.plane.get({ x: 3, y: 2 })?.char).toBe('界');
    setup.mockInput.pressKey('z', { super: true });
    expect(model.plane.materialize()).toEqual(before);
    expect(model.canUndo).toBe(false);
  } finally {
    detach();
    await setup.dispose();
    model.dispose();
  }
});

for (const kittyKeyboard of [false, true]) {
  test(`Option arrows pan ten cells on both axes without changing editing state (Kitty: ${kittyKeyboard})`, async () => {
    const setup = await createTestRenderer({ width: 80, height: 24, kittyKeyboard });
    const model = new TerminalCanvas('A界B');
    let detach = () => {};
    try {
      const surface = new CanvasSurface(setup.renderer, model, 'pan-test', 'darwin');
      setup.renderer.root.add(surface);
      detach = attachControls(surface, () => {});
      await setup.renderOnce();
      model.selection = { anchor: { x: 0, y: 0 }, focus: { x: 3, y: 0 } };
      const selection = structuredClone(model.selection),
        cursor = { ...model.cursor };
      const original = model.plane.materialize(),
        version = model.version;
      for (const tool of ['hand', 'edit'] as const) {
        surface.setTool(tool);
        for (const [direction, dx, dy] of [
          ['up', 0, -10],
          ['down', 0, 10],
          ['left', -10, 0],
          ['right', 10, 0],
        ] as const) {
          const before = { ...model.viewport };
          setup.mockInput.pressArrow(direction, { meta: true });
          expect(model.viewport).toEqual({ ...before, x: before.x + dx, y: before.y + dy });
        }
        // Literal xterm modifier sequences exercise input parsing, not a synthetic KeyEvent.
        const before = { ...model.viewport };
        setup.mockInput.pressKey('\x1b[1;3A');
        expect(model.viewport).toEqual({ ...before, y: before.y - 10 });
        setup.mockInput.pressKey('\x1b[1;3B');
        expect(model.viewport).toEqual(before);
        expect(model.selection).toEqual(selection);
        expect(model.cursor).toEqual(cursor);
        expect(model.version).toBe(version);
        expect(model.plane.materialize()).toEqual(original);
        expect(model.canUndo).toBe(false);
      }
    } finally {
      detach();
      await setup.dispose();
      model.dispose();
    }
  });
}
