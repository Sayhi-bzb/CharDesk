import type { EditorState } from "./interfaces";
import type { CanvasDocumentRegistry } from "./CanvasDocumentRegistry";
import { GridManager } from "@/shared/utils/grid";
import {
  advanceStaticGridInput,
  advanceStaticGridInputLine,
  collapseGridSelectionTo,
  createStaticGridInputSession,
  getStaticGridCursor,
  getStaticGridSelection,
  getStaticGridViewState,
  selectGridRange,
} from "@/domains/selection/public";
import { placeCharInYMap, placeStyledCellInYMap } from "./utils";
import type { Point } from "@/shared/types";
import { getGraphemeCellWidth as getCellOccupancy, splitGraphemes } from "@chardesk/protocol";
import { clampPointToActiveSlide, getActiveSlideGridBounds } from "./slideBounds";
import { resolveGridSlot } from "@/shared/utils/grid-occupancy";
import { resolveEditorDocumentAddress } from "./helpers/gridHelpers";
import { createCanvasInteractionPatch } from "./canvasInteractionState";
import { fillStaticGridSelectionWithChar } from "./canvasDocumentCommands";
import type {
  RichTextCell,
  RichTextRow,
  TextPasteOptions,
  TextWriteOptions,
} from "./textCommandTypes";
import {
  coordinateCanvasCommands,
  type CanvasStateCommitCoordinator,
} from "./CanvasStateCommitCoordinator";

