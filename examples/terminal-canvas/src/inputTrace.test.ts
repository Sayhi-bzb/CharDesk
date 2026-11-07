import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'bun:test';
import { createTestRenderer } from '@opentui/core/testing';
import { attachInputTrace } from './inputTrace.ts';
import { attachControls } from './controller.ts';
import { TerminalCanvas } from './model.ts';
import { CANVAS_TOP, CanvasSurface } from './surface.ts';

test('real input tracing preserves dispatch, records modifiers and excludes document/paste text', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chardesk-input-test-'));
  const path = join(directory, 'trace.jsonl');
  const setup = await createTestRenderer({
    width: 60,
    height: 18,
    kittyKeyboard: true,
    screenMode: 'alternate-screen',
  });
  const model = new TerminalCanvas('PRIVATE_DOCUMENT');
  let detach = () => {},
    detachTrace = () => {};
  try {
    const surface = new CanvasSurface(setup.renderer, model, 'trace-test', 'darwin');
    setup.renderer.root.add(surface);
    detach = attachControls(surface, () => {});
    detachTrace = attachInputTrace(surface, path);
    surface.settings.set('selectionColor', 6);
    expect(() => attachInputTrace(surface, path)).toThrow(); // Existing files are never overwritten.
    surface.setTool('edit');
    model.viewport = { ...model.viewport, x: 0, y: 0 };
    await setup.renderOnce();
    await setup.mockMouse.click(0, CANVAS_TOP);
    await setup.renderOnce();
    await setup.mockMouse.click(3, CANVAS_TOP, 0, { modifiers: { shift: true } });
    expect(model.selection).toEqual({ anchor: { x: 0, y: 0 }, focus: { x: 3, y: 0 } });
    const before = { ...model.viewport };
    setup.mockInput.pressArrow('up', { meta: true });
    expect(model.viewport.y).toBe(before.y - 10);
    setup.mockInput.pressArrow('down', { meta: true });
    expect(model.viewport).toEqual(before);
    const beforeDeletion = model.version;
    await setup.mockInput.pressKeys(['\x7f']);
    expect(model.version).not.toBe(beforeDeletion);
    await setup.mockInput.typeText('PRIVATE_TYPED_TEXT', 0);
    await setup.mockInput.pasteBracketedText('PRIVATE_PASTED_TEXT');
    const trace = await readFile(path, 'utf8');
    const events = trace
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(
      events.some((event) => event.kind === 'appearance' && event.appearance.revision > 0)
    ).toBe(true);
    expect(
      events.some(
        (e) => e.kind === 'key' && e.name === 'up' && (e.modifiers.option || e.modifiers.meta)
      )
    ).toBe(true);
    expect(events.some((e) => e.kind === 'state' && e.state.viewport.y === before.y - 10)).toBe(
      true
    );
    expect(
      events.some(
        (e) =>
          e.kind === 'raw-navigation' && Buffer.from(e.hex, 'hex').toString().includes('\x1b[<4;')
      )
    ).toBe(true);
    expect(events.some((e) => e.kind === 'raw-deletion' && e.hex === '7f')).toBe(true);
    expect(
      events.some(
        (e) =>
          e.kind === 'key' &&
          e.name === 'backspace' &&
          e.state.deletionEnabled.backward &&
          e.state.focus.dock === null &&
          !e.state.focus.style
      )
    ).toBe(true);
    expect(events.some((e) => e.kind === 'state' && e.state.contentVersion > 0)).toBe(true);
    // Associated text remains redacted even when a key reports a Backspace code.
    await setup.mockInput.pressKeys(['\x1b[127;1;80:82:73:86:65:84:69u']);
    const withAssociatedText = await readFile(path, 'utf8');
    expect(withAssociatedText).not.toContain(
      Buffer.from('\x1b[127;1;80:82:73:86:65:84:69u').toString('hex')
    );
    expect(events.some((e) => e.kind === 'raw-redacted' && e.bytes > 0)).toBe(true);
    expect(trace).not.toContain('PRIVATE_DOCUMENT');
    expect(trace).not.toContain('PRIVATE_TYPED_TEXT');
    expect(trace).not.toContain('PRIVATE_PASTED_TEXT');
    detachTrace();
    detachTrace = () => {};
    const closedTrace = await readFile(path, 'utf8');
    setup.mockInput.pressArrow('up', { meta: true });
    expect(model.viewport.y).toBe(before.y - 10);
    expect(await readFile(path, 'utf8')).toBe(closedTrace);
  } finally {
    detachTrace();
    detach();
    await setup.dispose();
    model.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});
