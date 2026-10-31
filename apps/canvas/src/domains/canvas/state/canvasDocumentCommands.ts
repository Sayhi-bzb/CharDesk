import { planDrawingPatch, planForegroundFill } from '@chardesk/editor-core/drawing/planner';
import { createStaticGridRangeMovePlan, planRangeMoveAnchors } from '../cell-plane/rangeMove';
import {
  forEachGridSelectionSpan,
  getGridSelectionRanges,
  getStaticGridSelectionAreas,
  getStaticGridSelection,
  getStaticGridViewState,
  resolveStaticGridDeletePlan,
  type StaticGridDeleteDirection,
} from '@/domains/selection/public';
import { fillGridSelection } from '@chardesk/editor-core/selection/fill';
import { resolveStaticGridDeletionState } from '@chardesk/editor-core/selection/static-grid-deletion';
import type { GridCell, Point, SelectionArea, TextAttributes } from '@/shared/types';
import { cloneTextAttributes } from '@/shared/utils/ansi';
import { GridManager } from '@/shared/utils/grid';
import { createPointGridReader, resolveGridSlot } from '@/shared/utils/grid-occupancy';
import type { CanvasDocumentRegistry, CanvasHistoryMode } from './CanvasDocumentRegistry';
import { createCanvasInteractionPatch } from './canvasInteractionState';
import { resolveEditorDocumentAddress } from './helpers/gridHelpers';
import type { EditorState } from './interfaces';
import { getActiveSlideGridBounds } from './slideBounds';
import { createClearedScratchLayerPatch } from './transitions/scratchLayerTransitions';
import { deleteCellAt, deleteRect } from './gridOps';
import { createDocumentInteractionResetPatch } from './transitions/editorTransitions';
import {
  coordinateCanvasCommands,
  type CanvasStateCommitCoordinator,
} from './CanvasStateCommitCoordinator';

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
  cell.char === ' ' && !cell.bgColor && !cloneTextAttributes(cell.attrs);

export const fillStaticGridSelectionWithChar = (
  documents: CanvasDocumentRegistry,
  state: EditorState,
  char: string,
  options?: { preserveTargetBackground?: boolean },
  history?: CanvasHistoryMode
) => {
  const selections = resolveSelectionAreas(state);
  if (selections.length === 0) return;

  const address = resolveEditorDocumentAddress(documents, state);
  documents.mutateGridAt(
    address,
    (grid) => {
      fillGridSelection(
        grid,
        state.contentSurface.reader,
        getGridSelectionRanges(getStaticGridSelection(state.interaction.staticGrid)),
        char,
        state.brushColor,
        options
      );
    },
    history
  );
};

const deleteStaticGridSelection = (
  documents: CanvasDocumentRegistry,
  state: EditorState,
  history?: CanvasHistoryMode
) => {
  const address = resolveEditorDocumentAddress(documents, state);
  documents.mutateGridAt(
    address,
    (grid) => {
      forEachSelectionSpan(state, ({ y, minX, maxX }) => {
        deleteRect(grid, minX, y, maxX, y);
      });
    },
    history
  );
};

