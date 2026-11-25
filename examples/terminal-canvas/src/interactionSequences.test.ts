import { expect, test } from 'bun:test';
import { createTestRenderer, ManualClock } from '@opentui/core/testing';
import { TerminalCanvas } from './model.ts';
import { CanvasSurface, CANVAS_TOP } from './surface.ts';
import { attachControls } from './controller.ts';
import { resolveTerminalPolicy } from './terminalPolicy.ts';

const seeds = process.env.TUI_SEQUENCE_SEED
  ? [Number(process.env.TUI_SEQUENCE_SEED)]
  : [1, 42, 20261114];
if (seeds.some((seed) => !Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff))
  throw new Error('TUI_SEQUENCE_SEED must be an unsigned 32-bit integer.');

function random(seed: number) {
  let state = seed >>> 0;
  return (bound: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return Math.floor((state / 0x100000000) * bound);
  };
}

async function fixture(kittyKeyboard: boolean, source = '') {
  const clock = new ManualClock();
  const setup = await createTestRenderer({ width: 80, height: 24, kittyKeyboard, clock });
  const model = new TerminalCanvas(source);
  const surface = new CanvasSurface(setup.renderer, model, 'sequences', 'win32', true, resolveTerminalPolicy({}));
  setup.renderer.root.add(surface);
  const detach = attachControls(surface, () => {});
  surface.setTool('edit');
  model.viewport = { ...model.viewport, x: -10, y: -4 };
  await setup.renderOnce();
  return {
    setup, model, surface, clock,
    click: (x: number, y: number) =>
      setup.mockMouse.click(x - model.viewport.x, CANVAS_TOP + y - model.viewport.y, 0, { delayMs: 0 }),
    async dispose() {
      detach();
      await setup.dispose();
      model.dispose();
    },
  };
}

for (const kitty of [false, true]) {
  for (const seed of seeds) {
    test(`sparse editing sequence matches an independent cell oracle (seed ${seed}, Kitty ${kitty})`, async () => {
      const f = await fixture(kitty);
      const next = random(seed);
      const expected = new Map<string, { x: number; y: number; char: string }>();
      const events: unknown[] = [];
      try {
        for (let step = 0; step < 100; step++) {
          const x = next(16) - 6, y = next(5) - 2;
          const char = String.fromCharCode(65 + next(26));
          const erase = next(4) === 0;
          events.push({ x, y, ...(erase ? { erase: true } : { char }) });
          await f.click(x, y);
          expect(f.model.selection).toBeNull();
          if (erase) {
            f.setup.mockInput.pressKey('\x1b[3~');
            expected.delete(`${x},${y}`);
          } else {
            await f.setup.mockInput.typeText(char, 0);
            expected.set(`${x},${y}`, { x, y, char });
          }
          expect(f.model.cursor).toEqual({ x: x + (erase ? 0 : 1), y });
          expect(f.model.plane.materialize().size).toBe(expected.size);
          for (const cell of expected.values())
            expect(f.model.plane.get(cell)?.char).toBe(cell.char);
          expect(f.model.gestureState.type).toBe('idle');
          if (step % 10 === 0) await f.setup.renderOnce();
        }
        const final = f.model.plane.materialize();
        for (let i = 0; f.model.canUndo && i < 101; i++)
          f.setup.mockInput.pressKey('z', { ctrl: true });
        expect(f.model.canUndo).toBe(false);
        expect(f.model.plane.materialize().size).toBe(0);
        for (let i = 0; f.model.canRedo && i < 101; i++)
          f.setup.mockInput.pressKey('y', { ctrl: true });
        expect(f.model.canRedo).toBe(false);
        expect(f.model.plane.materialize()).toEqual(final);
      } catch (cause) {
        throw new Error(`TUI_SEQUENCE_SEED=${seed}; Kitty=${kitty}; events=${JSON.stringify(events)}`, { cause });
      } finally {
        await f.dispose();
      }
    });
  }

  test(`interrupted pointer sequences always return to ordinary cell activation (Kitty ${kitty})`, async () => {
    const f = await fixture(kitty, 'A界🦀B');
    const content = f.model.plane.materialize();
    const version = f.model.documents.getContentVersion();
    const interruptions = ['escape', 'blur', 'focus', 'resize', 'help', 'settings', 'menu', 'hand'] as const;
    try {
      for (const interruption of interruptions) {
        for (const kind of ['range', 'move', 'pan'] as const) {
          f.surface.setTool('edit');
          await f.click(0, 0);
          if (kind === 'move') {
            await f.setup.mockMouse.click(15, CANVAS_TOP + 4, 0, { modifiers: { shift: true } });
          } else if (kind === 'pan') f.surface.setTool('hand');
          await f.setup.mockMouse.pressDown(10, CANVAS_TOP + 4);
          await f.setup.mockMouse.emitMouseEvent('drag', 18, CANVAS_TOP + 6);
          expect(f.model.gestureState.type).not.toBe('idle');
          if (interruption === 'escape') {
            f.setup.mockInput.pressEscape();
            f.clock.advance(40);
          }
          else if (interruption === 'blur' || interruption === 'focus') f.setup.renderer.emit(interruption);
          else if (interruption === 'resize') f.setup.resize(12, 4);
          else if (interruption === 'help') f.setup.mockInput.pressKey('F1');
          else if (interruption === 'settings') f.surface.activateDock('settings');
          else if (interruption === 'menu') f.setup.mockInput.pressKey('F10', { shift: true });
          else f.surface.setTool('hand');
          expect(f.model.gestureState.type, `${kind}/${interruption}`).toBe('idle');
          await f.setup.mockMouse.release(18, CANVAS_TOP + 6);
          f.setup.mockInput.pressEscape();
          f.clock.advance(40);
          f.setup.resize(80, 24);
          f.surface.setTool('edit');
          f.model.viewport = { ...f.model.viewport, x: -10, y: -4 };
          await f.setup.renderOnce();
          await f.click(3, 1);
          expect(f.model.cursor, `${kind}/${interruption}`).toEqual({ x: 3, y: 1 });
          expect(f.model.selection).toBeNull();
          expect(f.model.gestureState.type).toBe('idle');
          expect(f.model.plane.materialize()).toEqual(content);
          expect(f.model.documents.getContentVersion()).toBe(version);
          expect(f.model.canUndo).toBe(false);
        }
      }
    } finally {
      await f.dispose();
    }
  });
}
