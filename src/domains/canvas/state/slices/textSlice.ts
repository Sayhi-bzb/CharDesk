import type { StateCreator } from "zustand";
import type { EditorState, TextSlice } from "../interfaces";
import type { CanvasDocumentRegistry } from "../CanvasDocumentRegistry";
import { GridManager } from "@/shared/utils/grid";
import {
  advanceStaticGridInputFlow,
  advanceStaticGridInputFlowLine,
  collapseGridSelectionTo,
  createStaticGridInputFlow,
  getStaticGridViewState,
  selectGridRange,
} from "@/domains/selection/public";
import { placeCharInYMap, placeStyledCellInYMap } from "../utils";
import {
  deleteCellAt,
  resolveBackspaceAnchor,
} from "../gridOps";
import type { Point } from "@/shared/types";
import {
  getCellOccupancy,
  isWideCell,
  splitGraphemes,
} from "@/shared/metrics";
import { clampPointToActiveSlide, getActiveSlideGridBounds } from "../slideBounds";
import { resolveGridSlot } from "@/shared/utils/grid-occupancy";
import { resolveEditorDocumentAddress } from "../helpers/gridHelpers";
import {
  createCanvasInteractionPatch,
  type CanvasInteractionSnapshot,
} from "../canvasInteractionState";
import { fillStaticGridSelectionWithChar } from "../canvasDocumentCommands";

const createInputFlow = (
  state: EditorState,
  address: Point
) => createStaticGridInputFlow({
  grid: state.contentSurface.reader,
  address,
  bounds: getActiveSlideGridBounds(state),
  lineOriginX: state.contentSurface.reader.getLineOriginX?.(address),
});

const isWideFollowerRichCell = (
  cell: { x: number; y: number; char: string },
  cellsBySourcePoint: Map<string, { char: string }>
) => {
  if (cell.char !== " ") return false;
  const leftCell = cellsBySourcePoint.get(GridManager.toKey(cell.x - 1, cell.y));
  return !!leftCell && isWideCell(leftCell.char);
};

type WrittenCell = { point: Point; char: string };

type WrittenBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

const selectWrittenBounds = (
  selection: CanvasInteractionSnapshot["staticGridSelection"],
  bounds: WrittenBounds
) => {
  const start = { x: bounds.minX, y: bounds.minY };
  if (bounds.minX === bounds.maxX && bounds.minY === bounds.maxY) {
    return collapseGridSelectionTo(selection, start);
  }
  return selectGridRange(
    selection,
    { start, end: { x: bounds.maxX, y: bounds.maxY } },
    { activeCell: "start" }
  );
};

const selectWrittenCells = (
  selection: CanvasInteractionSnapshot["staticGridSelection"],
  writes: WrittenCell[]
) => {
  if (writes.length === 0) return selection;
  const first = writes[0];
  let minX = first.point.x;
  let maxX = first.point.x + getCellOccupancy(first.char) - 1;
  let minY = first.point.y;
  let maxY = first.point.y;

  writes.slice(1).forEach(({ point, char }) => {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x + getCellOccupancy(char) - 1);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  });

  return selectWrittenBounds(selection, { minX, minY, maxX, maxY });
};

