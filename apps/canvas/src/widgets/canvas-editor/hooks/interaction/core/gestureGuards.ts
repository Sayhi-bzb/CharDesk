import { isFromCanvasUi, isFromMinimap } from "./hitTesting";

export const shouldIgnoreMinimapGesture = ({
  event,
  interactionMode,
  hasDragStartGrid,
  isPanning,
}: {
  event: Event | undefined;
  interactionMode: "idle" | string;
  hasDragStartGrid: boolean;
  isPanning: boolean;
}) => {
  if (!isFromMinimap(event)) return false;
  return interactionMode === "idle" && !hasDragStartGrid && !isPanning;
};
export const shouldIgnoreCanvasSurfaceGesture = (
  event: Event | undefined
): boolean => isFromCanvasUi(event) || isFromMinimap(event);

export const shouldIgnoreActiveCanvasGesture = ({
  event,
  interactionMode,
  hasDragStartGrid,
  isPanning,
}: {
  event: Event | undefined;
  interactionMode: "idle" | string;
  hasDragStartGrid: boolean;
  isPanning: boolean;
}): boolean =>
  (interactionMode === "idle" &&
    !hasDragStartGrid &&
    !isPanning &&
    isFromCanvasUi(event)) ||
  shouldIgnoreMinimapGesture({
    event,
    interactionMode,
    hasDragStartGrid,
    isPanning,
  });
