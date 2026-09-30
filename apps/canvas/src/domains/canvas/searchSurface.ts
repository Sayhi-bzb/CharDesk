import { getGraphemeCellWidth, getTextCellWidth } from "@chardesk/protocol";
import type { CanvasSurfaceReader } from "./cell-plane/model";
import { isCanvasReadViewport, type CanvasReadViewport } from "./readViewport";

export type CanvasSearchPosition = readonly [x: number, y: number];
export type CanvasSearchMatch = Readonly<{ bounds: CanvasReadViewport; text: string }>;
export type CanvasSearchResult = Readonly<{ matches: readonly CanvasSearchMatch[]; next: CanvasSearchPosition | null }>;
export type CanvasSearchOptions = Readonly<{ viewport?: CanvasReadViewport; after?: CanvasSearchPosition }>;

export const isCanvasSearchQuery = (value: unknown): value is string =>
  typeof value === "string" && /\S/u.test(value) && !/[\p{Cc}\u2028\u2029]/u.test(value);
export const isCanvasSearchPosition = (value: unknown): value is CanvasSearchPosition =>
  Array.isArray(value) && value.length === 2 && value.every(Number.isSafeInteger);

const PAGE_SIZE = 20;
const CONTEXT_CELLS = 20;
type Glyph = Readonly<{ x: number; char: string; width: number }>;

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
  const queryWidth = getTextCellWidth(query);
  const { viewport, after } = options;
  const region = viewport ? { x: viewport[0], y: viewport[1], width: viewport[2], height: viewport[3] } : undefined;

  const searchRun = (glyphs: readonly Glyph[], y: number): boolean => {
    if (!glyphs.length) return false;
    const offsets = [0];
    const boundaries = new Map<number, number>([[0, 0]]);
    for (const [index, glyph] of glyphs.entries()) {
      const end = offsets[index] + glyph.char.length;
      offsets.push(end);
      boundaries.set(end, index + 1);
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
      const right = glyphs[last - 1].x + glyphs[last - 1].width;
      let contextStart = first, contextEnd = last;
      while (contextStart > 0 && glyphs[contextStart - 1].x >= x - CONTEXT_CELLS) contextStart--;
      while (contextEnd < glyphs.length && glyphs[contextEnd].x + glyphs[contextEnd].width <= right + CONTEXT_CELLS) contextEnd++;
      matches.push({ bounds: [x, y, right - x, 1], text: text.slice(offsets[contextStart], offsets[contextEnd]) });
    }
    return false;
  };
  const finish = (more: boolean): CanvasSearchResult => ({
    matches,
    next: more ? [matches[matches.length - 1].bounds[0], matches[matches.length - 1].bounds[1]] : null,
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
            for (let offset = 0; offset < gap; offset++) run.push({ x: previousEnd + offset, char: " ", width: 1 });
          }
          run.push({ x, char: cell.char, width });
          previousEnd = x + width;
        }
        x += width;
      }
    }
    if (searchRun(run, row.y)) return finish(true);
  }
  return finish(false);
};
