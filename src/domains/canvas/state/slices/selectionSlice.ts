import type { StateCreator } from "zustand";
import type { EditorState, SelectionSlice } from "../interfaces";
import type { CanvasDocumentRegistry } from "../CanvasDocumentRegistry";
import { GridManager } from "@/shared/utils/grid";
import { getSelectionBounds } from "@/shared/utils/selection";
import { placeCharInYMap } from "../utils";
import type { GridCell, TextAttributes } from "@/shared/types";
import { deleteRect } from "../gridOps";
import {
  getStructuredNodeBounds,
  intersectsBounds,
  withPointWithinBounds,
} from "@/domains/structured-content/public";
import {
  deleteStructuredSplitBoxSplit,
  isStructuredSplitBoxLineHandle,
} from "@/domains/structured-content/public";
import {
  collapseGridSelectionTo,
  createGridSelectionState,
  forEachGridSelectionSpan,
  getGridSelectionRanges,
  getStaticGridSelectionAreas,
} from "@/domains/selection/public";
import { getCellOccupancy } from "@/shared/metrics";
import { cloneTextAttributes } from "@/shared/utils/ansi";
import {
  createPointGridReader,
  resolveGridSlot,
} from "@/shared/utils/grid-occupancy";
import type { SelectionCommandFactory } from "../selectionCommandPort";
import { getStructuredTextSelectionRange } from "@/domains/structured-content/public";
import { resolveEditorDocumentAddress } from "../helpers/gridHelpers";
import { createStaticGridRangeMovePlan } from "../../cell-plane/rangeMove";
import { getActiveSlideGridBounds } from "../slideBounds";
import { createCanvasInteractionPatch } from "../canvasInteractionState";

const resolveSelectionAreas = (state: EditorState) => {
  return getStaticGridSelectionAreas(
    state.interaction.staticGridSelection,
    state.contentSurface.reader
  );
};

const forEachSelectionSpan = (
  state: EditorState,
  visit: (span: { y: number; minX: number; maxX: number }) => void
) => forEachGridSelectionSpan(
  getGridSelectionRanges(state.interaction.staticGridSelection),
  visit,
  state.contentSurface.reader
);

const isUnstyledBlankCell = (cell: GridCell) =>
  cell.char === " " && !cell.bgColor && !cloneTextAttributes(cell.attrs);

const getActiveStructuredTextSelection = (state: EditorState) => {
  if (state.canvasMode !== "structured") return null;
  const selection = state.interaction.structuredTextSelection;
  const range = getStructuredTextSelectionRange(selection);
  if (!range || !selection) return null;
  const node = state.structuredScene.find(
    (sceneNode) =>
      sceneNode.id === selection.nodeId &&
      sceneNode.type === "text"
  );
  if (!node || node.type !== "text") return null;
  return { node, range };
};

export const createSelectionSlice = (
  documents: CanvasDocumentRegistry,
  selectionCommands: SelectionCommandFactory
): StateCreator<
  EditorState,
  [],
  [],
  SelectionSlice
