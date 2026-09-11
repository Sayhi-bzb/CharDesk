import { createStaticGridRangeMovePlan } from "../cell-plane/rangeMove";
import type { StoreApi } from "zustand";
import {
  collapseGridSelectionTo,
  createStaticGridInputSession,
  forEachGridSelectionSpan,
  getGridSelectionRanges,
  getStaticGridSelectionAreas,
  getStaticGridSelection,
  getStaticGridViewState,
  resolveStaticGridDeletePlan,
  type StaticGridDeleteDirection,
} from "@/domains/selection/public";
import { getGraphemeCellWidth as getCellOccupancy } from "@chardesk/protocol";
import type {
  GridCell,
  Point,
  SelectionArea,
  TextAttributes,
} from "@/shared/types";
import { cloneTextAttributes } from "@/shared/utils/ansi";
import { GridManager } from "@/shared/utils/grid";
import { createGridMapSource } from "@/shared/utils/grid-source";
import {
  createPointGridReader,
  resolveGridSlot,
} from "@/shared/utils/grid-occupancy";
import { writeStyledCell } from "@/shared/utils/grid-ops";
import { getSelectionBounds } from "@/shared/utils/selection";
import type { CanvasDocumentRegistry } from "./CanvasDocumentRegistry";
import { createCanvasInteractionPatch } from "./canvasInteractionState";
import { resolveEditorDocumentAddress } from "./helpers/gridHelpers";
import type { EditorState } from "./interfaces";
import { getActiveSlideGridBounds } from "./slideBounds";
import { createClearedScratchLayerPatch } from "./transitions/scratchLayerTransitions";
import { placeCharInYMap } from "./utils";
import { deleteCellAt, deleteRect } from "./gridOps";

const resolveSelectionAreas = (state: EditorState) =>
  getStaticGridSelectionAreas(
    getStaticGridSelection(state.interaction.staticGrid),
    state.contentSurface.reader
  );

const forEachSelectionSpan = (
  state: EditorState,
  visit: (span: { y: number; minX: number; maxX: number }) => void
) =>
  forEachGridSelectionSpan(
    getGridSelectionRanges(getStaticGridSelection(state.interaction.staticGrid)),
    visit,
    state.contentSurface.reader
  );

const isUnstyledBlankCell = (cell: GridCell) =>
  cell.char === " " && !cell.bgColor && !cloneTextAttributes(cell.attrs);

export const fillStaticGridSelectionWithChar = (
  documents: CanvasDocumentRegistry,
  state: EditorState,
  char: string,
  options?: { preserveTargetBackground?: boolean }
) => {
  const selections = resolveSelectionAreas(state);
  if (selections.length === 0) return;

  const charWidth = getCellOccupancy(char);
  const address = resolveEditorDocumentAddress(documents, state);
  documents.mutateGridAt(address, (grid) => {
    forEachSelectionSpan(state, ({ y, minX, maxX }) => {
      for (let x = minX; x <= maxX; x += charWidth) {
        if (x + charWidth - 1 > maxX) break;
        placeCharInYMap(grid, x, y, char, state.brushColor, options);
      }
    });
  });
};

const deleteStaticGridSelection = (
  documents: CanvasDocumentRegistry,
  state: EditorState
) => {
  const address = resolveEditorDocumentAddress(documents, state);
  documents.mutateGridAt(address, (grid) => {
    forEachSelectionSpan(state, ({ y, minX, maxX }) => {
      deleteRect(grid, minX, y, maxX, y);
    });
  });
};

