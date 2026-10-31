import type { MinimapDimensions } from '@chardesk/editor-core/minimap/geometry';
export type {
  MinimapDimensions,
  MinimapRect,
  MinimapTransform,
} from '@chardesk/editor-core/minimap/geometry';
import type { Point } from '@/shared/types';
import type { CanvasSurfaceReader } from '@/domains/canvas/public';
import type { CanvasArtifactPalette } from '@/shared/canvas-appearance/artifact-style';

type MinimapColors = {
  artifact: CanvasArtifactPalette;
  viewportFill: string;
  viewportStroke: string;
};

/** Complete input required for one deterministic minimap frame. */
export type MinimapRenderSnapshot = {
  reader: CanvasSurfaceReader;
  contentRevision: unknown;
  offset: Point;
  zoom: number;
  viewportSize: MinimapDimensions;
  colors: MinimapColors;
};
