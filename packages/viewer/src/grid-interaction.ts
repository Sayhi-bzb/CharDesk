import type { CharDeskTextCell, ParsedCharDeskText } from "@chardesk/protocol";
import { resolveCellRangeBounds } from "@chardesk/cell-core";

export type CharDeskGridPoint = Readonly<{
  x: number;
  y: number;
}>;

export type CharDeskGridRect = Readonly<{
  left: number;
  top: number;
  right: number;
  bottom: number;
}>;

export type CharDeskGridSelection = Readonly<{
  anchor: CharDeskGridPoint;
  focus: CharDeskGridPoint;
  rect: CharDeskGridRect;
}>;

export type CharDeskGridIndex = {
  document: ParsedCharDeskText;
  cells: Map<string, CharDeskTextCell>;
  followers: Map<string, CharDeskTextCell>;
};

const key = (x: number, y: number) => `${x},${y}`;

export const createCharDeskGridIndex = (
  document: ParsedCharDeskText
): CharDeskGridIndex => {
  const cells = new Map<string, CharDeskTextCell>();
  const followers = new Map<string, CharDeskTextCell>();
  for (const cell of document.cells) {
    cells.set(key(cell.x, cell.y), cell);
    if (cell.width === 2) followers.set(key(cell.x + 1, cell.y), cell);
  }
  return { document, cells, followers };
};

export const hasCharDeskGrid = (index: CharDeskGridIndex) =>
  index.document.width > 0 && index.document.height > 0;

export const getCharDeskGridCell = (
  index: CharDeskGridIndex,
  point: CharDeskGridPoint
) => index.cells.get(key(point.x, point.y)) ?? index.followers.get(key(point.x, point.y));

export const normalizeCharDeskGridPoint = (
  index: CharDeskGridIndex,
  point: CharDeskGridPoint
): CharDeskGridPoint | null => {
  if (!hasCharDeskGrid(index)) return null;
  const x = Math.max(0, Math.min(index.document.width - 1, Math.floor(point.x)));
  const y = Math.max(0, Math.min(index.document.height - 1, Math.floor(point.y)));
  const follower = index.followers.get(key(x, y));
  return follower ? { x: follower.x, y } : { x, y };
};

export const hitTestCharDeskGridPoint = (
  index: CharDeskGridIndex,
  point: CharDeskGridPoint
): CharDeskGridPoint | null => {
  if (!hasCharDeskGrid(index)) return null;
  const x = Math.floor(point.x);
  const y = Math.floor(point.y);
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    x < 0 ||
    x >= index.document.width ||
    y < 0 ||
    y >= index.document.height
  ) {
    return null;
  }
  const follower = index.followers.get(key(x, y));
  return follower ? { x: follower.x, y } : { x, y };
};

export const moveCharDeskGridPoint = (
  index: CharDeskGridIndex,
  point: CharDeskGridPoint,
  delta: CharDeskGridPoint
): CharDeskGridPoint | null => {
  const current = normalizeCharDeskGridPoint(index, point);
  if (!current) return null;
  let x = current.x + delta.x;
  const y = current.y + delta.y;
  if (delta.x > 0) {
    const cell = index.cells.get(key(current.x, current.y));
    if (cell?.width === 2) x = current.x + 2;
  }
  return normalizeCharDeskGridPoint(index, { x, y });
};

export const createCharDeskGridSelection = (
  index: CharDeskGridIndex,
  anchor: CharDeskGridPoint,
  focus: CharDeskGridPoint
): CharDeskGridSelection | null => {
  const normalizedAnchor = normalizeCharDeskGridPoint(index, anchor);
  const normalizedFocus = normalizeCharDeskGridPoint(index, focus);
  if (!normalizedAnchor || !normalizedFocus) return null;

  const bounds = resolveCellRangeBounds({
    anchor: normalizedAnchor,
    focus: normalizedFocus,
  }, {
    clip: { x: 0, y: 0, width: index.document.width, height: index.document.height },
    getFootprint: (point) => {
      const cell = getCharDeskGridCell(index, point);
      return cell ? { x: cell.x, y: cell.y, width: cell.width, height: 1 } : null;
    },
  })!;

  return {
    anchor: normalizedAnchor,
    focus: normalizedFocus,
    rect: {
      left: bounds.x,
      top: bounds.y,
      right: bounds.x + bounds.width - 1,
      bottom: bounds.y + bounds.height - 1,
    },
  };
};

export const getCharDeskGridSelectionText = (
  index: CharDeskGridIndex,
  selection: CharDeskGridSelection
) => {
  const { left, top, right, bottom } = selection.rect;
  const lines: string[] = [];
  for (let y = top; y <= bottom; y += 1) {
    let line = "";
    for (let x = left; x <= right; x += 1) {
      const cell = index.cells.get(key(x, y));
      if (cell) {
        line += cell.text;
        if (cell.width === 2) x += 1;
      } else if (!index.followers.has(key(x, y))) {
        line += " ";
      }
    }
    lines.push(line);
  }
  return lines.join("\n");
};
