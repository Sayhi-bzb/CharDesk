import type { AxisTransform, CharDeskNormalizedCellRect } from "./canvas-geometry.js";

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Point = { x: number; y: number; rawX: number; rawY: number };
type PathOperation = Readonly<{ kind: string; values: number[]; point?: Point }>;

const COMMAND_ARITY: Readonly<Record<string, number>> = {
  M: 2, L: 2, H: 1, V: 1, C: 6, Q: 4, T: 2, A: 7, Z: 0,
};

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

function tokenize(path: string): Array<string | number> {
  const tokens: Array<string | number> = [];
  const tokenPattern = /[MLHVQCTAZ]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;
  const residue = path.replace(tokenPattern, "").replace(/[\s,]/g, "");
  if (residue) throw new Error(`Unsupported Cell graphic path syntax: ${residue}`);
  for (const match of path.matchAll(tokenPattern)) {
    const token = match[0]!;
    tokens.push(/^[A-Z]$/.test(token) ? token : Number(token));
  }
  return tokens;
}

function parsePath(path: string, bounds: CharDeskNormalizedCellRect): PathOperation[] {
  const tokens = tokenize(path);
  const operations: PathOperation[] = [];
  let index = 0, command = "", currentX = 0, currentY = 0;
  while (index < tokens.length) {
    if (typeof tokens[index] === "string") command = tokens[index++] as string;
    const arity = COMMAND_ARITY[command];
    if (arity === undefined) throw new Error(`Unsupported Cell graphic path command: ${command || "<none>"}`);
    if (arity === 0) {
      operations.push({ kind: command, values: [] });
      command = "";
      continue;
    }
    if (index + arity > tokens.length || typeof tokens[index] === "string") {
      throw new Error(`Invalid Cell graphic path command: ${command}`);
    }
    const values = tokens.slice(index, index + arity) as number[];
    if (values.some(value => typeof value !== "number" || !Number.isFinite(value))) {
      throw new Error(`Invalid Cell graphic path values: ${command}`);
    }
    index += arity;
    let x = currentX, y = currentY;
    if (command === "H") x = values[0]!;
    else if (command === "V") y = values[0]!;
    else if (command === "M" || command === "L" || command === "T") { x = values[0]!; y = values[1]!; }
    else if (command === "Q") { x = values[2]!; y = values[3]!; }
    else if (command === "C") { x = values[4]!; y = values[5]!; }
    else if (command === "A") { x = values[5]!; y = values[6]!; }
    const point = { x: bounds.x + x * bounds.width, y: bounds.y + y * bounds.height,
      rawX: bounds.x + x * bounds.width, rawY: bounds.y + y * bounds.height };
    operations.push({ kind: command, values, point });
    currentX = x; currentY = y;
    if (command === "M") command = "L";
  }
  return operations;
}

function alignStraightSegments(operations: PathOperation[], lineWidth: number, transform?: AxisTransform) {
  const axis = transform ?? { a: 1, b: 0, c: 0, d: 1 };
  if (axis.b !== 0 || axis.c !== 0 || !axis.a || !axis.d) return;
  let previous: Point | undefined;
  for (const operation of operations) {
    const end = operation.point;
    if (operation.kind === "Z") { previous = undefined; continue; }
    if (previous && end && (operation.kind === "L" || operation.kind === "H" || operation.kind === "V")) {
      if (previous.rawX !== end.rawX || previous.rawY !== end.rawY) {
        if (previous.rawX === end.rawX) previous.x = end.x = snapCenter(previous.rawX, lineWidth, axis.a, axis.e ?? 0);
        if (previous.rawY === end.rawY) previous.y = end.y = snapCenter(previous.rawY, lineWidth, axis.d, axis.f ?? 0);
      }
    }
    if (end) previous = end;
  }
}

