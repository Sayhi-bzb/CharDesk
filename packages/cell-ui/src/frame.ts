import type { CellFrame, CellRect, CellSource } from "@chardesk/cell-core";
import {
  resolveCharDeskFontRoute,
  type CharDeskCellFrameCell,
  type CharDeskCellVisual,
} from "@chardesk/rendering";
import type { CellBuffer } from "./buffer.js";
import type { Cell, FrameSnapshot } from "./types.js";

const sourceCache = new WeakMap<CellBuffer, CellSource<Cell>>();

export const createCellBufferSource = (buffer: CellBuffer): CellSource<Cell> => {
  const cached = sourceCache.get(buffer);
  if (cached) return cached;
  const bounds = Object.freeze({ x: 0, y: 0, width: buffer.width, height: buffer.height });
  const source: CellSource<Cell> = {
    get: ({ x, y }) => buffer.get(x, y),
    visit(region, visitor) {
      const left = Math.max(bounds.x, region.x);
      const top = Math.max(bounds.y, region.y);
      const right = Math.min(bounds.width, region.x + region.width);
      const bottom = Math.min(bounds.height, region.y + region.height);
      for (let y = top; y < bottom; y += 1) {
        for (let x = left; x < right; x += 1) {
          const cell = buffer.get(x, y);
          if (cell) visitor(x, y, cell);
        }
      }
    },
    getContentBounds: () => bounds,
  };
  sourceCache.set(buffer, source);
  return source;
};

const renderCellCache = new WeakMap<Cell, CharDeskCellFrameCell>();
const renderSourceCache = new WeakMap<CellBuffer, CellSource<CharDeskCellFrameCell>>();

const toRenderCell = (cell: Cell): CharDeskCellFrameCell => {
  const cached = renderCellCache.get(cell);
  if (cached) return cached;
  const visual: CharDeskCellVisual = {
    text: cell.text,
    width: cell.width,
    fontRoute: resolveCharDeskFontRoute(cell.text),
    ...(cell.style.color ? { color: cell.style.color } : {}),
    ...(cell.style.backgroundColor
      ? { bgColor: cell.style.backgroundColor }
      : {}),
    ...((cell.style.bold || cell.style.underline)
      ? {
          attrs: {
            ...(cell.style.bold ? { bold: true as const } : {}),
            ...(cell.style.underline ? { underline: true as const } : {}),
          },
        }
      : {}),
  };
  const result = Object.freeze({
    visual,
    backgroundWidth: 1 as const,
    drawBackground: cell.style.backgroundColor !== undefined,
    drawText: !cell.continuation,
  });
  renderCellCache.set(cell, result);
  return result;
};

export const createCellUiRenderFrame = (
  frame: FrameSnapshot,
  dirty: "full" | readonly CellRect[] = frame.invalidation.dirtyRegions,
  plane: Readonly<{
    buffer?: CellBuffer;
    viewport?: CellRect;
  }> = {}
): CellFrame<CharDeskCellFrameCell> => {
  const buffer = plane.buffer ?? frame.buffer;
  let renderSource = renderSourceCache.get(buffer);
  if (!renderSource) {
    const source = createCellBufferSource(buffer);
    renderSource = {
      get(point) {
        const cell = source.get(point);
        return cell ? toRenderCell(cell) : undefined;
      },
      visit(bounds, visitor) {
        source.visit(bounds, (x, y, cell) => visitor(x, y, toRenderCell(cell)));
      },
      getContentBounds: () => source.getContentBounds(),
    };
    renderSourceCache.set(buffer, renderSource);
  }
  return {
    revision: frame.revision,
    viewport: plane.viewport ?? frame.scene.viewport,
    dirty,
    source: renderSource,
  };
};
