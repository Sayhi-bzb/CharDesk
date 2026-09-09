import type { CanvasDocumentRegistry } from "./CanvasDocumentRegistry";
import type { CanvasStore } from "./editorStore";
import type { EditorState } from "./interfaces";
import { resolveEditorDocumentAddress } from "./helpers/gridHelpers";
import type { CanvasViewportRuntime } from "../viewportRuntime";
import type { ToolType } from "../model/tool";
import { isToolAllowedForMode } from "../model/tool";
import { normalizeBrushChar } from "@/shared/utils/characters";
import type { GridPoint, Point } from "@/shared/types";
import type { GridAddress, GridRange } from "@/domains/selection/public";
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
  createClearedInteractionPatch,
  createClearedSelectionsPatch,
  createEditingStructuredTextNodePatch,
  createMovedStructuredGridFocusPatch,
  createStructuredBoxSelectionPatch,
  createStructuredGridFocusPatch,
  createStructuredNodeSelectionPatch,
  createStructuredSplitHandlePatch,
  createStructuredTextSelectionPatch,
  createTextCursorPatch,
} from "./transitions/canvasInteractionTransitions";
import {
  createClearedStaticGridSelectionPatch,
  createMovedStaticGridFocusPatch,
  createStaticGridActiveCellPatch,
  createStaticGridColumnSelectionPatch,
  createStaticGridContentBoundaryFocusPatch,
  createStaticGridEdgeFocusPatch,
  createStaticGridRowSelectionPatch,
  createStaticGridSelectAllPatch,
  createStaticGridSelectionRangePatch,
  createStaticGridTextEditExitPatch,
  createStaticGridTextEditPatch,
} from "./transitions/staticGridTransitions";
import {
  createAddedScratchPointsPatch,
  createClearedScratchLayerPatch,
  createScratchLayerPatch,
  createShapeScratchLayerPatch,
} from "./transitions/scratchLayerTransitions";
import type { SelectionCommandFactory } from "./selectionCommandPort";
import { createCanvasDocumentCommands } from "./canvasDocumentCommands";

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

export const createCanvasFacade = (
  store: CanvasStore,
  documents: CanvasDocumentRegistry,
  viewport: CanvasViewportRuntime,
  selectionCommandFactory: SelectionCommandFactory
) => {
const call = createCall(store);
const resolveAddress = () =>
  resolveEditorDocumentAddress(documents, store.getState());
const documentCommands = createCanvasDocumentCommands(store, documents, {
  applyStructuredScene: (...args) => call("applyStructuredScene", ...args),
  replaceStructuredTextRange: (...args) =>
    call("replaceStructuredTextRange", ...args),
});
const selectionCommands = selectionCommandFactory({
  getState: store.getState,
  mutations: {
    deleteSelection: documentCommands.deleteSelection,
    erasePoints: documentCommands.erasePoints,
    applyStructuredScene: (...args) => call("applyStructuredScene", ...args),
    replaceStructuredTextRange: (...args) =>
      call("replaceStructuredTextRange", ...args),
    pasteRichData: (...args) => call("pasteRichData", ...args),
    pasteRichRows: (...args) => call("pasteRichRows", ...args),
    updateInteraction: (update) =>
      store.setState((state) =>
        createCanvasInteractionPatch(state.interaction, update)
      ),
  },
});
const commands = {
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
    setScratchLayer: (points: GridPoint[]) =>
      store.setState((state) => createScratchLayerPatch(state, points)),
    addScratchPoints: (points: GridPoint[]) =>
      store.setState((state) => createAddedScratchPointsPatch(state, points)),
    commitScratch: documentCommands.commitScratch,
    clearScratch: () =>
      store.setState((state) =>
        createClearedScratchLayerPatch(state.interaction)
      ),
    clear: () => call("clearCanvas"),
    erasePoints: documentCommands.erasePoints,
    updateScratchForShape: (
      tool: ToolType,
      start: Point,
      end: Point,
      options?: { axis?: "vertical" | "horizontal" | null }
    ) =>
      store.setState((state) =>
        createShapeScratchLayerPatch(state, tool, start, end, options)
      ),
    fillArea: documentCommands.fillArea,
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
    clear: () =>
      store.setState((state) => createClearedSelectionsPatch(state.interaction)),
    clearInteraction: () =>
      store.setState((state) =>
        createClearedInteractionPatch(state.interaction)
      ),
    delete: documentCommands.deleteSelection,
    moveStaticRange: documentCommands.moveStaticGridSelection,
    copy: selectionCommands.copySelection,
    cut: selectionCommands.cutSelection,
    paste: selectionCommands.pasteFromClipboard,
    copyAsPng: selectionCommands.copySelectionAsPng,
    fillWithChar: documentCommands.fillSelectionsWithChar,
    setTextAttributes: documentCommands.setSelectionTextAttributes,
    setForegroundColor: documentCommands.setSelectionForegroundColor,
    setBackgroundColor: documentCommands.setSelectionBackgroundColor,
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
    setActiveCell: (address: GridAddress) =>
      store.setState((state) => createStaticGridActiveCellPatch(state, address)),
    setSelectionRange: (range: GridRange) =>
      store.setState((state) =>
        createStaticGridSelectionRangePatch(state, range)
      ),
    appendSelectionRange: (range: GridRange) =>
      store.setState((state) =>
        createStaticGridSelectionRangePatch(state, range, true)
      ),
    moveFocus: (dx: number, dy: number, options?: { extend?: boolean }) =>
      store.setState((state) =>
        createMovedStaticGridFocusPatch(state, dx, dy, options)
      ),
    moveFocusToEdge: (
      edge: "left" | "right" | "top" | "bottom" | "top-left" | "bottom-right",
      options?: { extend?: boolean }
    ) =>
      store.setState((state) =>
        createStaticGridEdgeFocusPatch(state, edge, options)
      ),
    moveFocusToContentBoundary: (
      edge: "left" | "right" | "top" | "bottom",
      options?: { extend?: boolean }
    ) =>
      store.setState((state) =>
        createStaticGridContentBoundaryFocusPatch(state, edge, options)
      ),
    selectAll: () =>
      store.setState((state) => createStaticGridSelectAllPatch(state)),
    selectRow: () =>
      store.setState((state) => createStaticGridRowSelectionPatch(state)),
    selectColumn: () =>
      store.setState((state) => createStaticGridColumnSelectionPatch(state)),
    enterTextEdit: (address?: GridAddress) =>
      store.setState((state) => createStaticGridTextEditPatch(state, address)),
    exitTextEdit: () =>
      store.setState((state) => createStaticGridTextEditExitPatch(state)),
    clearSelection: () =>
      store.setState((state) =>
        createClearedStaticGridSelectionPatch(state)
      ),
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
const queries = {
  canCopyOrCut: selectionCommands.canCopyOrCut,
  getNextStructuredOrder: () => getNextStructuredOrder(store.getState().structuredScene),
  getActiveDocumentId: documents.getActiveDocumentId,
  getCollaborationDocument: documents.getCollaborationDocument,
  getActiveCellCount: documents.getActiveCellCount,
  getMemoryStats: documents.getMemoryStats,
  setMutationPerformanceEnabled: documents.setMutationPerformanceEnabled,
  resetMutationPerformance: documents.resetMutationPerformance,
  getMutationPerformanceStats: documents.getMutationPerformanceStats,
} as const;
return { commands, queries } as const;
};
