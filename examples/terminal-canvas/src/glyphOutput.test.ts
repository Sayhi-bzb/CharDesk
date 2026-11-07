import { expect, test } from 'bun:test';
import { Writable } from 'node:stream';
import { EmbeddedTerminalRenderable } from '@opentui/core';
import { createTestRenderer, ManualClock } from '@opentui/core/testing';
import { TerminalCanvas } from './model.ts';
import { CANVAS_TOP, CanvasSurface } from './surface.ts';
import { attachControls } from './controller.ts';
import { terminalRendererEnvironment } from './terminalPolicy.ts';

for (const tool of ['hand', 'edit'] as const) {
  for (const glyph of ['界', '🦀', '👩🏽‍💻']) {
    for (const linked of [false, true]) {
      test(`${glyph} ${linked ? 'linked' : 'plain'} ${tool} drag keeps Style intact in the terminal output, not just its frame buffer`, async () => {
        const chunks: Buffer[] = [];
        const stdout = Object.assign(
          new Writable({
            write(chunk, _encoding, done) {
              chunks.push(Buffer.from(chunk));
              done();
            },
          }),
          { isTTY: true, columns: 110, rows: 30, getColorDepth: () => 24 }
        );
        const terminal = await createTestRenderer({ width: 110, height: 30 });
        const embedded = new EmbeddedTerminalRenderable(terminal.renderer, {
          width: 110,
          height: 30,
          cols: 110,
          rows: 30,
        });
        terminal.renderer.root.add(embedded);
        const setup = await createTestRenderer({
          stdout: stdout as unknown as NodeJS.WriteStream,
          bufferedOutput: 'stdout',
          remote: false,
          forwardEnvKeys: [],
          environment: {
            TERM_PROGRAM: 'WarpTerminal',
            ...terminalRendererEnvironment({ TERM_PROGRAM: 'WarpTerminal' }),
          },
          screenMode: 'alternate-screen',
          width: 110,
          height: 30,
          kittyKeyboard: true,
          clock: new ManualClock(),
        });
        const model = new TerminalCanvas();
        const surface = new CanvasSurface(setup.renderer, model, 'occlusion', 'darwin');
        setup.renderer.root.add(surface);
        const detach = attachControls(surface, () => {});
        surface.setTool(tool);
        model.viewport = { ...model.viewport, x: 0, y: 0 };
        model.apply({
          rows: [12, 13].map((y) => ({
            y,
            erase: [],
            spans: [
              {
                x: 10,
                text: glyph.repeat(2),
                color: '#ff3344',
                ...(linked ? { href: 'https://example.com/wide' } : {}),
              },
            ],
          })),
        });
        model.documents.clearHistory();
        model.selection = { anchor: { x: 10, y: 12 }, focus: { x: 13, y: 13 } };
        // Replay the actual native diff into a VT grid. Frame captures alone miss
        // terminal cursor drift when a ZWJ sequence occupies more than two cells.
        const present = async () => {
          await setup.renderOnce();
          await setup.renderer.nativeScene.driver.idle();
          const wire = Buffer.concat(chunks.splice(0));
          embedded.write(wire);
          await terminal.renderOnce();
          return wire.toString('utf8');
        };
        const initialWire = await present();
        expect(initialWire.includes('https://example.com/wide')).toBe(linked);
        expect(initialWire.includes(glyph)).toBe(glyph !== '👩🏽‍💻');
        expect(surface.widthFallbacks > 0).toBe(glyph === '👩🏽‍💻');
        expect(setup.renderer.getLinkAt(10, CANVAS_TOP + 12)).toBe(
          linked ? 'https://example.com/wide' : null
        );
        const original = model.plane.materialize();
        const toolbar = surface.inspector!.layout;
        try {
          await setup.mockMouse.pressDown(10, CANVAS_TOP + 12);
          for (const x of [toolbar.x - 2, toolbar.x - 1, toolbar.x, toolbar.x + 1, toolbar.x - 1]) {
            await setup.mockMouse.emitMouseEvent('drag', x, toolbar.y + 1);
            await present();
            expect(model.gestureState.type).toBe(tool === 'hand' ? 'panning' : 'movingRange');
            const lines = embedded.screen().lines;
            expect(lines[toolbar.y + 1], `drag x=${x} toolbar=${toolbar.x}`).toContain(
              '│[B] [I] [U] [S] [Inv]│'
            );
            expect(lines[toolbar.y + 2]).toContain('│[Text] [Fill] [Clear]│');
            expect(lines[toolbar.y]).toContain('┌ Style ' + '─'.repeat(toolbar.width - 9) + '┐');
            expect(lines[toolbar.y + 3]).toContain('└' + '─'.repeat(toolbar.width - 2) + '┘');
            expect(setup.renderer.getLinkAt(toolbar.x, toolbar.y + 1)).toBeNull();
            expect(model.plane.materialize()).toEqual(original);
            expect(model.canUndo).toBe(false);
          }
          await setup.mockMouse.emitMouseEvent('drag', 10, CANVAS_TOP + 12);
          surface.cancelGesture();
          await present();
          expect(embedded.screen().lines[CANVAS_TOP + 12]).toContain(
            glyph === '👩🏽‍💻' ? '????' : glyph.repeat(2)
          );
          expect(model.plane.materialize()).toEqual(original);
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
}
