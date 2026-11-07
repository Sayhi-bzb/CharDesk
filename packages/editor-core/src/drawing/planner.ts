import type {
  GridCell,
  GridCellSource,
  GridPoint,
  Point,
  SelectionArea,
} from '@chardesk/cell-plane/types';
import { resolveGridSlot, type CellPlanePatch } from '@chardesk/cell-plane';
import { deleteCellAt, writeStyledCell } from '@chardesk/cell-plane/grid-ops';
import { getGraphemeCellWidth } from '@chardesk/protocol';
import type { ToolType } from '../interaction/tool.js';
import {
  getArrowLinePoints,
  getBoxPoints,
  getCirclePoints,
  getLShapeLinePoints,
  getStepLinePoints,
} from './shapes.js';
import { getDefaultSplitBoxPoints } from './splitBox.js';
import { validateDrawingPoints, validateDrawingWork } from './limits.js';

export type DrawingStyle = { foreground: string; background?: string };
export type ShapeOptions = { axis?: 'horizontal' | 'vertical' | null };
export function createShapePoints(
  tool: ToolType,
  start: Point,
  end: Point,
  style: DrawingStyle,
  options?: ShapeOptions
): GridPoint[] {
  validateDrawingPoints(start, end);
  let points: GridPoint[];
  switch (tool) {
    case 'box':
      points = getBoxPoints(start, end);
      break;
    case 'splitBox':
      points = getDefaultSplitBoxPoints(start, end);
      break;
    case 'circle':
      points = getCirclePoints(start, end);
      break;
    case 'line':
      points = getLShapeLinePoints(start, end, options?.axis === 'vertical');
      break;
    case 'arrowLine':
      points = getArrowLinePoints(start, end, options?.axis === 'vertical');
      break;
    case 'stepline':
      points = getStepLinePoints(start, end);
      break;
    case 'bg': {
      const minX = Math.min(start.x, end.x),
        maxX = Math.max(start.x, end.x),
        minY = Math.min(start.y, end.y),
        maxY = Math.max(start.y, end.y);
      validateDrawingWork((maxX - minX + 1) * (maxY - minY + 1));
      points = [];
      for (let y = minY; y <= maxY; y++)
        for (let x = minX; x <= maxX; x++)
          points.push({
            x,
            y,
            char: ' ',
            color: '#000000',
            bgColor: style.background ?? style.foreground,
          });
      break;
    }
    default:
      points = [];
  }
  validateDrawingWork(points.length);
  return points.map((point) => ({ ...point, color: point.color ?? style.foreground }));
}

/** Resolve collisions and background strokes on the affected cells only. No document mutation. */
export function planDrawingPatch(
  reader: GridCellSource,
  points: readonly GridPoint[],
  erasures: readonly Point[] = [],
  options?: { backgroundStroke?: boolean }
): CellPlanePatch {
  validateDrawingWork(points.length + erasures.length);
  const changes = new Map<string, GridCell | null>();
  const target = {
    get(key: string) {
      if (changes.has(key)) return changes.get(key) ?? undefined;
      const [x, y] = key.split(',').map(Number);
      return reader.get({ x: x!, y: y! });
    },
    set(key: string, cell: GridCell) {
      changes.set(key, cell);
    },
    delete(key: string) {
      changes.set(key, null);
    },
  };
  for (const point of erasures) {
    validateDrawingPoints(point);
    deleteCellAt(target, point.x, point.y);
  }
  for (const point of points) {
    validateDrawingPoints(point);
    const color = point.color ?? '#000000';
    if (options?.backgroundStroke !== false && point.char === ' ' && point.bgColor) {
      const slot = resolveGridSlot({ get: (at) => target.get(`${at.x},${at.y}`) }, point);
      const at = slot?.anchor ?? point;
      writeStyledCell(target, at.x, at.y, {
        ...(slot?.cell ?? { char: ' ', color }),
        bgColor: point.bgColor,
      });
    } else {
      writeStyledCell(target, point.x, point.y, {
        char: point.char,
        color,
        ...(point.bgColor ? { bgColor: point.bgColor } : {}),
        ...(point.attrs ? { attrs: point.attrs } : {}),
        ...(point.href ? { href: point.href } : {}),
      });
    }
  }
  const rows = new Map<
    number,
    {
      y: number;
      erase: { from: number; to: number }[];
      spans: {
        x: number;
        text: string;
        color: string;
        bgColor?: string;
        attrs?: GridCell['attrs'];
        href?: string;
      }[];
    }
  >();
  for (const [key, cell] of changes) {
    const [x, y] = key.split(',').map(Number);
    let row = rows.get(y!);
    if (!row) {
      row = { y: y!, erase: [], spans: [] };
      rows.set(y!, row);
    }
    // Erase first, including every overwritten anchor; spans rebuild final state.
    row.erase.push({ from: x!, to: x! });
    if (cell) {
      const { char, ...style } = cell;
      row.spans.push({ x: x!, text: char, ...style });
    }
  }
  return {
    rows: [...rows.values()]
      .sort((a, b) => a.y - b.y)
      .map((row) => ({ ...row, spans: row.spans.sort((a, b) => a.x - b.x) })),
  };
}

/** Web Fill recolors existing glyphs in a rectangle; it does not flood empty space. */
export function planForegroundFill(
  reader: GridCellSource,
  area: SelectionArea,
  color: string
): CellPlanePatch {
  validateDrawingPoints(area.start, area.end);
  const minX = Math.min(area.start.x, area.end.x),
    maxX = Math.max(area.start.x, area.end.x),
    minY = Math.min(area.start.y, area.end.y),
    maxY = Math.max(area.start.y, area.end.y);
  validateDrawingWork((maxX - minX + 1) * (maxY - minY + 1));
  const points: GridPoint[] = [];
  reader.visit(
    { x: minX - 1, y: minY, width: maxX - minX + 2, height: maxY - minY + 1 },
    (x, y, cell) => {
      if (x + getGraphemeCellWidth(cell.char) > minX && x <= maxX)
        points.push({ x, y, ...cell, color });
    }
  );
  return planDrawingPatch(reader, points, [], { backgroundStroke: false });
}
