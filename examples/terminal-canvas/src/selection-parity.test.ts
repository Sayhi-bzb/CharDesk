import { expect, test } from 'bun:test';
import { RGBA, createTextAttributes } from '@opentui/core';
import { createTestRenderer, ManualClock } from '@opentui/core/testing';
import { attachControls } from './controller.ts';
import { TerminalCanvas } from './model.ts';
import { CANVAS_TOP, CanvasSurface } from './surface.ts';

async function fixture(source: string) {
  const setup = await createTestRenderer({
    width: 50,
    height: 16,
    kittyKeyboard: true,
    screenMode: 'alternate-screen',
    clock: new ManualClock(),
  });
  const model = new TerminalCanvas(source);
  const surface = new CanvasSurface(setup.renderer, model, 'selection-test', 'darwin');
  setup.renderer.root.add(surface);
  const detach = attachControls(surface, () => {});
  surface.setTool('edit');
  model.viewport = { ...model.viewport, x: 0, y: 0 };
  await setup.renderOnce();
  return {
    setup,
    model,
    async click(x: number, y = 0, shift = false) {
      await setup.mockMouse.click(x - model.viewport.x, CANVAS_TOP + y - model.viewport.y, 0, {
        modifiers: { shift },
      });
      await setup.renderOnce();
    },
    highlighted(x: number, y: number) {
      return setup.renderer.currentRenderBuffer.withBuffers((cells) => {
        const index = (CANVAS_TOP + y - model.viewport.y) * cells.width + x - model.viewport.x;
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

test('selection uses one terminal palette background across styled text, emoji followers and empty cells', async () => {
  const f = await fixture(
    '\x1b[1;38;2;19;87;143;48;2;223;217;199mA\x1b[0m🦀 \x1b[38;2;120;50;200;48;2;20;30;40;7mB\x1b[0m'
  );
  try {
    const original = f.model.plane.materialize();
    await f.click(0);
    await f.click(4, 1, true);
    for (const y of [0, 1]) for (const x of [0, 1, 2, 3, 4]) expect(f.highlighted(x, y)).toBe(true);
    const spans = f.setup.captureSpans().lines[CANVAS_TOP]!.spans;
    for (const span of spans)
      expect(span.attributes & createTextAttributes({ inverse: true })).toBe(0);
    const styled = spans.find((span) => span.text.includes('A'))!;
    expect(styled.fg.toInts()).toEqual([19, 87, 143, 255]);
    expect(styled.attributes & createTextAttributes({ bold: true })).not.toBe(0);
    expect(spans.find((span) => span.text.includes('B'))!.fg.toInts()).toEqual([120, 50, 200, 255]);
    expect(f.highlighted(5, 1)).toBe(false);
    await f.click(6);
    const restored = f.setup.captureSpans().lines[CANVAS_TOP]!.spans;
    expect(restored.find((span) => span.text.includes('A'))!.bg.toInts()).toEqual([
      223, 217, 199, 255,
    ]);
    expect(
      restored.find((span) => span.text.includes('B'))!.attributes &
        createTextAttributes({ inverse: true })
    ).not.toBe(0);
    expect(f.model.plane.materialize()).toEqual(original);
    expect(f.model.canUndo).toBe(false);
  } finally {
    await f.dispose();
  }
});

for (const glyph of ['界', '👩🏽‍💻', '🦀']) {
  test(`${glyph}: a resting range touching the leading cell covers the follower without selecting its neighbor`, async () => {
    const f = await fixture(`A${glyph}B`);
    try {
      await f.click(0);
      await f.click(1, 0, true);
      expect(f.model.selectionPresentation.coverage.contains({ x: 2, y: 0 })).toBe(true);
      expect(f.highlighted(1, 0)).toBe(true);
      expect(f.highlighted(2, 0)).toBe(true);
      expect(f.highlighted(3, 0)).toBe(false);
      // Returning to an ordinary point repaints the old follower, not just its anchor.
      await f.click(3);
      expect(f.highlighted(1, 0)).toBe(false);
      expect(f.highlighted(2, 0)).toBe(false);
    } finally {
      await f.dispose();
    }
  });

  test(`${glyph}: native move preview highlights both physical cells before and after commit`, async () => {
    const f = await fixture(`ABC\n${glyph}BC\nABC`);
    try {
      await f.click(1);
      await f.click(2, 2, true);
      await f.setup.mockMouse.pressDown(1, CANVAS_TOP);
      await f.setup.mockMouse.emitMouseEvent('drag', 6, CANVAS_TOP);
      await f.setup.renderOnce();
      expect(f.model.gestureState.type).toBe('movingRange');
      for (const x of [5, 6, 7]) expect(f.highlighted(x, 1)).toBe(true);
      expect(f.highlighted(5, 0)).toBe(false);
      expect(f.model.canUndo).toBe(false);
      await f.setup.mockMouse.release(6, CANVAS_TOP);
      await f.setup.renderOnce();
      for (const x of [5, 6, 7]) expect(f.highlighted(x, 1)).toBe(true);
      // Clip the glyph anchor offscreen; its selected follower must keep its selection background.
      f.model.viewport.x = 6;
      await f.setup.renderOnce();
      expect(f.highlighted(6, 1)).toBe(true);
    } finally {
      await f.dispose();
    }
  });

  test(`${glyph}: modifier append preview highlights a wide follower immediately`, async () => {
    const f = await fixture(`AB\n${glyph}C`);
    try {
      await f.click(1);
      await f.setup.mockMouse.pressDown(1, CANVAS_TOP + 1, 0, { modifiers: { ctrl: true } });
      await f.setup.renderOnce();
      for (const x of [0, 1]) expect(f.highlighted(x, 1)).toBe(true);
      await f.setup.mockMouse.release(1, CANVAS_TOP + 1);
      await f.setup.renderOnce();
      for (const x of [0, 1]) expect(f.highlighted(x, 1)).toBe(true);
      expect(f.highlighted(2, 1)).toBe(false);
    } finally {
      await f.dispose();
    }
  });
}

test('native click selects an envelope hole; click in a range collapses it before typing', async () => {
  const f = await fixture('A界\nABCDE');
  try {
    await f.click(0);
    await f.click(1, 1, true);
    expect(f.highlighted(2, 1)).toBe(false);
    await f.click(2, 1);
    expect(f.model.selection).toBeNull();
    expect(f.model.cursor).toEqual({ x: 2, y: 1 });
    await f.click(0, 1);
    await f.click(4, 1, true);
    await f.click(2, 1);
    await f.setup.mockInput.typeText('Z', 0);
    expect([0, 1, 2, 3, 4].map((x) => f.model.plane.get({ x, y: 1 })?.char).join('')).toBe('ABZDE');
  } finally {
    await f.dispose();
  }
});

test('reverse selection moves across negative coordinates and blur cancels the rendered preview', async () => {
  const f = await fixture('ABC\n界BC\nABC');
  try {
    f.model.viewport = { ...f.model.viewport, x: -10, y: -4 };
    await f.setup.renderOnce();
    await f.click(2, 2);
    await f.click(1, 0, true);
    const original = f.model.plane.materialize();
    await f.setup.mockMouse.pressDown(12, CANVAS_TOP + 6);
    await f.setup.mockMouse.emitMouseEvent('drag', 7, CANVAS_TOP + 3);
    await f.setup.renderOnce();
    expect(f.model.gestureState.type).toBe('movingRange');
    expect(f.highlighted(-5, -2)).toBe(true);
    expect(f.highlighted(-4, -2)).toBe(true);
    f.setup.renderer.emit('blur');
    await f.setup.renderOnce();
    expect(f.model.gestureState.type).toBe('idle');
    expect(f.model.plane.materialize()).toEqual(original);
    expect(f.highlighted(-5, -2)).toBe(false);
    expect(f.highlighted(0, 1)).toBe(true);
    expect(f.highlighted(1, 1)).toBe(true);
    expect(f.model.canUndo).toBe(false);
  } finally {
    await f.dispose();
  }
});
