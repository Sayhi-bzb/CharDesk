export type CanvasSurfaceGeometry = {
  width: number;
  height: number;
  left: number;
  top: number;
};

export const resolveCanvasSurfaceGeometry = (
  viewport: { width: number; height: number }
): CanvasSurfaceGeometry => ({
  width: viewport.width,
  height: viewport.height,
  left: 0,
  top: 0,
});
