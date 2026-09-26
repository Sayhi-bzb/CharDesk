import { getGraphemeCellWidth, iterateGraphemes } from "@chardesk/protocol";

export type CellTextGlyphPlacement = Readonly<{
  segment: string;
  offset: number;
  column: number;
  row: number;
  width: number;
}>;

type PreparedGlyph = Readonly<{ index: number; segment: string; width: number }>;

const MIN_PREPARED_LENGTH = 64;
const MAX_PREPARED_LENGTH = 16_384;
const MAX_PREPARED_ENTRIES = 256;
const MAX_PREPARED_SOURCE_LENGTH = 262_144;
const MAX_PREPARED_GLYPHS = 65_536;
const MAX_PROBATION_ENTRIES = 256;
const MAX_PROBATION_SOURCE_LENGTH = 131_072;
const preparedTexts = new Map<string, readonly PreparedGlyph[]>();
const probation = new Set<string>();
let preparedSourceLength = 0;
let preparedGlyphs = 0;
let probationSourceLength = 0;

const preparedFor = (text: string): readonly PreparedGlyph[] | null => {
  const cached = preparedTexts.get(text);
  if (cached) {
    preparedTexts.delete(text);
    preparedTexts.set(text, cached);
    return cached;
  }
  if (!probation.delete(text)) {
    while (probation.size >= MAX_PROBATION_ENTRIES
      || probationSourceLength + text.length > MAX_PROBATION_SOURCE_LENGTH) {
      const oldest = probation.values().next().value!;
      probation.delete(oldest);
      probationSourceLength -= oldest.length;
    }
    probation.add(text);
    probationSourceLength += text.length;
    return null;
  }
  probationSourceLength -= text.length;
  const glyphs: PreparedGlyph[] = [];
  for (const { index, segment } of iterateGraphemes(text)) {
    glyphs.push({ index, segment, width: segment === "\n" ? 0 : getGraphemeCellWidth(segment) });
  }
  while (preparedTexts.size >= MAX_PREPARED_ENTRIES
    || preparedSourceLength + text.length > MAX_PREPARED_SOURCE_LENGTH
    || preparedGlyphs + glyphs.length > MAX_PREPARED_GLYPHS) {
    const oldest = preparedTexts.keys().next().value!;
    const removed = preparedTexts.get(oldest)!;
    preparedTexts.delete(oldest);
    preparedSourceLength -= oldest.length;
    preparedGlyphs -= removed.length;
  }
  preparedTexts.set(text, glyphs);
  preparedSourceLength += text.length;
  preparedGlyphs += glyphs.length;
  return glyphs;
};

const walkUncachedRows = (
  text: string,
  widthLimit: number,
  onGlyph?: (placement: CellTextGlyphPlacement) => boolean | void,
): Readonly<{ width: number; height: number }> => {
  let column = 0;
  let row = 0;
  let widest = 0;
  for (const { index, segment } of iterateGraphemes(text)) {
    if (segment === "\n") {
      widest = Math.max(widest, column);
      column = 0;
      row += 1;
      continue;
    }
    const width = getGraphemeCellWidth(segment);
    if (column > 0 && column + width > widthLimit) {
      widest = Math.max(widest, column);
      column = 0;
      row += 1;
    }
    if (onGlyph?.({ segment, offset: index, column, row, width }) === false) break;
    column += width;
  }
  return { width: Math.max(widest, column), height: row + 1 };
};

/** Shared Cell geometry for measuring and painting ordinary multiline text. */
export const walkCellTextRows = (
  text: string,
  widthLimit: number,
  onGlyph?: (placement: CellTextGlyphPlacement) => boolean | void,
): Readonly<{ width: number; height: number }> => {
  if (text.length < MIN_PREPARED_LENGTH || text.length > MAX_PREPARED_LENGTH) {
    return walkUncachedRows(text, widthLimit, onGlyph);
  }
  const prepared = preparedFor(text);
  if (!prepared) return walkUncachedRows(text, widthLimit, onGlyph);
  let column = 0;
  let row = 0;
  let widest = 0;
  for (const { index, segment, width } of prepared) {
    if (segment === "\n") {
      widest = Math.max(widest, column);
      column = 0;
      row += 1;
      continue;
    }
    if (column > 0 && column + width > widthLimit) {
      widest = Math.max(widest, column);
      column = 0;
      row += 1;
    }
    if (onGlyph?.({ segment, offset: index, column, row, width }) === false) break;
    column += width;
  }
  return { width: Math.max(widest, column), height: row + 1 };
};

