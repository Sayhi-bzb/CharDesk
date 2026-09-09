import type { Point } from "@/shared/types";
import type { CanvasSurfaceReader } from "@/domains/canvas/public";
import type { CanvasArtifactPalette } from "@/shared/canvas-appearance/artifact-style";

export type MinimapDimensions = {
  width: number;
  height: number;
};

export type MinimapRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type MinimapTransform = {
  dimensions: MinimapDimensions;
  contentBounds: MinimapRect | null;
  viewportBounds: MinimapRect;
  worldBounds: MinimapRect;
  drawableRect: MinimapRect;
  scale: number;
};

export type MinimapColors = {
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