export const createTextSlice = (
  documents: CanvasDocumentRegistry
): StateCreator<EditorState, [], [], TextSlice> => (set, get) => ({
  writeTextString: (str, startPos, options) => {
    const current = get();
    const {
      staticGridSelection,
      staticGridEditMode,
      staticGridInputFlow,
      textCursor,
    } = current.interaction;
    const { brushColor, canvasMode } = current;

    const normalized = str.replace(/\r\n?/g, "\n");
    const graphemes = splitGraphemes(normalized);
    if (graphemes.length === 0) return;

    const staticGridView = getStaticGridViewState({
      selection: staticGridSelection,
      editMode: staticGridEditMode,
      textCursor,
      grid: get().contentSurface.reader,
    });
    const staticGridInteraction = staticGridView.interaction;
    const hasRangeTarget = staticGridInteraction.kind === "range";

    if (hasRangeTarget && graphemes.length === 1 && graphemes[0] !== "\n") {
      fillStaticGridSelectionWithChar(
        documents,
        current,
        graphemes[0],
        options
      );
      return;
    }

    const fallbackSelectionStart = !startPos && !textCursor && hasRangeTarget
      ? staticGridView.target.areas[0]?.start ?? null
      : null;

    const cursor = startPos
      || textCursor
      || fallbackSelectionStart
      || staticGridInteraction.activeCell;

    const state = get();
    const bounds = getActiveSlideGridBounds(state);
    let flow =
      startPos || !staticGridInputFlow
        ? createInputFlow(state, cursor)
        : staticGridInputFlow;
    const writes: Array<{ point: Point; char: string }> = [];

    for (const char of graphemes) {
      if (char === "\n") {
        flow = advanceStaticGridInputFlowLine({ flow, bounds });
      } else {
        const step = advanceStaticGridInputFlow({
          flow,
          width: getCellOccupancy(char),
          bounds,
        });
        flow = step.flow;
        if (step.writeAt) writes.push({ point: step.writeAt, char });
      }
      if (flow.exhausted) break;
    }

    if (writes.length === 0 && flow === staticGridInputFlow) return;

    if (writes.length > 0) {
      documents.mutateGridAt(resolveEditorDocumentAddress(documents, get()), (gridWriter) => {
        writes.forEach(({ point, char }) => {
          placeCharInYMap(gridWriter, point.x, point.y, char, brushColor, options);
        });
      });
    }

    if (options?.selectResult && canvasMode === "freeform" && writes.length > 0) {
      set((current) => createCanvasInteractionPatch(current.interaction, {
        textCursor: null,
        staticGridSelection: selectWrittenCells(
          current.interaction.staticGridSelection,
          writes
        ),
        staticGridEditMode: "navigate",
        staticGridInputFlow: null,
      }));
      return;
    }

    const activeCell = clampPointToActiveSlide(state, flow.activeCell);
    set((current) => createCanvasInteractionPatch(current.interaction, {
      textCursor: activeCell,
      staticGridSelection: collapseGridSelectionTo(
        current.interaction.staticGridSelection,
        activeCell
      ),
      staticGridEditMode: "text-edit",
      staticGridInputFlow: flow,
    }));
  },

  pasteRichData: (cells, startPos, options) => {
    const state = get();
    const { canvasMode } = state;
    const {
      textCursor,
      staticGridSelection,
      staticGridEditMode,
    } = state.interaction;
    const staticGridView = getStaticGridViewState({
      selection: staticGridSelection,
      editMode: staticGridEditMode,
      textCursor,
      grid: get().contentSurface.reader,
    });
    const staticGridInteraction = staticGridView.interaction;

    const basePos =
      startPos ??
      (staticGridInteraction.kind === "text-edit"
        ? staticGridInteraction.cursor
        : null) ??
      (staticGridInteraction.kind === "range"
        ? staticGridInteraction.geometry.bounds?.start
        : null) ??
      textCursor ??
      staticGridInteraction.activeCell;
    const cellsBySourcePoint = new Map(
      cells.map((cell) => [GridManager.toKey(cell.x, cell.y), cell])
    );
    const writes: WrittenCell[] = [];
    documents.mutateGridAt(resolveEditorDocumentAddress(documents, get()), (gridWriter) => {
      cells.forEach((cell) => {
        if (isWideFollowerRichCell(cell, cellsBySourcePoint)) return;
        const nextPoint = {
          x: basePos.x + cell.x,
          y: basePos.y + cell.y,
        };
        writes.push({ point: nextPoint, char: cell.char });
        placeStyledCellInYMap(
          gridWriter,
          nextPoint.x,
          nextPoint.y,
          cell.char,
          {
            color: cell.color,
            ...(cell.bgColor ? { bgColor: cell.bgColor } : {}),
            ...(cell.attrs ? { attrs: cell.attrs } : {}),
            ...(cell.href ? { href: cell.href } : {}),
          },
          { preserveTargetBackground: true }
        );
      });
    });
    if (options?.selectResult && canvasMode === "freeform" && writes.length > 0) {
      set((current) => createCanvasInteractionPatch(current.interaction, {
        textCursor: null,
        staticGridSelection: selectWrittenCells(
          current.interaction.staticGridSelection,
          writes
        ),
        staticGridEditMode: "navigate",
        staticGridInputFlow: null,
      }));
    }
  },

  pasteRichRows: (rows, startPos, options) => {
    const state = get();
    const { textCursor, staticGridSelection, staticGridEditMode } = state.interaction;
    if (rows.length === 0) return;
    const staticGridView = getStaticGridViewState({
      selection: staticGridSelection,
      editMode: staticGridEditMode,
      textCursor,
      grid: get().contentSurface.reader,
    });
    const staticGridInteraction = staticGridView.interaction;
    const basePos =
      startPos ??
      (staticGridInteraction.kind === "text-edit"
        ? staticGridInteraction.cursor
        : null) ??
      (staticGridInteraction.kind === "range"
        ? staticGridInteraction.geometry.bounds?.start
        : null) ??
      textCursor ??
      staticGridInteraction.activeCell;
    const operation = documents.applyCellPlanePatchAt(
      resolveEditorDocumentAddress(documents, get()),
      {
        rows: rows.map((row) => ({
          y: basePos.y + row.y,
          erase: [],
          spans: row.spans.map((span) => ({
            x: basePos.x + span.x,
            text: span.text,
            color: span.color,
            ...(span.bgColor ? { bgColor: span.bgColor } : {}),
            ...(span.attrs ? { attrs: span.attrs } : {}),
            ...(span.href ? { href: span.href } : {}),
            preserveTargetBackground: true,
          })),
        })),
      }
    );
    const writtenBounds: WrittenBounds | null = operation
      ? {
          minX: operation.bounds.x,
          minY: operation.bounds.y,
          maxX: operation.bounds.x + operation.bounds.width - 1,
          maxY: operation.bounds.y + operation.bounds.height - 1,
        }
      : null;
    if (options?.selectResult && writtenBounds) {
      set((current) => createCanvasInteractionPatch(current.interaction, {
        textCursor: null,
        staticGridSelection: selectWrittenBounds(
          current.interaction.staticGridSelection,
          writtenBounds!
        ),
        staticGridEditMode: "navigate",
        staticGridInputFlow: null,
      }));
    }
  },

  moveTextCursor: (dx, dy) => {
    const state = get();
    const { textCursor, staticGridInputFlow } = state.interaction;
    const { contentSurface } = state;
    const grid = contentSurface.reader;
    if (!textCursor) return;
    const currentPoint = staticGridInputFlow?.activeCell ?? textCursor;
    let newX = currentPoint.x;
    const newY = currentPoint.y + dy;
    if (dx > 0) {
      const slot = resolveGridSlot(grid, currentPoint);
      newX = slot ? slot.anchor.x + slot.width + dx - 1 : newX + dx;
    } else if (dx < 0) {
      newX = resolveGridSlot(grid, { x: newX - 1, y: currentPoint.y })?.anchor.x ?? newX + dx;
    }
    const nextCell = clampPointToActiveSlide(state, { x: newX, y: newY });
    set(createCanvasInteractionPatch(state.interaction, {
      textCursor: nextCell,
      staticGridSelection: collapseGridSelectionTo(
        state.interaction.staticGridSelection,
        nextCell
      ),
      staticGridInputFlow: createInputFlow(state, nextCell),
    }));
  },

  backspaceText: () => {
    const state = get();
    const { textCursor, staticGridInputFlow } = state.interaction;
    const { contentSurface } = state;
    const grid = contentSurface.reader;
    if (!textCursor) return;

    const flow =
      staticGridInputFlow ??
      createInputFlow(get(), textCursor);
    const backspaceOrigin = flow.exhausted ? flow.activeCell : flow.nextCell;
    const deletePos =
      flow.previousCell ?? resolveBackspaceAnchor(grid, backspaceOrigin.x, backspaceOrigin.y);
    documents.mutateGridAt(resolveEditorDocumentAddress(documents, get()), (gridWriter) => {
      deleteCellAt(gridWriter, deletePos.x, deletePos.y);
    });
    const nextFlow = {
      ...flow,
      nextCell: { ...deletePos },
      activeCell: { ...deletePos },
      previousCell: null,
      exhausted: false,
    };
    set((current) => createCanvasInteractionPatch(current.interaction, {
      textCursor: deletePos,
      staticGridSelection: collapseGridSelectionTo(
        current.interaction.staticGridSelection,
        deletePos
      ),
      staticGridInputFlow: nextFlow,
    }));
  },

  deleteTextForward: () => undefined,

  newlineText: () => {
    const state = get();
    const { textCursor, staticGridInputFlow } = state.interaction;
    if (!textCursor) return;

    const flow =
      staticGridInputFlow ??
      createInputFlow(state, textCursor);
    const nextFlow = advanceStaticGridInputFlowLine({
      flow,
      bounds: getActiveSlideGridBounds(state),
    });
    const activeCell = clampPointToActiveSlide(state, nextFlow.activeCell);
    set(createCanvasInteractionPatch(state.interaction, {
      textCursor: activeCell,
      staticGridSelection: collapseGridSelectionTo(
        state.interaction.staticGridSelection,
        activeCell
      ),
      staticGridInputFlow: nextFlow,
    }));
  },

  indentText: () => {
    const state = get();
    const { textCursor } = state.interaction;
    if (!textCursor) return;
    const activeCell = clampPointToActiveSlide(state, {
      x: textCursor.x + 2,
      y: textCursor.y,
    });
    set(createCanvasInteractionPatch(state.interaction, {
      textCursor: activeCell,
      staticGridSelection: collapseGridSelectionTo(
        state.interaction.staticGridSelection,
        activeCell
      ),
      staticGridInputFlow: createInputFlow(state, activeCell),
    }));
  },
});
