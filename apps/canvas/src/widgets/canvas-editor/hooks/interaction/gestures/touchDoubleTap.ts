type Cell = Readonly<{ x: number; y: number }>;
type TouchPoint = Readonly<{
  pointerId: number;
  x: number;
  y: number;
  time: number;
  cell: Cell | null;
}>;

const MAX_TAP_DURATION_MS = 350;
const MAX_TAP_DISTANCE_PX = 8;
const MAX_DOUBLE_TAP_INTERVAL_MS = 350;
const MAX_DOUBLE_TAP_DISTANCE_PX = 16;

const distance = (a: TouchPoint, b: TouchPoint) =>
  Math.hypot(a.x - b.x, a.y - b.y);

export const createTouchDoubleTapRecognizer = () => {
  const active = new Map<number, TouchPoint>();
  let previousTap: TouchPoint | null = null;
  let multiTouch = false;

  return {
    down(point: TouchPoint) {
      if (active.size > 0) {
        multiTouch = true;
        previousTap = null;
      }
      active.set(point.pointerId, point);
    },
    move(point: TouchPoint) {
      const start = active.get(point.pointerId);
      if (start && distance(start, point) > MAX_TAP_DISTANCE_PX) {
        active.delete(point.pointerId);
        previousTap = null;
      }
    },
    up(point: TouchPoint): Cell | null {
      const start = active.get(point.pointerId);
      active.delete(point.pointerId);
      if (multiTouch) {
        if (active.size === 0) multiTouch = false;
        return null;
      }
      if (
        !start || !start.cell || !point.cell ||
        point.time - start.time > MAX_TAP_DURATION_MS ||
        distance(start, point) > MAX_TAP_DISTANCE_PX ||
        start.cell.x !== point.cell.x || start.cell.y !== point.cell.y
      ) {
        previousTap = null;
        return null;
      }
      const previous = previousTap;
      previousTap = point;
      if (
        previous && point.time - previous.time <= MAX_DOUBLE_TAP_INTERVAL_MS &&
        distance(previous, point) <= MAX_DOUBLE_TAP_DISTANCE_PX &&
        previous.cell?.x === point.cell.x && previous.cell.y === point.cell.y
      ) {
        previousTap = null;
        return point.cell;
      }
      return null;
    },
    cancel(pointerId: number) {
      active.delete(pointerId);
      previousTap = null;
      if (active.size === 0) multiTouch = false;
    },
  };
};
