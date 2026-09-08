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
import type { NodeBounds, Point } from "@/shared/types";
import type { StructuredBoxNode, StructuredTextNode } from "@/domains/structured-content/public";
import {
  createStructuredNodeId,
  getTextColumnWidth,
  trimTextToColumns,
  withPointWithinBounds,
  getStructuredNodeBounds,
} from "@/domains/structured-content/public";
import {
  getCellOccupancy,
  isWideCell,
  splitGraphemes,
} from "@/shared/metrics";
import {
  getStructuredTextCaretPoint,
  getNextStructuredOrder,
  getStructuredTextOffsetAtPoint,
  getStructuredTextSelectionRange,
  replaceStructuredTextRange as replaceStructuredTextNodeRange,
} from "@/domains/structured-content/public";
import { clampPointToActiveSlide, getActiveSlideGridBounds } from "../slideBounds";
import { resolveGridSlot } from "@/shared/utils/grid-occupancy";
import { resolveEditorDocumentAddress } from "../helpers/gridHelpers";
import {
  createCanvasInteractionPatch,
  type CanvasInteractionSnapshot,
} from "../canvasInteractionState";

const toCharIndexByColumn = (text: string, columnOffset: number) => {
  if (columnOffset <= 0) return 0;
  let width = 0;
  const chars = splitGraphemes(text);
  for (let i = 0; i < chars.length; i++) {
    const charWidth = getCellOccupancy(chars[i]);
    if (width + charWidth > columnOffset) return i;
    width += charWidth;
  }
  return chars.length;
};

const findTextNodeAtCursor = (
  scene: EditorState["structuredScene"],
  cursor: CanvasInteractionSnapshot["textCursor"],
  preferredNodeId?: string | null
) => {
  if (!cursor) return null;
  const candidates = scene.filter((node): node is StructuredTextNode => {
    if (node.type !== "text") return false;
    const bounds = getStructuredNodeBounds(node);
    return withPointWithinBounds(cursor, bounds, true);
  });
  if (candidates.length === 0) return null;
  const preferredNode = candidates.find((node) => node.id === preferredNodeId);
  if (preferredNode) return preferredNode;
  return [...candidates].sort((a, b) => b.order - a.order)[0];
};

const clamp = (value: number, min: number, max: number) => {
  return Math.max(min, Math.min(max, value));
};

const getBoxNameTextCapacity = (bounds: NodeBounds) =>
  Math.max(0, bounds.width - 5);

const getBoxNameTextStartX = (bounds: NodeBounds) =>
  bounds.x + 3;

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

const findBoxNameTargetAtCursor = (
  scene: EditorState["structuredScene"],
  cursor: CanvasInteractionSnapshot["textCursor"]
) => {
  if (!cursor) return null;
  const candidates = scene
    .filter((node): node is StructuredBoxNode => node.type === "box")
    .map((node) => ({ node, bounds: getStructuredNodeBounds(node) }))
    .filter(({ bounds }) => {
      const left = getBoxNameTextStartX(bounds);
      const right = left + getBoxNameTextCapacity(bounds) - 1;
      if (left > right) return false;
      return cursor.y === bounds.y && cursor.x >= left && cursor.x <= right;
    });

  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => {
    if (a.node.order !== b.node.order) return b.node.order - a.node.order;
    return a.bounds.width - b.bounds.width;
  })[0];
};

