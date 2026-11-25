import type { ElkPoint } from "elkjs/lib/elk-api.js";
import type { GridPoint } from "./model.js";

const EPSILON = 1e-6;

export const quantizeRoute = (points: readonly ElkPoint[]): GridPoint[] => {
  const quantized: GridPoint[] = [];
  for (const point of points) {
    const next = { x: Math.floor(point.x + EPSILON), y: Math.floor(point.y + EPSILON) };
    const previous = quantized.at(-1);
    if (previous && previous.x === next.x && previous.y === next.y) continue;
    quantized.push(next);
  }

  return quantized.filter((point, index, values) => {
    if (index === 0 || index === values.length - 1) return true;
    const previous = values[index - 1]!;
    const next = values[index + 1]!;
    return !(
      (previous.x === point.x && point.x === next.x) ||
      (previous.y === point.y && point.y === next.y)
    );
  });
};

export const quantizeCoordinate = (value: number | undefined): number =>
  Math.max(0, Math.floor((value ?? 0) + EPSILON));
