import { BOX_CHARS } from "@/shared/lib/constants";
import type { Point, GridPoint } from "@/shared/types";

function resolvePointChars(points: Point[]): GridPoint[] {
  return points.map((p, i) => {
    const prev = points[i - 1];
    const next = points[i + 1];

    if (!prev && !next) return { ...p, char: BOX_CHARS.CROSS };

    const dIn = prev ? `${p.x - prev.x},${p.y - prev.y}` : null;
    const dOut = next ? `${next.x - p.x},${next.y - p.y}` : null;

    const isH = (d: string | null) => d === "1,0" || d === "-1,0";
    const isV = (d: string | null) => d === "0,1" || d === "0,-1";

    if ((isH(dIn) || !dIn) && (isH(dOut) || !dOut)) {
      return { ...p, char: BOX_CHARS.HORIZONTAL };
    }
    if ((isV(dIn) || !dIn) && (isV(dOut) || !dOut)) {
      return { ...p, char: BOX_CHARS.VERTICAL };
    }

    const combined = `${dIn}|${dOut}`;
    let char = BOX_CHARS.CROSS;

    switch (combined) {
      case "0,-1|1,0":
      case "-1,0|0,1":
        char = BOX_CHARS.TOP_LEFT;
        break;

      case "0,-1|-1,0":
      case "1,0|0,1":
        char = BOX_CHARS.TOP_RIGHT;
        break;

      case "0,1|1,0":
      case "-1,0|0,-1":
        char = BOX_CHARS.BOTTOM_LEFT;
        break;
      case "0,1|-1,0":
      case "1,0|0,-1":
        char = BOX_CHARS.BOTTOM_RIGHT;
        break;
    }

    return { ...p, char };
  });
}

export function getLShapeLinePoints(
  start: Point,
  end: Point,
  isVerticalFirst: boolean
): GridPoint[] {
  const points: Point[] = [];
  const junction = isVerticalFirst
    ? { x: start.x, y: end.y }
    : { x: end.x, y: start.y };

  const drawLine = (p1: Point, p2: Point) => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    const stepX = dx === 0 ? 0 : dx / adx;
    const stepY = dy === 0 ? 0 : dy / ady;
    const steps = Math.max(adx, ady);

    for (let i = 0; i <= steps; i++) {
      points.push({ x: p1.x + i * stepX, y: p1.y + i * stepY });
    }
  };

  drawLine(start, junction);
  points.pop();
  drawLine(junction, end);

  const uniquePoints: Point[] = [];
  const seen = new Set();
  points.forEach((p) => {
    const key = `${p.x},${p.y}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniquePoints.push(p);
    }
  });

  return resolvePointChars(uniquePoints);
}

export function getArrowLinePoints(
  start: Point,
  end: Point,
  isVerticalFirst: boolean
): GridPoint[] {
  const points = getLShapeLinePoints(start, end, isVerticalFirst);
  if (points.length === 0) return points;

  const previous = points[points.length - 2];
  let char = ">";
  if (previous) {
    const dx = end.x - previous.x;
    const dy = end.y - previous.y;
    if (dx < 0) char = "<";
    else if (dy > 0) char = "v";
    else if (dy < 0) char = "^";
  }

  return points.map((point, index) =>
    index === points.length - 1 ? { ...point, char } : point
  );
}

export function getStepLinePoints(start: Point, end: Point): GridPoint[] {
  const points: Point[] = [];
  let x = start.x;
  let y = start.y;
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  const sx = start.x < end.x ? 1 : -1;
  const sy = start.y < end.y ? 1 : -1;
  let err = dx - dy;

  points.push({ x, y });
  while (x !== end.x || y !== end.y) {
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
      points.push({ x, y });
    }
    if (x === end.x && y === end.y) break;
    if (e2 < dx) {
      err += dx;
      y += sy;
      points.push({ x, y });
    }
  }
  return resolvePointChars(points);
}

export function getBoxPoints(start: Point, end: Point): GridPoint[] {
  const points: GridPoint[] = [];
  const x1 = Math.min(start.x, end.x);
  const x2 = Math.max(start.x, end.x);
  const y1 = Math.min(start.y, end.y);
  const y2 = Math.max(start.y, end.y);

  for (let x = x1; x <= x2; x++) {
    for (let y = y1; y <= y2; y++) {
      if (x === x1 || x === x2 || y === y1 || y === y2) {
        let char = "";
        if (x === x1 && y === y1) char = BOX_CHARS.TOP_LEFT;
        else if (x === x2 && y === y1) char = BOX_CHARS.TOP_RIGHT;
        else if (x === x1 && y === y2) char = BOX_CHARS.BOTTOM_LEFT;
        else if (x === x2 && y === y2) char = BOX_CHARS.BOTTOM_RIGHT;
        else if (y === y1 || y === y2) char = BOX_CHARS.HORIZONTAL;
        else char = BOX_CHARS.VERTICAL;
        points.push({ x, y, char });
      }
    }
  }
  return points;
}

export function getCirclePoints(center: Point, edge: Point): GridPoint[] {
  const dx = edge.x - center.x;
  const dy = edge.y - center.y;
  const radius = Math.sqrt(dx * dx + dy * 2 * (dy * 2)) * 2;

  if (radius < 1) return [{ x: center.x, y: center.y, char: "·" }];

  const result: GridPoint[] = [];
  const minX = Math.floor(center.x - radius / 2) - 1;
  const maxX = Math.ceil(center.x + radius / 2) + 1;
  const minY = Math.floor(center.y - radius / 4) - 1;
  const maxY = Math.ceil(center.y + radius / 4) + 1;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      let brailleCode = 0;

      const dotMap = [
        [0, 0, 0x01],
        [0, 1, 0x02],
        [0, 2, 0x04],
        [1, 0, 0x08],
        [1, 1, 0x10],
        [1, 2, 0x20],
        [0, 3, 0x40],
        [1, 3, 0x80],
      ];

      dotMap.forEach(([dx_sub, dy_sub, bit]) => {
        const subX = x * 2 + dx_sub;
        const subY = y * 4 + dy_sub;
        const centerX_sub = center.x * 2;
        const centerY_sub = center.y * 4;

        const dist = Math.sqrt(
          Math.pow(subX - centerX_sub, 2) + Math.pow(subY - centerY_sub, 2)
        );

        if (Math.abs(dist - radius) < 0.8) {
          brailleCode |= bit;
        }
      });

      if (brailleCode > 0) {
        result.push({
          x,
          y,
          char: String.fromCharCode(0x2800 + brailleCode),
        });
      }
    }
  }

  return result;
}
