import { expect, test } from 'bun:test';
import { createTestRenderer, MouseButtons } from '@opentui/core/testing';
import { RGBA } from '@opentui/core';
import { attachControls } from './controller.ts';
import { TerminalCanvas } from './model.ts';
import { CANVAS_TOP, CanvasSurface } from './surface.ts';

type Modifiers = { shift?: boolean; alt?: boolean; ctrl?: boolean };
const variants: Array<[string, Modifiers]> = [
  ['Shift', { shift: true }],
  ['Option', { alt: true }],
];
async function fixture(kittyKeyboard = true) {
  const setup = await createTestRenderer({
    width: 90,
    height: 24,
    kittyKeyboard,
    screenMode: 'alternate-screen',
  });
  const model = new TerminalCanvas('A界BC\nABCDE');
  const surface = new CanvasSurface(setup.renderer, model, 'range-input', 'darwin');
  setup.renderer.root.add(surface);
  const detach = attachControls(surface, () => {});
  surface.setTool('edit');
  model.viewport = { ...model.viewport, x: 0, y: 0 };
  await setup.renderOnce();
  return {
    setup,
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
    const f = await fixture(true);
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
    const f = await fixture(true);
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
