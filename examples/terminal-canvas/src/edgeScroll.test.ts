import { expect, test } from 'bun:test';
import { createTestRenderer, KeyCodes, ManualClock } from '@opentui/core/testing';
import { attachControls } from './controller.ts';
import { TerminalCanvas } from './model.ts';
import { CanvasSurface } from './surface.ts';

async function fixture(source = 'A🦀界B', useMouse = true) {
  const clock = new ManualClock();
  const setup = await createTestRenderer({
    width: 40,
    height: 14,
    kittyKeyboard: true,
    clock,
    useMouse,
  });
  const model = new TerminalCanvas(source);
  const surface = new CanvasSurface(setup.renderer, model, 'edge-scroll', 'darwin');
  setup.renderer.root.add(surface);
  const detach = attachControls(surface, () => {});
  surface.setTool('edit');
  model.viewport = { ...model.viewport, x: 0, y: 0 };
  await setup.renderOnce();
  return {
    clock,
    setup,
    model,
    surface,
    detach,
    async start(x = 39, y = 11) {
      await setup.mockMouse.pressDown(5, 5);
      await setup.mockMouse.emitMouseEvent('drag', x, y);
    },
    async dispose() {
      detach();
      await setup.dispose();
      model.dispose();
    },
  };
}

for (const corner of [
  { x: 39, y: 11, sign: 1 },
  { x: 0, y: 0, sign: -1 },
]) {
  test(`stationary corner selection scrolls continuously in both axes (${corner.sign})`, async () => {
    const f = await fixture();
    try {
      const before = f.model.plane.materialize();
      await f.start(corner.x, corner.y);
      f.clock.advance(250);
      expect(f.model.viewport.x).toBe(0);
      expect(f.model.viewport.y).toBe(0);
      f.clock.advance(1750);
      const first = { ...f.model.viewport };
      expect(first.x * corner.sign).toBeGreaterThan(0);
      expect(first.y * corner.sign).toBeGreaterThan(0);
      f.clock.advance(1000);
      expect(f.model.viewport.x * corner.sign).toBeGreaterThan(first.x * corner.sign);
      expect(f.model.selection?.focus).toEqual({
        x: f.model.viewport.x + corner.x,
        y: f.model.viewport.y + corner.y,
      });
      expect(Number.isInteger(f.model.viewport.x)).toBe(true);
      expect(Number.isInteger(f.model.viewport.y)).toBe(true);
      expect(f.model.plane.materialize()).toEqual(before);
      expect(f.model.canUndo).toBe(false);
      await f.setup.mockMouse.release(corner.x, corner.y);
      const end = { ...f.model.viewport };
      f.clock.advance(4000);
      expect(f.model.viewport).toEqual(end);
      expect(f.model.gestureState.type).toBe('idle');
    } finally {
      await f.dispose();
    }
  });
}

test('center pauses scrolling and a fresh edge entry waits again', async () => {
  const f = await fixture();
  try {
    await f.start(39, 6);
    f.clock.advance(1600);
    expect(f.model.viewport.x).toBeGreaterThan(0);
    expect(f.model.viewport.y).toBe(0);
    await f.setup.mockMouse.emitMouseEvent('drag', 20, 6);
    const paused = { ...f.model.viewport };
    f.clock.advance(3000);
    expect(f.model.viewport).toEqual(paused);
    await f.setup.mockMouse.emitMouseEvent('drag', 0, 6);
    f.clock.advance(250);
    expect(f.model.viewport).toEqual(paused);
    f.clock.advance(2000);
    expect(f.model.viewport.x).toBeLessThan(paused.x);
    expect(f.model.viewport.y).toBe(paused.y);
  } finally {
    await f.dispose();
  }
});

