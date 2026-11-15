import { expect, test } from 'bun:test';
import { createTestRenderer, ManualClock } from '@opentui/core/testing';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CanvasFile } from './document.ts';
import { CanvasSurface, CANVAS_TOP } from './surface.ts';
import { attachControls } from './controller.ts';
import { resolveTerminalPolicy } from './terminalPolicy.ts';
import type { EditorCommandResult } from '@chardesk/editor-core/editor/types';
import type { ClipboardCommandResult, ClipboardPort, PreparedClipboardPaste } from '@chardesk/editor-core/clipboard/commands';

async function finish(result: EditorCommandResult<ClipboardCommandResult>) {
  if (result.status !== 'pending') throw new Error(`Expected pending, got ${result.status}`);
  expect(await result.completion).toMatchObject({ succeeded: true });
}

test('wide selection survives drag, style, rich copy/cut/paste, history and a native-file round trip', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chardesk-unicode-workflow-'));
  const path = join(directory, 'workflow.chardesk');
  const { file, model } = await CanvasFile.open(path, 'A界🦀B');
  const setup = await createTestRenderer({ width: 80, height: 24, kittyKeyboard: true, clock: new ManualClock() });
  let clipboard: PreparedClipboardPaste = {};
  let plain = '';
  const port: ClipboardPort = {
    read: async () => clipboard,
    write: async (payload) => {
      plain = payload.plain;
      clipboard = { richCells: JSON.parse(payload.rich!).cells };
      return { status: 'written' };
    },
  };
  const surface = new CanvasSurface(setup.renderer, model, 'workflow', 'win32', true, resolveTerminalPolicy({}));
  setup.renderer.root.add(surface);
  const detach = attachControls(surface, () => {}, port);
  const click = (x: number, y: number, shift = false) =>
    setup.mockMouse.click(x - model.viewport.x, CANVAS_TOP + y - model.viewport.y, 0, { modifiers: { shift } });
  try {
    surface.setTool('edit');
    model.viewport = { ...model.viewport, x: -10, y: -4 };
    await setup.renderOnce();
    const original = model.plane.materialize();
    await click(0, 0);
    await click(4, 0, true); // emoji follower: include the complete glyph, exclude B
    expect(model.selectionCoverage.contains({ x: 3, y: 0 })).toBe(true);
    expect(model.selectionCoverage.contains({ x: 4, y: 0 })).toBe(true);
    expect(model.selectionCoverage.contains({ x: 5, y: 0 })).toBe(false);
    const version = model.documents.getContentVersion();
    await setup.mockMouse.pressDown(10, CANVAS_TOP + 4);
    await setup.mockMouse.emitMouseEvent('drag', 13, CANVAS_TOP + 6);
    await setup.renderOnce();
    expect(model.documents.getContentVersion()).toBe(version);
    expect(model.plane.materialize()).toEqual(original);
    await setup.mockMouse.release(13, CANVAS_TOP + 6);
    expect(model.plane.get({ x: 3, y: 2 })?.char).toBe('A');
    expect(model.plane.get({ x: 4, y: 2 })?.char).toBe('界');
    expect(model.plane.get({ x: 6, y: 2 })?.char).toBe('🦀');
    expect(model.plane.get({ x: 5, y: 0 })?.char).toBe('B');
    setup.mockInput.pressKey('z', { ctrl: true });
    expect(model.plane.materialize()).toEqual(original);
    setup.mockInput.pressKey('y', { ctrl: true });
    model.commands.style({ kind: 'attributes', attributes: { bold: true, underline: true } });
    model.commands.style({ kind: 'background', color: '#123456' });
    const styled = model.plane.materialize();
    await finish(model.commands.copy());
    expect(plain).toBe('A界🦀');
    await finish(model.commands.cut());
    expect(model.plane.get({ x: 6, y: 2 })).toBeUndefined();
    expect(model.plane.get({ x: 5, y: 0 })?.char).toBe('B');
    setup.mockInput.pressKey('z', { ctrl: true });
    expect(model.plane.materialize()).toEqual(styled);
    await setup.renderOnce();
    await click(-5, -3);
    expect(model.cursor).toEqual({ x: -5, y: -3 });
    expect(model.selection).toBeNull();
    await finish(model.commands.paste());
    for (const [x, char] of [[-5, 'A'], [-4, '界'], [-2, '🦀']] as const)
      expect(model.plane.get({ x, y: -3 })).toMatchObject({ char, attrs: { bold: true, underline: true }, bgColor: '#123456' });
    expect(model.plane.get({ x: -3, y: -3 })).toBeUndefined();
    expect(model.plane.get({ x: -1, y: -3 })).toBeUndefined();
    const pasted = model.plane.materialize();
    setup.mockInput.pressKey('z', { ctrl: true });
    expect(model.plane.materialize()).toEqual(styled);
    setup.mockInput.pressKey('y', { ctrl: true });
    expect(model.plane.materialize()).toEqual(pasted);
    await setup.renderOnce();
    await file.save(model);
    const reopened = await CanvasFile.open(path);
    try {
      const visible = (grid: typeof pasted) => [...grid].filter(([, cell]) => cell.char !== ' ' || cell.bgColor || cell.href);
      expect(visible(reopened.model.plane.materialize())).toEqual(visible(pasted));
      expect(model.dirty).toBe(false);
    } finally {
      reopened.model.dispose();
    }
  } finally {
    detach();
    await setup.dispose();
    model.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});