const createInputSession = (state: EditorState, address: Point) =>
  createStaticGridInputSession({
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
  selection: ReturnType<typeof getStaticGridSelection>,
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
  selection: ReturnType<typeof getStaticGridSelection>,
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

export const createCanvasTextCommands = (
  commits: CanvasStateCommitCoordinator,
  documents: CanvasDocumentRegistry
) => {
  const get = commits.getState;
  const set = commits.setState;
  return coordinateCanvasCommands(commits, {
    write: (str: string, startPos?: Point, options?: TextWriteOptions) => {
      const current = get();
      const staticGrid = current.interaction.staticGrid;
      const textCursor = getStaticGridCursor(staticGrid);
      const inputSession = staticGrid.mode === "text-edit" ? staticGrid.session : null;
      const { brushColor, canvasMode } = current;

      const normalized = str.replace(/\r\n?/g, "\n");
      const graphemes = splitGraphemes(normalized);
      if (graphemes.length === 0) return;

      const staticGridView = getStaticGridViewState({
        state: staticGrid,
        grid: current.contentSurface.reader,
      });
      const staticGridInteraction = staticGridView.interaction;
      const hasRangeTarget = staticGridInteraction.kind === "range";

      if (hasRangeTarget && graphemes.length === 1 && graphemes[0] !== "\n") {
        fillStaticGridSelectionWithChar(
          documents,
          current,
          graphemes[0],
          options,
          commits.getDocumentHistoryMode()
        );
        return;
      }

      const fallbackSelectionStart =
        !startPos && !textCursor && hasRangeTarget
          ? (staticGridView.target.areas[0]?.start ?? null)
          : null;

      const cursor =
        startPos || textCursor || fallbackSelectionStart || staticGridInteraction.activeCell;

      const bounds = getActiveSlideGridBounds(current);
      let nextInputSession =
        startPos || !inputSession ? createInputSession(current, cursor) : inputSession;
      const writes: Array<{ point: Point; char: string }> = [];

      for (const char of graphemes) {
        if (char === "\n") {
          nextInputSession = advanceStaticGridInputLine({
            session: nextInputSession,
            bounds,
          });
        } else {
          const step = advanceStaticGridInput({
            session: nextInputSession,
            width: getCellOccupancy(char),
            bounds,
          });
          nextInputSession = step.session;
          if (step.writeAt) writes.push({ point: step.writeAt, char });
        }
        if (nextInputSession.exhausted) break;
      }

      if (writes.length === 0 && nextInputSession === inputSession) return;

      if (writes.length > 0) {
        documents.mutateGridAt(
          resolveEditorDocumentAddress(documents, current),
          (gridWriter) => {
            writes.forEach(({ point, char }) => {
              placeCharInYMap(gridWriter, point.x, point.y, char, brushColor, options);
            });
          },
          commits.getDocumentHistoryMode()
        );
      }

      if (options?.selectResult && canvasMode === "freeform" && writes.length > 0) {
        set(
          createCanvasInteractionPatch(current.interaction, {
            staticGrid: {
              mode: "navigate",
              selection: selectWrittenCells(
                getStaticGridSelection(current.interaction.staticGrid),
                writes
              ),
            },
          })
        );
        return;
      }

      set(
        createCanvasInteractionPatch(current.interaction, {
          staticGrid: { mode: "text-edit", session: nextInputSession },
        })
      );
    },

    pasteRichData: (cells: RichTextCell[], startPos?: Point, options?: TextPasteOptions) => {
      const state = get();
      const { canvasMode } = state;
      const staticGrid = state.interaction.staticGrid;
      const staticGridView = getStaticGridViewState({
        state: staticGrid,
        grid: state.contentSurface.reader,
      });
      const staticGridInteraction = staticGridView.interaction;

      const basePos =
        startPos ??
        (staticGridInteraction.kind === "text-edit" ? staticGridInteraction.cursor : null) ??
        (staticGridInteraction.kind === "range"
          ? staticGridInteraction.geometry.bounds?.start
          : null) ??
        staticGridInteraction.activeCell;
      const cellsBySourcePoint = new Map(
        cells.map((cell) => [GridManager.toKey(cell.x, cell.y), cell])
      );
      const writes = cells
        .filter((cell) => !isWideFollowerRichCell(cell, cellsBySourcePoint))
        .map((cell) => ({
          cell,
          point: {
            x: basePos.x + cell.x,
            y: basePos.y + cell.y,
          },
          char: cell.char,
        }));
      documents.mutateGridAt(
        resolveEditorDocumentAddress(documents, state),
        (gridWriter) => {
          writes.forEach(({ cell, point }) => {
            placeStyledCellInYMap(
              gridWriter,
              point.x,
              point.y,
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
        },
        commits.getDocumentHistoryMode()
      );
      if (options?.selectResult && canvasMode === "freeform" && writes.length > 0) {
        set(
          createCanvasInteractionPatch(state.interaction, {
            staticGrid: {
              mode: "navigate",
              selection: selectWrittenCells(
                getStaticGridSelection(state.interaction.staticGrid),
                writes
              ),
            },
          })
        );
      }
    },

    pasteRichRows: (rows: readonly RichTextRow[], startPos?: Point, options?: TextPasteOptions) => {
      const state = get();
      if (rows.length === 0) return;
      const staticGridView = getStaticGridViewState({
        state: state.interaction.staticGrid,
        grid: state.contentSurface.reader,
      });
      const staticGridInteraction = staticGridView.interaction;
      const basePos =
        startPos ??
        (staticGridInteraction.kind === "text-edit" ? staticGridInteraction.cursor : null) ??
        (staticGridInteraction.kind === "range"
          ? staticGridInteraction.geometry.bounds?.start
          : null) ??
        staticGridInteraction.activeCell;
      const operation = documents.applyCellPlanePatchAt(
        resolveEditorDocumentAddress(documents, state),
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
        },
        commits.getDocumentHistoryMode()
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
        set(
          createCanvasInteractionPatch(state.interaction, {
            staticGrid: {
              mode: "navigate",
              selection: selectWrittenBounds(
                getStaticGridSelection(state.interaction.staticGrid),
                writtenBounds!
              ),
            },
          })
        );
      }
    },

    moveCursor: (dx: number, dy: number) => {
      const state = get();
      if (state.interaction.staticGrid.mode !== "text-edit") return;
      const { contentSurface } = state;
      const grid = contentSurface.reader;
      const currentPoint = state.interaction.staticGrid.session.activeCell;
      let newX = currentPoint.x;
      const newY = currentPoint.y + dy;
      if (dx > 0) {
        const slot = resolveGridSlot(grid, currentPoint);
        newX = slot ? slot.anchor.x + slot.width + dx - 1 : newX + dx;
      } else if (dx < 0) {
        newX = resolveGridSlot(grid, { x: newX - 1, y: currentPoint.y })?.anchor.x ?? newX + dx;
      }
      const nextCell = clampPointToActiveSlide(state, { x: newX, y: newY });
      set(
        createCanvasInteractionPatch(state.interaction, {
          staticGrid: {
            mode: "text-edit",
            session: createInputSession(state, nextCell),
          },
        })
      );
    },

    newline: () => {
      const state = get();
      if (state.interaction.staticGrid.mode !== "text-edit") return;
      const nextSession = advanceStaticGridInputLine({
        session: state.interaction.staticGrid.session,
        bounds: getActiveSlideGridBounds(state),
      });
      set(
        createCanvasInteractionPatch(state.interaction, {
          staticGrid: { mode: "text-edit", session: nextSession },
        })
      );
    },

    indent: () => {
      const state = get();
      if (state.interaction.staticGrid.mode !== "text-edit") return;
      const textCursor = state.interaction.staticGrid.session.activeCell;
      const activeCell = clampPointToActiveSlide(state, {
        x: textCursor.x + 2,
        y: textCursor.y,
      });
      set(
        createCanvasInteractionPatch(state.interaction, {
          staticGrid: {
            mode: "text-edit",
            session: createInputSession(state, activeCell),
          },
        })
      );
    },
  } as const);
};