test('wide range movement previews through scrolling and commits as one undo', async () => {
  const f = await fixture('🦀X');
  try {
    f.model.selection = { anchor: { x: 0, y: 0 }, focus: { x: 1, y: 0 } };
    const original = f.model.plane.materialize();
    await f.setup.mockMouse.pressDown(0, 0);
    await f.setup.mockMouse.emitMouseEvent('drag', 39, 5);
    f.clock.advance(2000);
    expect(f.model.gestureState.type).toBe('movingRange');
    const target = { x: f.model.viewport.x + 39, y: f.model.viewport.y + 5 };
    expect(f.model.selectionPresentation.coverage.contains(target)).toBe(true);
    expect(f.model.selectionPresentation.coverage.contains({ x: target.x + 1, y: target.y })).toBe(
      true
    );
    expect(f.model.plane.materialize()).toEqual(original);
    expect(f.model.canUndo).toBe(false);
    await f.setup.mockMouse.release(39, 5);
    expect(f.model.plane.get(target)?.char).toBe('🦀');
    expect(f.model.plane.get({ x: 0, y: 0 })).toBeUndefined();
    expect(f.model.canUndo).toBe(true);
    f.model.commands.undo();
    expect(f.model.plane.materialize()).toEqual(original);
    expect(f.model.canUndo).toBe(false);
    const end = { ...f.model.viewport };
    f.clock.advance(3000);
    expect(f.model.viewport).toEqual(end);
  } finally {
    await f.dispose();
  }
});

for (const cancellation of [
  'escape',
  'blur',
  'resize',
  'tool',
  'settings',
  'help',
  'dock',
  'detach',
  'move',
  'out',
  'mouse-disabled',
  'history',
] as const) {
  test(`edge scroll stops on ${cancellation} without committing a range move`, async () => {
    const f = await fixture('🦀X');
    try {
      f.model.selection = { anchor: { x: 0, y: 0 }, focus: { x: 1, y: 0 } };
      const original = f.model.plane.materialize();
      await f.setup.mockMouse.pressDown(0, 0);
      await f.setup.mockMouse.emitMouseEvent('drag', 39, 5);
      f.clock.advance(1500);
      expect(f.model.viewport.x).toBeGreaterThan(0);
      switch (cancellation) {
        case 'escape':
          f.setup.mockInput.pressEscape();
          f.clock.advance(40);
          break;
        case 'blur':
          f.setup.renderer.emit('blur');
          break;
        case 'resize':
          f.setup.resize(41, 15);
          await f.setup.renderOnce();
          break;
        case 'tool':
          f.surface.setTool('hand');
          break;
        case 'settings':
          f.setup.mockInput.pressKey(KeyCodes.F11);
          break;
        case 'help':
          f.setup.mockInput.pressKey(KeyCodes.F1);
          break;
        case 'dock':
          f.setup.mockInput.pressTab();
          break;
        case 'detach':
          f.detach();
          break;
        case 'move':
          await f.setup.mockMouse.emitMouseEvent('move', 20, 5);
          break;
        case 'out':
          f.surface.mouse({ type: 'out' } as never);
          break;
        case 'mouse-disabled':
          f.setup.renderer.useMouse = false;
          f.clock.advance(40);
          break;
        case 'history':
          f.model.commands.undo();
          break;
      }
      const stopped = { ...f.model.viewport };
      f.clock.advance(4000);
      expect(f.model.viewport).toEqual(stopped);
      expect(f.model.plane.materialize()).toEqual(original);
      expect(f.model.canUndo).toBe(false);
      expect(f.model.gestureState.type).toBe('idle');
    } finally {
      await f.dispose();
    }
  });
}

test('captured footer endpoints clamp to the last canvas row and never activate its dock', async () => {
  const f = await fixture();
  try {
    await f.start(10, 13);
    f.clock.advance(1000);
    expect(f.model.selection?.focus.y).toBe(f.model.viewport.y + 11);
    await f.setup.mockMouse.release(10, 13);
    expect(f.model.selection?.focus.y).toBe(f.model.viewport.y + 11);
    expect(f.surface.panel).toBeNull();
  } finally {
    await f.dispose();
  }
});

