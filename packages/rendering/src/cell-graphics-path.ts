import type { AxisTransform, CharDeskNormalizedCellRect } from "./canvas-geometry.js";

type Point = { x: number; y: number; rawX: number; rawY: number };
type Command = { kind: string; points: Point[] };
type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Stroke edges, not centerlines, belong on integer device pixels. */
function snapCenter(value: number, width: number, scale: number, offset: number) {
  const half = Math.abs(scale) * width / 2;
  return (Math.round(value * scale + offset - half) + half - offset) / scale;
}

/** Circular corners share the center alignment used by straight Box strokes. */
export function traceCellGraphicCorner(
  ctx: Context, direction: { x: number; y: number }, bounds: CharDeskNormalizedCellRect,
  lineWidth: number, transform?: AxisTransform,
) {
  const axis = transform ?? { a: 1, b: 0, c: 0, d: 1 };
  let x = bounds.x + bounds.width / 2;
  let y = bounds.y + bounds.height / 2;
  if (axis.b === 0 && axis.c === 0 && axis.a && axis.d) {
    x = snapCenter(x, lineWidth, axis.a, axis.e ?? 0);
    y = snapCenter(y, lineWidth, axis.d, axis.f ?? 0);
  }
  const right = bounds.x + bounds.width, bottom = bounds.y + bounds.height;
  const radius = Math.max(0, Math.min(x - bounds.x, right - x, y - bounds.y, bottom - y));
  const dx = direction.x, dy = direction.y;
  ctx.moveTo(x, dy > 0 ? bottom : bounds.y);
  ctx.lineTo(x, y + dy * radius);
  if (radius > 0) {
    ctx.arc(x + dx * radius, y + dy * radius, radius,
      dx > 0 ? Math.PI : 0, -dy * Math.PI / 2, dx !== dy);
  }
  ctx.lineTo(dx > 0 ? right : bounds.x, y);
}

/** Trace xterm M/L paths; only straight-stroke cross axes are snapped. */
export function traceCellGraphicPath(
  ctx: Context, path: string, bounds: CharDeskNormalizedCellRect,
  lineWidth: number, transform?: AxisTransform,
) {
  const commands: Command[] = [];
  for (const match of path.matchAll(/([ML])([^ML]+)/g)) {
    const values = match[2]!.trim().split(/[ ,]+/).map(Number);
    const points: Point[] = [];
    for (let i = 0; i < values.length; i += 2) {
      const x = bounds.x + values[i]! * bounds.width;
      const y = bounds.y + values[i + 1]! * bounds.height;
      points.push({ x, y, rawX: x, rawY: y });
    }
    commands.push({ kind: match[1]!, points });
  }

  const axis = transform ?? { a: 1, b: 0, c: 0, d: 1 };
  if (axis.b === 0 && axis.c === 0 && axis.a && axis.d) {
    let previous: Point | undefined;
    const align = (start: Point, end: Point) => {
      if (start.rawX === end.rawX && start.rawY === end.rawY) return;
      if (start.rawX === end.rawX) {
        start.x = end.x = snapCenter(start.rawX, lineWidth, axis.a, axis.e ?? 0);
      }
      if (start.rawY === end.rawY) {
        start.y = end.y = snapCenter(start.rawY, lineWidth, axis.d, axis.f ?? 0);
      }
    };
    for (const command of commands) {
      const end = command.points[command.points.length - 1]!;
      if (previous && command.kind === "L") align(previous, end);
      previous = end;
    }
  }

  for (const { kind, points } of commands) {
    const first = points[0]!;
    if (kind === "M") ctx.moveTo(first.x, first.y);
    else if (kind === "L") ctx.lineTo(first.x, first.y);
  }
}
