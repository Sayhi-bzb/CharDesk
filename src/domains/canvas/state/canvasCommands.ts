import type { CanvasDocumentRegistry } from "./CanvasDocumentRegistry";
import type { CanvasStore } from "./editorStore";
import type { EditorState } from "./interfaces";
import { resolveEditorDocumentAddress } from "./helpers/gridHelpers";
import type { CanvasViewportRuntime } from "../viewportRuntime";
import type { ToolType } from "../model/tool";
import { isToolAllowedForMode } from "../model/tool";
import { normalizeBrushChar } from "@/shared/utils/characters";
import type { Point } from "@/shared/types";
import {
  getNextStructuredOrder,
  type StructuredSplitBoxHandle,
  type StructuredTextSelection,
} from "@/domains/structured-content/public";
import {
  createCanvasInteractionPatch,
  type CanvasColorPickerTarget,
} from "./canvasInteractionState";
import {
  createEditingStructuredTextNodePatch,
  createMovedStructuredGridFocusPatch,
  createStructuredBoxSelectionPatch,
  createStructuredGridFocusPatch,
  createStructuredNodeSelectionPatch,
  createStructuredSplitHandlePatch,
  createStructuredTextSelectionPatch,
  createTextCursorPatch,
} from "./transitions/canvasInteractionTransitions";

const createCall = (store: CanvasStore) => <Key extends keyof EditorState>(
  key: Key,
  ...args: EditorState[Key] extends (...params: infer Params) => unknown
    ? Params
    : never
) => {
  type Result = EditorState[Key] extends (...params: never[]) => infer Return
    ? Return
    : never;
  const command = store.getState()[key] as (...params: typeof args) => Result;
  if (typeof command !== "function") {
    throw new TypeError(`Canvas command ${String(key)} is not callable`);
  }
  return command(...args);
};

