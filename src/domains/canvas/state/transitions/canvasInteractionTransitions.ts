import {
  collapseGridSelectionTo,
  createGridSelectionState,
  createStaticGridInputFlow,
} from "@/domains/selection/public";
import {
  normalizeStructuredTextSelection,
  type StructuredSplitBoxHandle,
  type StructuredTextSelection,
} from "@/domains/structured-content/public";
import { splitGraphemes } from "@/shared/metrics";
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
  "canvasMode" | "contentSurface" | "interaction" | "slideDeck" | "structuredScene"
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
    editingStructuredTextNodeId: null,
    structuredTextSelection: null,
    selectedStructuredNodeIds: [],
    selectedStructuredBoxId: null,
    selectedStructuredSplitHandle: null,
    structuredContextPoint: null,
    structuredGridFocus: null,
    staticGridSelection: createGridSelectionState(
      interaction.staticGridSelection.activeCell
    ),
    staticGridEditMode: "navigate",
    staticGridInputFlow: null,
  });

export const createStructuredGridFocusPatch = (
  interaction: CanvasInteractionSnapshot,
  point: Point | null
): InteractionPatch =>
  createCanvasInteractionPatch(interaction, {
    structuredGridFocus: point ? { ...point } : null,
    ...(point
      ? {
          selectedStructuredNodeIds: [],
          selectedStructuredBoxId: null,
          selectedStructuredSplitHandle: null,
          structuredContextPoint: null,
          editingStructuredTextNodeId: null,
          structuredTextSelection: null,
          textCursor: null,
          staticGridEditMode: "navigate" as const,
          staticGridInputFlow: null,
        }
      : {}),
  });

export const createMovedStructuredGridFocusPatch = (
  interaction: CanvasInteractionSnapshot,
  dx: number,
  dy: number
): InteractionPatch => {
  const current = interaction.structuredGridFocus ?? { x: 0, y: 0 };
  return createCanvasInteractionPatch(interaction, {
    structuredGridFocus: { x: current.x + dx, y: current.y + dy },
  });
};

export const createTextCursorPatch = (
  state: InteractionState,
  position: Point | null
): InteractionPatch => {
  const resolvedPosition =
    position && state.canvasMode !== "structured"
      ? resolveGridAnchor(state.contentSurface.reader, position)
      : position;
  const nextPosition = resolvedPosition
    ? clampPointToActiveSlide(state, resolvedPosition)
    : null;

  return createCanvasInteractionPatch(state.interaction, {
    textCursor: nextPosition,
    ...(state.canvasMode === "structured" && nextPosition
      ? { structuredGridFocus: null }
      : {}),
    ...(nextPosition
      ? {
          staticGridSelection: collapseGridSelectionTo(
            state.interaction.staticGridSelection,
            nextPosition
          ),
          staticGridEditMode: "text-edit" as const,
          staticGridInputFlow:
            state.canvasMode === "structured"
              ? null
              : createStaticGridInputFlow({
                  grid: state.contentSurface.reader,
                  address: nextPosition,
                  bounds: getActiveSlideGridBounds(state),
                  lineOriginX: state.contentSurface.reader.getLineOriginX?.(nextPosition),
                }),
        }
      : {
          editingStructuredTextNodeId: null,
          structuredTextSelection: null,
          staticGridInputFlow: null,
        }),
  });
};

export const createEditingStructuredTextNodePatch = (
  state: Pick<InteractionState, "interaction" | "structuredScene">,
  id: string | null
): InteractionPatch => {
  if (!id) {
    return createCanvasInteractionPatch(state.interaction, {
      editingStructuredTextNodeId: null,
      structuredTextSelection: null,
    });
  }
  const node = state.structuredScene.find(
    (sceneNode) => sceneNode.id === id && sceneNode.type === "text"
  );
  return createCanvasInteractionPatch(state.interaction, {
    editingStructuredTextNodeId: node ? id : null,
    structuredTextSelection: node ? state.interaction.structuredTextSelection : null,
  });
};

