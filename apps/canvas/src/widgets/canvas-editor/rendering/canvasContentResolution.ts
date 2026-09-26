export type CanvasContentResolutionMode = "full" | "coarse";

const CANVAS_CONTENT_COARSE_ENTER_ZOOM = 0.48;
const CANVAS_CONTENT_COARSE_EXIT_ZOOM = 0.55;
const CANVAS_CONTENT_COARSE_MAX_DPR = 1.5;

export const resolveCanvasContentResolutionMode = (
  zoom: number,
  currentMode: CanvasContentResolutionMode
): CanvasContentResolutionMode => {
  if (currentMode === "coarse") {
    return zoom >= CANVAS_CONTENT_COARSE_EXIT_ZOOM ? "full" : "coarse";
  }
  return zoom <= CANVAS_CONTENT_COARSE_ENTER_ZOOM ? "coarse" : "full";
};

export const resolveCanvasContentDpr = (
  deviceDpr: number,
  mode: CanvasContentResolutionMode
) => {
  const normalizedDpr = Number.isFinite(deviceDpr) && deviceDpr > 0
    ? deviceDpr
    : 1;
  return mode === "coarse"
    ? Math.min(CANVAS_CONTENT_COARSE_MAX_DPR, normalizedDpr)
    : normalizedDpr;
};
