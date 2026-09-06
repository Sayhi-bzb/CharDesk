import type { CharDeskCellPrimitive } from "@chardesk/rendering";
import type { HalfCellThumb } from "./types.js";

export const thumbAxis = (track: number, visible: number, content: number, offset: number): HalfCellThumb => {
  const length = Math.min(track * 2, Math.max(2, Math.floor(track * 2 * visible / Math.max(1, content))));
  const maximum = Math.max(0, content - visible);
  return {
    length,
    start: maximum === 0 ? 0 : Math.round((track * 2 - length) * Math.max(0, Math.min(maximum, offset)) / maximum),
  };
};

export const thumbCellSpan = (thumb: HalfCellThumb) => ({
  start: Math.floor(thumb.start / 2),
  length: Math.ceil((thumb.start + thumb.length) / 2) - Math.floor(thumb.start / 2),
});

export const thumbGlyph = (thumb: HalfCellThumb, cell: number, horizontal: boolean): string => {
  const start = Math.max(cell * 2, thumb.start);
  const end = Math.min(cell * 2 + 2, thumb.start + thumb.length);
  if (end <= start) return " ";
  if (end - start === 2) return "█";
  return start === cell * 2 ? (horizontal ? "▌" : "▀") : (horizontal ? "▐" : "▄");
};

export const thumbPrimitive = (
  thumb: HalfCellThumb,
  cell: number,
  horizontal: boolean
): CharDeskCellPrimitive => {
  const start = Math.max(cell * 2, thumb.start) - cell * 2;
  const end = Math.min(cell * 2 + 2, thumb.start + thumb.length) - cell * 2;
  return {
    kind: "fill",
    regions: horizontal
      ? [{ x: start / 2, y: 0, width: Math.max(0, end - start) / 2, height: 1 }]
      : [{ x: 0, y: start / 2, width: 1, height: Math.max(0, end - start) / 2 }],
  };
};

export const cellCenter = (point: { x: number; y: number }) => ({ x: point.x + 0.5, y: point.y + 0.5 });
