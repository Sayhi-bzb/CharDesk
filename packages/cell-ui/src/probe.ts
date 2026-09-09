import type { CellBuffer, CellTextOptions } from "./buffer.js";
import type { CharDeskFontAudit } from "@chardesk/rendering/canvas";
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
  width: 1 | 2;
  continuation: boolean;
  ownerId: WidgetId | null;
  style: CellTextStyle;
}>;

export type CellProbeFontCapability =
  | "cell-glyph"
  | "display"
  | "cjk"
  | "nerd"
  | "symbol"
  | "emoji";

export type CellProbeRequestedFontFace = Readonly<{
  family: string;
  fontSize: number;
  scaleX: number;
  baselineShiftEm: number;
  boldStrategy: "native" | "overdraw" | "none";
  boldOverdrawEm?: number;
}>;

export type CellProbeGlyphOverflow = Readonly<{
  text: string;
  row: number;
  col: number;
  spanCells: number;
  measuredWidth: number;
  availableWidth: number;
}>;

export type CellProbePresentation = Readonly<{
  cellGraphics?: Readonly<{
    source: "cell-graphics";
    version: string;
    cells: readonly { text: string; codePoint: number; row: number; col: number; width: number; height: number }[];
  }>;
  fontAudit?: Readonly<{
    status: "loading" | "ready" | "unavailable";
    reason?: "font-load-failed" | "measurement-unavailable";
    report?: CharDeskFontAudit;
  }>;
  glyphOverflowMode?: "clip" | "visible";
  metrics: Readonly<{
    cellWidth: number;
    cellHeight: number;
    fontSize: number;
    baseline?: number;
  }>;
  measurement?: Readonly<{
    source: "font-bounds" | "glyph-bounds" | "calibrated" | "temporary" | "default" | "explicit";
    ready: boolean;
  }>;
  fontProfileId: string;
  requestedFontRoutes: Readonly<Partial<Record<
    CellProbeFontCapability,
    CellProbeRequestedFontFace
  >>>;
  glyphOverflow: readonly CellProbeGlyphOverflow[];
}>;

export type CellProbeSnapshot = Readonly<{
  schemaVersion: 4;
  probeId: string | null;
  revision: number;
  region: CellRect;
  viewport: CellSize;
  overlayViewport: CellSize;
  overlays: readonly Readonly<{
    rootId: WidgetId;
    bounds: CellRect;
    text: string;
    cells: readonly CellProbeCell[];
  }>[];
  text: string;
  cells: readonly CellProbeCell[];
  focusedId: WidgetId | null;
  invalidation: FrameInvalidation;
  presentation?: CellProbePresentation;
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
  const overlays = frame.overlayPlanes.map((plane) => {
    const overlayCells: CellProbeCell[] = [];
    for (let y = plane.bounds.y; y < plane.bounds.y + plane.bounds.height; y += 1) {
      for (let x = plane.bounds.x; x < plane.bounds.x + plane.bounds.width; x += 1) {
        const cell = frame.overlayBuffer.get(x, y);
        if (cell) overlayCells.push(cloneCell(cell, x, y));
      }
    }
    return {
      rootId: plane.rootId,
      bounds: { ...plane.bounds },
      text: formatCellBuffer(frame.overlayBuffer, { region: plane.bounds, trimEnd: true }),
      cells: overlayCells,
    };
  });
  return {
    schemaVersion: 4,
    probeId: options.probeId ?? null,
    revision: frame.revision,
    region,
    viewport: { width: frame.scene.viewport.width, height: frame.scene.viewport.height },
    overlayViewport: {
      width: frame.scene.overlayViewport.width,
      height: frame.scene.overlayViewport.height,
    },
    overlays,
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
  const presentation = snapshot.presentation;
  if (!presentation) return snapshot.text.length > 0 ? `${header}\n${snapshot.text}` : header;
  const formatFace = (capability: "display" | "cjk" | "cell-glyph") => {
    const face = presentation.requestedFontRoutes[capability];
    if (!face) return `glyph ${capability}=cell-graphics version=${presentation.cellGraphics?.version ?? "unknown"}`;
    const overdraw = face.boldStrategy === "overdraw" && face.boldOverdrawEm && face.boldOverdrawEm > 0
      ? ` bold-overdraw=${Number((face.boldOverdrawEm * face.fontSize).toFixed(4))}px`
      : "";
    return `font ${capability}=${face.family} size=${face.fontSize}px scaleX=${face.scaleX} bold-strategy=${face.boldStrategy}${overdraw}`;
  };
  const diagnostics = [
    `font-profile=${presentation.fontProfileId} cell=${presentation.metrics.cellWidth}×${presentation.metrics.cellHeight} base=${presentation.metrics.fontSize}px`,
    formatFace("display"),
    formatFace("cjk"),
    formatFace("cell-glyph"),
  ];
  const visibleOverflow = presentation.glyphOverflow.slice(0, 8);
  const audit = presentation.fontAudit;
  if (audit) {
    diagnostics.push(`font-audit=${audit.status}${audit.reason ? ` reason=${audit.reason}` : ""}`);
    if (audit.report) {
      const { measurement, metrics, samples } = audit.report;
      const size = (m: typeof metrics) => `${m.cellWidth}×${m.cellHeight} baseline=${m.baseline ?? "middle"}`;
      diagnostics.push(`font-native=${size(measurement.fontMetrics)} source=${measurement.fontMetricsSource}`,
        `font-grid=${size(measurement.metrics)} source=${measurement.source}`,
        `surface-grid=${size(metrics)} source=${presentation.measurement?.source ?? "unknown"}`,
        "font-identity=requested-stack-only");
      const issues = samples.filter((s) => s.status === "unavailable" || (s.advanceOverflow ?? 0) > 0.01
        || (s.overflowTop ?? 0) > 0.01 || (s.overflowBottom ?? 0) > 0.01 || s.verticalGap !== null)
        .sort((a, b) => Number(b.verticalGap !== null) - Number(a.verticalGap !== null));
      diagnostics.push(...issues.slice(0, 12).map((s) =>
        `font-sample ${JSON.stringify(s.text)} bold=${s.requestedBold}->${s.effectiveBold} status=${s.status} advance-overflow=${s.advanceOverflow} top=${s.top} bottom=${s.bottom} vertical-gap=${s.verticalGap}`));
      if (issues.length > 12) diagnostics.push(`font-sample +${issues.length - 12} more (JSON contains all samples)`);
    }
  }
  diagnostics.push(...visibleOverflow.map((overflow) =>
    `glyph-overflow ${JSON.stringify(overflow.text)}@(${overflow.col},${overflow.row}) ${overflow.measuredWidth}px>${overflow.availableWidth}px`));
  if (presentation.glyphOverflow.length > visibleOverflow.length) {
    diagnostics.push(`glyph-overflow +${presentation.glyphOverflow.length - visibleOverflow.length} more`);
  }
  return [header, ...diagnostics, snapshot.text].filter((line) => line.length > 0).join("\n");
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
