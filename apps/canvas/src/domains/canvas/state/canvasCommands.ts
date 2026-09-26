import type { CanvasDocumentRegistry } from "./CanvasDocumentRegistry";
import { resolveEditorDocumentAddress } from "./helpers/gridHelpers";
import type { CanvasViewportRuntime } from "../viewportRuntime";
import type { ToolType } from "../model/tool";
import { isToolAllowedForMode } from "../model/tool";
import { normalizeBrushChar } from "@/shared/utils/characters";
import type { GridPoint, Point } from "@/shared/types";
import {
  getStaticGridSelection,
  type GridAddress,
  type GridRange,
} from "@/domains/selection/public";
import {
  createCanvasInteractionPatch,
  type CanvasColorPickerTarget,
} from "./canvasInteractionState";
import {
  createClearedInteractionPatch,
  createClearedSelectionsPatch,
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
import { createCanvasTextCommands } from "./canvasTextCommands";
import type { CanvasStateCommitCoordinator } from "./CanvasStateCommitCoordinator";
import { createCanvasSessionCommands } from "./canvasSessionCommands";
import { createCanvasSlideCommands } from "./canvasSlideCommands";
import type { CanvasSessionSourceParser } from "./sessionImportPort";
import type { CanvasDocumentResidency } from "./documentResidencyPort";

export const createCanvasFacade = (
  commits: CanvasStateCommitCoordinator,
  documents: CanvasDocumentRegistry,
  viewport: CanvasViewportRuntime,
  selectionCommandFactory: SelectionCommandFactory,
  parseSessionSource: CanvasSessionSourceParser,
  residency?: CanvasDocumentResidency
) => {
const resolveAddress = () =>
  resolveEditorDocumentAddress(documents, commits.getState());
const documentCommands = createCanvasDocumentCommands(commits, documents);
const textCommands = createCanvasTextCommands(commits, documents);
const sessionCommands = createCanvasSessionCommands(
  commits,
  documents,
  parseSessionSource,
  viewport,
  residency
);
const slideCommands = createCanvasSlideCommands(commits, documents);
const selectionCommands = selectionCommandFactory({
  getState: commits.getState,
  mutations: {
    transact: commits.run,
    deleteSelection: documentCommands.deleteSelection,
    erasePoints: documentCommands.erasePoints,
    pasteRichData: textCommands.pasteRichData,
    pasteRichRows: textCommands.pasteRichRows,
    updateInteraction: (update) =>
      commits.setState((state) =>
        createCanvasInteractionPatch(state.interaction, update)
      ),
  },
});
const commands = {
  history: {
    undo: () => commits.run(() => {
      resolveAddress();
      return documents.undo();
    }),
    redo: () => commits.run(() => {
      resolveAddress();
      return documents.redo();
    }),
    beginCheckpoint: () => {
      resolveAddress();
      const checkpoint = documents.beginHistoryCheckpoint();
      return {
        commit: () => commits.run(checkpoint.commit),
        cancel: () => commits.run(checkpoint.cancel),
      };
    },
    finishCapture: () => {
      resolveAddress();
      return documents.finishHistoryCapture();
    },
    transact: <Result>(fn: () => Result, history: "save" | "merge" | "none" | "reset" = "save") => {
      return commits.run(() => {
        resolveAddress();
        if (history === "save" || history === "reset") {
          documents.finishHistoryCapture();
        }
        try {
          return commits.withHistory(history, fn);
        } finally {
          if (history === "save") documents.finishHistoryCapture();
          else if (history === "reset") documents.clearHistory();
        }
      });
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
      commits.setState((state) => {
        if (!isToolAllowedForMode(tool, state.canvasMode)) return state;
        return {
          tool,
          ...createCanvasInteractionPatch(state.interaction, {
            staticGrid: {
              mode: "navigate",
              selection: getStaticGridSelection(state.interaction.staticGrid),
            },
            hoveredGrid: null,
          }),
        };
      }),
  },
  preferences: {
    setBrushChar: (char: string) =>
      commits.setState((state) => ({
        brushChar: normalizeBrushChar(char, state.brushChar),
      })),
    setBrushColor: (color: string) => commits.setState({ brushColor: color }),
    setBrushBackgroundColor: (color: string) =>
      commits.setState({ brushBackgroundColor: color }),
    setShowGrid: (show: boolean) => commits.setState({ showGrid: show }),
    setExportShowGrid: (show: boolean) => commits.setState({ exportShowGrid: show }),
  },
  interaction: {
    setColorPickerTarget: (target: CanvasColorPickerTarget | null) =>
      commits.setState((state) =>
        createCanvasInteractionPatch(state.interaction, {
          canvasColorPickerTarget: target,
        })
      ),
    setHoveredGrid: (position: Point | null) =>
      commits.setState((state) =>
        createCanvasInteractionPatch(state.interaction, {
          hoveredGrid: position,
        })
      ),
  },
  grid: {
    replace: (entries: Parameters<CanvasDocumentRegistry["replaceCellPage"]>[1]) =>
      commits.run(() => documents.replaceCellPage(resolveAddress(), entries)),
    setScratchLayer: (points: GridPoint[]) =>
      commits.setState((state) => createScratchLayerPatch(state, points)),
    addScratchPoints: (points: GridPoint[]) =>
      commits.setState((state) => createAddedScratchPointsPatch(state, points)),
    commitScratch: documentCommands.commitScratch,
    clearScratch: () =>
      commits.setState((state) =>
        createClearedScratchLayerPatch(state.interaction)
      ),
    clear: documentCommands.clearCanvas,
    erasePoints: documentCommands.erasePoints,
    updateScratchForShape: (
      tool: ToolType,
      start: Point,
      end: Point,
      options?: { axis?: "vertical" | "horizontal" | null }
    ) =>
      commits.setState((state) =>
        createShapeScratchLayerPatch(state, tool, start, end, options)
      ),
    fillArea: documentCommands.fillArea,
    insertRows: textCommands.pasteRichRows,
  },
  text: {
    write: textCommands.write,
    pasteRichData: textCommands.pasteRichData,
    moveCursor: textCommands.moveCursor,
    newline: textCommands.newline,
    indent: textCommands.indent,
  },
  selection: {
    clear: () =>
      commits.setState((state) => createClearedSelectionsPatch(state.interaction)),
    clearInteraction: () =>
      commits.setState((state) =>
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
  staticGrid: {
    delete: documentCommands.deleteStaticGrid,
    setActiveCell: (address: GridAddress) =>
      commits.setState((state) => createStaticGridActiveCellPatch(state, address)),
    setSelectionRange: (range: GridRange) =>
      commits.setState((state) =>
        createStaticGridSelectionRangePatch(state, range)
      ),
    appendSelectionRange: (range: GridRange) =>
      commits.setState((state) =>
        createStaticGridSelectionRangePatch(state, range, true)
      ),
    moveFocus: (dx: number, dy: number, options?: { extend?: boolean }) =>
      commits.setState((state) =>
        createMovedStaticGridFocusPatch(state, dx, dy, options)
      ),
    moveFocusToEdge: (
      edge: "left" | "right" | "top" | "bottom" | "top-left" | "bottom-right",
      options?: { extend?: boolean }
    ) =>
      commits.setState((state) =>
        createStaticGridEdgeFocusPatch(state, edge, options)
      ),
    moveFocusToContentBoundary: (
      edge: "left" | "right" | "top" | "bottom",
      options?: { extend?: boolean }
    ) =>
      commits.setState((state) =>
        createStaticGridContentBoundaryFocusPatch(state, edge, options)
      ),
    selectAll: () =>
      commits.setState((state) => createStaticGridSelectAllPatch(state)),
    selectRow: () =>
      commits.setState((state) => createStaticGridRowSelectionPatch(state)),
    selectColumn: () =>
      commits.setState((state) => createStaticGridColumnSelectionPatch(state)),
    enterTextEdit: (address?: GridAddress) =>
      commits.setState((state) => createStaticGridTextEditPatch(state, address)),
    exitTextEdit: () =>
      commits.setState((state) => createStaticGridTextEditExitPatch(state)),
    clearSelection: () =>
      commits.setState((state) =>
        createClearedStaticGridSelectionPatch(state)
      ),
  },
  sessions: {
    create: sessionCommands.createCanvasSession,
    openSource: sessionCommands.openSourceSession,
    import: sessionCommands.importCanvasSession,
    replaceSnapshot: sessionCommands.replaceCanvasSessionSnapshot,
    applySourceProjection: sessionCommands.applySourceProjection,
    switch: sessionCommands.switchCanvasSession,
    remove: sessionCommands.removeCanvasSession,
    saveViewport: sessionCommands.saveCanvasSessionViewport,
    rename: sessionCommands.renameCanvasSession,
    setCollaboration: sessionCommands.setCanvasSessionCollaboration,
    joinCollaboration: sessionCommands.joinCanvasSessionCollaboration,
  },
  slides: {
    add: slideCommands.addSlide,
    duplicate: slideCommands.duplicateSlide,
    remove: slideCommands.removeSlide,
    rename: slideCommands.renameSlide,
    move: slideCommands.moveSlide,
    activate: slideCommands.activateSlide,
    resize: slideCommands.resizeSlide,
  },
} as const;
const queries = {
  canCopyOrCut: selectionCommands.canCopyOrCut,
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
