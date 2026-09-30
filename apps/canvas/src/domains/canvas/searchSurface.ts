import { getGraphemeCellWidth, getTextCellWidth } from "@chardesk/protocol";
import { RE2JS } from "re2js";
import type { CanvasSurfaceReader, CellPlaneRow } from "./cell-plane/model";
import { isCanvasReadViewport, type CanvasReadViewport } from "./readViewport";
import { readCanvasTextRegion } from "./textRegion";

export type CanvasSearchPosition = readonly [x: number, y: number];
export type CanvasSearchMatch = Readonly<{ viewport: CanvasReadViewport; content: string }>;
export type CanvasSearchResult = Readonly<{ matches: readonly CanvasSearchMatch[]; next: CanvasSearchPosition | null }>;
export type CanvasSearchOptions = Readonly<{
  viewport?: CanvasReadViewport;
  after?: CanvasSearchPosition;
  regex?: boolean;
  ignoreCase?: boolean;
}>;

const PAGE_SIZE = 20;
const WINDOW_WIDTH = 32;
const WINDOW_HEIGHT = 5;
const MAX_QUERY_LENGTH = 4096;
const MAX_TEMPLATE_ROWS = 64;
const MAX_REGEX_ROW_WIDTH = 16384;
const SCAN_BUDGET = 2_000_000;
const TIME_BUDGET_MS = 250;

export class CanvasSearchError extends Error {
  readonly code: "invalid_input" | "search_limit";
  constructor(code: "invalid_input" | "search_limit", message: string) {
    super(message);
    this.code = code;
  }
}

export const isCanvasSearchQuery = (value: unknown): value is string => {
  if (typeof value !== "string" || value.length > MAX_QUERY_LENGTH) return false;
  const lines = value.split("\n");
  return lines.length <= MAX_TEMPLATE_ROWS && lines.every((line) => /\S/u.test(line)
    && !/[\p{Cc}\u2028\u2029]/u.test(line));
};
export const isCanvasSearchPosition = (value: unknown): value is CanvasSearchPosition =>
  Array.isArray(value) && value.length === 2 && value.every(Number.isSafeInteger);

const windowOrigin = (coordinate: number, offset: number, size: number) =>
  Math.max(-Number.MAX_SAFE_INTEGER, Math.min(Number.MAX_SAFE_INTEGER - size, coordinate - offset));
type Glyph = Readonly<{ x: number; char: string }>;
type Run = Readonly<{ text: string; positions: ReadonlyMap<number, number>; offsets: ReadonlyMap<number, number> }>;

