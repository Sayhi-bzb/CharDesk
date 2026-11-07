import { Writable } from 'node:stream';
import { expect, test } from 'bun:test';
import { EmbeddedTerminalRenderable, RGBA } from '@opentui/core';
import { createTestRenderer, ManualClock } from '@opentui/core/testing';
import { TerminalCanvas } from './model.ts';
import { CANVAS_TOP, CanvasSurface } from './surface.ts';
import { attachControls } from './controller.ts';
import { terminalRendererEnvironment } from './terminalPolicy.ts';

for (const glyph of ['一', '🦀']) {
  for (const linked of [false, true]) {
    test(`${glyph} ${linked ? 'linked' : 'plain'} selection covers both cells in emitted terminal frames`, async () => {
      const chunks: Buffer[] = [];
      const stdout = Object.assign(
        new Writable({
          write(chunk, _encoding, done) {
            chunks.push(Buffer.from(chunk));
            done();
          },
        }),
        { isTTY: true, columns: 80, rows: 24, getColorDepth: () => 24 }
      );
      const terminal = await createTestRenderer({ width: 80, height: 24 });
      const embedded = new EmbeddedTerminalRenderable(terminal.renderer, {
        width: 80,
        height: 24,
        cols: 80,
        rows: 24,
      });
      terminal.renderer.root.add(embedded);
      const setup = await createTestRenderer({
        width: 80,
        height: 24,
        kittyKeyboard: true,
        clock: new ManualClock(),
        stdout: stdout as unknown as NodeJS.WriteStream,
        bufferedOutput: 'stdout',
        screenMode: 'alternate-screen',
        remote: false,
        forwardEnvKeys: [],
        environment: {
          TERM_PROGRAM: 'WarpTerminal',
          ...terminalRendererEnvironment({ TERM_PROGRAM: 'WarpTerminal' }),
        },
      });
      const text = linked ? `\x1b]8;;https://example.com\x1b\\${glyph}\x1b]8;;\x1b\\` : glyph;
      const model = new TerminalCanvas(`A${text}B`);
      const surface = new CanvasSurface(setup.renderer, model, 'selection output', 'darwin');
      setup.renderer.root.add(surface);
      const detach = attachControls(surface, () => {});
      surface.setTool('edit');
      model.viewport = { ...model.viewport, x: 0, y: 0 };
      const present = async () => {
        await setup.renderOnce();
        await setup.renderer.nativeScene.driver.idle();
        embedded.write(Buffer.concat(chunks.splice(0)));
        await terminal.renderOnce();
      };
      const background = (renderer: typeof setup.renderer, x: number) =>
        renderer.currentRenderBuffer.withBuffers((cells) =>
          RGBA.fromArray(
            cells.bg.slice(
              (CANVAS_TOP * cells.width + x) * 4,
              (CANVAS_TOP * cells.width + x + 1) * 4
            )
          ).toInts()
        );
      const expectSelected = () => {
        for (const x of [1, 2])
          expect(model.selectionPresentation.coverage.contains({ x, y: 0 })).toBe(true);
        expect(background(setup.renderer, 1)).toEqual(background(setup.renderer, 2));
        expect(background(terminal.renderer, 1)).toEqual(background(terminal.renderer, 2));
        expect(background(terminal.renderer, 2)).not.toEqual(background(terminal.renderer, 3));
      };
      const original = model.plane.materialize();
      try {
        await present();
        for (const [start, end] of [
          [0, 1],
          [1, 2],
          [2, 1],
        ]) {
          await setup.mockMouse.click(3, CANVAS_TOP);
          await present();
          expect(background(terminal.renderer, 1)).toEqual(background(terminal.renderer, 2));
          await setup.mockMouse.pressDown(start!, CANVAS_TOP);
          await setup.mockMouse.emitMouseEvent('drag', end!, CANVAS_TOP);
          await present();
          expectSelected();
          await setup.mockMouse.release(end!, CANVAS_TOP);
          await present();
          expectSelected();
        }
        expect(model.plane.materialize()).toEqual(original);
        expect(model.canUndo).toBe(false);
      } finally {
        detach();
        await setup.dispose();
        await terminal.dispose();
        stdout.destroy();
        model.dispose();
      }
    });
  }
}
