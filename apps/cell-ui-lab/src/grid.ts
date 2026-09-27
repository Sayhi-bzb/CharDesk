export type Ink = "dim" | "base" | "cyan" | "lime" | "amber" | "red" | "violet";
export type Cell = Readonly<{ glyph: string; ink: Ink }>;
export type Span = Readonly<{ text: string; ink: Ink }>;
export type Frame = readonly (readonly Span[])[];

const emptyCell: Cell = { glyph: " ", ink: "base" };

export class GridCanvas {
  readonly width: number;
  readonly height: number;
  private readonly cells: Cell[][];

  constructor(width: number, height: number, fill = " ", ink: Ink = "base") {
    this.width = width;
    this.height = height;
    this.cells = Array.from({ length: height }, () =>
      Array.from({ length: width }, () => fill === " " ? emptyCell : { glyph: fill, ink }));
  }

  put(x: number, y: number, glyph: string, ink: Ink = "base") {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.cells[y]![x] = { glyph, ink };
  }

  text(x: number, y: number, value: string, ink: Ink = "base") {
    [...value].forEach((glyph, index) => this.put(x + index, y, glyph, ink));
  }

  horizontal(x1: number, x2: number, y: number, glyph = "─", ink: Ink = "dim") {
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) this.put(x, y, glyph, ink);
  }

  vertical(x: number, y1: number, y2: number, glyph = "│", ink: Ink = "dim") {
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) this.put(x, y, glyph, ink);
  }

  box(x: number, y: number, width: number, height: number, ink: Ink = "dim") {
    if (width < 2 || height < 2) return;
    this.horizontal(x + 1, x + width - 2, y, "─", ink);
    this.horizontal(x + 1, x + width - 2, y + height - 1, "─", ink);
    this.vertical(x, y + 1, y + height - 2, "│", ink);
    this.vertical(x + width - 1, y + 1, y + height - 2, "│", ink);
    this.put(x, y, "┌", ink);
    this.put(x + width - 1, y, "┐", ink);
    this.put(x, y + height - 1, "└", ink);
    this.put(x + width - 1, y + height - 1, "┘", ink);
  }

  frame(): Frame {
    return this.cells.map((row) => {
      const spans: Span[] = [];
      for (const cell of row) {
        const last = spans.at(-1);
        if (last?.ink === cell.ink) spans[spans.length - 1] = { text: last.text + cell.glyph, ink: cell.ink };
        else spans.push({ text: cell.glyph, ink: cell.ink });
      }
      return spans;
    });
  }
}

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function hash(seed: number, x: number, y = 0): number {
  let n = (seed ^ Math.imul(x + 1, 0x45d9f3b) ^ Math.imul(y + 1, 0x119de1f3)) >>> 0;
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return ((n ^ (n >>> 16)) >>> 0) / 0x1_0000_0000;
}