/** Literal and regex matching share Cell boundaries and spatial template verification. */
export const searchCanvasSurface = (
  surface: CanvasSurfaceReader,
  query: string,
  options: CanvasSearchOptions = {},
): CanvasSearchResult => {
  if (!isCanvasSearchQuery(query) || (options.viewport !== undefined && !isCanvasReadViewport(options.viewport))
    || (options.after !== undefined && !isCanvasSearchPosition(options.after))
    || (options.regex !== undefined && typeof options.regex !== "boolean")
    || (options.ignoreCase !== undefined && typeof options.ignoreCase !== "boolean")) {
    throw new CanvasSearchError("invalid_input", "Expected non-blank template rows, optional boolean regex/ignoreCase, viewport [x,y,width,height], and after [x,y].");
  }
  const lines = query.split("\n");
  let patterns: Array<RE2JS | null>;
  try {
    patterns = lines.map((line) => options.regex || options.ignoreCase
      ? RE2JS.compile(options.regex ? line : RE2JS.quote(line), options.ignoreCase ? RE2JS.CASE_INSENSITIVE : 0)
      : null);
  } catch {
    throw new CanvasSearchError("invalid_input", "Invalid or unsupported RE2 pattern; lookaround and backreferences are not supported.");
  }
  const { viewport, after } = options;
  const region = viewport ? { x: viewport[0], y: viewport[1], width: viewport[2], height: viewport[3] } : undefined;
  const gapLimit = options.regex ? Infinity : Math.max(...lines.map(getTextCellWidth));
  const started = performance.now();
  let remaining = SCAN_BUDGET;
  const spend = (amount: number) => {
    remaining -= amount;
    if (remaining < 0 || performance.now() - started > TIME_BUDGET_MS) {
      throw new CanvasSearchError("search_limit", "Search budget exceeded. Narrow viewport and retry; no partial results were returned.");
    }
  };
  const makeRun = (glyphs: readonly Glyph[]): Run => {
    const positions = new Map<number, number>();
    const offsets = new Map<number, number>();
    let offset = 0;
    for (const glyph of glyphs) {
      positions.set(offset, glyph.x);
      offsets.set(glyph.x, offset);
      offset += glyph.char.length;
    }
    const last = glyphs[glyphs.length - 1];
    positions.set(offset, last.x + getGraphemeCellWidth(last.char));
    return { text: glyphs.map(({ char }) => char).join(""), positions, offsets };
  };
  const runsFor = (row: CellPlaneRow): Run[] => {
    const runs: Run[] = [];
    let glyphs: Glyph[] = [];
    let previousEnd: number | null = null;
    let start = 0;
    for (const span of row.spans) {
      let x = span.x;
      for (const cell of span.cells) {
        spend(1);
        const width = getGraphemeCellWidth(cell.char);
        if (width > 0 && (!region || (x >= region.x && x + width <= region.x + region.width))) {
          const gap = previousEnd === null ? 0 : x - previousEnd;
          if (gap >= gapLimit || gap < 0) {
            if (glyphs.length) runs.push(makeRun(glyphs));
            glyphs = [];
          }
          if (!glyphs.length) start = x;
          if (options.regex && x + width - start > MAX_REGEX_ROW_WIDTH) {
            throw new CanvasSearchError("search_limit", "Regex row envelope exceeds 16384 Cells. Narrow viewport; rows are never silently split.");
          }
          if (glyphs.length && previousEnd !== null) {
            spend(gap);
            for (let offset = 0; offset < gap; offset++) glyphs.push({ x: previousEnd + offset, char: " " });
          }
          glyphs.push({ x, char: cell.char });
          previousEnd = x + width;
        }
        x += width;
      }
    }
    if (glyphs.length) runs.push(makeRun(glyphs));
    return runs;
  };
  const find = (run: Run, line: number, from: number): readonly [number, number] | null => {
    spend(patterns[line] ? run.text.length - from + 1 : 1);
    const pattern = patterns[line];
    if (pattern) {
      const matcher = pattern.matcher(run.text);
      const found = matcher.find(from);
      spend(0);
      return found ? [matcher.start(), matcher.end()] : null;
    }
    const hit = run.text.indexOf(lines[line], from);
    return hit < 0 ? null : [hit, hit + lines[line].length];
  };
  const cache = new Map<number, Run[]>();
  const templateBounds = lines.length > 1 ? region ?? surface.getContentBounds() : null;
  const rowAt = (y: number): Run[] => {
    const cached = cache.get(y);
    if (cached) return cached;
    const row = templateBounds && [...surface.rows({ x: templateBounds.x, y, width: templateBounds.width, height: 1 })].find((candidate) => candidate.y === y);
    const runs = row ? runsFor(row) : [];
    cache.set(y, runs);
    return runs;
  };
  const followsTemplate = (x: number, y: number) => {
    for (let line = 1; line < lines.length; line++) {
      const targetY = y + line;
      if (!Number.isSafeInteger(targetY) || (region && targetY >= region.y + region.height)) return false;
      const matched = rowAt(targetY).some((run) => {
        const offset = run.offsets.get(x);
        if (offset === undefined) return false;
        const hit = find(run, line, offset);
        return hit !== null && hit[0] === offset && hit[1] > offset && run.positions.has(hit[1]);
      });
      if (!matched) return false;
    }
    return true;
  };
  const matches: CanvasSearchMatch[] = [];
  let lastPosition: CanvasSearchPosition | null = null;
  for (const row of surface.rows(region)) {
    spend(1);
    if (after && row.y < after[1]) continue;
    const runs = cache.get(row.y) ?? runsFor(row);
    for (const run of runs) {
      let from = 0;
      while (from < run.text.length) {
        const hit = find(run, 0, from);
        if (!hit) break;
        const [start, end] = hit;
        from = start + 1;
        const x = run.positions.get(start);
        if (end <= start || x === undefined || !run.positions.has(end)) continue;
        if (!followsTemplate(x, row.y)) continue;
        from = end;
        if (after && row.y === after[1] && x <= after[0]) continue;
        if (matches.length === PAGE_SIZE) return { matches, next: lastPosition };
        const left = windowOrigin(x, 8, WINDOW_WIDTH), top = windowOrigin(row.y, 2, WINDOW_HEIGHT);
        const preview = readCanvasTextRegion(surface, { x: left, y: top, width: WINDOW_WIDTH, height: WINDOW_HEIGHT });
        matches.push({ viewport: [left, top, WINDOW_WIDTH, WINDOW_HEIGHT], content: preview.text.map((line) => line.join("")).join("\n") });
        lastPosition = [x, row.y];
      }
    }
    for (const y of cache.keys()) if (y <= row.y) cache.delete(y);
  }
  spend(0);
  return { matches, next: null };
};
