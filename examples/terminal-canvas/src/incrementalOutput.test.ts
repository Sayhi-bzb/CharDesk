import { expect, test } from 'bun:test';
import { Writable } from 'node:stream';
import { EmbeddedTerminalRenderable } from '@opentui/core';
import { createTestRenderer, ManualClock } from '@opentui/core/testing';
import { TerminalCanvas } from './model.ts';
import { CanvasSurface, CANVAS_TOP } from './surface.ts';
import { attachControls } from './controller.ts';
import { resolveTerminalPolicy, terminalRendererEnvironment } from './terminalPolicy.ts';

test('fragmented VT diffs match the composed frame throughout overlay and Unicode editing transitions', async () => {
  const width = 80, height = 24;
  const chunks: Buffer[] = [];
  const stdout = Object.assign(new Writable({
    write(chunk, _encoding, done) { chunks.push(Buffer.from(chunk)); done(); },
  }), { isTTY: true, columns: width, rows: height, getColorDepth: () => 24 });
  const terminal = await createTestRenderer({ width, height });
  const embedded = new EmbeddedTerminalRenderable(terminal.renderer, { width, height, cols: width, rows: height });
  terminal.renderer.root.add(embedded);
  const clock = new ManualClock();
  const setup = await createTestRenderer({ width, height, clock, kittyKeyboard: true,
    stdout: stdout as unknown as NodeJS.WriteStream, bufferedOutput: 'stdout',
    remote: false, forwardEnvKeys: [], screenMode: 'alternate-screen',
    environment: { TERM_PROGRAM: 'WarpTerminal', ...terminalRendererEnvironment({ TERM_PROGRAM: 'WarpTerminal' }) },
  });
  const model = new TerminalCanvas('A界🦀é\n\x1b]8;;https://example.com\x1b\\linked界\x1b]8;;\x1b\\');
  const surface = new CanvasSurface(setup.renderer, model, 'wire', 'win32', true,
    resolveTerminalPolicy({ TERM_PROGRAM: 'WarpTerminal' }));
  setup.renderer.root.add(surface);
  const detach = attachControls(surface, () => {});
  const present = async (label: string) => {
    await setup.renderOnce();
    await setup.renderer.nativeScene.driver.idle();
    const wire = Buffer.concat(chunks.splice(0));
    for (let i = 0; i < wire.length; i += 7) embedded.write(wire.subarray(i, i + 7));
    await terminal.renderOnce();
    expect(embedded.screen().lines.map((line) => line.trimEnd()), label).toEqual(
      setup.captureCharFrame().split('\n').slice(0, height).map((line) => line.trimEnd())
    );
  };
  const escape = () => { setup.mockInput.pressEscape(); clock.advance(40); };
  try {
    surface.setTool('edit');
    model.viewport = { ...model.viewport, x: 0, y: 0 };
    const original = model.plane.materialize();
    await present('initial');
    for (let cycle = 0; cycle < 3; cycle++) {
      await setup.mockMouse.click(0, CANVAS_TOP);
      await setup.mockMouse.click(4, CANVAS_TOP, 0, { modifiers: { shift: true } });
      await present(`range ${cycle}`);
      setup.mockInput.pressKey('F10', { shift: true });
      await present(`menu ${cycle}`);
      escape();
      await present(`menu closed ${cycle}`);
      surface.activateDock('settings');
      await present(`settings ${cycle}`);
      escape();
      await present(`settings closed ${cycle}`);
      setup.mockInput.pressKey('F1');
      await present(`help ${cycle}`);
      escape();
      surface.activateDock('inspector');
      await present(`style toggle ${cycle}`);
      surface.activateDock('minimap');
      await present(`minimap toggle ${cycle}`);
      model.pan(10, -10);
      await present(`pan ${cycle}`);
      model.pan(-10, 10);
      await present(`pan back ${cycle}`);
      setup.mockInput.pressKey('\x1b[3~');
      await present(`delete ${cycle}`);
      setup.mockInput.pressKey('z', { ctrl: true });
      setup.mockInput.pressKey('\x1b[57442;1:3u');
      await present(`undo ${cycle}`);
      expect(model.plane.materialize()).toEqual(original);
    }
  } finally {
    detach();
    await setup.dispose();
    await terminal.dispose();
    stdout.destroy();
    model.dispose();
  }
});
