import type { CanvasDocumentRegistry } from "../CanvasDocumentRegistry";
import type { CanvasSurfaceReader } from "../../cell-plane/model";
import type { EditorState } from "../interfaces";
import type { CanvasContentSurfaceState } from "../interfaces";
import { getDefaultCanvasPageId, type CanvasDocumentAddress } from "../canvasDocumentModel";

export const resolveEditorDocumentAddress = (
  documents: CanvasDocumentRegistry,
  state: Pick<
    EditorState,
    | "activeCanvasId"
    | "canvasMode"
    | "slideDeck"
    | "contentSurface"
  >
): CanvasDocumentAddress => {
  const activeAddress =
    state.canvasMode === "slide"
      ? null
      : documents.getDocumentAddress(state.activeCanvasId);
  const pageId =
    state.canvasMode === "slide"
      ? state.slideDeck?.activeSlideId
      : activeAddress?.pageId ?? getDefaultCanvasPageId(state.activeCanvasId);
  if (!pageId) throw new Error("Active Canvas page is unavailable");
  const kind = "cell-plane" as const;
  if (!documents.getDocument(state.activeCanvasId)) {
    documents.activateDocument(state.activeCanvasId, {
      mode: state.canvasMode,
      activePageId: pageId,
      pages: [{ id: pageId, kind }],
      grid: [],
    });
  } else if (!documents.getDocumentAddress(state.activeCanvasId, pageId)) {
    documents.ensurePage(
      state.activeCanvasId,
      { id: pageId, kind },
      { activate: true }
    );
  } else if (
    documents.getPageDescriptor(state.activeCanvasId, pageId)?.kind !== kind
  ) {
    documents.replacePage(state.activeCanvasId, {
      id: pageId,
      kind,
      grid: Array.from(state.contentSurface.reader.materialize()),
    });
    documents.activatePage(state.activeCanvasId, pageId);
  } else {
    documents.activatePage(state.activeCanvasId, pageId);
  }
  return { documentId: state.activeCanvasId, pageId };
};

let contentSurfaceRevision = 0;

export const createCanvasContentSurface = (
  reader: CanvasSurfaceReader
): CanvasContentSurfaceState => ({
  reader,
  revision: ++contentSurfaceRevision,
});

export const rebuildContentSurface = (documents: CanvasDocumentRegistry) =>
  createCanvasContentSurface(documents.getContentReader());
