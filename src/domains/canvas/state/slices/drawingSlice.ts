import type { StateCreator } from "zustand";
import type { EditorState, DrawingSlice } from "../interfaces";
import type { CanvasDocumentRegistry } from "../CanvasDocumentRegistry";
import { GridManager } from "@/shared/utils/grid";
import type { GridCell, GridPoint, TextAttributes } from "@/shared/types";
import type {
  StructuredBoxNode,
  StructuredNode,
} from "@/domains/structured-content/public";
import { placeCharInMap, placeCharInYMap } from "../utils";
import { deleteCellAt } from "../gridOps";
import { COLOR_PRIMARY_TEXT } from "@/shared/lib/constants";
import { getArrowLinePoints, getBoxPoints, getCirclePoints, getLShapeLinePoints, getStepLinePoints } from "@/shared/utils/shapes";
import { createDefaultSplitBoxRoot, getSplitBoxPoints } from "@/domains/structured-content/public";
import { createStructuredNodeId } from "@/domains/structured-content/public";
import {
  duplicateStructuredNodes,
  reorderStructuredNodes,
} from "@/domains/structured-content/public";
import {
  addStructuredSplitBoxSplit,
  canSplitStructuredSplitBoxLeaf,
  getStructuredSplitBoxLeafAtPoint,
} from "@/domains/structured-content/public";
import { cloneTextAttributes } from "@/shared/utils/ansi";
import { splitGraphemes } from "@/shared/metrics";
import { createGridMapSource } from "@/shared/utils/grid-source";
import { createPointGridReader } from "@/shared/utils/grid-occupancy";
import {
  getStructuredTextSelectionRange,
  updateStructuredTextStyleRanges,
} from "@/domains/structured-content/public";
import { createDocumentInteractionResetPatch } from "../transitions/editorTransitions";
import { isStaticGridMode } from "@/domains/sessions/public";
import { writeStyledCell } from "@/shared/utils/grid-ops";
import { resolveGridSlot } from "@/shared/utils/grid-occupancy";
import { resolveEditorDocumentAddress } from "../helpers/gridHelpers";

type StructuredTextStyleUpdater = Parameters<
  typeof updateStructuredTextStyleRanges
>[3];

const getFilledRectPoints = (
  start: { x: number; y: number },
  end: { x: number; y: number }
): GridPoint[] => {
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);
  const points: GridPoint[] = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      points.push({ x, y, char: " " });
    }
  }
  return points;
};

const addPointsToLayer = (
  layer: Map<string, GridCell>,
  points: GridPoint[],
  brushColor: string
) => {
  points.forEach((point) => {
    if (point.bgColor || point.attrs || point.href) {
      writeStyledCell(layer, point.x, point.y, {
        char: point.char,
        color: point.color || brushColor,
        ...(point.bgColor ? { bgColor: point.bgColor } : {}),
        ...(point.attrs ? { attrs: point.attrs } : {}),
        ...(point.href ? { href: point.href } : {}),
      });
      return;
    }
    placeCharInMap(
      layer,
      point.x,
      point.y,
      point.char,
      point.color || brushColor
    );
  });
};

const updateSelectedStructuredTextStyle = (
  state: EditorState,
  updateStyle: StructuredTextStyleUpdater
) => {
  if (state.canvasMode !== "structured" || !state.structuredTextSelection) return;
  const range = getStructuredTextSelectionRange(state.structuredTextSelection);
  if (!range) return;
  const targetId = state.structuredTextSelection.nodeId;
  const nextScene = state.structuredScene.map((node) =>
    node.id === targetId && node.type === "text"
      ? {
          ...node,
          styleRanges: updateStructuredTextStyleRanges(
            node.styleRanges,
            range.start,
            range.end,
            updateStyle
          ),
        }
      : node
  );
  state.applyStructuredScene(nextScene, true);
};

export const createDrawingSlice = (
  documents: CanvasDocumentRegistry
): StateCreator<
  EditorState,
  [],
  [],
  DrawingSlice
