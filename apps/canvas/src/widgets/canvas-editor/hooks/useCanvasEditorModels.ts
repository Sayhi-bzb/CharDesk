import {
  createGridSurfaceReader,
  createEmptyCanvasInteraction,
  isIncrementalCanvasSurfaceReader,
  readSlideDeckDescriptor,
  useCanvasRuntime,
  useCanvasState,
  type CanvasState,
  type CanvasSurfaceReader,
} from "@/domains/canvas/public";
import { useShallow } from "zustand/react/shallow";
import { useCanvasViewOptional } from '../engine/CanvasWorkspace';
import type { CanvasSessionDescriptor } from '@/domains/sessions/public';
import { useMemo, useSyncExternalStore } from 'react';

type SessionContent = Pick<
  CanvasState,
  | 'activeCanvasId'
  | 'canvasMode'
  | 'slideDeck'
> & {
  contentReader: CanvasSurfaceReader;
  contentRevision: number;
};

const contentModel = (contentReader: CanvasSurfaceReader) => ({
  contentReader,
  contentRevision: isIncrementalCanvasSurfaceReader(contentReader)
    ? contentReader.getRevision()
    : 0,
});

const resolveSessionContent = (
  session: CanvasSessionDescriptor,
  documents: ReturnType<typeof useCanvasRuntime>["documents"]
): SessionContent => {
  if (session.mode === 'slide') {
    const slideDeck = readSlideDeckDescriptor(documents, session.id);
    const activeSlide = slideDeck?.slides.find(
      (slide) => slide.id === slideDeck.activeSlideId
    );
    const contentReader = activeSlide
      ? documents.getContentReader(session.id, activeSlide.id) ??
        createGridSurfaceReader(new Map())
      : createGridSurfaceReader(new Map());
    return {
      activeCanvasId: session.id,
      canvasMode: session.mode,
      slideDeck,
      ...contentModel(contentReader),
    };
  }
  const contentReader = documents.getContentReader(session.id) ??
    createGridSurfaceReader(new Map());
  return {
    activeCanvasId: session.id,
    canvasMode: session.mode,
    slideDeck: null,
    ...contentModel(contentReader),
  };
};

