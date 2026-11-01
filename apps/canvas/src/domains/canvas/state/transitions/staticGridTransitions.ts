import {
  selectGridRangeAt,
  moveGridFocus,
  moveGridFocusToEdge,
  moveGridFocusToContentBoundary,
  selectGridAxis,
} from "@chardesk/editor-core/selection/commands";
import {
  collapseGridSelectionTo,
  createStaticGridInputSession,
  getConnectedGridRange,
  getEffectiveGridBounds,
  getGridSelectionRanges,
  getStaticGridSelection,
  gridRangesEqual,
  selectGridRange,
  type GridAddress,
  type GridRange,
  type GridSelectionState,
} from "@/domains/selection/public";
import { resolveGridAnchor } from "@/shared/utils/grid-occupancy";
import { createCanvasInteractionPatch } from "../canvasInteractionState";
import type { CanvasState } from "../interfaces";
import { clampPointToActiveSlide, getActiveSlideGridBounds } from "../slideBounds";

type StaticGridState = Pick<
  CanvasState,
  "canvasMode" | "contentSurface" | "interaction" | "slideDeck"
>;

type InteractionPatch = Pick<CanvasState, "interaction">;
type MoveOptions = { extend?: boolean };
type GridEdge = "left" | "right" | "top" | "bottom";
type GridCornerOrEdge = GridEdge | "top-left" | "bottom-right";

const resolveStaticGridAddress = (state: StaticGridState, address: GridAddress) =>
  resolveGridAnchor(state.contentSurface.reader, clampPointToActiveSlide(state, address));

const createInputSession = (state: StaticGridState, address: GridAddress) =>
  createStaticGridInputSession({
    origin: address,
    bounds: getActiveSlideGridBounds(state),
  });

const createNavigationPatch = (
  state: StaticGridState,
  selection: GridSelectionState
): InteractionPatch =>
  createCanvasInteractionPatch(state.interaction, {
    staticGrid: { mode: "navigate", selection },
  });

const getGridBounds = (state: StaticGridState) => {
  const current = getStaticGridSelection(state.interaction.staticGrid);
  return getEffectiveGridBounds({
    grid: state.contentSurface.reader,
    activeCell: current.activeCell,
    ranges: getGridSelectionRanges(current),
    fixedBounds: getActiveSlideGridBounds(state),
  });
};

export const createStaticGridActiveCellPatch = (
  state: StaticGridState,
  address: GridAddress
): InteractionPatch => {
  const activeCell = resolveStaticGridAddress(state, address);
  return createNavigationPatch(
    state,
    collapseGridSelectionTo(getStaticGridSelection(state.interaction.staticGrid), activeCell)
  );
};

export const createStaticGridSelectionRangePatch = (
  state: StaticGridState,
  range: GridRange,
  append = false
): InteractionPatch => {
  const start = resolveStaticGridAddress(state, range.start);
  const end = resolveStaticGridAddress(state, range.end);
  return createNavigationPatch(
    state,
    selectGridRangeAt(
      state.contentSurface.reader,
      getStaticGridSelection(state.interaction.staticGrid),
      { start, end },
      append
    )
  );
};

export const createMovedStaticGridFocusPatch = (
  state: StaticGridState,
  dx: number,
  dy: number,
  options?: MoveOptions
): InteractionPatch => {
  const current = getStaticGridSelection(state.interaction.staticGrid);
  const selection = moveGridFocus(
    state.contentSurface.reader,
    current,
    { x: dx, y: dy },
    options?.extend,
    (point) => resolveStaticGridAddress(state, point)
  );
  const nextCell = selection.activeCell;

  if (!options?.extend && state.interaction.staticGrid.mode === "text-edit") {
    return createCanvasInteractionPatch(state.interaction, {
      staticGrid: {
        mode: "text-edit",
        session: createInputSession(state, nextCell),
      },
    });
  }
  return createNavigationPatch(state, selection);
};

export const createStaticGridEdgeFocusPatch = (
  state: StaticGridState,
  edge: GridCornerOrEdge,
  options?: MoveOptions
): InteractionPatch => {
  return createNavigationPatch(
    state,
    moveGridFocusToEdge(
      state.contentSurface.reader,
      getStaticGridSelection(state.interaction.staticGrid),
      edge,
      options?.extend,
      getActiveSlideGridBounds(state),
      (point) => resolveStaticGridAddress(state, point)
    )
  );
};

export const createStaticGridContentBoundaryFocusPatch = (
  state: StaticGridState,
  edge: GridEdge,
  options?: MoveOptions
): InteractionPatch => {
  return createNavigationPatch(
    state,
    moveGridFocusToContentBoundary(
      state.contentSurface.reader,
      getStaticGridSelection(state.interaction.staticGrid),
      edge,
      options?.extend,
      getActiveSlideGridBounds(state),
      (point) => resolveStaticGridAddress(state, point)
    )
  );
};

export const createStaticGridSelectAllPatch = (state: StaticGridState): InteractionPatch => {
  const current = getStaticGridSelection(state.interaction.staticGrid);
  const connected = getConnectedGridRange(state.contentSurface.reader, current.activeCell);
  const range =
    current.additionalRanges.length === 0 && gridRangesEqual(current.primaryRange, connected)
      ? getGridBounds(state)
      : connected;
  return createNavigationPatch(state, selectGridRange(current, range));
};

export const createStaticGridRowSelectionPatch = (state: StaticGridState): InteractionPatch =>
  createNavigationPatch(
    state,
    selectGridAxis(
      state.contentSurface.reader,
      getStaticGridSelection(state.interaction.staticGrid),
      "row",
      getActiveSlideGridBounds(state)
    )
  );

export const createStaticGridColumnSelectionPatch = (state: StaticGridState): InteractionPatch =>
  createNavigationPatch(
    state,
    selectGridAxis(
      state.contentSurface.reader,
      getStaticGridSelection(state.interaction.staticGrid),
      "column",
      getActiveSlideGridBounds(state)
    )
  );

export const createStaticGridTextEditPatch = (
  state: StaticGridState,
  address?: GridAddress
): InteractionPatch => {
  const current = getStaticGridSelection(state.interaction.staticGrid);
  const activeCell = resolveStaticGridAddress(state, address ?? current.activeCell);
  return createCanvasInteractionPatch(state.interaction, {
    staticGrid: {
      mode: "text-edit",
      session: createInputSession(state, activeCell),
    },
  });
};

export const createStaticGridTextEditExitPatch = (state: StaticGridState): InteractionPatch =>
  createNavigationPatch(state, getStaticGridSelection(state.interaction.staticGrid));

export const createClearedStaticGridSelectionPatch = (state: StaticGridState): InteractionPatch => {
  const current = getStaticGridSelection(state.interaction.staticGrid);
  return createNavigationPatch(state, collapseGridSelectionTo(current, current.activeCell));
};