function drawSvgArc(ctx: Context, x1: number, y1: number, rx: number, ry: number, phi: number,
  largeArc: number, sweep: number, x2: number, y2: number) {
  if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2)) { ctx.lineTo(x2, y2); return; }
  rx = Math.abs(rx); ry = Math.abs(ry);
  const cos = Math.cos(phi), sin = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy, y1p = -sin * dx + cos * dy;
  let rx2 = rx * rx, ry2 = ry * ry;
  const lambda = x1p * x1p / rx2 + y1p * y1p / ry2;
  if (lambda > 1) {
    const scale = Math.sqrt(lambda);
    rx *= scale; ry *= scale; rx2 = rx * rx; ry2 = ry * ry;
  }
  const denominator = rx2 * y1p * y1p + ry2 * x1p * x1p;
  const ratio = denominator === 0 ? 0 : Math.max(0,
    (rx2 * ry2 - rx2 * y1p * y1p - ry2 * x1p * x1p) / denominator);
  const coefficient = (largeArc === sweep ? -1 : 1) * Math.sqrt(ratio);
  const cxp = coefficient * rx * y1p / ry, cyp = -coefficient * ry * x1p / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const start = Math.atan2((y1p - cyp) / ry, (x1p - cxp) / rx);
  let delta = Math.atan2((-y1p - cyp) / ry, (-x1p - cxp) / rx) - start;
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  else if (sweep && delta < 0) delta += 2 * Math.PI;
  ctx.ellipse(cx, cy, rx, ry, phi, start, start + delta, !sweep);
}

/** Trace the normalized absolute SVG subset used by the pinned Cell graphic definitions. */
export function traceCellGraphicPath(
  ctx: Context, path: string, bounds: CharDeskNormalizedCellRect,
  lineWidth: number, transform?: AxisTransform, snapStraightSegments = true,
) {
  const operations = parsePath(path, bounds);
  if (snapStraightSegments) alignStraightSegments(operations, lineWidth, transform);
  let currentX = bounds.x, currentY = bounds.y, subpathX = currentX, subpathY = currentY;
  let controlX = currentX, controlY = currentY, lastCommand = "";
  const tx = (value: number) => bounds.x + value * bounds.width;
  const ty = (value: number) => bounds.y + value * bounds.height;
  for (const operation of operations) {
    const values = operation.values, point = operation.point;
    switch (operation.kind) {
      case "M":
        ctx.moveTo(point!.x, point!.y); currentX = subpathX = point!.x; currentY = subpathY = point!.y;
        controlX = currentX; controlY = currentY; break;
      case "L": case "H": case "V":
        ctx.lineTo(point!.x, point!.y); currentX = controlX = point!.x; currentY = controlY = point!.y; break;
      case "C":
        ctx.bezierCurveTo(tx(values[0]!), ty(values[1]!), tx(values[2]!), ty(values[3]!), point!.x, point!.y);
        controlX = tx(values[2]!); controlY = ty(values[3]!); currentX = point!.x; currentY = point!.y; break;
      case "Q":
        ctx.quadraticCurveTo(tx(values[0]!), ty(values[1]!), point!.x, point!.y);
        controlX = tx(values[0]!); controlY = ty(values[1]!); currentX = point!.x; currentY = point!.y; break;
      case "T": {
        const reflectedX = lastCommand === "Q" || lastCommand === "T" ? 2 * currentX - controlX : currentX;
        const reflectedY = lastCommand === "Q" || lastCommand === "T" ? 2 * currentY - controlY : currentY;
        ctx.quadraticCurveTo(reflectedX, reflectedY, point!.x, point!.y);
        controlX = reflectedX; controlY = reflectedY; currentX = point!.x; currentY = point!.y; break;
      }
      case "A":
        drawSvgArc(ctx, currentX, currentY, values[0]! * bounds.width, values[1]! * bounds.height,
          values[2]! * Math.PI / 180, values[3]!, values[4]!, point!.x, point!.y);
        currentX = point!.x; currentY = point!.y; break;
      case "Z": ctx.closePath(); currentX = subpathX; currentY = subpathY; break;
    }
    lastCommand = operation.kind;
  }
}