const MIN_INDEXED_LENGTH = 1_024;
const MIN_INDEXED_ROW = 32;
const MAX_INDEXED_LENGTH = 1_000_000;
const MAX_INDEXED_ROWS = 100_000;
const MAX_INDEXED_ENTRIES = 16;
const MAX_INDEXED_SOURCE_LENGTH = 2_000_000;
type GlyphRowIndex = Readonly<{ rows: readonly number[]; offsets: readonly number[] }>;
const indexedRows = new Map<string, Map<number, GlyphRowIndex | null>>();
let indexedEntries = 0;
let indexedSourceLength = 0;

const rowStartsFor = (text: string, widthLimit: number): GlyphRowIndex | null => {
  const widths = indexedRows.get(text);
  const cached = widths?.get(widthLimit);
  if (cached !== undefined) {
    indexedRows.delete(text);
    indexedRows.set(text, widths!);
    return cached;
  }
  const rows: number[] = [];
  const offsets: number[] = [];
  let tooManyRows = false;
  walkCellTextRows(text, widthLimit, ({ row, offset }) => {
    if (rows[rows.length - 1] === row) return;
    if (rows.length >= MAX_INDEXED_ROWS) {
      tooManyRows = true;
      return false;
    }
    rows.push(row);
    offsets.push(offset);
  });
  const starts = tooManyRows ? null : { rows, offsets };
  while (indexedEntries >= MAX_INDEXED_ENTRIES
    || indexedSourceLength + text.length > MAX_INDEXED_SOURCE_LENGTH) {
    const oldest = indexedRows.keys().next().value!;
    const removed = indexedRows.get(oldest)!;
    indexedRows.delete(oldest);
    indexedEntries -= removed.size;
    indexedSourceLength -= oldest.length * removed.size;
  }
  const nextWidths = indexedRows.get(text) ?? new Map<number, GlyphRowIndex | null>();
  nextWidths.set(widthLimit, starts);
  indexedRows.delete(text);
  indexedRows.set(text, nextWidths);
  indexedEntries += 1;
  indexedSourceLength += text.length;
  return starts;
};

const walkFullWindow = (
  text: string,
  widthLimit: number,
  firstRow: number,
  endRow: number,
  onGlyph: (placement: CellTextGlyphPlacement) => boolean | void,
): void => {
  walkCellTextRows(text, widthLimit, (placement) => {
    if (placement.row >= endRow) return false;
    if (placement.row >= firstRow) return onGlyph(placement);
  });
};

/** Visit only visible rows of static text, retaining the full walk as the small-text fallback. */
export const walkCellTextRowsInRange = (
  text: string,
  widthLimit: number,
  firstRow: number,
  endRow: number,
  onGlyph: (placement: CellTextGlyphPlacement) => boolean | void,
): void => {
  if (firstRow >= endRow) return;
  if (text.length < MIN_INDEXED_LENGTH || text.length > MAX_INDEXED_LENGTH
    || firstRow < MIN_INDEXED_ROW || widthLimit < 2 || !Number.isFinite(widthLimit)) {
    walkFullWindow(text, widthLimit, firstRow, endRow, onGlyph);
    return;
  }
  const starts = rowStartsFor(text, widthLimit);
  if (!starts) {
    walkFullWindow(text, widthLimit, firstRow, endRow, onGlyph);
    return;
  }
  let low = 0;
  let high = starts.rows.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (starts.rows[middle]! < firstRow) low = middle + 1;
    else high = middle;
  }
  if (low >= starts.rows.length || starts.rows[low]! >= endRow) return;
  const startOffset = starts.offsets[low]!;
  let row = starts.rows[low]!;
  let column = 0;
  for (const { index, segment } of iterateGraphemes(text.slice(startOffset))) {
    if (segment === "\n") {
      column = 0;
      row += 1;
      if (row >= endRow) break;
      continue;
    }
    const width = getGraphemeCellWidth(segment);
    if (column > 0 && column + width > widthLimit) {
      column = 0;
      row += 1;
      if (row >= endRow) break;
    }
    if (onGlyph({ segment, offset: startOffset + index, column, row, width }) === false) break;
    column += width;
  }
};
