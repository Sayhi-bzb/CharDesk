import { getGraphemeCellWidth, getTextCellWidth } from "@chardesk/protocol";
import type { CanvasSurfaceReader } from "./cell-plane/model";
import { isCanvasReadViewport, type CanvasReadViewport } from "./readViewport";
import { readCanvasTextRegion } from "./textRegion";

export type CanvasSearchPosition = readonly [x: number, y: number];
export type CanvasSearchMatch = Readonly<{ viewport: CanvasReadViewport; content: string }>;
export type CanvasSearchResult = Readonly<{ matches: readonly CanvasSearchMatch[]; next: CanvasSearchPosition | null }>;
export type CanvasSearchOptions = Readonly<{ viewport?: CanvasReadViewport; after?: CanvasSearchPosition }>;

export const isCanvasSearchQuery = (value: unknown): value is string =>
  typeof value === "string" && /\S/u.test(value) && !/[\p{Cc}\u2028\u2029]/u.test(value);
export const isCanvasSearchPosition = (value: unknown): value is CanvasSearchPosition =>
  Array.isArray(value) && value.length === 2 && value.every(Number.isSafeInteger);

const PAGE_SIZE = 20;
const WINDOW_WIDTH = 32;
const WINDOW_HEIGHT = 5;
const windowOrigin = (coordinate: number, offset: number, size: number) =>
  Math.max(-Number.MAX_SAFE_INTEGER, Math.min(Number.MAX_SAFE_INTEGER - size, coordinate - offset));
type Glyph = Readonly<{ x: number; char: string }>;

/** Search sparse rows at original precision, never allocating their empty envelope. */
export const searchCanvasSurface = (
  surface: CanvasSurfaceReader,
  query: string,
  options: CanvasSearchOptions = {},
): CanvasSearchResult => {
  if (!isCanvasSearchQuery(query) || (options.viewport !== undefined && !isCanvasReadViewport(options.viewport))
    || (options.after !== undefined && !isCanvasSearchPosition(options.after))) {
    throw new Error("Expected non-blank single-line Unicode query, optional viewport [x,y,width,height], and after [x,y].");
  }
  const matches: CanvasSearchMatch[] = [];
  let lastPosition: CanvasSearchPosition | null = null;
  const queryWidth = getTextCellWidth(query);
  const { viewport, after } = options;
  const region = viewport ? { x: viewport[0], y: viewport[1], width: viewport[2], height: viewport[3] } : undefined;

  const searchRun = (glyphs: readonly Glyph[], y: number): boolean => {
    if (!glyphs.length) return false;
    let offset = 0;
    const boundaries = new Map<number, number>([[0, 0]]);
    for (const [index, glyph] of glyphs.entries()) {
      offset += glyph.char.length;
      boundaries.set(offset, index + 1);
    }
    const text = glyphs.map((glyph) => glyph.char).join("");
    let from = 0;
    while (from < text.length) {
      const hit = text.indexOf(query, from);
      if (hit < 0) break;
      const end = hit + query.length;
      const first = boundaries.get(hit), last = boundaries.get(end);
      if (first === undefined || last === undefined) { from = hit + 1; continue; }
      from = end;
      const x = glyphs[first].x;
      if (after && (y < after[1] || (y === after[1] && x <= after[0]))) continue;
      if (matches.length === PAGE_SIZE) return true;
      const left = windowOrigin(x, 8, WINDOW_WIDTH), top = windowOrigin(y, 2, WINDOW_HEIGHT);
      const preview = readCanvasTextRegion(surface, { x: left, y: top, width: WINDOW_WIDTH, height: WINDOW_HEIGHT });
      matches.push({ viewport: [left, top, WINDOW_WIDTH, WINDOW_HEIGHT], content: preview.text.map((row) => row.join("")).join("\n") });
      lastPosition = [x, y];
    }
    return false;
  };
  const finish = (more: boolean): CanvasSearchResult => ({
    matches,
    next: more ? lastPosition : null,
  });

  for (const row of surface.rows(region)) {
    if (after && row.y < after[1]) continue;
    let run: Glyph[] = [];
    let previousEnd: number | null = null;
    for (const span of row.spans) {
      let x = span.x;
      for (const cell of span.cells) {
        const width = getGraphemeCellWidth(cell.char);
        if (width > 0 && (!region || (x >= region.x && x + width <= region.x + region.width))) {
          const gap = previousEnd === null ? 0 : x - previousEnd;
          if (gap >= queryWidth || gap < 0) {
            if (searchRun(run, row.y)) return finish(true);
            run = [];
          } else if (previousEnd !== null) {
            for (let offset = 0; offset < gap; offset++) run.push({ x: previousEnd + offset, char: " " });
          }
          run.push({ x, char: cell.char });
          previousEnd = x + width;
        }
        x += width;
      }
    }
    if (searchRun(run, row.y)) return finish(true);
  }
  return finish(false);
};
