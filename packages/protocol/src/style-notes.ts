import type { CharDeskTextCell } from "./types.js";

export type CharDeskStyleNoteCell = Pick<CharDeskTextCell, "x" | "y" | "color" | "bgColor" | "attrs" | "href"> & {
  width: number;
};

type StyleRegion = {
  x: number;
  y: number;
  width: number;
  endY: number;
  key: string;
  tokens: string[];
};

const styleTokens = (cell: CharDeskStyleNoteCell) => [
  ...(cell.color ? [`fg:${cell.color}`] : []),
  ...(cell.bgColor ? [`bg:${cell.bgColor}`] : []),
  ...(cell.attrs?.bold ? ["bold"] : []),
  ...(cell.attrs?.italic ? ["italic"] : []),
  ...(cell.attrs?.underline ? ["underline"] : []),
  ...(cell.attrs?.strike ? ["strike"] : []),
  ...(cell.attrs?.inverse ? ["inverse"] : []),
  ...(cell.href ? [`link:${JSON.stringify(cell.href)}`] : []),
];

const styleRegions = (cells: readonly CharDeskStyleNoteCell[]) => {
  const runs: StyleRegion[] = [];
  for (const cell of [...cells].sort((a, b) => a.y - b.y || a.x - b.x)) {
    if (cell.width <= 0) continue;
    const tokens = styleTokens(cell);
    if (tokens.length === 0) continue;
    const key = tokens.join("\u0000");
    const previous = runs[runs.length - 1];
    if (previous && previous.y === cell.y && previous.x + previous.width === cell.x && previous.key === key) {
      previous.width += cell.width;
    } else {
      runs.push({ x: cell.x, y: cell.y, width: cell.width, endY: cell.y, key, tokens });
    }
  }
  const grouped = new Map<string, StyleRegion[]>();
  for (const run of runs) {
    const geometryKey = `${run.key}\u0001${run.x}\u0001${run.width}`;
    const regions = grouped.get(geometryKey) ?? [];
    const previous = regions[regions.length - 1];
    if (previous && previous.endY + 1 === run.y) previous.endY = run.y;
    else regions.push({ ...run });
    grouped.set(geometryKey, regions);
  }
  return [...grouped.values()].flat().sort((a, b) => a.y - b.y || a.x - b.x || a.endY - b.endY || a.width - b.width);
};

/** Coordinates are inclusive Cell ranges in the caller's coordinate space. */
export const formatCharDeskStyleNotes = (
  cells: readonly CharDeskStyleNoteCell[],
  options: { coordinates?: "compact" | "explicit"; truncationHint?: string } = {},
): string => {
  const regions = styleRegions(cells);
  if (regions.length === 0) return "styles:none";
  const shown = regions.slice(0, 256);
  const rules = new Map<string, { tokens: string[]; selectors: string[] }>();
  for (const region of shown) {
    const separator = options.coordinates === "explicit" ? ".." : "-";
    const y = region.y === region.endY ? String(region.y) : `${region.y}${separator}${region.endY}`;
    const endX = region.x + region.width - 1;
    const x = region.x === endX ? String(region.x) : `${region.x}${separator}${endX}`;
    const selector = options.coordinates === "explicit" ? `y=${y} x=${x}`
      : `${y}:${x}`;
    const rule = rules.get(region.key) ?? { tokens: region.tokens, selectors: [] };
    rule.selectors.push(selector);
    rules.set(region.key, rule);
  }
  const header = regions.length > shown.length
    ? `styles:${shown.length}/${regions.length} regions · ${options.truncationHint ?? "narrow the viewport"}`
    : "styles:";
  return [header, ...[...rules.values()].map(({ tokens, selectors }) =>
    `  ${selectors.join(",")}{${tokens.join(";")}}`,
  )].join("\n");
};
