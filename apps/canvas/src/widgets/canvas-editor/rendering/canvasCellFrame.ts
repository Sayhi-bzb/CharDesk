import { createProjectedSource } from '@chardesk/editor-core/interaction/preview';
import type { CellRect } from '@chardesk/cell-core';
import type { GridCellSource } from '@/shared/types';
import type { CanvasSurfaceReader } from '@/domains/canvas/public';
import { createGridCellFrame } from '@/shared/cell-rendering/cell-frame';
import type { CanvasArtifactPalette } from '@/shared/canvas-appearance/artifact-style';
import { DEFAULT_ARTIFACT_CANVAS_PALETTE } from '@/shared/canvas-appearance/artifact-style';
import { projectWelcomeSurface } from '@/shared/canvas-appearance/welcome';

export type CanvasCellFrameProjection = Readonly<{
  hiddenSpans: readonly Readonly<{
    y: number;
    minX: number;
    maxX: number;
  }>[];
  overlay: GridCellSource;
}>;

export const createCanvasCellFrame = (
  reader: CanvasSurfaceReader,
  viewport: CellRect,
  dirty: 'full' | readonly CellRect[] = 'full',
  projection?: CanvasCellFrameProjection,
  palette?: CanvasArtifactPalette
) =>
  createGridCellFrame(
    projectWelcomeSurface(
      projection ? createProjectedSource(reader, projection) : reader,
      palette ?? DEFAULT_ARTIFACT_CANVAS_PALETTE,
      reader
    ),
    viewport,
    dirty,
    palette
  );