export const useCanvasEditorModels = () => {
  const canvas = useCanvasRuntime();
  const {
    commands: canvasCommands,
    documents,
  } = canvas;
  const canvasView = useCanvasViewOptional();
  const fallbackViewport = useSyncExternalStore(
    canvas.viewport.subscribe,
    canvas.viewport.getSnapshot,
    canvas.viewport.getSnapshot
  );
  const pendingCameraPlacement = useSyncExternalStore(
    canvas.viewport.subscribePlacement,
    canvas.viewport.getPendingPlacement,
    canvas.viewport.getPendingPlacement
  );
  const canvasSessions = useCanvasState((state) => state.canvasSessions);
  const interactionState = useCanvasState(
    useShallow((state) => ({
      activeCanvasId: state.activeCanvasId,
      tool: state.tool,
      canvasMode: state.canvasMode,
      slideDeck: state.slideDeck,
      brushChar: state.brushChar,
      brushColor: state.brushColor,
      brushBackgroundColor: state.brushBackgroundColor,
      contentReader: state.contentSurface.reader,
      contentRevision: state.contentSurface.revision,
      interaction: state.interaction,
    }))
  );
  const boundSession = canvasView?.sessionId
    ? canvasSessions.find((session) => session.id === canvasView.sessionId)
    : undefined;
  const usesSessionSnapshot = !!boundSession && boundSession.id !== interactionState.activeCanvasId;
  const sessionContent = useMemo(
    () =>
      usesSessionSnapshot
        ? resolveSessionContent(boundSession, documents)
        : null,
    [boundSession, documents, usesSessionSnapshot]
  );
  const inactiveInteraction = useMemo(
    () => createEmptyCanvasInteraction(interactionState.interaction.address),
    [interactionState.interaction.address]
  );
  const activeInteractionState = {
    ...interactionState,
    ...interactionState.interaction,
  };
  const resolvedInteractionState = sessionContent
    ? {
        ...activeInteractionState,
        ...sessionContent,
        ...inactiveInteraction,
      }
    : activeInteractionState;
  const interactionStore = {
    ...resolvedInteractionState,
    ...(canvasView?.viewport ?? fallbackViewport),
    setBrushColor: canvasCommands.preferences.setBrushColor,
    setBrushBackgroundColor: canvasCommands.preferences.setBrushBackgroundColor,
    setCanvasColorPickerTarget: canvasCommands.interaction.setColorPickerTarget,
    setOffset: canvasView?.setOffset ?? canvasCommands.viewport.setOffset,
    setZoom: canvasView?.setZoom ?? canvasCommands.viewport.setZoom,
    setViewport: canvasView?.setViewport ?? canvasCommands.viewport.setViewport,
    addScratchPoints: canvasCommands.grid.addScratchPoints,
    commitScratch: canvasCommands.grid.commitScratch,
    setStaticGridActiveCell: canvasCommands.staticGrid.setActiveCell,
    enterStaticGridTextEdit: canvasCommands.staticGrid.enterTextEdit,
    exitStaticGridTextEdit: canvasCommands.staticGrid.exitTextEdit,
    setStaticGridSelectionRange: canvasCommands.staticGrid.setSelectionRange,
    appendStaticGridSelectionRange: canvasCommands.staticGrid.appendSelectionRange,
    clearSelections: canvasCommands.selection.clear,
    clearInteractionState: canvasCommands.selection.clearInteraction,
    erasePoints: canvasCommands.grid.erasePoints,
    updateScratchForShape: canvasCommands.grid.updateScratchForShape,
    setHoveredGrid:
      !canvasView || canvasView.isActive
        ? canvasCommands.interaction.setHoveredGrid
        : () => undefined,
    fillArea: canvasCommands.grid.fillArea,
    moveStaticGridSelection: canvasCommands.selection.moveStaticRange,
    insertRows: canvasCommands.grid.insertRows,
  };
  const rendererStore = useCanvasState(
    useShallow((state) => ({
      activeCanvasId: state.activeCanvasId,
      contentReader: state.contentSurface.reader,
      contentRevision: state.contentSurface.revision,
      showGrid: state.showGrid,
      tool: state.tool,
      canvasMode: state.canvasMode,
      slideDeck: state.slideDeck,
      interaction: state.interaction,
    }))
  );
  const activeRendererStore = { ...rendererStore, ...rendererStore.interaction };
  const viewRendererStore = canvasView
    ? {
        ...activeRendererStore,
        ...(sessionContent ?? null),
        ...canvasView.viewport,
        ...(canvasView.isActive ? null : inactiveInteraction),
      }
    : { ...activeRendererStore, ...fallbackViewport };
  const editorState = useCanvasState(
    useShallow((state) => ({
      contentReader: state.contentSurface.reader,
      interaction: state.interaction,
      brushColor: state.brushColor,
    }))
  );
  const editorStore = {
    ...editorState,
    ...(sessionContent ?? null),
    ...(canvasView?.viewport ?? fallbackViewport),
    pendingCameraPlacement,
    interaction:
      canvasView && !canvasView.isActive
        ? inactiveInteraction
        : editorState.interaction,
    writeTextString: canvasCommands.text.write,
    deleteStaticGrid: canvasCommands.staticGrid.delete,
    newlineText: canvasCommands.text.newline,
    indentText: canvasCommands.text.indent,
    moveTextCursor: canvasCommands.text.moveCursor,
    moveStaticGridFocus: canvasCommands.staticGrid.moveFocus,
    moveStaticGridFocusToEdge: canvasCommands.staticGrid.moveFocusToEdge,
    moveStaticGridFocusToContentBoundary:
      canvasCommands.staticGrid.moveFocusToContentBoundary,
    selectStaticGridAll: canvasCommands.staticGrid.selectAll,
    selectStaticGridRow: canvasCommands.staticGrid.selectRow,
    selectStaticGridColumn: canvasCommands.staticGrid.selectColumn,
    enterStaticGridTextEdit: canvasCommands.staticGrid.enterTextEdit,
    exitStaticGridTextEdit: canvasCommands.staticGrid.exitTextEdit,
    setOffset: canvasView?.setOffset ?? canvasCommands.viewport.setOffset,
    consumePendingCameraPlacement: canvasCommands.viewport.consumePendingPlacement,
    fillSelectionsWithChar: canvasCommands.selection.fillWithChar,
    moveStaticGridSelection: canvasCommands.selection.moveStaticRange,
    insertRows: canvasCommands.grid.insertRows,
    clearSelections: canvasCommands.selection.clear,
    setCanvasColorPickerTarget: canvasCommands.interaction.setColorPickerTarget,
    setHoveredGrid:
      !canvasView || canvasView.isActive
        ? canvasCommands.interaction.setHoveredGrid
        : () => undefined,
  };

  return {
    interaction: interactionStore,
    renderer: viewRendererStore,
    editor: editorStore,
  };
};