test('coordinate exhaustion cancels before changing the viewport or document', async () => {
  const f = await fixture();
  try {
    f.model.viewport = { ...f.model.viewport, x: Number.MAX_SAFE_INTEGER - 39 };
    const viewport = { ...f.model.viewport },
      content = f.model.plane.materialize();
    await f.start(39, 5);
    f.clock.advance(3000);
    expect(f.model.viewport).toEqual(viewport);
    expect(f.model.gestureState.type).toBe('idle');
    expect(f.surface.status).toContain('coordinate limit');
    expect(f.model.plane.materialize()).toEqual(content);
    expect(f.model.canUndo).toBe(false);
  } finally {
    await f.dispose();
  }
});

test('destroying the surface cancels the owned gesture and its scheduled scroll', async () => {
  const f = await fixture();
  try {
    await f.start();
    f.clock.advance(1500);
    f.surface.destroy();
    const viewport = { ...f.model.viewport };
    expect(f.model.gestureState.type).toBe('idle');
    f.clock.advance(4000);
    expect(f.model.viewport).toEqual(viewport);
    expect(f.model.canUndo).toBe(false);
  } finally {
    await f.dispose();
  }
});

for (const destination of ['page', 'document'] as const) {
  test(`switching ${destination} cancels scroll without leaking into the destination view`, async () => {
    const f = await fixture('🦀X');
    try {
      const original = f.model.documents.getActiveAddress();
      if (destination === 'page')
        f.model.documents.ensurePage(original.documentId, {
          id: 'second',
          kind: 'cell-plane',
          grid: [],
        });
      else f.model.documents.registerDocument('second', { grid: [] });
      f.model.selection = { anchor: { x: 0, y: 0 }, focus: { x: 1, y: 0 } };
      const content = f.model.plane.materialize();
      await f.setup.mockMouse.pressDown(0, 0);
      await f.setup.mockMouse.emitMouseEvent('drag', 39, 5);
      f.clock.advance(1500);
      expect(f.model.gestureState.type).toBe('movingRange');
      if (destination === 'page') f.model.switchDocument(original.documentId, 'second');
      else f.model.switchDocument('second');
      const view = { ...f.model.viewport };
      f.clock.advance(4000);
      expect(f.model.viewport).toEqual(view);
      expect(f.model.gestureState.type).toBe('idle');
      expect(f.model.plane.materialize().size).toBe(0);
      f.model.switchDocument(original.documentId, original.pageId);
      expect(f.model.plane.materialize()).toEqual(content);
      expect(f.model.canUndo).toBe(false);
      const restored = { ...f.model.viewport };
      f.clock.advance(4000);
      expect(f.model.viewport).toEqual(restored);
    } finally {
      await f.dispose();
    }
  });
}

test('hand drag and keyboard-only editing do not start edge scrolling', async () => {
  const f = await fixture();
  try {
    f.surface.setTool('hand');
    await f.start();
    const panned = { ...f.model.viewport };
    f.clock.advance(5000);
    expect(f.model.viewport).toEqual(panned);
    await f.setup.mockMouse.release(39, 11);
    f.setup.renderer.useMouse = false;
    f.surface.setTool('edit');
    f.model.viewport = { ...f.model.viewport, x: 0, y: 0 };
    f.model.commands.pointAt({ x: 0, y: 0 });
    f.setup.mockInput.pressArrow('right', { shift: true });
    expect(f.model.selectionBounds?.width).toBeGreaterThan(1);
    f.setup.mockInput.pressArrow('down', { meta: true });
    expect(f.model.viewport.y).toBe(10);
    const viewport = { ...f.model.viewport };
    f.clock.advance(4000);
    expect(f.model.viewport).toEqual(viewport);
  } finally {
    await f.dispose();
  }
});