> => (set, get) => ({
  scratchLayer: null,

  setScratchLayer: (points) => {
    const { brushColor } = get();
    const layer = new Map<string, GridCell>();
    addPointsToLayer(layer, points, brushColor);
    set({ scratchLayer: layer });
  },

  addScratchPoints: (points) => {
    const { brushColor } = get();
    set((state) => {
      const layer = new Map(state.scratchLayer || []);
      addPointsToLayer(layer, points, brushColor);
      return { scratchLayer: layer };
    });
  },

  updateScratchForShape: (tool, start, end, options) => {
    let points: GridPoint[] = [];
    const state = get();
    const color = state.brushColor;
    const backgroundColor = isStaticGridMode(state.canvasMode)
      ? state.brushBackgroundColor
      : state.brushColor;
    switch (tool) {
      case "box":
        points = getBoxPoints(start, end);
        break;
      case "splitBox":
        points = getSplitBoxPoints(start, end, {
          verticalSplitRatio: 0.36,
          topSplitRatio: 0.25,
          bottomSplitRatio: 0.75,
          root: createDefaultSplitBoxRoot({
            verticalSplitRatio: 0.36,
            topSplitRatio: 0.25,
            bottomSplitRatio: 0.75,
          }),
        });
        break;
      case "bg":
        points = getFilledRectPoints(start, end).map((point) => ({
          ...point,
          color: COLOR_PRIMARY_TEXT,
          bgColor: backgroundColor,
        }));
        break;
      case "circle":
        points = getCirclePoints(start, end);
        break;
      case "stepline":
        points = getStepLinePoints(start, end);
        break;
      case "arrowLine": {
        const isVerticalFirst = options?.axis === "vertical";
        points = getArrowLinePoints(start, end, isVerticalFirst);
        break;
      }
      case "line": {
        const isVerticalFirst = options?.axis === "vertical";
        points = getLShapeLinePoints(start, end, isVerticalFirst);
        break;
      }
    }
    const coloredPoints = points.map((p) => ({ ...p, color: p.color || color }));
    get().setScratchLayer(coloredPoints);
  },

  commitScratch: () => {
    const { scratchLayer, canvasMode } = get();
    if (canvasMode === "structured") {
      set({ scratchLayer: null });
      return;
    }
    if (!scratchLayer || scratchLayer.size === 0) return;
    documents.mutateGridAt(resolveEditorDocumentAddress(documents, get()), (grid) => {
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
    set({ scratchLayer: null });
  },

  clearScratch: () => set({ scratchLayer: null }),
  clearCanvas: () => {
    const { canvasMode, applyStructuredScene } = get();
    if (canvasMode === "structured") {
      applyStructuredScene([], true);
      set(createDocumentInteractionResetPatch());
      return;
    }
    documents.mutateGridAt(
      resolveEditorDocumentAddress(documents, get()),
      (grid) => grid.clear()
    );
    set(createDocumentInteractionResetPatch());
  },

  erasePoints: (points, shouldSaveHistory = true) => {
    const { canvasMode } = get();
    if (canvasMode === "structured") return;
    if (points.length === 0) return;
    documents.mutateGridAt(resolveEditorDocumentAddress(documents, get()), (grid) => {
      points.forEach((p) => {
        deleteCellAt(grid, p.x, p.y);
      });
    }, shouldSaveHistory);
  },

  commitStructuredShape: (tool, start, end, options) => {
    const state = get();
    if (state.canvasMode !== "structured") return;
    if (
      tool !== "box" &&
      tool !== "splitBox" &&
      tool !== "line" &&
      tool !== "arrowLine" &&
      tool !== "bg"
    ) return;

    const nodeBase = {
      id: createStructuredNodeId(),
      order: state.getNextStructuredOrder(),
      start: { ...start },
      end: { ...end },
    };
    let node: StructuredNode;

    switch (tool) {
      case "box":
        node = {
          ...nodeBase,
          type: "box",
          style: { color: state.brushColor },
        };
        break;
      case "splitBox": {
        const ratios = {
          verticalSplitRatio: 0.36,
          topSplitRatio: 0.25,
          bottomSplitRatio: 0.75,
        };
        node = {
          ...nodeBase,
          type: "splitBox",
          ...ratios,
          root: createDefaultSplitBoxRoot(ratios),
          style: { color: state.brushColor },
        };
        break;
      }
      case "bg":
        node = {
          ...nodeBase,
          type: "bg",
          style: { color: COLOR_PRIMARY_TEXT, bgColor: state.brushColor },
        };
        break;
      case "line":
      case "arrowLine": {
        const axis =
          options?.axis ??
          (Math.abs(end.y - start.y) > Math.abs(end.x - start.x)
            ? "vertical"
            : "horizontal");
        node = {
          ...nodeBase,
          type: "line",
          axis,
          style: { color: state.brushColor },
          ...(tool === "arrowLine" ? { endMarker: "arrow" as const } : {}),
        };
        break;
      }
    }

    state.applyStructuredScene([...state.structuredScene, node], true);
    set({
      scratchLayer: null,
      selectedStructuredNodeIds: [node.id],
      selectedStructuredBoxId: node.type === "box" ? node.id : null,
      selectedStructuredSplitHandle: null,
      structuredContextPoint: null,
      structuredGridFocus: null,
      editingStructuredTextNodeId: null,
      structuredTextSelection: null,
    });
  },
  setSelectedStructuredNodeIds: (ids) =>
    set((state) => {
      const validIds = ids.filter((id, index) =>
        ids.indexOf(id) === index && state.structuredScene.some((node) => node.id === id)
      );
      const selectedBox =
        validIds.length === 1
          ? state.structuredScene.find((node) => node.id === validIds[0] && node.type === "box")
          : null;
      const keepsEditing =
        !!state.editingStructuredTextNodeId &&
        validIds.includes(state.editingStructuredTextNodeId);
      return {
        selectedStructuredNodeIds: validIds,
        selectedStructuredBoxId: selectedBox?.id ?? null,
        selectedStructuredSplitHandle: null,
        structuredGridFocus: validIds.length > 0 ? null : state.structuredGridFocus,
        editingStructuredTextNodeId: keepsEditing
          ? state.editingStructuredTextNodeId
          : null,
        structuredTextSelection: keepsEditing
          ? state.structuredTextSelection
          : null,
        textCursor: keepsEditing ? state.textCursor : null,
      };
    }),
  setSelectedStructuredBoxId: (id) =>
    set((state) => {
      if (!id) return { selectedStructuredNodeIds: [], selectedStructuredBoxId: null, selectedStructuredSplitHandle: null, structuredContextPoint: null, editingStructuredTextNodeId: null, structuredTextSelection: null };
      const selectedBox = state.structuredScene.find((node) => node.id === id && node.type === "box");
      if (!selectedBox) return { selectedStructuredNodeIds: [], selectedStructuredBoxId: null, selectedStructuredSplitHandle: null, structuredContextPoint: null, editingStructuredTextNodeId: null, structuredTextSelection: null };
      return { selectedStructuredNodeIds: [id], selectedStructuredBoxId: id, selectedStructuredSplitHandle: null, structuredContextPoint: null, structuredGridFocus: null, editingStructuredTextNodeId: null, structuredTextSelection: null };
    }),
  setSelectedStructuredSplitHandle: (handle) =>
    set((state) => {
      if (!handle) return { selectedStructuredSplitHandle: null };
      const node = state.structuredScene.find(
        (sceneNode) => sceneNode.id === handle.nodeId && sceneNode.type === "splitBox"
      );
      if (!node) return { selectedStructuredSplitHandle: null };
      return {
        selectedStructuredSplitHandle: handle,
        selectedStructuredNodeIds: [handle.nodeId],
        selectedStructuredBoxId: null,
        structuredGridFocus: null,
        editingStructuredTextNodeId: null,
        structuredTextSelection: null,
      };
    }),

  splitStructuredSplitBoxLeaf: (nodeId, point, axis) => {
    const state = get();
    if (state.canvasMode !== "structured") return false;
    const target = state.structuredScene.find(
      (node) => node.id === nodeId && node.type === "splitBox"
    );
    if (!target || target.type !== "splitBox") return false;
    const leaf = getStructuredSplitBoxLeafAtPoint(target, point);
    if (!leaf || !canSplitStructuredSplitBoxLeaf(leaf, axis)) return false;

    const nextScene = state.structuredScene.map((node) =>
      node.id === nodeId && node.type === "splitBox"
        ? addStructuredSplitBoxSplit(node, leaf.id, axis)
        : node
    );
    state.applyStructuredScene(nextScene, true);
    set({
      selectedStructuredNodeIds: [nodeId],
      selectedStructuredBoxId: null,
      selectedStructuredSplitHandle: null,
      structuredGridFocus: null,
      editingStructuredTextNodeId: null,
      structuredTextSelection: null,
      textCursor: null,
    });
    return true;
  },

  updateStructuredNode: (id, updater, history = "save") => {
    const state = get();
    if (state.canvasMode !== "structured") return;
    let selectedBoxId: string | null = null;
    let didUpdate = false;
    const nextScene = state.structuredScene.map((node) => {
      if (node.id !== id) return node;
      const updatedNode = updater(node);
      didUpdate = true;
      selectedBoxId = updatedNode.type === "box" ? id : null;
      return updatedNode;
    });
    if (!didUpdate) return;
    state.applyStructuredScene(nextScene, history);
    set({
      selectedStructuredNodeIds: [id],
      selectedStructuredBoxId: selectedBoxId,
      selectedStructuredSplitHandle: null,
      structuredGridFocus: null,
    });
  },

  updateStructuredBox: (id, updater) => {
    get().updateStructuredNode(id, (node) => {
      if (node.type !== "box") return node;
      return updater(node as StructuredBoxNode);
    });
  },

  setStructuredTextAttributes: (attrs) => {
    const state = get();
    updateSelectedStructuredTextStyle(state, (style) => {
      const nextAttrs = cloneTextAttributes(style.attrs) ?? {};
      Object.entries(attrs).forEach(([name, enabled]) => {
        const attrName = name as keyof TextAttributes;
        if (enabled) {
          nextAttrs[attrName] = true;
        } else {
          delete nextAttrs[attrName];
        }
      });
      const normalizedAttrs = cloneTextAttributes(nextAttrs);
      return {
        ...style,
        ...(normalizedAttrs ? { attrs: normalizedAttrs } : { attrs: undefined }),
      };
    });
  },

  setStructuredTextColor: (color) => {
    updateSelectedStructuredTextStyle(get(), (style) => ({ ...style, color }));
  },

  setStructuredTextBackgroundColor: (bgColor) => {
    updateSelectedStructuredTextStyle(get(), (style) => ({
      ...style,
      ...(bgColor ? { bgColor } : { bgColor: undefined }),
    }));
  },

  setStructuredNodeCharColor: (color) => {
    const state = get();
    if (state.canvasMode !== "structured" || state.selectedStructuredNodeIds.length === 0) {
      return;
    }
    const selectedIds = new Set(state.selectedStructuredNodeIds);
    let didUpdate = false;
    const nextScene = state.structuredScene.map((node) => {
      if (!selectedIds.has(node.id)) return node;
      if (node.type !== "box" && node.type !== "splitBox" && node.type !== "line") {
        return node;
      }
      didUpdate = true;
      return {
        ...node,
        style: {
          ...node.style,
          color,
        },
      };
    });

    if (!didUpdate) return;
    state.applyStructuredScene(nextScene, true);
    state.setSelectedStructuredNodeIds(state.selectedStructuredNodeIds);
  },

  setStructuredSelectionPrimaryColor: (color) => {
    const state = get();
    if (
      state.canvasMode !== "structured" ||
      state.selectedStructuredNodeIds.length === 0
    ) {
      return;
    }
    const selectedIds = new Set(state.selectedStructuredNodeIds);
    let didUpdate = false;
    const nextScene = state.structuredScene.map((node) => {
      if (!selectedIds.has(node.id)) return node;
      didUpdate = true;
      if (node.type === "bg") {
        return {
          ...node,
          style: { ...node.style, bgColor: color },
        };
      }
      const style = { ...node.style, color };
      if (node.type !== "text" || !node.styleRanges) {
        return { ...node, style };
      }
      return {
        ...node,
        style,
        styleRanges: node.styleRanges.map((range) => ({
          ...range,
          style: { ...range.style, color },
        })),
      };
    });
    if (!didUpdate) return;
    state.applyStructuredScene(nextScene, true);
    state.setSelectedStructuredNodeIds(state.selectedStructuredNodeIds);
  },

  setStructuredSelectionStyle: (patch) => {
    const state = get();
    if (
      state.canvasMode !== "structured" ||
      state.selectedStructuredNodeIds.length === 0 ||
      (patch.color === undefined && patch.bgColor === undefined)
    ) {
      return;
    }
    const selectedIds = new Set(state.selectedStructuredNodeIds);
    let didUpdate = false;
    const nextScene = state.structuredScene.map((node) => {
      if (!selectedIds.has(node.id)) return node;
      const color = node.type === "bg" ? undefined : patch.color;
      const bgColor = patch.bgColor;
      if (color === undefined && bgColor === undefined) return node;
      didUpdate = true;
      const style = {
        ...node.style,
        ...(color !== undefined ? { color } : {}),
        ...(bgColor !== undefined ? { bgColor } : {}),
      };
      if (node.type !== "text" || !node.styleRanges) {
        return { ...node, style };
      }
      return {
        ...node,
        style,
        styleRanges: node.styleRanges.map((range) => ({
          ...range,
          style: {
            ...range.style,
            ...(color !== undefined ? { color } : {}),
            ...(bgColor !== undefined ? { bgColor } : {}),
          },
        })),
      };
    });
    if (!didUpdate) return;
    state.applyStructuredScene(nextScene, true);
    state.setSelectedStructuredNodeIds(state.selectedStructuredNodeIds);
  },

  fillStructuredTextSelectionWithChar: (char) => {
    const state = get();
    if (state.canvasMode !== "structured" || !state.structuredTextSelection) return;
    const range = getStructuredTextSelectionRange(state.structuredTextSelection);
    if (!range) return;
    const fillChar = splitGraphemes(char)[0] ?? char[0] ?? "";
    if (!fillChar) return;
    const targetId = state.structuredTextSelection.nodeId;

    const nextScene = state.structuredScene.map((node) => {
      if (node.id !== targetId || node.type !== "text") return node;
      const chars = splitGraphemes(node.text);
      const fillLength = range.end - range.start;
      chars.splice(range.start, fillLength, ...Array(fillLength).fill(fillChar));
      return {
        ...node,
        text: chars.join(""),
      };
    });

    state.applyStructuredScene(nextScene, true);
  },

  reorderStructuredSelection: (direction) => {
    const state = get();
    if (state.canvasMode !== "structured") return;
    if (state.selectedStructuredNodeIds.length === 0) return;
    const nextScene = reorderStructuredNodes(
      state.structuredScene,
      state.selectedStructuredNodeIds,
      direction
    );
    state.applyStructuredScene(nextScene, true);
    state.setSelectedStructuredNodeIds(state.selectedStructuredNodeIds);
  },

  duplicateStructuredSelection: () => {
    const state = get();
    if (state.canvasMode !== "structured") return [];
    if (state.selectedStructuredNodeIds.length === 0) return [];
    const { scene, duplicatedIds } = duplicateStructuredNodes(
      state.structuredScene,
      state.selectedStructuredNodeIds
    );
    if (duplicatedIds.length === 0) return [];
    state.applyStructuredScene(scene, true);
    state.setSelectedStructuredNodeIds(duplicatedIds);
    return duplicatedIds;
  },
});