export const createCanvasDocumentCommands = (
  commits: CanvasStateCommitCoordinator,
  documents: CanvasDocumentRegistry
) =>
  coordinateCanvasCommands(commits, {
    clearCanvas: () => {
      const state = commits.getState();
      documents.mutateGridAt(
        resolveEditorDocumentAddress(documents, state),
        (grid) => grid.clear(),
        commits.getDocumentHistoryMode()
      );
      commits.setState(createDocumentInteractionResetPatch(documents.getActiveAddress()));
    },

    deleteSelection: () =>
      deleteStaticGridSelection(documents, commits.getState(), commits.getDocumentHistoryMode()),

    deleteStaticGrid: (direction: StaticGridDeleteDirection) => {
      const state = commits.getState();
      const interaction = getStaticGridViewState({
        state: state.interaction.staticGrid,
        grid: state.contentSurface.reader,
      }).interaction;
      const plan = resolveStaticGridDeletePlan({
        interaction,
        direction,
        grid: state.contentSurface.reader,
        bounds: getActiveSlideGridBounds(state),
        previousInputCell:
          state.interaction.staticGrid.mode === 'text-edit'
            ? state.interaction.staticGrid.session.previousCell
            : null,
      });
      if (plan.kind === 'noop') return;
      if (plan.kind === 'range') {
        deleteStaticGridSelection(documents, state, commits.getDocumentHistoryMode());
        return;
      }

      const address = resolveEditorDocumentAddress(documents, state);
      documents.mutateGridAt(
        address,
        (grid) => {
          deleteCellAt(grid, plan.target.x, plan.target.y);
        },
        commits.getDocumentHistoryMode()
      );

      commits.setState((current) =>
        createCanvasInteractionPatch(current.interaction, {
          staticGrid: resolveStaticGridDeletionState(state.interaction.staticGrid, plan, direction),
        })
      );
    },

    erasePoints: (points: Point[], shouldSaveHistory = true) => {
      const state = commits.getState();
      if (points.length === 0) return;
      const address = resolveEditorDocumentAddress(documents, state);
      documents.mutateGridAt(
        address,
        (grid) => {
          points.forEach((point) => deleteCellAt(grid, point.x, point.y));
        },
        shouldSaveHistory ? commits.getDocumentHistoryMode() : false
      );
    },

    fillSelectionsWithChar: (char: string, options?: { preserveTargetBackground?: boolean }) =>
      fillStaticGridSelectionWithChar(
        documents,
        commits.getState(),
        char,
        options,
        commits.getDocumentHistoryMode()
      ),

    setSelectionTextAttributes: (attrs: Partial<Record<keyof TextAttributes, boolean>>) => {
      const state = commits.getState();
      const selections = resolveSelectionAreas(state);
      if (selections.length === 0) return;

      const shouldMaterializeBlank =
        attrs.underline === true || attrs.strike === true || attrs.inverse === true;
      const address = resolveEditorDocumentAddress(documents, state);
      documents.mutateGridAt(
        address,
        (grid) => {
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
                : { char: ' ', color: state.brushColor };
              if (normalizedAttrs) nextCell.attrs = normalizedAttrs;
              else delete nextCell.attrs;

              if (isUnstyledBlankCell(nextCell)) grid.delete(key);
              else grid.set(key, nextCell);
            }
          });
        },
        commits.getDocumentHistoryMode()
      );
    },

    setSelectionForegroundColor: (color: string) => {
      const state = commits.getState();
      const selections = resolveSelectionAreas(state);
      if (selections.length === 0) return;

      const address = resolveEditorDocumentAddress(documents, state);
      documents.mutateGridAt(
        address,
        (grid) => {
          const reader = createPointGridReader(grid);
          forEachSelectionSpan(state, ({ y, minX, maxX }) => {
            for (let x = minX; x <= maxX; x++) {
              if (resolveGridSlot(reader, { x, y })?.offset === 1) continue;
              const key = GridManager.toKey(x, y);
              const existingCell = grid.get(key);
              if (existingCell) grid.set(key, { ...existingCell, color });
            }
          });
        },
        commits.getDocumentHistoryMode()
      );
    },

    setSelectionBackgroundColor: (bgColor: string | null) => {
      const state = commits.getState();
      const selections = resolveSelectionAreas(state);
      if (selections.length === 0) return;

      const address = resolveEditorDocumentAddress(documents, state);
      documents.mutateGridAt(
        address,
        (grid) => {
          const reader = createPointGridReader(grid);
          forEachSelectionSpan(state, ({ y, minX, maxX }) => {
            for (let x = minX; x <= maxX; x++) {
              if (resolveGridSlot(reader, { x, y })?.offset === 1) continue;
              const key = GridManager.toKey(x, y);
              const existingCell = grid.get(key);
              if (!existingCell && !bgColor) continue;

              const nextCell: GridCell = existingCell
                ? { ...existingCell }
                : { char: ' ', color: state.brushColor };
              if (bgColor) nextCell.bgColor = bgColor;
              else delete nextCell.bgColor;

              if (isUnstyledBlankCell(nextCell)) grid.delete(key);
              else grid.set(key, nextCell);
            }
          });
        },
        commits.getDocumentHistoryMode()
      );
    },

    commitScratch: () => {
      const state = commits.getState();
      const { scratchLayer } = state.interaction;
      if (!scratchLayer || scratchLayer.size === 0) return;

      const address = resolveEditorDocumentAddress(documents, state);
      const points = [...scratchLayer].map(([key, cell]) => {
        const { x, y } = GridManager.fromKey(key);
        return { x, y, ...cell };
      });
      documents.applyCellPlanePatchAt(
        address,
        planDrawingPatch(state.contentSurface.reader, points),
        commits.getDocumentHistoryMode()
      );
      commits.setState((current) => createClearedScratchLayerPatch(current.interaction));
    },

    fillArea: (area: SelectionArea) => {
      const state = commits.getState();
      const address = resolveEditorDocumentAddress(documents, state);
      const patch = planForegroundFill(state.contentSurface.reader, area, state.brushColor);
      documents.applyCellPlanePatchAt(address, patch, commits.getDocumentHistoryMode());
    },

    moveStaticGridSelection: (requestedDelta: Point) => {
      const state = commits.getState();
      const selection = getStaticGridSelection(state.interaction.staticGrid);
      if (selection.mode !== 'range' || selection.additionalRanges.length > 0) {
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
      const movedAnchors = planRangeMoveAnchors(
        state.contentSurface.reader,
        plan,
        documents.getAnchorsAt(address)
      );
      const operation = documents.applyCellPlanePatchAt(
        address,
        plan.patch,
        commits.getDocumentHistoryMode(),
        movedAnchors
      );
      if (!operation) return false;

      commits.setState((current) =>
        createCanvasInteractionPatch(current.interaction, {
          staticGrid: {
            mode: 'navigate',
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
