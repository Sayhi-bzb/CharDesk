import type { CanvasDocumentRegistry } from "../CanvasDocumentRegistry";
import type { CanvasSurfaceReader } from "../../cell-plane/model";
import type { StructuredNode } from "@/domains/structured-content/public";
import type { EditorState } from "../interfaces";
import type { CanvasContentSurfaceState } from "../interfaces";
import { getDefaultCanvasPageId, type CanvasDocumentAddress } from "../canvasDocumentModel";
import {
  cloneStructuredNode,
  createStructuredSceneSurface,
  normalizeScene,
  StructuredSceneSurfaceIndex,
} from "@/domains/structured-content/public";
import {
  decodeCollaborativeStructuredNode,
} from "../collaborationSchema";

export const resolveEditorDocumentAddress = (
  documents: CanvasDocumentRegistry,
  state: Pick<
    EditorState,
    | "activeCanvasId"
    | "canvasMode"
    | "slideDeck"
    | "contentSurface"
    | "structuredScene"
    | "structuredComponents"
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
  const kind = state.canvasMode === "structured" ? "structured" : "cell-plane";
  if (!documents.getDocument(state.activeCanvasId)) {
    documents.activateDocument(state.activeCanvasId, {
      mode: state.canvasMode,
      activePageId: pageId,
      pages: [{ id: pageId, kind }],
      grid: [],
      scene: [],
      components: [],
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
      ...(kind === "structured"
        ? {
            scene: state.structuredScene,
            components: state.structuredComponents,
          }
        : { grid: Array.from(state.contentSurface.reader.materialize()) }),
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

export const createStructuredContentSurface = (
  scene: readonly StructuredNode[]
) => createCanvasContentSurface(createStructuredSceneSurface(scene));

export const updateStructuredContentSurface = (
  current: CanvasContentSurfaceState,
  scene: readonly StructuredNode[],
  changedIds: readonly string[]
) => {
  if (current.reader instanceof StructuredSceneSurfaceIndex) {
    current.reader.update(scene, changedIds);
    return createCanvasContentSurface(current.reader);
  }
  return createStructuredContentSurface(scene);
};

export const rebuildSceneFromYMap = (documents: CanvasDocumentRegistry) => {
  const nextScene: StructuredNode[] = [];
  documents.yStructuredScene.forEach((value, key) => {
    const decoded = decodeCollaborativeStructuredNode(key, value);
    documents.setIntegrityIssue("structured-scene", key, decoded.ok ? null : decoded.issue);
    if (decoded.ok) nextScene.push(cloneStructuredNode(decoded.value));
  });
  return normalizeScene(nextScene);
};

export const rebuildSceneFromYMapChanges = (
  documents: CanvasDocumentRegistry,
  currentScene: readonly StructuredNode[],
  changedIds: readonly string[]
) => {
  const nextById = new Map(currentScene.map((node) => [node.id, node]));
  changedIds.forEach((key) => {
    const value = documents.yStructuredScene.get(key);
    if (value === undefined) {
      nextById.delete(key);
      documents.setIntegrityIssue("structured-scene", key, null);
      return;
    }
    const decoded = decodeCollaborativeStructuredNode(key, value);
    documents.setIntegrityIssue(
      "structured-scene",
      key,
      decoded.ok ? null : decoded.issue
    );
    if (decoded.ok) nextById.set(key, cloneStructuredNode(decoded.value));
    else nextById.delete(key);
  });
  return normalizeScene([...nextById.values()]);
};
