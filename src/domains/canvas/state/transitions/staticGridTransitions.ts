import {
  collapseGridSelectionTo,
  createStaticGridInputSession,
  extendGridSelectionTo,
  getConnectedGridRange,
  getEffectiveGridBounds,
  getGridSelectionExtent,
  getGridSelectionRanges,
  getStaticGridSelection,
  gridRangesEqual,
  moveGridAddress,
  moveGridAddressToContentBoundary,
  moveGridAddressToEdge,
  selectGridColumn,
  selectGridRange,
  selectGridRow,
  type GridAddress,
  type GridRange,
  type GridSelectionState,
} from "@/domains/selection/public";
import { resolveGridAnchor, resolveGridSlot } from "@/shared/utils/grid-occupancy";
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

const resolveStaticGridAddress = (
  state: StaticGridState,
  address: GridAddress
) =>
  resolveGridAnchor(
    state.contentSurface.reader,
    clampPointToActiveSlide(state, address)
  );

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
    collapseGridSelectionTo(
      getStaticGridSelection(state.interaction.staticGrid),
      activeCell
    )
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
    selectGridRange(
      getStaticGridSelection(state.interaction.staticGrid),
      { start, end },
      { append, activeCell: "start" }
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
  const focusCell = options?.extend
    ? getGridSelectionExtent(current)
    : current.activeCell;
  const currentSlot = resolveGridSlot(state.contentSurface.reader, focusCell);
  const visualDx = dx > 0 && currentSlot ? dx + currentSlot.width - 1 : dx;
  const nextCell = resolveStaticGridAddress(
    state,
    moveGridAddress(focusCell, visualDx, dy)
  );
  const selection = options?.extend
    ? extendGridSelectionTo(current, nextCell)
    : collapseGridSelectionTo(current, nextCell);

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
  const current = getStaticGridSelection(state.interaction.staticGrid);
  const bounds = getGridBounds(state);
  const focusCell = options?.extend
    ? getGridSelectionExtent(current)
    : current.activeCell;
  let edgeCell = focusCell;
  if (edge === "top-left") {
    edgeCell = bounds.start;
  } else if (edge === "bottom-right") {
    edgeCell = bounds.end;
  } else {
    edgeCell = moveGridAddressToEdge(focusCell, edge, bounds);
  }
  const nextCell = resolveStaticGridAddress(state, edgeCell);
  const selection = options?.extend
    ? extendGridSelectionTo(current, nextCell)
    : collapseGridSelectionTo(current, nextCell);
  return createNavigationPatch(state, selection);
};

export const createStaticGridContentBoundaryFocusPatch = (
  state: StaticGridState,
  edge: GridEdge,
  options?: MoveOptions
): InteractionPatch => {
  const current = getStaticGridSelection(state.interaction.staticGrid);
  const focusCell = options?.extend
    ? getGridSelectionExtent(current)
    : current.activeCell;
  const nextCell = resolveStaticGridAddress(
    state,
    moveGridAddressToContentBoundary({
      grid: state.contentSurface.reader,
      address: focusCell,
      edge,
      fixedBounds: getActiveSlideGridBounds(state),
    })
  );
  const selection = options?.extend
    ? extendGridSelectionTo(current, nextCell)
    : collapseGridSelectionTo(current, nextCell);
  return createNavigationPatch(state, selection);
};

export const createStaticGridSelectAllPatch = (
  state: StaticGridState
): InteractionPatch => {
  const current = getStaticGridSelection(state.interaction.staticGrid);
  const connected = getConnectedGridRange(
    state.contentSurface.reader,
    current.activeCell
  );
  const range =
    current.additionalRanges.length === 0 &&
    gridRangesEqual(current.primaryRange, connected)
      ? getGridBounds(state)
      : connected;
  return createNavigationPatch(state, selectGridRange(current, range));
};

export const createStaticGridRowSelectionPatch = (
  state: StaticGridState
): InteractionPatch =>
  createNavigationPatch(
    state,
    selectGridRow(
      getStaticGridSelection(state.interaction.staticGrid),
      getGridBounds(state)
    )
  );

export const createStaticGridColumnSelectionPatch = (
  state: StaticGridState
): InteractionPatch =>
  createNavigationPatch(
    state,
    selectGridColumn(
      getStaticGridSelection(state.interaction.staticGrid),
      getGridBounds(state)
    )
  );

export const createStaticGridTextEditPatch = (
  state: StaticGridState,
  address?: GridAddress
): InteractionPatch => {
  const current = getStaticGridSelection(state.interaction.staticGrid);
  const activeCell = resolveStaticGridAddress(
    state,
    address ?? current.activeCell
  );
  return createCanvasInteractionPatch(state.interaction, {
    staticGrid: {
      mode: "text-edit",
      session: createInputSession(state, activeCell),
    },
  });
};

export const createStaticGridTextEditExitPatch = (
  state: StaticGridState
): InteractionPatch => createNavigationPatch(
  state,
  getStaticGridSelection(state.interaction.staticGrid)
);

export const createClearedStaticGridSelectionPatch = (
  state: StaticGridState
): InteractionPatch => {
  const current = getStaticGridSelection(state.interaction.staticGrid);
  return createNavigationPatch(
    state,
    collapseGridSelectionTo(current, current.activeCell)
  );
};
