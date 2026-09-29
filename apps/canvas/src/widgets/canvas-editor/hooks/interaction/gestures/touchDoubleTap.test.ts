import { describe, expect, it } from 'vitest';
import { createTouchDoubleTapRecognizer } from './touchDoubleTap';

const point = (time: number, x = 24, y = 24, pointerId = 1) => ({
  pointerId, x, y, time, cell: { x: 2, y: 3 },
});

describe('touch double tap', () => {
  it('enters only after two taps on the same cell', () => {
    const tap = createTouchDoubleTapRecognizer();
    tap.down(point(100));
    expect(tap.up(point(140))).toBeNull();
    tap.down(point(240));
    expect(tap.up(point(280))).toEqual({ x: 2, y: 3 });
  });

  it('rejects a different cell or a late second tap', () => {
    const tap = createTouchDoubleTapRecognizer();
    tap.down(point(100));
    tap.up(point(140));
    tap.down({ ...point(240), cell: { x: 3, y: 3 } });
    expect(tap.up({ ...point(280), cell: { x: 3, y: 3 } })).toBeNull();
    tap.down(point(700));
    expect(tap.up(point(740))).toBeNull();
  });

  it('rejects dragging, pinch, and canceled pointers', () => {
    const drag = createTouchDoubleTapRecognizer();
    drag.down(point(100));
    drag.move(point(120, 50));
    expect(drag.up(point(140, 50))).toBeNull();
    drag.down(point(200));
    expect(drag.up(point(240))).toBeNull();

    const pinch = createTouchDoubleTapRecognizer();
    pinch.down(point(100));
    pinch.down(point(110, 50, 50, 2));
    expect(pinch.up(point(140))).toBeNull();
    expect(pinch.up(point(145, 50, 50, 2))).toBeNull();
    pinch.down(point(200));
    expect(pinch.up(point(240))).toBeNull();

    const canceled = createTouchDoubleTapRecognizer();
    canceled.down(point(100));
    canceled.cancel(1);
    expect(canceled.up(point(140))).toBeNull();
  });
});