export const createCanvasCommands = (
  store: CanvasStore,
  documents: CanvasDocumentRegistry,
  viewport: CanvasViewportRuntime
) => {
const call = createCall(store);
const resolveAddress = () =>
  resolveEditorDocumentAddress(documents, store.getState());
return {
  history: {
    undo: () => {
      resolveAddress();
      return documents.undo();
    },
    redo: () => {
      resolveAddress();
      return documents.redo();
    },
    beginCheckpoint: () => {
      resolveAddress();
      return documents.beginHistoryCheckpoint();
    },
    finishCapture: () => {
      resolveAddress();
      return documents.finishHistoryCapture();
    },
    transact: <Result>(fn: () => Result, history: "save" | "merge" | "none" | "reset" = "save") => {
      let result!: Result;
      documents.runTransactionAt(resolveAddress(), () => {
        result = fn();
      }, history);
      return result;
    },
  },
  viewport: {
    setOffset: viewport.setOffset,
    setZoom: viewport.setZoom,
    setViewport: viewport.setViewport,
    consumePendingPlacement: viewport.consumePlacement,
  },
  tools: {
    set: (tool: ToolType) =>
      store.setState((state) => {
        if (!isToolAllowedForMode(tool, state.canvasMode)) return state;
        return {
          tool,
          ...createCanvasInteractionPatch(state.interaction, {
            textCursor: null,
            editingStructuredTextNodeId: null,
            structuredTextSelection: null,
            hoveredGrid: null,
          }),
        };
      }),
  },
  preferences: {
    setBrushChar: (char: string) =>
      store.setState((state) => ({
        brushChar: normalizeBrushChar(char, state.brushChar),
      })),
    setBrushColor: (color: string) => store.setState({ brushColor: color }),
    setBrushBackgroundColor: (color: string) =>
      store.setState({ brushBackgroundColor: color }),
    setShowGrid: (show: boolean) => store.setState({ showGrid: show }),
    setExportShowGrid: (show: boolean) => store.setState({ exportShowGrid: show }),
  },
  interaction: {
    setColorPickerTarget: (target: CanvasColorPickerTarget | null) =>
      store.setState((state) =>
        createCanvasInteractionPatch(state.interaction, {
          canvasColorPickerTarget: target,
        })
      ),
    setStructuredContextPoint: (point: Point | null) =>
      store.setState((state) =>
        createCanvasInteractionPatch(state.interaction, {
          structuredContextPoint: point ? { ...point } : null,
        })
      ),
    setHoveredGrid: (position: Point | null) =>
      store.setState((state) =>
        createCanvasInteractionPatch(state.interaction, {
          hoveredGrid: position,
        })
      ),
    setStructuredGridFocus: (point: Point | null) =>
      store.setState((state) =>
        createStructuredGridFocusPatch(state.interaction, point)
      ),
    moveStructuredGridFocus: (dx: number, dy: number) =>
      store.setState((state) =>
        createMovedStructuredGridFocusPatch(state.interaction, dx, dy)
      ),
    setTextCursor: (position: Point | null) =>
      store.setState((state) => createTextCursorPatch(state, position)),
    setEditingStructuredTextNodeId: (id: string | null) =>
      store.setState((state) => createEditingStructuredTextNodePatch(state, id)),
    setStructuredTextSelection: (selection: StructuredTextSelection | null) =>
      store.setState((state) =>
        createStructuredTextSelectionPatch(state, selection)
      ),
    setSelectedStructuredNodeIds: (ids: string[]) =>
      store.setState((state) => createStructuredNodeSelectionPatch(state, ids)),
    setSelectedStructuredBoxId: (id: string | null) =>
      store.setState((state) => createStructuredBoxSelectionPatch(state, id)),
    setSelectedStructuredSplitHandle: (
      handle: { nodeId: string; handle: StructuredSplitBoxHandle } | null
    ) =>
      store.setState((state) =>
        createStructuredSplitHandlePatch(state, handle)
      ),
  },
  grid: {
    replace: (entries: Parameters<CanvasDocumentRegistry["replaceCellPage"]>[1]) =>
      documents.replaceCellPage(resolveAddress(), entries),
    setScratchLayer: (...args: Parameters<EditorState["setScratchLayer"]>) =>
      call("setScratchLayer", ...args),
    addScratchPoints: (...args: Parameters<EditorState["addScratchPoints"]>) =>
      call("addScratchPoints", ...args),
    commitScratch: () => call("commitScratch"),
    clearScratch: () => call("clearScratch"),
    clear: () => call("clearCanvas"),
    erasePoints: (...args: Parameters<EditorState["erasePoints"]>) =>
      call("erasePoints", ...args),
    updateScratchForShape: (...args: Parameters<EditorState["updateScratchForShape"]>) =>
      call("updateScratchForShape", ...args),
    fillArea: (...args: Parameters<EditorState["fillArea"]>) => call("fillArea", ...args),
  },
  text: {
    replaceStructuredRange: (...args: Parameters<EditorState["replaceStructuredTextRange"]>) =>
      call("replaceStructuredTextRange", ...args),
    write: (...args: Parameters<EditorState["writeTextString"]>) =>
      call("writeTextString", ...args),
    pasteRichData: (...args: Parameters<EditorState["pasteRichData"]>) =>
      call("pasteRichData", ...args),
    moveCursor: (...args: Parameters<EditorState["moveTextCursor"]>) =>
      call("moveTextCursor", ...args),
    backspace: () => call("backspaceText"),
    deleteForward: () => call("deleteTextForward"),
    newline: () => call("newlineText"),
    indent: () => call("indentText"),
  },
  selection: {
    clear: () => call("clearSelections"),
    clearInteraction: () => call("clearInteractionState"),
    delete: () => call("deleteSelection"),
    moveStaticRange: (...args: Parameters<EditorState["moveStaticGridSelection"]>) =>
      call("moveStaticGridSelection", ...args),
    copy: (...args: Parameters<EditorState["copySelection"]>) => call("copySelection", ...args),
    cut: (...args: Parameters<EditorState["cutSelection"]>) => call("cutSelection", ...args),
    paste: (...args: Parameters<EditorState["pasteFromClipboard"]>) =>
      call("pasteFromClipboard", ...args),
    copyAsPng: (...args: Parameters<EditorState["copySelectionAsPng"]>) =>
      call("copySelectionAsPng", ...args),
    fillWithChar: (...args: Parameters<EditorState["fillSelectionsWithChar"]>) =>
      call("fillSelectionsWithChar", ...args),
    setTextAttributes: (...args: Parameters<EditorState["setSelectionTextAttributes"]>) =>
      call("setSelectionTextAttributes", ...args),
    setForegroundColor: (
      ...args: Parameters<EditorState["setSelectionForegroundColor"]>
    ) => call("setSelectionForegroundColor", ...args),
    setBackgroundColor: (...args: Parameters<EditorState["setSelectionBackgroundColor"]>) =>
      call("setSelectionBackgroundColor", ...args),
  },
  structured: {
    applyScene: (...args: Parameters<EditorState["applyStructuredScene"]>) =>
      call("applyStructuredScene", ...args),
    commitShape: (...args: Parameters<EditorState["commitStructuredShape"]>) =>
      call("commitStructuredShape", ...args),
    splitLeaf: (...args: Parameters<EditorState["splitStructuredSplitBoxLeaf"]>) =>
      call("splitStructuredSplitBoxLeaf", ...args),
    updateNode: (...args: Parameters<EditorState["updateStructuredNode"]>) =>
      call("updateStructuredNode", ...args),
    updateBox: (...args: Parameters<EditorState["updateStructuredBox"]>) =>
      call("updateStructuredBox", ...args),
    setTextAttributes: (...args: Parameters<EditorState["setStructuredTextAttributes"]>) =>
      call("setStructuredTextAttributes", ...args),
    setTextColor: (...args: Parameters<EditorState["setStructuredTextColor"]>) =>
      call("setStructuredTextColor", ...args),
    setTextBackground: (
      ...args: Parameters<EditorState["setStructuredTextBackgroundColor"]>
    ) => call("setStructuredTextBackgroundColor", ...args),
    setNodeCharColor: (...args: Parameters<EditorState["setStructuredNodeCharColor"]>) =>
      call("setStructuredNodeCharColor", ...args),
    setSelectionPrimaryColor: (
      ...args: Parameters<EditorState["setStructuredSelectionPrimaryColor"]>
    ) => call("setStructuredSelectionPrimaryColor", ...args),
    setSelectionStyle: (
      ...args: Parameters<EditorState["setStructuredSelectionStyle"]>
    ) => call("setStructuredSelectionStyle", ...args),
    fillTextSelectionWithChar: (
      ...args: Parameters<EditorState["fillStructuredTextSelectionWithChar"]>
    ) => call("fillStructuredTextSelectionWithChar", ...args),
    reorderSelection: (...args: Parameters<EditorState["reorderStructuredSelection"]>) =>
      call("reorderStructuredSelection", ...args),
    duplicateSelection: () => call("duplicateStructuredSelection"),
  },
  staticGrid: {
    setActiveCell: (...args: Parameters<EditorState["setStaticGridActiveCell"]>) =>
      call("setStaticGridActiveCell", ...args),
    setSelectionRange: (...args: Parameters<EditorState["setStaticGridSelectionRange"]>) =>
      call("setStaticGridSelectionRange", ...args),
    appendSelectionRange: (
      ...args: Parameters<EditorState["appendStaticGridSelectionRange"]>
    ) => call("appendStaticGridSelectionRange", ...args),
    moveFocus: (...args: Parameters<EditorState["moveStaticGridFocus"]>) =>
      call("moveStaticGridFocus", ...args),
    moveFocusToEdge: (...args: Parameters<EditorState["moveStaticGridFocusToEdge"]>) =>
      call("moveStaticGridFocusToEdge", ...args),
    moveFocusToContentBoundary: (
      ...args: Parameters<EditorState["moveStaticGridFocusToContentBoundary"]>
    ) => call("moveStaticGridFocusToContentBoundary", ...args),
    selectAll: () => call("selectStaticGridAll"),
    selectRow: () => call("selectStaticGridRow"),
    selectColumn: () => call("selectStaticGridColumn"),
    enterTextEdit: (...args: Parameters<EditorState["enterStaticGridTextEdit"]>) =>
      call("enterStaticGridTextEdit", ...args),
    exitTextEdit: () => call("exitStaticGridTextEdit"),
    clearSelection: () => call("clearStaticGridSelection"),
  },
  sessions: {
    create: (...args: Parameters<EditorState["createCanvasSession"]>) =>
      call("createCanvasSession", ...args),
    openSource: (...args: Parameters<EditorState["openSourceSession"]>) =>
      call("openSourceSession", ...args),
    import: (...args: Parameters<EditorState["importCanvasSession"]>) =>
      call("importCanvasSession", ...args),
    replaceSnapshot: (
      ...args: Parameters<EditorState["replaceCanvasSessionSnapshot"]>
    ) => call("replaceCanvasSessionSnapshot", ...args),
    applySourceProjection: (
      ...args: Parameters<EditorState["applySourceProjection"]>
    ) => call("applySourceProjection", ...args),
    switch: (...args: Parameters<EditorState["switchCanvasSession"]>) =>
      call("switchCanvasSession", ...args),
    remove: (...args: Parameters<EditorState["removeCanvasSession"]>) =>
      call("removeCanvasSession", ...args),
    saveViewport: (...args: Parameters<EditorState["saveCanvasSessionViewport"]>) =>
      call("saveCanvasSessionViewport", ...args),
    rename: (...args: Parameters<EditorState["renameCanvasSession"]>) =>
      call("renameCanvasSession", ...args),
    setCollaboration: (
      ...args: Parameters<EditorState["setCanvasSessionCollaboration"]>
    ) => call("setCanvasSessionCollaboration", ...args),
    joinCollaboration: (
      ...args: Parameters<EditorState["joinCanvasSessionCollaboration"]>
    ) => call("joinCanvasSessionCollaboration", ...args),
  },
  slides: {
    add: () => call("addSlide"),
    duplicate: (...args: Parameters<EditorState["duplicateSlide"]>) =>
      call("duplicateSlide", ...args),
    remove: (...args: Parameters<EditorState["removeSlide"]>) => call("removeSlide", ...args),
    rename: (...args: Parameters<EditorState["renameSlide"]>) => call("renameSlide", ...args),
    move: (...args: Parameters<EditorState["moveSlide"]>) => call("moveSlide", ...args),
    activate: (...args: Parameters<EditorState["activateSlide"]>) =>
      call("activateSlide", ...args),
    resize: (...args: Parameters<EditorState["resizeSlide"]>) => call("resizeSlide", ...args),
  },
} as const;
};

export const createCanvasQueries = (
  store: CanvasStore,
  documents: CanvasDocumentRegistry
) => ({
  canCopyOrCut: () => store.getState().canCopyOrCut(),
  getNextStructuredOrder: () => getNextStructuredOrder(store.getState().structuredScene),
  getActiveDocumentId: documents.getActiveDocumentId,
  getCollaborationDocument: documents.getCollaborationDocument,
  getActiveCellCount: documents.getActiveCellCount,
  getMemoryStats: documents.getMemoryStats,
  setMutationPerformanceEnabled: documents.setMutationPerformanceEnabled,
  resetMutationPerformance: documents.resetMutationPerformance,
  getMutationPerformanceStats: documents.getMutationPerformanceStats,
} as const);
