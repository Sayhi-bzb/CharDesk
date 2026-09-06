import type { CellBuffer, CellTextOptions } from "./buffer.js";
import type { CharDeskCellPrimitive } from "@chardesk/rendering";
import { hitTest, hitTestCell } from "./scene.js";
import type {
  Cell,
  CellHit,
  CellPoint,
  CellRect,
  CellSize,
  CellTextStyle,
  FrameInvalidation,
  FrameSnapshot,
  SceneEntry,
  WidgetId,
} from "./types.js";

export type CellProbeCell = Readonly<{
  x: number;
  y: number;
  text: string;
  primitive?: CharDeskCellPrimitive;
  width: 1 | 2;
  continuation: boolean;
  ownerId: WidgetId | null;
  style: CellTextStyle;
}>;

export type CellProbeSnapshot = Readonly<{
  schemaVersion: 2;
  probeId: string | null;
  revision: number;
  region: CellRect;
  viewport: CellSize;
  text: string;
  cells: readonly CellProbeCell[];
  focusedId: WidgetId | null;
  invalidation: FrameInvalidation;
}>;

export type CellInspection = Readonly<{
  point: CellPoint;
  cell: CellProbeCell | null;
  owner: SceneEntry | null;
  hit: CellHit | null;
  hitStack: readonly WidgetId[];
  focusedId: WidgetId | null;
  ownerFocused: boolean;
}>;

export type CellProbeOptions = Readonly<{
  region?: CellRect;
  probeId?: string | null;
}>;

export type FormatCellBufferOptions = CellTextOptions;

export type FormatCellProbeOptions = Readonly<{
  header?: boolean;
}>;

const cloneStyle = (style: CellTextStyle): CellTextStyle => ({
  ...(style.color === undefined ? {} : { color: style.color }),
  ...(style.backgroundColor === undefined ? {} : { backgroundColor: style.backgroundColor }),
  ...(style.bold === undefined ? {} : { bold: style.bold }),
  ...(style.dim === undefined ? {} : { dim: style.dim }),
  ...(style.underline === undefined ? {} : { underline: style.underline }),
});

const cloneCell = (cell: Cell, x: number, y: number): CellProbeCell => ({
  x,
  y,
  text: cell.text,
  ...(cell.primitive ? { primitive: cell.primitive } : {}),
  width: cell.width,
  continuation: cell.continuation,
  ownerId: cell.ownerId,
  style: cloneStyle(cell.style),
});

export const formatCellBuffer = (
  buffer: CellBuffer,
  options: FormatCellBufferOptions = {}
): string => buffer.toText(options);

export const captureCellProbe = (
  frame: FrameSnapshot,
  options: CellProbeOptions = {}
): CellProbeSnapshot => {
  const region = frame.buffer.normalizeRegion(options.region);
  const cells: CellProbeCell[] = [];
  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      const cell = frame.buffer.get(x, y);
      if (cell) cells.push(cloneCell(cell, x, y));
    }
  }
  return {
    schemaVersion: 2,
    probeId: options.probeId ?? null,
    revision: frame.revision,
    region,
    viewport: { width: frame.buffer.width, height: frame.buffer.height },
    text: formatCellBuffer(frame.buffer, { region, trimEnd: true }),
    cells,
    focusedId: frame.semantics.focusedId,
    invalidation: {
      phases: [...frame.invalidation.phases],
      dirtyRegions: frame.invalidation.dirtyRegions.map((dirty) => ({ ...dirty })),
      work: { ...frame.invalidation.work },
    },
  };
};

export const formatCellProbe = (
  snapshot: CellProbeSnapshot,
  options: FormatCellProbeOptions = {}
): string => {
  if (!options.header) return snapshot.text;
  const id = snapshot.probeId ?? "anonymous";
  const focus = snapshot.focusedId ?? "none";
  const header = `cell-ui/probe@${snapshot.schemaVersion}  ${id}  ${snapshot.region.width}×${snapshot.region.height}  focus=${focus}`;
  return snapshot.text.length > 0 ? `${header}\n${snapshot.text}` : header;
};

export const inspectCell = (frame: FrameSnapshot, point: CellPoint): CellInspection => {
  const cell = frame.buffer.get(point.x, point.y);
  const owner = cell?.ownerId ? frame.scene.entries.get(cell.ownerId) ?? null : null;
  return {
    point: { ...point },
    cell: cell ? cloneCell(cell, point.x, point.y) : null,
    owner,
    hit: hitTestCell(frame.scene, point),
    hitStack: [...hitTest(frame.scene, point)],
    focusedId: frame.semantics.focusedId,
    ownerFocused: cell?.ownerId != null && cell.ownerId === frame.semantics.focusedId,
  };
};
