import type { CellRect } from "@chardesk/cell-core";
import type { GridCellSource } from "@/shared/types";
import type { CanvasSurfaceReader } from "@/domains/canvas/public";
import { createGridCellFrame } from "@/shared/metrics";
import type { CanvasArtifactPalette } from "@/shared/metrics";

export type CanvasCellFrameProjection = Readonly<{
  hiddenSpans: readonly Readonly<{
    y: number;
    minX: number;
    maxX: number;
  }>[];
  overlay: GridCellSource;
}>;

const createProjectedSource = (
  reader: CanvasSurfaceReader,
  projection: CanvasCellFrameProjection
): GridCellSource => {
  const hiddenByRow = new Map<
    number,
    readonly Readonly<{ minX: number; maxX: number }>[]
  >();
  for (const span of projection.hiddenSpans) {
    hiddenByRow.set(span.y, [...(hiddenByRow.get(span.y) ?? []), span]);
  }
  const isHidden = (x: number, y: number) =>
    hiddenByRow.get(y)?.some((span) => x >= span.minX && x <= span.maxX) ??
    false;
  const getRevision =
    "getRevision" in reader && typeof reader.getRevision === "function"
      ? reader.getRevision.bind(reader)
      : null;

  return {
    get(point) {
      const overlayCell = projection.overlay.get(point);
      if (overlayCell) return overlayCell;
      if (isHidden(point.x, point.y)) return undefined;
      return reader.get(point);
    },
    visit(bounds, visitor) {
      reader.visit(bounds, (x, y, cell) => {
        if (!isHidden(x, y)) visitor(x, y, cell);
      });
      projection.overlay.visit(bounds, visitor);
    },
    getContentBounds: () => reader.getContentBounds(),
    ...(getRevision ? { getRevision } : {}),
  };
};

export const createCanvasCellFrame = (
  reader: CanvasSurfaceReader,
  viewport: CellRect,
  dirty: "full" | readonly CellRect[] = "full",
  projection?: CanvasCellFrameProjection,
  palette?: CanvasArtifactPalette
) =>
  createGridCellFrame(
    projection ? createProjectedSource(reader, projection) : reader,
    viewport,
    dirty,
    palette
  );