export const createCanvasDocumentCommands = (
  store: Pick<StoreApi<EditorState>, "getState" | "setState">,
  documents: CanvasDocumentRegistry
) => ({
  deleteSelection: () => deleteStaticGridSelection(documents, store.getState()),

  deleteStaticGrid: (direction: StaticGridDeleteDirection) => {
    const state = store.getState();
    const interaction = getStaticGridViewState({
      state: state.interaction.staticGrid,
      grid: state.contentSurface.reader,
    }).interaction;
    const plan = resolveStaticGridDeletePlan({
      interaction,
      direction,
      grid: state.contentSurface.reader,
      bounds: getActiveSlideGridBounds(state),
      previousInputCell: state.interaction.staticGrid.mode === "text-edit"
        ? state.interaction.staticGrid.session.previousCell
        : null,
    });
    if (plan.kind === "noop") return;
    if (plan.kind === "range") {
      deleteStaticGridSelection(documents, state);
      return;
    }

    const address = resolveEditorDocumentAddress(documents, state);
    documents.mutateGridAt(address, (grid) => {
      deleteCellAt(grid, plan.target.x, plan.target.y);
    });

    if (interaction.kind === "text-edit") {
      const inputSession = state.interaction.staticGrid.mode === "text-edit"
        ? state.interaction.staticGrid.session
        : createStaticGridInputSession({
            origin: interaction.activeCell,
            bounds: getActiveSlideGridBounds(state),
          });
      const nextSession = direction === "backward"
        ? {
            ...inputSession,
            nextCell: { ...plan.nextActiveCell },
            activeCell: { ...plan.nextActiveCell },
            previousCell: null,
            exhausted: false,
          }
        : inputSession;
      store.setState((current) => createCanvasInteractionPatch(
        current.interaction,
        {
          staticGrid: { mode: "text-edit", session: nextSession },
        }
      ));
      return;
    }

    store.setState((current) => createCanvasInteractionPatch(
      current.interaction,
      {
        staticGrid: {
          mode: "navigate",
          selection: collapseGridSelectionTo(
            getStaticGridSelection(current.interaction.staticGrid),
            plan.nextActiveCell
          ),
        },
      }
    ));
  },

  erasePoints: (points: Point[], shouldSaveHistory = true) => {
    const state = store.getState();
    if (points.length === 0) return;
    const address = resolveEditorDocumentAddress(documents, state);
    documents.mutateGridAt(
      address,
      (grid) => {
        points.forEach((point) => deleteCellAt(grid, point.x, point.y));
      },
      shouldSaveHistory
    );
  },

  fillSelectionsWithChar: (
    char: string,
    options?: { preserveTargetBackground?: boolean }
  ) =>
    fillStaticGridSelectionWithChar(
      documents,
      store.getState(),
      char,
      options
    ),

  setSelectionTextAttributes: (
    attrs: Partial<Record<keyof TextAttributes, boolean>>
  ) => {
    const state = store.getState();
    const selections = resolveSelectionAreas(state);
    if (selections.length === 0) return;

    const shouldMaterializeBlank =
      attrs.underline === true ||
      attrs.strike === true ||
      attrs.inverse === true;
    const address = resolveEditorDocumentAddress(documents, state);
    documents.mutateGridAt(address, (grid) => {
      const reader = createPointGridReader(grid);
      forEachSelectionSpan(state, ({ y, minX, maxX }) => {
        for (let x = minX; x <= maxX; x++) {
          if (resolveGridSlot(reader, { x, y })?.offset === 1) continue;
          const key = GridManager.toKey(x, y);
          const existingCell = grid.get(key);
          if (!existingCell && !shouldMaterializeBlank) continue;

          const nextAttrs = cloneTextAttributes(existingCell?.attrs) ?? {};
          Object.entries(attrs).forEach(([name, enabled]) => {
            const attrName = name as keyof TextAttributes;
            if (enabled) nextAttrs[attrName] = true;
            else delete nextAttrs[attrName];
          });

          const normalizedAttrs = cloneTextAttributes(nextAttrs);
          const nextCell: GridCell = existingCell
            ? { ...existingCell }
            : { char: " ", color: state.brushColor };
          if (normalizedAttrs) nextCell.attrs = normalizedAttrs;
          else delete nextCell.attrs;

          if (isUnstyledBlankCell(nextCell)) grid.delete(key);
          else grid.set(key, nextCell);
        }
      });
    });
  },

  setSelectionForegroundColor: (color: string) => {
    const state = store.getState();
    const selections = resolveSelectionAreas(state);
    if (selections.length === 0) return;

    const address = resolveEditorDocumentAddress(documents, state);
    documents.mutateGridAt(address, (grid) => {
      const reader = createPointGridReader(grid);
      forEachSelectionSpan(state, ({ y, minX, maxX }) => {
        for (let x = minX; x <= maxX; x++) {
          if (resolveGridSlot(reader, { x, y })?.offset === 1) continue;
          const key = GridManager.toKey(x, y);
          const existingCell = grid.get(key);
          if (existingCell) grid.set(key, { ...existingCell, color });
        }
      });
    });
  },

  setSelectionBackgroundColor: (bgColor: string | null) => {
    const state = store.getState();
    const selections = resolveSelectionAreas(state);
    if (selections.length === 0) return;

    const address = resolveEditorDocumentAddress(documents, state);
    documents.mutateGridAt(address, (grid) => {
      const reader = createPointGridReader(grid);
      forEachSelectionSpan(state, ({ y, minX, maxX }) => {
        for (let x = minX; x <= maxX; x++) {
          if (resolveGridSlot(reader, { x, y })?.offset === 1) continue;
          const key = GridManager.toKey(x, y);
          const existingCell = grid.get(key);
          if (!existingCell && !bgColor) continue;

          const nextCell: GridCell = existingCell
            ? { ...existingCell }
            : { char: " ", color: state.brushColor };
          if (bgColor) nextCell.bgColor = bgColor;
          else delete nextCell.bgColor;

          if (isUnstyledBlankCell(nextCell)) grid.delete(key);
          else grid.set(key, nextCell);
        }
      });
    });
  },

  commitScratch: () => {
    const state = store.getState();
    const { scratchLayer } = state.interaction;
    if (!scratchLayer || scratchLayer.size === 0) return;

    const address = resolveEditorDocumentAddress(documents, state);
    documents.mutateGridAt(address, (grid) => {
      const reader = createPointGridReader(grid);
      GridManager.iterate(createGridMapSource(scratchLayer), (cell, x, y) => {
        if (cell.bgColor && cell.char === " ") {
          const slot = resolveGridSlot(reader, { x, y });
          const anchor = slot?.anchor ?? { x, y };
          writeStyledCell(grid, anchor.x, anchor.y, {
            ...(slot?.cell ?? { char: " ", color: cell.color }),
            bgColor: cell.bgColor,
          });
          return;
        }
        if (cell.bgColor || cell.attrs || cell.href) {
          writeStyledCell(grid, x, y, {
            char: cell.char,
            color: cell.color,
            ...(cell.bgColor ? { bgColor: cell.bgColor } : {}),
            ...(cell.attrs ? { attrs: cell.attrs } : {}),
            ...(cell.href ? { href: cell.href } : {}),
          });
          return;
        }
        placeCharInYMap(grid, x, y, cell.char, cell.color);
      });
    });
    store.setState((current) =>
      createClearedScratchLayerPatch(current.interaction)
    );
  },

  fillArea: (area: SelectionArea) => {
    const state = store.getState();
    const { minX, maxX, minY, maxY } = getSelectionBounds(area);
    const address = resolveEditorDocumentAddress(documents, state);

    documents.mutateGridAt(address, (grid) => {
      const reader = createPointGridReader(grid);
      const updated = new Set<string>();
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const slot = resolveGridSlot(reader, { x, y });
          if (!slot) continue;
          const key = GridManager.toKey(slot.anchor.x, slot.anchor.y);
          if (updated.has(key)) continue;
          updated.add(key);
          grid.set(key, { ...slot.cell, color: state.brushColor });
        }
      }
    });
  },

  moveStaticGridSelection: (requestedDelta: Point) => {
    const state = store.getState();
    const selection = getStaticGridSelection(state.interaction.staticGrid);
    if (
      selection.mode !== "range" ||
      selection.additionalRanges.length > 0
    ) {
      return false;
    }

    const plan = createStaticGridRangeMovePlan({
      source: state.contentSurface.reader,
      range: selection.primaryRange,
      requestedDelta,
      bounds: getActiveSlideGridBounds(state),
    });
    if (!plan) return false;

    const address = resolveEditorDocumentAddress(documents, state);
    const operation = documents.applyCellPlanePatchAt(
      address,
      plan.patch,
      "save"
    );
    if (!operation) return false;

    store.setState((current) =>
      createCanvasInteractionPatch(current.interaction, {
        staticGrid: {
          mode: "navigate",
          selection: {
            ...getStaticGridSelection(current.interaction.staticGrid),
            activeCell: {
              x: selection.activeCell.x + plan.delta.x,
              y: selection.activeCell.y + plan.delta.y,
            },
            anchorCell: {
              x: selection.anchorCell.x + plan.delta.x,
              y: selection.anchorCell.y + plan.delta.y,
            },
            primaryRange: plan.targetRange,
          },
        },
      })
    );
    return true;
  },
});
