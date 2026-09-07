import { getGraphemeCellWidth, iterateGraphemes } from "@chardesk/protocol";
import type {
  Cell,
  CellRect,
  CellSize,
  CellTextStyle,
  WidgetId,
} from "./types.js";

const EMPTY_STYLE: CellTextStyle = Object.freeze({});
export type CellComposition = "replace" | "over";

export type CellTextOptions = Readonly<{
  region?: CellRect;
  trimEnd?: boolean;
}>;

const emptyCell = (): Cell => ({
  text: " ",
  width: 1,
  continuation: false,
  ownerId: null,
  style: EMPTY_STYLE,
});

export class CellBuffer {
  readonly width: number;
  readonly height: number;
  readonly #cells: Cell[];

  constructor(size: CellSize) {
    if (!Number.isInteger(size.width) || !Number.isInteger(size.height) || size.width < 0 || size.height < 0) {
      throw new RangeError("CellBuffer dimensions must be non-negative integers.");
    }
    this.width = size.width;
    this.height = size.height;
    this.#cells = Array.from({ length: size.width * size.height }, emptyCell);
  }

  get(x: number, y: number): Cell | undefined {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return undefined;
    return this.#cells[y * this.width + x];
  }

  clone(): CellBuffer {
    const copy = new CellBuffer({ width: this.width, height: this.height });
    for (let index = 0; index < this.#cells.length; index += 1) {
      copy.#cells[index] = this.#cells[index]!;
    }
    return copy;
  }

  clear(rect: CellRect): void {
    const left = Math.max(0, rect.x);
    const top = Math.max(0, rect.y);
    const right = Math.min(this.width, rect.x + rect.width);
    const bottom = Math.min(this.height, rect.y + rect.height);
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) this.#clearWideCellAt(x, y);
    }
  }

  writeGrapheme(
    x: number,
    y: number,
    text: string,
    ownerId: WidgetId,
    style: CellTextStyle = EMPTY_STYLE,
    clip?: CellRect,
    composition: CellComposition = "replace"
  ): number {
    const width = getGraphemeCellWidth(text);
    if (!this.#contains(x, y, clip) || (width === 2 && !this.#contains(x + 1, y, clip))) return width;
    const styles = Array.from({ length: width }, (_, offset) => {
      const backgroundColor = this.get(x + offset, y)?.style.backgroundColor;
      return composition === "over" && style.backgroundColor === undefined && backgroundColor !== undefined
        ? { ...style, backgroundColor }
        : style;
    });
    this.#clearWideCellAt(x, y, composition === "over");
    if (width === 2) this.#clearWideCellAt(x + 1, y, composition === "over");
    this.#cells[y * this.width + x] = {
      text,
      width,
      continuation: false,
      ownerId,
      style: styles[0]!,
    };
    if (width === 2) {
      this.#cells[y * this.width + x + 1] = {
        text: "",
        width: 1,
        continuation: true,
        ownerId,
        style: styles[1]!,
      };
    }
    return width;
  }

  writeText(
    x: number,
    y: number,
    text: string,
    ownerId: WidgetId,
    style: CellTextStyle = EMPTY_STYLE,
    clip?: CellRect,
    maxWidth = Number.POSITIVE_INFINITY,
    composition: CellComposition = "replace"
  ): void {
    let cursor = x;
    const end = x + Math.max(0, maxWidth);
    for (const { segment } of iterateGraphemes(text)) {
      if (segment === "\n") break;
      const width = getGraphemeCellWidth(segment);
      if (cursor + width > end) break;
      this.writeGrapheme(cursor, y, segment, ownerId, style, clip, composition);
      cursor += width;
    }
  }

  toLines(options: CellTextOptions = {}): string[] {
    const region = this.normalizeRegion(options.region);
    const lines: string[] = [];
    for (let y = region.y; y < region.y + region.height; y += 1) {
      let line = "";
      for (let x = region.x; x < region.x + region.width; x += 1) {
        const cell = this.get(x, y);
        if (!cell) continue;
        if (cell.continuation) {
          if (x === region.x) line += " ";
          continue;
        }
        if (cell.width === 2 && x + 1 >= region.x + region.width) {
          line += " ";
          continue;
        }
        line += cell.text;
      }
      lines.push(options.trimEnd ? line.replace(/ +$/u, "") : line);
    }
    return lines;
  }

  toText(options: CellTextOptions = {}): string {
    return this.toLines(options).join("\n");
  }

  normalizeRegion(requested?: CellRect): CellRect {
    if (!requested) return { x: 0, y: 0, width: this.width, height: this.height };
    const clamp = (value: number, min: number, max: number) =>
      Math.max(min, Math.min(max, Math.trunc(value)));
    const left = clamp(requested.x, 0, this.width);
    const top = clamp(requested.y, 0, this.height);
    const right = clamp(requested.x + Math.max(0, requested.width), left, this.width);
    const bottom = clamp(requested.y + Math.max(0, requested.height), top, this.height);
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  #contains(x: number, y: number, clip?: CellRect): boolean {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
    if (!clip) return true;
    return x >= clip.x && y >= clip.y && x < clip.x + clip.width && y < clip.y + clip.height;
  }

  #clearWideCellAt(x: number, y: number, preserveBackground = false): void {
    const cell = this.get(x, y);
    if (!cell) return;
    const clear = (column: number) => {
      const backgroundColor = this.get(column, y)?.style.backgroundColor;
      this.#cells[y * this.width + column] = {
        ...emptyCell(),
        ...(preserveBackground && backgroundColor !== undefined ? { style: { backgroundColor } } : {}),
      };
    };
    if (cell.continuation && x > 0) clear(x - 1);
    if (cell.width === 2 && x + 1 < this.width) clear(x + 1);
    clear(x);
  }
}
