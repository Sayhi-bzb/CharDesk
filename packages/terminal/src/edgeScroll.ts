import {
  CanvasEdgeScroll,
  type EdgeScrollSession,
} from '@chardesk/editor-core/interaction/edgeScroll';
import type { CliRenderer } from '@opentui/core';

/** Terminal units are integer cells; fractional speed never reaches the editor. */
export class TerminalEdgeScroll {
  readonly #scroll: CanvasEdgeScroll;
  #remaining = { x: 0, y: 0 };
  constructor(clock: CliRenderer['clock'], pan: (x: number, y: number) => void) {
    let timer: ReturnType<typeof clock.setTimeout> | undefined;
    this.#scroll = new CanvasEdgeScroll(
      {
        request: (tick) => {
          timer = clock.setTimeout(() => {
            timer = undefined;
            tick(clock.now());
          }, 32);
        },
        cancel: () => {
          if (timer !== undefined) clock.clearTimeout(timer);
          timer = undefined;
        },
      },
      (x, y) => {
        const collect = (delta: number, remainder: number) =>
          delta === 0 ? 0 : delta + (Math.sign(delta) === Math.sign(remainder) ? remainder : 0);
        const next = {
          x: collect(x, this.#remaining.x),
          y: collect(y, this.#remaining.y),
        };
        const dx = Math.trunc(next.x),
          dy = Math.trunc(next.y);
        this.#remaining = { x: next.x - dx, y: next.y - dy };
        if (dx || dy) pan(dx, dy);
      },
      { distance: { x: 2, y: 2 }, maxSpeed: { x: 24, y: 12 } }
    );
  }
  update(session: EdgeScrollSession) {
    if (!this.#scroll.update(session)) this.#remaining = { x: 0, y: 0 };
  }
  stop() {
    this.#scroll.stop();
    this.#remaining = { x: 0, y: 0 };
  }
  dispose() {
    this.stop();
    this.#scroll.dispose();
  }
}
