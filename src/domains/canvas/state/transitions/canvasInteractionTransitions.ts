import {
  collapseGridSelectionTo,
  createGridSelectionState,
  getStaticGridSelection,
} from "@/domains/selection/public";
import {
  createCanvasInteractionPatch,
  type CanvasInteractionSnapshot,
} from "../canvasInteractionState";
import type { CanvasState } from "../interfaces";

type InteractionPatch = Pick<CanvasState, "interaction">;

export const createClearedSelectionsPatch = (
  interaction: CanvasInteractionSnapshot
): InteractionPatch =>
  createCanvasInteractionPatch(interaction, {
    staticGrid: {
      mode: "navigate",
      selection: collapseGridSelectionTo(
        getStaticGridSelection(interaction.staticGrid),
        getStaticGridSelection(interaction.staticGrid).activeCell
      ),
    },
  });

export const createClearedInteractionPatch = (
  interaction: CanvasInteractionSnapshot
): InteractionPatch =>
  createCanvasInteractionPatch(interaction, {
    staticGrid: {
      mode: "navigate",
      selection: createGridSelectionState(
        getStaticGridSelection(interaction.staticGrid).activeCell
      ),
    },
  });
