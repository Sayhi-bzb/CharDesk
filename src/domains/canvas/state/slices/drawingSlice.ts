import type { StateCreator } from "zustand";
import type { EditorState, DrawingSlice } from "../interfaces";
import type { CanvasDocumentRegistry } from "../CanvasDocumentRegistry";
import type { TextAttributes } from "@/shared/types";
import type {
  StructuredBoxNode,
  StructuredNode,
} from "@/domains/structured-content/public";
import { COLOR_PRIMARY_TEXT } from "@/shared/lib/constants";
import { createDefaultSplitBoxRoot } from "@/domains/structured-content/public";
import { createStructuredNodeId } from "@/domains/structured-content/public";
import {
  duplicateStructuredNodes,
  getNextStructuredOrder,
  reorderStructuredNodes,
} from "@/domains/structured-content/public";
import {
  addStructuredSplitBoxSplit,
  canSplitStructuredSplitBoxLeaf,
  getStructuredSplitBoxLeafAtPoint,
} from "@/domains/structured-content/public";
import { cloneTextAttributes } from "@/shared/utils/ansi";
import { splitGraphemes } from "@/shared/metrics";
import {
  getStructuredTextSelectionRange,
  updateStructuredTextStyleRanges,
} from "@/domains/structured-content/public";
import { createDocumentInteractionResetPatch } from "../transitions/editorTransitions";
import {
  createStructuredNodeSelectionPatch,
} from "../transitions/canvasInteractionTransitions";
import { createCanvasInteractionPatch } from "../canvasInteractionState";
import { resolveEditorDocumentAddress } from "../helpers/gridHelpers";

type StructuredTextStyleUpdater = Parameters<
  typeof updateStructuredTextStyleRanges
>[3];

const updateSelectedStructuredTextStyle = (
  state: EditorState,
  updateStyle: StructuredTextStyleUpdater
) => {
  const selection = state.interaction.structuredTextSelection;
  if (state.canvasMode !== "structured" || !selection) return;
  const range = getStructuredTextSelectionRange(selection);
  if (!range) return;
  const targetId = selection.nodeId;
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
  clearCanvas: () => {
    const { canvasMode, applyStructuredScene } = get();
    if (canvasMode === "structured") {
      applyStructuredScene([], true);
      set(createDocumentInteractionResetPatch(documents.getActiveAddress()));
      return;
    }
    documents.mutateGridAt(
      resolveEditorDocumentAddress(documents, get()),
      (grid) => grid.clear()
    );
    set(createDocumentInteractionResetPatch(documents.getActiveAddress()));
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
      order: getNextStructuredOrder(state.structuredScene),
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
    set((current) => createCanvasInteractionPatch(current.interaction, {
      scratchLayer: null,
      selectedStructuredNodeIds: [node.id],
      selectedStructuredBoxId: node.type === "box" ? node.id : null,
      selectedStructuredSplitHandle: null,
      structuredContextPoint: null,
      structuredGridFocus: null,
      editingStructuredTextNodeId: null,
      structuredTextSelection: null,
    }));
  },
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
    set((current) => createCanvasInteractionPatch(current.interaction, {
      selectedStructuredNodeIds: [nodeId],
      selectedStructuredBoxId: null,
      selectedStructuredSplitHandle: null,
      structuredGridFocus: null,
      editingStructuredTextNodeId: null,
      structuredTextSelection: null,
      textCursor: null,
    }));
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
    set((current) => createCanvasInteractionPatch(current.interaction, {
      selectedStructuredNodeIds: [id],
      selectedStructuredBoxId: selectedBoxId,
      selectedStructuredSplitHandle: null,
      structuredGridFocus: null,
    }));
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
    if (state.canvasMode !== "structured" || state.interaction.selectedStructuredNodeIds.length === 0) {
      return;
    }
    const selectedIds = new Set(state.interaction.selectedStructuredNodeIds);
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
    set((current) =>
      createStructuredNodeSelectionPatch(
        current,
        current.interaction.selectedStructuredNodeIds
      )
    );
  },

  setStructuredSelectionPrimaryColor: (color) => {
    const state = get();
    if (
      state.canvasMode !== "structured" ||
      state.interaction.selectedStructuredNodeIds.length === 0
    ) {
      return;
    }
    const selectedIds = new Set(state.interaction.selectedStructuredNodeIds);
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
    set((current) =>
      createStructuredNodeSelectionPatch(
        current,
        current.interaction.selectedStructuredNodeIds
      )
    );
  },

  setStructuredSelectionStyle: (patch) => {
    const state = get();
    if (
      state.canvasMode !== "structured" ||
      state.interaction.selectedStructuredNodeIds.length === 0 ||
      (patch.color === undefined && patch.bgColor === undefined)
    ) {
      return;
    }
    const selectedIds = new Set(state.interaction.selectedStructuredNodeIds);
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
    set((current) =>
      createStructuredNodeSelectionPatch(
        current,
        current.interaction.selectedStructuredNodeIds
      )
    );
  },

  fillStructuredTextSelectionWithChar: (char) => {
    const state = get();
    const selection = state.interaction.structuredTextSelection;
    if (state.canvasMode !== "structured" || !selection) return;
    const range = getStructuredTextSelectionRange(selection);
    if (!range) return;
    const fillChar = splitGraphemes(char)[0] ?? char[0] ?? "";
    if (!fillChar) return;
    const targetId = selection.nodeId;

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
    if (state.interaction.selectedStructuredNodeIds.length === 0) return;
    const nextScene = reorderStructuredNodes(
      state.structuredScene,
      state.interaction.selectedStructuredNodeIds,
      direction
    );
    state.applyStructuredScene(nextScene, true);
    set((current) =>
      createStructuredNodeSelectionPatch(
        current,
        current.interaction.selectedStructuredNodeIds
      )
    );
  },

  duplicateStructuredSelection: () => {
    const state = get();
    if (state.canvasMode !== "structured") return [];
    if (state.interaction.selectedStructuredNodeIds.length === 0) return [];
    const { scene, duplicatedIds } = duplicateStructuredNodes(
      state.structuredScene,
      state.interaction.selectedStructuredNodeIds
    );
    if (duplicatedIds.length === 0) return [];
    state.applyStructuredScene(scene, true);
    set((current) => createStructuredNodeSelectionPatch(current, duplicatedIds));
    return duplicatedIds;
  },
});
