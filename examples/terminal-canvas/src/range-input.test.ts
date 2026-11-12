import { expect, test } from 'bun:test';
import { createTestRenderer, MouseButtons, ManualClock } from '@opentui/core/testing';
import { RGBA } from '@opentui/core';
import { attachControls } from './controller.ts';
import { TerminalCanvas } from './model.ts';
import { CANVAS_TOP, CanvasSurface } from './surface.ts';
import { resolveTerminalPolicy } from './terminalPolicy.ts';

type Modifiers = { shift?: boolean; alt?: boolean; ctrl?: boolean };
const variants: Array<[string, Modifiers]> = [
  ['Shift', { shift: true }],
  ['Option', { alt: true }],
];
async function fixture(kittyKeyboard = true, environment: NodeJS.ProcessEnv = {}) {
  const clock = new ManualClock();
  const setup = await createTestRenderer({
    clock,
    width: 90,
    height: 24,
    kittyKeyboard,
    screenMode: 'alternate-screen',
  });
  const model = new TerminalCanvas('A界BC\nABCDE');
  const surface = new CanvasSurface(setup.renderer, model, 'range-input', 'darwin');
  surface.setInputPolicy(resolveTerminalPolicy(environment));
  setup.renderer.root.add(surface);
  const detach = attachControls(surface, () => {});
  surface.setTool('edit');
  model.viewport = { ...model.viewport, x: 0, y: 0 };
  await setup.renderOnce();
  return {
    setup,
    clock,
    model,
    surface,
    async click(x: number, y = 0, modifiers: Modifiers = {}, button: 0 | 2 = MouseButtons.LEFT) {
      await setup.mockMouse.click(x, CANVAS_TOP + y, button, { modifiers });
      await setup.renderOnce();
    },
    highlighted(x: number, y: number) {
      return setup.renderer.currentRenderBuffer.withBuffers((cells) => {
        const index = (CANVAS_TOP + y) * cells.width + x;
        const background = RGBA.fromArray(cells.bg.slice(index * 4, index * 4 + 4));
        return background.intent === 'indexed' && background.slot === 8;
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
  for (const [name, modifiers] of variants) {
    test(`${name}+left-click extends and shrinks one range (Kitty ${kitty})`, async () => {
      const f = await fixture(kitty);
      try {
        await f.click(0);
        const original = f.model.plane.materialize(),
          viewport = { ...f.model.viewport };
        await f.click(2, 1, modifiers);
        expect(f.model.selection).toEqual({ anchor: { x: 0, y: 0 }, focus: { x: 2, y: 1 } });
        expect(f.highlighted(1, 0)).toBe(true);
        expect(f.highlighted(2, 0)).toBe(true);
        expect(f.highlighted(3, 0)).toBe(false);
        await f.click(1, 1, modifiers);
        expect(f.model.selection).toEqual({ anchor: { x: 0, y: 0 }, focus: { x: 1, y: 1 } });
        expect(f.highlighted(2, 1)).toBe(false);
        const state = f.model.getSnapshot().interaction;
        expect(state.mode).toBe('navigate');
        if (state.mode === 'navigate') expect(state.selection.additionalRanges).toEqual([]);
        expect(f.model.gestureState.type).toBe('idle');
        expect(f.model.canUndo).toBe(false);
        expect(f.model.plane.materialize()).toEqual(original);
        expect(f.model.viewport).toEqual(viewport);
        await f.click(4, 1);
        expect(f.model.selection).toBeNull();
        expect(f.model.cursor).toEqual({ x: 4, y: 1 });
      } finally {
        await f.dispose();
      }
    });
  }
}

test('modified range clicks preserve Hand', async () => {
  const f = await fixture();
  try {
    await f.click(0);
    await f.click(2, 1, { shift: true });
    const selection = structuredClone(f.model.selection),
      cursor = { ...f.model.cursor };
    f.surface.setTool('hand');
    await f.setup.renderOnce();
    const viewport = { ...f.model.viewport };
    for (const [, modifiers] of variants) await f.click(4, 1, modifiers);
    expect(f.model.selection).toEqual(selection);
    expect(f.model.cursor).toEqual(cursor);
    expect(f.model.viewport).toEqual(viewport);
  } finally {
    await f.dispose();
  }
});

for (const [name, code] of [
  ['Option left', 57443],
  ['Option right', 57449],
] as const) {
  test(`${name} from standalone Kitty events extends a bare SGR click and releases cleanly`, async () => {
    const f = await fixture(true, { TERM_PROGRAM: 'WarpTerminal' });
    try {
      await f.click(0);
      const original = f.model.plane.materialize();
      f.setup.mockInput.pressKey(`\x1b[${code};3:1u`);
      // The mouse event deliberately contains no modifiers, as in Warp's encoder.
      await f.click(2, 1);
      expect(f.model.selection).toEqual({ anchor: { x: 0, y: 0 }, focus: { x: 2, y: 1 } });
      expect(f.highlighted(1, 0)).toBe(true);
      expect(f.highlighted(2, 0)).toBe(true);
      f.setup.mockInput.pressKey(`\x1b[${code};3:3u`);
      expect(f.surface.inputModifiers.held).toEqual({ shift: false, alt: false, ctrl: false });
      await f.click(1, 1);
      expect(f.model.selection).toBeNull();
      expect(f.model.plane.materialize()).toEqual(original);
      expect(f.model.canUndo).toBe(false);
    } finally {
      await f.dispose();
    }
  });
}

test('blur and resize clear held modifiers so subsequent ordinary clicks do not extend', async () => {
  const f = await fixture(true);
  try {
    await f.click(0);
    f.setup.mockInput.pressKey('\x1b[57443;3:1u');
    expect(f.surface.inputModifiers.held.alt).toBe(true);
    f.setup.renderer.emit('blur');
    await f.click(3, 1);
    expect(f.model.selection).toBeNull();
    f.setup.mockInput.pressKey('\x1b[57442;5:1u');
    expect(f.surface.inputModifiers.held.ctrl).toBe(true);
    f.setup.resize(95, 25);
    await f.setup.renderOnce();
    await f.click(1, 1);
    expect(f.model.selection).toBeNull();
    expect(f.surface.inputModifiers.held.ctrl).toBe(false);
  } finally {
    await f.dispose();
  }
});

test('full keyboard reporting preserves associated ASCII, shifted text, CJK and joined Emoji', async () => {
  const f = await fixture(true);
  try {
    await f.click(0);
    for (const sequence of [
      '\x1b[97;1;97u',
      '\x1b[97:65;2;65u',
      '\x1b[30028;1;30028u',
      '\x1b[128105;1;128105:127997:8205:128187u',
    ])
      f.setup.mockInput.pressKey(sequence);
    expect(f.model.plane.get({ x: 0, y: 0 })?.char).toBe('a');
    expect(f.model.plane.get({ x: 1, y: 0 })?.char).toBe('A');
    expect(f.model.plane.get({ x: 2, y: 0 })?.char).toBe('界');
    expect(f.model.plane.get({ x: 4, y: 0 })?.char).toBe('👩🏽‍💻');
  } finally {
    await f.dispose();
  }
});

for (const source of ['mouse', 'keyboard'] as const) {
  test(`Ctrl from ${source} appends a disjoint range instead of extending the primary rectangle`, async () => {
    const f = await fixture(true, { TERM_PROGRAM: 'WarpTerminal' });
    try {
      await f.click(0);
      const original = f.model.plane.materialize();
      if (source === 'keyboard') f.setup.mockInput.pressKey('\x1b[57442;5:1u');
      await f.click(2, 1, source === 'mouse' ? { ctrl: true } : {});
      expect(f.model.selectionCoverage.contains({ x: 0, y: 0 })).toBe(true);
      expect(f.model.selectionCoverage.contains({ x: 2, y: 1 })).toBe(true);
      expect(f.model.selectionCoverage.contains({ x: 1, y: 0 })).toBe(false);
      const state = f.model.getSnapshot().interaction;
      expect(state.mode).toBe('navigate');
      if (state.mode === 'navigate') expect(state.selection.additionalRanges).toHaveLength(1);
      if (source === 'keyboard') f.setup.mockInput.pressKey('\x1b[57442;5:3u');
      await f.click(1, 1);
      expect(f.model.selection).toBeNull();
      expect(f.model.plane.materialize()).toEqual(original);
      expect(f.model.canUndo).toBe(false);
    } finally {
      await f.dispose();
    }
  });
}

for (const [modifier, code, flags] of [
  ['alt', 57443, 3],
  ['shift', 57441, 2],
  ['ctrl', 57442, 5],
] as const) {
  test(`an unmodified Kitty snapshot repairs a missing ${modifier} release before ordinary clicks`, async () => {
    const f = await fixture(true, { TERM_PROGRAM: 'WarpTerminal' });
    try {
      await f.click(0);
      const content = f.model.plane.materialize();
      f.setup.mockInput.pressKey(`\x1b[${code};${flags}:1u`);
      expect(f.surface.inputModifiers.held[modifier]).toBe(true);
      f.setup.mockInput.pressKey('\x1b[27;1u');
      expect(f.surface.inputModifiers.held).toEqual({ shift: false, alt: false, ctrl: false });
      for (const at of [
        { x: 4, y: 1 },
        { x: 7, y: 3 },
      ]) {
        await f.click(at.x, at.y);
        expect(f.model.selection).toBeNull();
        expect(f.model.cursor).toEqual(at);
        expect(f.model.gestureState.type).toBe('idle');
      }
      expect(f.model.plane.materialize()).toEqual(content);
      expect(f.model.canUndo).toBe(false);
    } finally {
      await f.dispose();
    }
  });
}

test('a positive Kitty snapshot establishes Option-click without a standalone press; holding Option permits repeated range extension', async () => {
  const f = await fixture(true, { TERM_PROGRAM: 'WarpTerminal' });
  try {
    await f.click(0);
    f.setup.mockInput.pressKey('\x1b[27;3u');
    expect(f.surface.inputModifiers.held.alt).toBe(true);
    await f.click(4, 1);
    expect(f.model.selection).toEqual({ anchor: { x: 0, y: 0 }, focus: { x: 4, y: 1 } });
    f.clock.advance(10_000);
    await f.click(7, 3);
    expect(f.model.selection).toEqual({ anchor: { x: 0, y: 0 }, focus: { x: 7, y: 3 } });
    f.setup.mockInput.pressKey('\x1b[57443;3:3u');
    await f.click(8, 4);
    expect(f.model.selection).toBeNull();
    expect(f.model.cursor).toEqual({ x: 8, y: 4 });
  } finally {
    await f.dispose();
  }
});

for (const environment of [
  { TERM_PROGRAM: 'ghostty' },
  { TERM_PROGRAM: 'kitty' },
  {},
  { TERM_PROGRAM: 'WarpTerminal', TMUX: '/test/tmux' },
]) {
  test(`mouse reports are authoritative for ${JSON.stringify(environment)} despite stale keyboard modifiers`, async () => {
    const f = await fixture(true, environment);
    try {
      await f.click(0);
      f.setup.mockInput.pressKey('\x1b[57443;3:1u');
      f.setup.mockInput.pressKey('\x1b[57442;7:1u');
      await f.click(4, 1);
      expect(f.model.selection).toBeNull();
      expect(f.model.cursor).toEqual({ x: 4, y: 1 });
      expect(f.surface.inputModifiers.held).toEqual({ shift: false, alt: false, ctrl: false });
      await f.click(7, 3, { shift: true });
      expect(f.model.selection?.anchor).toEqual({ x: 4, y: 1 });
      expect(f.model.selection?.focus).toEqual({ x: 7, y: 3 });
    } finally {
      await f.dispose();
    }
  });
}

test('Warp does not infer a reserved Shift-click from its keyboard fallback, but honors an explicitly forwarded Shift mouse packet', async () => {
  const f = await fixture(true, { TERM_PROGRAM: 'WarpTerminal' });
  try {
    await f.click(0);
    f.setup.mockInput.pressKey('\x1b[57441;2:1u');
    await f.click(4, 1);
    expect(f.model.selection).toBeNull();
    await f.click(7, 3, { shift: true });
    expect(f.model.selection).toEqual({ anchor: { x: 4, y: 1 }, focus: { x: 7, y: 3 } });
  } finally {
    await f.dispose();
  }
});

test('stale Ctrl cannot append an unintended old cell that Delete later erases', async () => {
  const f = await fixture(true, { TERM_PROGRAM: 'WarpTerminal' });
  try {
    await f.click(0);
    const before = f.model.plane.materialize();
    f.setup.mockInput.pressKey('\x1b[57442;5:1u');
    f.setup.mockInput.pressKey('\x1b[27;1u');
    await f.click(4, 1);
    expect(f.model.selection).toBeNull();
    f.setup.mockInput.pressKey('\x1b[3~');
    expect(f.model.plane.get({ x: 0, y: 0 })?.char).toBe('A');
    expect(f.model.plane.get({ x: 4, y: 1 })).toBeUndefined();
    f.model.commands.undo();
    expect(f.model.plane.materialize()).toEqual(before);
  } finally {
    await f.dispose();
  }
});

for (const phase of ['focus', 'escape'] as const) {
  test(`${phase} resets stale modifier/gesture ownership even without a prior blur`, async () => {
    const f = await fixture(true, { TERM_PROGRAM: 'WarpTerminal' });
    try {
      await f.click(0);
      f.setup.mockInput.pressKey('\x1b[57443;3:1u');
      await f.setup.mockMouse.pressDown(5, CANVAS_TOP + 4);
      await f.setup.mockMouse.emitMouseEvent('drag', 7, CANVAS_TOP + 5);
      if (phase === 'focus') f.setup.renderer.emit('focus');
      else {
        f.setup.mockInput.pressEscape();
        f.clock.advance(40);
      }
      expect(f.model.gestureState.type).toBe('idle');
      expect(f.surface.inputModifiers.held).toEqual({ shift: false, alt: false, ctrl: false });
      await f.click(8, 4);
      expect(f.model.selection).toBeNull();
      expect(f.model.cursor).toEqual({ x: 8, y: 4 });
    } finally {
      await f.dispose();
    }
  });
}

test('terminal identity changes fence keyboard fallback state from the previous input path', async () => {
  const f = await fixture(true, { TERM_PROGRAM: 'WarpTerminal' });
  try {
    await f.click(0);
    f.setup.mockInput.pressKey('\x1b[57443;3:1u');
    f.surface.setInputPolicy(resolveTerminalPolicy({ TERM_PROGRAM: 'ghostty' }));
    f.surface.setInputPolicy(resolveTerminalPolicy({ TERM_PROGRAM: 'WarpTerminal' }));
    await f.click(4, 1);
    expect(f.model.selection).toBeNull();
    expect(f.surface.inputModifiers.held.alt).toBe(false);
  } finally {
    await f.dispose();
  }
});

test('focus restoration clears a pending command sequence as well as modifier state', async () => {
  const f = await fixture(true, { TERM_PROGRAM: 'WarpTerminal' });
  try {
    f.model.editor.keymap.setUserBindings('terminal.hand', [['F12', 'F12']]);
    f.setup.mockInput.pressKey('F12');
    f.setup.renderer.emit('focus');
    f.setup.mockInput.pressKey('F12');
    expect(f.surface.tool).toBe('edit');
    f.setup.mockInput.pressKey('F12');
    expect(f.surface.tool).toBe('hand');
  } finally {
    await f.dispose();
  }
});
