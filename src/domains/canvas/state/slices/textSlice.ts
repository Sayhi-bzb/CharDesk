import type { StateCreator } from "zustand";
import type { EditorState, TextSlice } from "../interfaces";
import type { CanvasDocumentRegistry } from "../CanvasDocumentRegistry";
import { GridManager } from "@/shared/utils/grid";
import {
  advanceStaticGridInput,
  advanceStaticGridInputLine,
  collapseGridSelectionTo,
  createStaticGridInputSession,
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
  getGraphemeCellWidth as getCellOccupancy,
  splitGraphemes,
} from "@chardesk/protocol";
import { clampPointToActiveSlide, getActiveSlideGridBounds } from "../slideBounds";
import { resolveGridSlot } from "@/shared/utils/grid-occupancy";
import { resolveEditorDocumentAddress } from "../helpers/gridHelpers";
import {
  createCanvasInteractionPatch,
  type CanvasInteractionSnapshot,
} from "../canvasInteractionState";
import { fillStaticGridSelectionWithChar } from "../canvasDocumentCommands";

const createInputSession = (
  state: EditorState,
  address: Point
) => createStaticGridInputSession({
  origin: address,
  bounds: getActiveSlideGridBounds(state),
});

const isWideFollowerRichCell = (
  cell: { x: number; y: number; char: string },
  cellsBySourcePoint: Map<string, { char: string }>
) => {
  if (cell.char !== " ") return false;
  const leftCell = cellsBySourcePoint.get(GridManager.toKey(cell.x - 1, cell.y));
  return !!leftCell && getCellOccupancy(leftCell.char) === 2;
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
      staticGridInputSession,
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
    let inputSession =
      startPos || !staticGridInputSession
        ? createInputSession(state, cursor)
        : staticGridInputSession;
    const writes: Array<{ point: Point; char: string }> = [];

    for (const char of graphemes) {
      if (char === "\n") {
        inputSession = advanceStaticGridInputLine({
          session: inputSession,
          bounds,
        });
      } else {
        const step = advanceStaticGridInput({
          session: inputSession,
          width: getCellOccupancy(char),
          bounds,
        });
        inputSession = step.session;
        if (step.writeAt) writes.push({ point: step.writeAt, char });
      }
      if (inputSession.exhausted) break;
    }

    if (writes.length === 0 && inputSession === staticGridInputSession) return;

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
        staticGridInputSession: null,
      }));
      return;
    }

    const activeCell = clampPointToActiveSlide(state, inputSession.activeCell);
    set((current) => createCanvasInteractionPatch(current.interaction, {
      textCursor: activeCell,
      staticGridSelection: collapseGridSelectionTo(
        current.interaction.staticGridSelection,
        activeCell
      ),
      staticGridEditMode: "text-edit",
      staticGridInputSession: inputSession,
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
        staticGridInputSession: null,
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
        staticGridInputSession: null,
      }));
    }
  },

  moveTextCursor: (dx, dy) => {
    const state = get();
    const { textCursor, staticGridInputSession } = state.interaction;
    const { contentSurface } = state;
    const grid = contentSurface.reader;
    if (!textCursor) return;
    const currentPoint = staticGridInputSession?.activeCell ?? textCursor;
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
      staticGridInputSession: createInputSession(state, nextCell),
    }));
  },

  backspaceText: () => {
    const state = get();
    const { textCursor, staticGridInputSession } = state.interaction;
    const { contentSurface } = state;
    const grid = contentSurface.reader;
    if (!textCursor) return;

    const inputSession =
      staticGridInputSession ??
      createInputSession(get(), textCursor);
    const backspaceOrigin = inputSession.exhausted
      ? inputSession.activeCell
      : inputSession.nextCell;
    const deletePos =
      inputSession.previousCell
      ?? resolveBackspaceAnchor(grid, backspaceOrigin.x, backspaceOrigin.y);
    documents.mutateGridAt(resolveEditorDocumentAddress(documents, get()), (gridWriter) => {
      deleteCellAt(gridWriter, deletePos.x, deletePos.y);
    });
    const nextSession = {
      ...inputSession,
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
      staticGridInputSession: nextSession,
    }));
  },

  deleteTextForward: () => undefined,

  newlineText: () => {
    const state = get();
    const { textCursor, staticGridInputSession } = state.interaction;
    if (!textCursor) return;

    const inputSession =
      staticGridInputSession ??
      createInputSession(state, textCursor);
    const nextSession = advanceStaticGridInputLine({
      session: inputSession,
      bounds: getActiveSlideGridBounds(state),
    });
    const activeCell = clampPointToActiveSlide(state, nextSession.activeCell);
    set(createCanvasInteractionPatch(state.interaction, {
      textCursor: activeCell,
      staticGridSelection: collapseGridSelectionTo(
        state.interaction.staticGridSelection,
        activeCell
      ),
      staticGridInputSession: nextSession,
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
      staticGridInputSession: createInputSession(state, activeCell),
    }));
  },
});
