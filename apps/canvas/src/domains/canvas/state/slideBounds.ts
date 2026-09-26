import type { EditorState } from "./interfaces";
import type { Point } from "@/shared/types";
import type { GridBounds } from "@/domains/selection/public";

type SlideBoundState = Pick<EditorState, "canvasMode" | "slideDeck">;

const getActiveSlideSize = (state: SlideBoundState) =>
  state.canvasMode === "slide"
    ? state.slideDeck?.slides.find(
        (slide) => slide.id === state.slideDeck?.activeSlideId
      )?.size ?? null
    : null;

export const getActiveSlideGridBounds = (
  state: SlideBoundState
): GridBounds | null => {
  const size = getActiveSlideSize(state);
  if (!size) return null;
  return {
    start: { x: 0, y: 0 },
    end: { x: size.columns - 1, y: size.rows - 1 },
  };
};

export const clampPointToActiveSlide = (state: SlideBoundState, point: Point): Point => {
  const size = getActiveSlideSize(state);
  if (!size) return point;
  return {
    x: Math.min(size.columns - 1, Math.max(0, point.x)),
    y: Math.min(size.rows - 1, Math.max(0, point.y)),
  };
};
