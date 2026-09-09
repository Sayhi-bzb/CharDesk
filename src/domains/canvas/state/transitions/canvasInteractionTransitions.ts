import {
  collapseGridSelectionTo,
  createGridSelectionState,
  createStaticGridInputFlow,
} from "@/domains/selection/public";
import type { Point } from "@/shared/types";
import { resolveGridAnchor } from "@/shared/utils/grid-occupancy";
import {
  createCanvasInteractionPatch,
  type CanvasInteractionSnapshot,
} from "../canvasInteractionState";
import type { CanvasState } from "../interfaces";
import { clampPointToActiveSlide, getActiveSlideGridBounds } from "../slideBounds";

type InteractionState = Pick<
  CanvasState,
  "canvasMode" | "contentSurface" | "interaction" | "slideDeck"
>;

type InteractionPatch = Pick<CanvasState, "interaction">;

export const createClearedSelectionsPatch = (
  interaction: CanvasInteractionSnapshot
): InteractionPatch =>
  createCanvasInteractionPatch(interaction, {
    staticGridSelection: collapseGridSelectionTo(
      interaction.staticGridSelection,
      interaction.staticGridSelection.activeCell
    ),
  });

export const createClearedInteractionPatch = (
  interaction: CanvasInteractionSnapshot
): InteractionPatch =>
  createCanvasInteractionPatch(interaction, {
    textCursor: null,
    staticGridSelection: createGridSelectionState(
      interaction.staticGridSelection.activeCell
    ),
    staticGridEditMode: "navigate",
    staticGridInputFlow: null,
  });

export const createTextCursorPatch = (
  state: InteractionState,
  position: Point | null
): InteractionPatch => {
  const resolvedPosition = position
    ? resolveGridAnchor(state.contentSurface.reader, position)
    : position;
  const nextPosition = resolvedPosition
    ? clampPointToActiveSlide(state, resolvedPosition)
    : null;

  return createCanvasInteractionPatch(state.interaction, {
    textCursor: nextPosition,
    ...(nextPosition
      ? {
          staticGridSelection: collapseGridSelectionTo(
            state.interaction.staticGridSelection,
            nextPosition
          ),
          staticGridEditMode: "text-edit" as const,
          staticGridInputFlow: createStaticGridInputFlow({
            grid: state.contentSurface.reader,
            address: nextPosition,
            bounds: getActiveSlideGridBounds(state),
            lineOriginX: state.contentSurface.reader.getLineOriginX?.(nextPosition),
          }),
        }
      : {
          staticGridInputFlow: null,
        }),
  });
};