export const createTextSlice = (
  documents: CanvasDocumentRegistry
): StateCreator<EditorState, [], [], TextSlice> => (set, get) => ({
  replaceStructuredTextRange: (nodeId, start, end, text, styleRanges) => {
    const state = get();
    if (state.canvasMode !== "structured") return;
    const targetNode = state.structuredScene.find(
      (node): node is StructuredTextNode =>
        node.id === nodeId && node.type === "text"
    );
    if (!targetNode) return;
    const replacementTextNode = replaceStructuredTextNodeRange(
      targetNode,
      start,
      end,
      text,
      styleRanges
    );
    const nextScene = state.structuredScene.map((node) => {
      if (node.id !== nodeId || node.type !== "text") return node;
      return replacementTextNode;
    });
    state.applyStructuredScene(nextScene, true);
    const cursorOffset = Math.max(
      0,
      Math.min(
        splitGraphemes(replacementTextNode.text).length,
        start + splitGraphemes(text).length
      )
    );
    set((current) => createCanvasInteractionPatch(current.interaction, {
      textCursor: getStructuredTextCaretPoint(replacementTextNode, cursorOffset),
      editingStructuredTextNodeId: nodeId,
      structuredTextSelection: null,
      selectedStructuredNodeIds: [nodeId],
      selectedStructuredBoxId: null,
      selectedStructuredSplitHandle: null,
      structuredContextPoint: null,
      structuredGridFocus: null,
    }));
  },

  writeTextString: (str, startPos, options) => {
    const current = get();
    const {
      staticGridSelection,
      staticGridEditMode,
      staticGridInputFlow,
      textCursor,
      editingStructuredTextNodeId,
      structuredGridFocus,
    } = current.interaction;
    const {
      fillSelectionsWithChar,
      brushColor,
      canvasMode,
      structuredScene,
      applyStructuredScene,
    } = current;

    if (canvasMode === "structured") {
      const normalized = str.replace(/\r\n?/g, "\n");
      if (!normalized) return;
      const selectedRange = getStructuredTextSelectionRange(
        get().interaction.structuredTextSelection
      );
      const selectedNodeId = get().interaction.structuredTextSelection?.nodeId;
      if (selectedRange && selectedNodeId) {
        get().replaceStructuredTextRange(
          selectedNodeId,
          selectedRange.start,
          selectedRange.end,
          normalized
        );
        return;
      }
      const cursor = startPos || textCursor || structuredGridFocus;
      if (!cursor) return;

      const boxNameTarget = findBoxNameTargetAtCursor(structuredScene, cursor);
      if (boxNameTarget) {
        const inlineText = normalized.replace(/\n+/g, "");
        if (!inlineText) return;
        const { node, bounds } = boxNameTarget;
        const labelCapacity = getBoxNameTextCapacity(bounds);
        if (labelCapacity <= 0) return;
        const currentName = node.name || "";
        const labelStartX = getBoxNameTextStartX(bounds);
        const cursorColumn = clamp(cursor.x - labelStartX, 0, labelCapacity);
        const insertAt = toCharIndexByColumn(currentName, cursorColumn);
        const chars = splitGraphemes(currentName);
        const insertedChars = splitGraphemes(inlineText);
        chars.splice(insertAt, 0, ...insertedChars);
        const nextName = chars.join("");
        const nextScene = structuredScene.map((sceneNode) =>
          sceneNode.id === node.id
            ? { ...node, name: nextName || undefined }
            : sceneNode
        );
        applyStructuredScene(nextScene, true);
        const nextCursorText = trimTextToColumns(
          chars.slice(0, insertAt + insertedChars.length).join(""),
          labelCapacity
        );
        const nextCursorColumn = getTextColumnWidth(nextCursorText);
        set((state) => createCanvasInteractionPatch(state.interaction, {
          textCursor: {
            x: labelStartX + nextCursorColumn,
            y: bounds.y,
          },
          structuredGridFocus: null,
        }));
        return;
      }

      const existingNode = findTextNodeAtCursor(
        structuredScene,
        cursor,
        editingStructuredTextNodeId
      );
      if (!existingNode) {
        const nodeId = createStructuredNodeId();
        const nextNode: StructuredTextNode = {
          id: nodeId,
          type: "text",
          order: getNextStructuredOrder(structuredScene),
          position: { ...cursor },
          text: normalized,
          style: { color: brushColor },
        };
        applyStructuredScene([...structuredScene, nextNode], true);
        set((state) => createCanvasInteractionPatch(state.interaction, {
          textCursor: getStructuredTextCaretPoint(
            nextNode,
            splitGraphemes(normalized).length
          ),
          editingStructuredTextNodeId: nodeId,
          structuredTextSelection: null,
          selectedStructuredNodeIds: [nodeId],
          selectedStructuredBoxId: null,
          structuredGridFocus: null,
        }));
        return;
      }

      const insertAt = getStructuredTextOffsetAtPoint(existingNode, cursor);
      get().replaceStructuredTextRange(
        existingNode.id,
        insertAt,
        insertAt,
        normalized
      );
      return;
    }

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
      fillSelectionsWithChar(graphemes[0], options);
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
    const {
      textCursor,
      staticGridSelection,
      staticGridEditMode,
    } = state.interaction;
    const { canvasMode } = state;
    if (canvasMode === "structured") return;

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
    const { canvasMode } = state;
    if (canvasMode === "structured" || rows.length === 0) return;
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
    const {
      textCursor,
      editingStructuredTextNodeId,
      staticGridInputFlow,
    } = state.interaction;
    const {
      contentSurface,
      canvasMode,
      structuredScene,
    } = state;
    const grid = contentSurface.reader;
    if (!textCursor) return;
    if (canvasMode === "structured" && editingStructuredTextNodeId && dy === 0 && dx !== 0) {
      const node = structuredScene.find(
        (sceneNode): sceneNode is StructuredTextNode =>
          sceneNode.id === editingStructuredTextNodeId && sceneNode.type === "text"
      );
      if (node) {
        const currentOffset = getStructuredTextOffsetAtPoint(node, textCursor);
        const textLength = splitGraphemes(node.text).length;
        const nextOffset = Math.max(0, Math.min(textLength, currentOffset + dx));
        set(createCanvasInteractionPatch(state.interaction, {
          textCursor: getStructuredTextCaretPoint(node, nextOffset),
        }));
        return;
      }
    }
    if (canvasMode !== "structured") {
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
      return;
    }
    let newX = textCursor.x;
    const newY = textCursor.y + dy;
    if (dx > 0) {
      const slot = resolveGridSlot(grid, { x: newX, y: textCursor.y });
      newX = slot ? slot.anchor.x + slot.width : newX + 1;
    } else if (dx < 0) {
      newX =
        resolveGridSlot(grid, { x: newX - 1, y: textCursor.y })?.anchor.x ??
        newX - 1;
    }
    set((current) => createCanvasInteractionPatch(current.interaction, {
      textCursor: clampPointToActiveSlide(current, { x: newX, y: newY }),
    }));
  },

  backspaceText: () => {
    const state = get();
    const {
      textCursor,
      editingStructuredTextNodeId,
      staticGridInputFlow,
    } = state.interaction;
    const {
      contentSurface,
      canvasMode,
      structuredScene,
      applyStructuredScene,
    } = state;
    const grid = contentSurface.reader;
    if (!textCursor) return;

    if (canvasMode === "structured") {
      const selectedRange = getStructuredTextSelectionRange(
        get().interaction.structuredTextSelection
      );
      const selectedNodeId = get().interaction.structuredTextSelection?.nodeId;
      if (selectedRange && selectedNodeId) {
        get().replaceStructuredTextRange(
          selectedNodeId,
          selectedRange.start,
          selectedRange.end,
          ""
        );
        return;
      }
      const boxNameTarget = findBoxNameTargetAtCursor(structuredScene, textCursor);
      if (boxNameTarget) {
        const { node, bounds } = boxNameTarget;
        const labelCapacity = getBoxNameTextCapacity(bounds);
        const currentName = node.name || "";
        if (!currentName) return;
        const labelStartX = getBoxNameTextStartX(bounds);
        const cursorColumn = clamp(textCursor.x - labelStartX, 0, labelCapacity);
        const visibleNameBeforeCursor = trimTextToColumns(currentName, cursorColumn);
        const deleteAt = splitGraphemes(visibleNameBeforeCursor).length - 1;
        if (deleteAt < 0) return;

        const chars = splitGraphemes(currentName);
        chars.splice(deleteAt, 1);
        const nextName = chars.join("");
        const nextCursorColumn = getTextColumnWidth(chars.slice(0, deleteAt).join(""));
        applyStructuredScene(
          structuredScene.map((sceneNode) =>
            sceneNode.id === node.id
              ? { ...node, name: nextName || undefined }
              : sceneNode
          ),
          true
        );
        set((current) => createCanvasInteractionPatch(current.interaction, {
          textCursor: {
            x: labelStartX + nextCursorColumn,
            y: bounds.y,
          },
        }));
        return;
      }

      const existingNode = findTextNodeAtCursor(
        structuredScene,
        textCursor,
        editingStructuredTextNodeId
      );
      if (!existingNode) return;

      const deleteAt = getStructuredTextOffsetAtPoint(existingNode, textCursor) - 1;
      if (deleteAt < 0) return;

      get().replaceStructuredTextRange(
        existingNode.id,
        deleteAt,
        deleteAt + 1,
        ""
      );
      return;
    }

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

  deleteTextForward: () => {
    const state = get();
    const {
      textCursor,
      editingStructuredTextNodeId,
    } = state.interaction;
    const {
      canvasMode,
      structuredScene,
      applyStructuredScene,
    } = state;
    if (!textCursor || canvasMode !== "structured") return;

    const selectedRange = getStructuredTextSelectionRange(
      get().interaction.structuredTextSelection
    );
    const selectedNodeId = get().interaction.structuredTextSelection?.nodeId;
    if (selectedRange && selectedNodeId) {
      get().replaceStructuredTextRange(
        selectedNodeId,
        selectedRange.start,
        selectedRange.end,
        ""
      );
      return;
    }

    const boxNameTarget = findBoxNameTargetAtCursor(structuredScene, textCursor);
    if (!boxNameTarget) {
      const existingNode = findTextNodeAtCursor(
        structuredScene,
        textCursor,
        editingStructuredTextNodeId
      );
      if (!existingNode) return;
      const deleteAt = getStructuredTextOffsetAtPoint(existingNode, textCursor);
      if (deleteAt >= splitGraphemes(existingNode.text).length) return;
      get().replaceStructuredTextRange(
        existingNode.id,
        deleteAt,
        deleteAt + 1,
        ""
      );
      return;
    }

    const { node, bounds } = boxNameTarget;
    const labelCapacity = getBoxNameTextCapacity(bounds);
    const currentName = node.name || "";
    if (!currentName) return;

    const labelStartX = getBoxNameTextStartX(bounds);
    const cursorColumn = clamp(textCursor.x - labelStartX, 0, labelCapacity);
    const visibleNameBeforeCursor = trimTextToColumns(currentName, cursorColumn);
    const deleteAt = splitGraphemes(visibleNameBeforeCursor).length;
    const chars = splitGraphemes(currentName);
    if (deleteAt >= chars.length) return;

    chars.splice(deleteAt, 1);
    const nextName = chars.join("");
    applyStructuredScene(
      structuredScene.map((sceneNode) =>
        sceneNode.id === node.id
          ? { ...node, name: nextName || undefined }
          : sceneNode
      ),
      true
    );
    set(createCanvasInteractionPatch(state.interaction, {
      textCursor: { x: textCursor.x, y: bounds.y },
    }));
  },

  newlineText: () => {
    const state = get();
    const {
      textCursor,
      editingStructuredTextNodeId,
      staticGridInputFlow,
    } = state.interaction;
    const {
      canvasMode,
      structuredScene,
    } = state;
    if (!textCursor) return;
    if (canvasMode === "structured") {
      const selectedRange = getStructuredTextSelectionRange(
        get().interaction.structuredTextSelection
      );
      const selectedNodeId = get().interaction.structuredTextSelection?.nodeId;
      if (selectedRange && selectedNodeId) {
        get().replaceStructuredTextRange(
          selectedNodeId,
          selectedRange.start,
          selectedRange.end,
          "\n"
        );
        return;
      }

      const existingNode = findTextNodeAtCursor(
        structuredScene,
        textCursor,
        editingStructuredTextNodeId
      );
      if (existingNode) {
        const insertAt = getStructuredTextOffsetAtPoint(existingNode, textCursor);
        get().replaceStructuredTextRange(
          existingNode.id,
          insertAt,
          insertAt,
          "\n"
        );
        return;
      }

      set(createCanvasInteractionPatch(state.interaction, {
        textCursor: { x: textCursor.x, y: textCursor.y + 1 },
      }));
      return;
    }

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
    if (state.canvasMode !== "structured") {
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
      return;
    }
    set(createCanvasInteractionPatch(state.interaction, {
      textCursor: { x: textCursor.x + 2, y: textCursor.y },
    }));
  },
});