> => (set, get) => ({
  clearSelections: () =>
    set((state) => createCanvasInteractionPatch(state.interaction, {
      staticGridSelection: collapseGridSelectionTo(
        state.interaction.staticGridSelection,
        state.interaction.staticGridSelection.activeCell
      ),
    })),
  clearInteractionState: () =>
    set((state) => createCanvasInteractionPatch(state.interaction, {
      textCursor: null,
      editingStructuredTextNodeId: null,
      structuredTextSelection: null,
      selectedStructuredNodeIds: [],
      selectedStructuredBoxId: null,
      selectedStructuredSplitHandle: null,
      structuredContextPoint: null,
      structuredGridFocus: null,
      staticGridSelection: createGridSelectionState(
        state.interaction.staticGridSelection.activeCell
      ),
      staticGridEditMode: "navigate" as const,
      staticGridInputFlow: null,
    })),
  canCopyOrCut: () => selectionCommands(set, get).canCopyOrCut(),
  deleteSelection: () => {
    const state = get();
    const { canvasMode, structuredScene, applyStructuredScene } = state;
    const {
      selectedStructuredNodeIds,
      selectedStructuredSplitHandle,
      textCursor,
    } = state.interaction;
    const selections = resolveSelectionAreas(state);
    if (canvasMode === "structured") {
      const textSelection = getActiveStructuredTextSelection(state);
      if (textSelection) {
        state.replaceStructuredTextRange(
          textSelection.node.id,
          textSelection.range.start,
          textSelection.range.end,
          ""
        );
        return;
      }
      if (structuredScene.length === 0) return;
      const splitHandle = selectedStructuredSplitHandle?.handle;
      if (
        selectedStructuredSplitHandle &&
        splitHandle &&
        isStructuredSplitBoxLineHandle(splitHandle)
      ) {
        let didUpdate = false;
        const nextScene = structuredScene.map((node) => {
          if (
            node.id !== selectedStructuredSplitHandle.nodeId ||
            node.type !== "splitBox"
          ) {
            return node;
          }
          didUpdate = true;
          return deleteStructuredSplitBoxSplit(
            node,
            splitHandle
          );
        });
        if (didUpdate) {
          applyStructuredScene(nextScene, true);
          set(createCanvasInteractionPatch(get().interaction, {
            selectedStructuredSplitHandle: null,
            structuredContextPoint: null,
          }));
        }
        return;
      }
      if (selectedStructuredNodeIds.length > 0) {
        const selectedIds = new Set(selectedStructuredNodeIds);
        const nextScene = structuredScene.filter((node) => !selectedIds.has(node.id));
        if (nextScene.length !== structuredScene.length) {
          applyStructuredScene(nextScene, true);
          set(createCanvasInteractionPatch(get().interaction, {
            selectedStructuredNodeIds: [],
            selectedStructuredBoxId: null,
            selectedStructuredSplitHandle: null,
            structuredContextPoint: null,
          }));
        }
        return;
      }
      const bounds = selections.map((area) => {
        const { minX, maxX, minY, maxY } = getSelectionBounds(area);
        return {
          x: minX,
          y: minY,
          width: maxX - minX + 1,
          height: maxY - minY + 1,
        };
      });
      const nextScene = structuredScene.filter((node) => {
        const nodeBounds = getStructuredNodeBounds(node);
        if (
          textCursor &&
          withPointWithinBounds(textCursor, nodeBounds, true)
        ) {
          return false;
        }
        return !bounds.some((selectionBounds) =>
          intersectsBounds(nodeBounds, selectionBounds)
        );
      });
      if (nextScene.length !== structuredScene.length) {
        applyStructuredScene(nextScene, true);
      }
      return;
    }

    documents.mutateGridAt(resolveEditorDocumentAddress(documents, state), (grid) => {
      forEachSelectionSpan(state, ({ y, minX, maxX }) => {
        deleteRect(grid, minX, y, maxX, y);
      });
    });
  },

  moveStaticGridSelection: (requestedDelta) => {
    const state = get();
    const selection = state.interaction.staticGridSelection;
    if (
      state.canvasMode === "structured" ||
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

    const operation = documents.applyCellPlanePatchAt(
      resolveEditorDocumentAddress(documents, state),
      plan.patch,
      "save"
    );
    if (!operation) return false;

    set((current) => createCanvasInteractionPatch(current.interaction, {
      staticGridSelection: {
        ...current.interaction.staticGridSelection,
        activeCell: {
          x: current.interaction.staticGridSelection.activeCell.x + plan.delta.x,
          y: current.interaction.staticGridSelection.activeCell.y + plan.delta.y,
        },
        anchorCell: {
          x: current.interaction.staticGridSelection.anchorCell.x + plan.delta.x,
          y: current.interaction.staticGridSelection.anchorCell.y + plan.delta.y,
        },
        primaryRange: plan.targetRange,
      },
      staticGridEditMode: "navigate" as const,
      staticGridInputFlow: null,
      textCursor: null,
    }));
    return true;
  },

  copySelection: (options) =>
    selectionCommands(set, get).copySelection(options),
  cutSelection: (options) =>
    selectionCommands(set, get).cutSelection(options),
  pasteFromClipboard: (options) =>
    selectionCommands(set, get).pasteFromClipboard(options),
  copySelectionAsPng: (withGrid) =>
    selectionCommands(set, get).copySelectionAsPng(withGrid),
  fillSelectionsWithChar: (char, options) => {
    const state = get();
    const { brushColor, canvasMode } = state;
    const selections = resolveSelectionAreas(state);
    if (canvasMode === "structured") return;
    if (selections.length === 0) return;

    const charWidth = getCellOccupancy(char);

    documents.mutateGridAt(resolveEditorDocumentAddress(documents, state), (grid) => {
      forEachSelectionSpan(state, ({ y, minX, maxX }) => {
        for (let x = minX; x <= maxX; x += charWidth) {
          if (x + charWidth - 1 > maxX) break;
          placeCharInYMap(grid, x, y, char, brushColor, options);
        }
      });
    });
  },

  setSelectionTextAttributes: (attrs) => {
    const state = get();
    const { brushColor, canvasMode } = state;
    const selections = resolveSelectionAreas(state);
    if (canvasMode === "structured") return;
    if (selections.length === 0) return;

    const shouldMaterializeBlank =
      attrs.underline === true ||
      attrs.strike === true ||
      attrs.inverse === true;

    documents.mutateGridAt(resolveEditorDocumentAddress(documents, state), (grid) => {
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
            if (enabled) {
              nextAttrs[attrName] = true;
            } else {
              delete nextAttrs[attrName];
            }
          });

          const normalizedAttrs = cloneTextAttributes(nextAttrs);
          const nextCell: GridCell = existingCell
            ? { ...existingCell }
            : { char: " ", color: brushColor };
          if (normalizedAttrs) {
            nextCell.attrs = normalizedAttrs;
          } else {
            delete nextCell.attrs;
          }
          if (isUnstyledBlankCell(nextCell)) {
            grid.delete(key);
            continue;
          }
          grid.set(key, nextCell);
        }
      });
    });
  },

  setSelectionForegroundColor: (color) => {
    const state = get();
    const selections = resolveSelectionAreas(state);
    if (state.canvasMode === "structured" || selections.length === 0) return;

    documents.mutateGridAt(resolveEditorDocumentAddress(documents, state), (grid) => {
      const reader = createPointGridReader(grid);
      forEachSelectionSpan(state, ({ y, minX, maxX }) => {
        for (let x = minX; x <= maxX; x++) {
          if (resolveGridSlot(reader, { x, y })?.offset === 1) continue;
          const key = GridManager.toKey(x, y);
          const existingCell = grid.get(key);
          if (!existingCell) continue;
          grid.set(key, { ...existingCell, color });
        }
      });
    });
  },

  setSelectionBackgroundColor: (bgColor) => {
    const state = get();
    const { brushColor, canvasMode } = state;
    const selections = resolveSelectionAreas(state);
    if (canvasMode === "structured") return;
    if (selections.length === 0) return;

    documents.mutateGridAt(resolveEditorDocumentAddress(documents, state), (grid) => {
      const reader = createPointGridReader(grid);
      forEachSelectionSpan(state, ({ y, minX, maxX }) => {
        for (let x = minX; x <= maxX; x++) {
          if (resolveGridSlot(reader, { x, y })?.offset === 1) continue;
          const key = GridManager.toKey(x, y);
          const existingCell = grid.get(key);
          if (!existingCell && !bgColor) continue;

          const nextCell: GridCell = existingCell
            ? { ...existingCell }
            : { char: " ", color: brushColor };
          if (bgColor) {
            nextCell.bgColor = bgColor;
          } else {
            delete nextCell.bgColor;
          }
          if (isUnstyledBlankCell(nextCell)) {
            grid.delete(key);
            continue;
          }
          grid.set(key, nextCell);
        }
      });
    });
  },

  fillArea: (area) => {
    const state = get();
    const { brushColor, canvasMode } = state;
    if (canvasMode === "structured") return;
    const { minX, maxX, minY, maxY } = getSelectionBounds(area);

    documents.mutateGridAt(resolveEditorDocumentAddress(documents, state), (grid) => {
      const reader = createPointGridReader(grid);
      const updated = new Set<string>();
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const slot = resolveGridSlot(reader, { x, y });
          if (!slot) continue;
          const key = GridManager.toKey(slot.anchor.x, slot.anchor.y);
          if (updated.has(key)) continue;
          updated.add(key);
          const existingCell = slot.cell;

          grid.set(key, {
            ...existingCell,
            color: brushColor,
          });
        }
      }
    });
  },

});