export const createStructuredTextSelectionPatch = (
  state: Pick<InteractionState, "interaction" | "structuredScene">,
  selection: StructuredTextSelection | null
): InteractionPatch => {
  if (!selection) {
    return createCanvasInteractionPatch(state.interaction, {
      structuredTextSelection: null,
    });
  }
  const node = state.structuredScene.find(
    (sceneNode) => sceneNode.id === selection.nodeId && sceneNode.type === "text"
  );
  return createCanvasInteractionPatch(state.interaction, {
    structuredTextSelection:
      node?.type === "text"
        ? normalizeStructuredTextSelection(selection, splitGraphemes(node.text).length)
        : null,
  });
};

export const createStructuredNodeSelectionPatch = (
  state: Pick<InteractionState, "interaction" | "structuredScene">,
  ids: readonly string[]
): InteractionPatch => {
  const validIds = ids.filter(
    (id, index) => ids.indexOf(id) === index && state.structuredScene.some((node) => node.id === id)
  );
  const selectedBox =
    validIds.length === 1
      ? state.structuredScene.find(
          (node) => node.id === validIds[0] && node.type === "box"
        )
      : null;
  const keepsEditing =
    !!state.interaction.editingStructuredTextNodeId &&
    validIds.includes(state.interaction.editingStructuredTextNodeId);

  return createCanvasInteractionPatch(state.interaction, {
    selectedStructuredNodeIds: validIds,
    selectedStructuredBoxId: selectedBox?.id ?? null,
    selectedStructuredSplitHandle: null,
    structuredGridFocus:
      validIds.length > 0 ? null : state.interaction.structuredGridFocus,
    editingStructuredTextNodeId: keepsEditing
      ? state.interaction.editingStructuredTextNodeId
      : null,
    structuredTextSelection: keepsEditing
      ? state.interaction.structuredTextSelection
      : null,
    textCursor: keepsEditing ? state.interaction.textCursor : null,
  });
};

export const createStructuredBoxSelectionPatch = (
  state: Pick<InteractionState, "interaction" | "structuredScene">,
  id: string | null
): InteractionPatch => {
  const selectedBox = id
    ? state.structuredScene.find((node) => node.id === id && node.type === "box")
    : null;
  if (!selectedBox) {
    return createCanvasInteractionPatch(state.interaction, {
      selectedStructuredNodeIds: [],
      selectedStructuredBoxId: null,
      selectedStructuredSplitHandle: null,
      structuredContextPoint: null,
      editingStructuredTextNodeId: null,
      structuredTextSelection: null,
    });
  }
  return createCanvasInteractionPatch(state.interaction, {
    selectedStructuredNodeIds: [selectedBox.id],
    selectedStructuredBoxId: selectedBox.id,
    selectedStructuredSplitHandle: null,
    structuredContextPoint: null,
    structuredGridFocus: null,
    editingStructuredTextNodeId: null,
    structuredTextSelection: null,
  });
};

export const createStructuredSplitHandlePatch = (
  state: Pick<InteractionState, "interaction" | "structuredScene">,
  handle: { nodeId: string; handle: StructuredSplitBoxHandle } | null
): InteractionPatch => {
  if (!handle) {
    return createCanvasInteractionPatch(state.interaction, {
      selectedStructuredSplitHandle: null,
    });
  }
  const node = state.structuredScene.find(
    (sceneNode) => sceneNode.id === handle.nodeId && sceneNode.type === "splitBox"
  );
  if (!node) {
    return createCanvasInteractionPatch(state.interaction, {
      selectedStructuredSplitHandle: null,
    });
  }
  return createCanvasInteractionPatch(state.interaction, {
    selectedStructuredSplitHandle: handle,
    selectedStructuredNodeIds: [handle.nodeId],
    selectedStructuredBoxId: null,
    structuredGridFocus: null,
    editingStructuredTextNodeId: null,
    structuredTextSelection: null,
  });
};
