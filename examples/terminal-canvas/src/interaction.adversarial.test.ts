import { expect, test } from 'bun:test';
import { createTestRenderer, KeyCodes, ManualClock } from '@opentui/core/testing';
import type {
  ClipboardPort,
  PreparedClipboardPaste,
} from '@chardesk/editor-core/clipboard/commands';
import { TerminalCanvas } from './model.ts';
import { CanvasSurface, CANVAS_TOP } from './surface.ts';
import { attachControls } from './controller.ts';

async function fixture(
  kittyKeyboard: boolean,
  source = '0123456789',
  clipboard: ClipboardPort = { write: async () => ({ status: 'written' }), read: async () => ({}) }
) {
  const clock = new ManualClock();
  const setup = await createTestRenderer({ width: 90, height: 28, kittyKeyboard, clock });
  const model = new TerminalCanvas(source);
  const surface = new CanvasSurface(setup.renderer, model, 'test.chardesk', 'win32');
  setup.renderer.root.add(surface);
  const detach = attachControls(surface, () => {}, clipboard);
  await setup.renderOnce();
  return {
    setup,
    model,
    surface,
    detach,
    clock,
    x: -model.viewport.x,
    y: CANVAS_TOP - model.viewport.y,
    async dispose() {
      detach();
      await setup.dispose();
      model.dispose();
    },
  };
}
for (const kitty of [false, true]) {
  test(`Edit and printable tool letters stay in text input (Kitty ${kitty})`, async () => {
    const f = await fixture(kitty, '');
    try {
      f.surface.activateDock('edit');
      expect(f.surface.tool).toBe('edit');
      await f.setup.mockInput.typeText('hifgm', 0);
      f.setup.mockInput.pressEnter();
      await f.setup.mockInput.typeText('Z', 0);
      expect(f.model.plane.get({ x: 0, y: 1 })?.char).toBe('Z');
      expect(f.model.cursor).toEqual({ x: 1, y: 1 });
      expect(f.surface.tool).toBe('edit');
      expect(f.surface.minimapOpen).toBe(false);
    } finally {
      await f.dispose();
    }
  });
  test(`typing mode cancels a live drag and late release cannot exit input (Kitty ${kitty})`, async () => {
    const f = await fixture(kitty);
    try {
      f.surface.activateDock('edit');
      await f.setup.mockMouse.pressDown(f.x + 5, f.y);
      await f.setup.mockMouse.emitMouseEvent('drag', f.x + 8, f.y);
      f.surface.activateDock('edit');
      expect(f.model.gestureState.type).toBe('idle');
      expect(f.surface.tool).toBe('edit');
      await f.setup.mockMouse.release(f.x + 8, f.y);
      expect(f.surface.tool).toBe('edit');
      await f.setup.mockInput.typeText('X', 0);
      expect(f.model.plane.get({ x: 0, y: 0 })?.char).toBe('X');
    } finally {
      await f.dispose();
    }
  });
  test(`Shift+click follows keyboard focus after a mouse click (Kitty ${kitty})`, async () => {
    const f = await fixture(kitty);
    try {
      f.surface.activateDock('edit');
      await f.setup.mockMouse.click(f.x, f.y);
      for (let i = 0; i < 5; i++) f.setup.mockInput.pressArrow('right');
      await f.setup.mockMouse.click(f.x + 8, f.y, 0, { modifiers: { shift: true } });
      expect(f.model.selectionBounds).toEqual({ x: 5, y: 0, width: 4, height: 1 });
    } finally {
      await f.dispose();
    }
  });
  test(`help cancels selection preview and blocks clipboard shortcuts (Kitty ${kitty})`, async () => {
    let writes = 0,
      reads = 0;
    const f = await fixture(kitty, 'AB', {
      write: async () => {
        writes++;
        return { status: 'written' };
      },
      read: async () => {
        reads++;
        return {};
      },
    });
    try {
      f.surface.activateDock('edit');
      await f.setup.mockMouse.pressDown(f.x + 5, f.y);
      await f.setup.mockMouse.emitMouseEvent('drag', f.x + 8, f.y);
      f.setup.mockInput.pressKey(KeyCodes.F1);
      for (const key of ['c', 'x', 'v']) f.setup.mockInput.pressKey(key, { ctrl: true });
      expect(f.model.gestureState.type).toBe('idle');
      expect(f.model.selection).toBeNull();
      expect(reads).toBe(0);
      expect(writes).toBe(0);
      await f.setup.mockMouse.release(f.x + 8, f.y);
      f.setup.mockInput.pressEscape();
      f.clock.advance(40);
      expect(f.surface.help).toBe(false);
      expect(f.model.canUndo).toBe(false);
    } finally {
      await f.dispose();
    }
  });
  test(`detaching controls cancels pending paste without disposing the model (Kitty ${kitty})`, async () => {
    let resolve!: (data: PreparedClipboardPaste) => void;
    const read = new Promise<PreparedClipboardPaste>((done) => {
      resolve = done;
    });
    const f = await fixture(kitty, 'AB', {
      write: async () => ({ status: 'written' }),
      read: () => read,
    });
    try {
      f.setup.mockInput.pressKey('v', { ctrl: true });
      f.detach();
      resolve({ plainText: 'late' });
      await read;
      expect(f.model.plane.get({ x: 0, y: 0 })?.char).toBe('A');
      expect(f.model.canUndo).toBe(false);
    } finally {
      await f.dispose();
    }
  });
}
