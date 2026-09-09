import * as Y from "yjs";
import {
  decodeStructuredNode,
  normalizeScene,
  sceneToGridEntries,
  type StructuredNode,
} from "@/domains/legacy-structured/public";
import { gridEntriesToCellPlaneOperation } from "../cell-plane/model";
import {
  CANVAS_DOCUMENT_SCHEMA_VERSION,
  getCanvasDocumentRoot,
  getDefaultCanvasPageId,
} from "./canvasDocumentModel";

const readField = (value: unknown, key: string): unknown => {
  if (value instanceof Y.Map) return value.get(key);
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)[key]
    : undefined;
};

const decodeSceneMap = (scene: Y.Map<unknown>) =>
  normalizeScene(
    Array.from(scene.values())
      .map(decodeStructuredNode)
      .filter((node): node is StructuredNode => node !== null)
  );

/** Converts retired Structured storage into the active CellPlane schema in place. */
export const migrateLegacyStructuredDocument = (doc: Y.Doc, documentId: string) => {
  const root = getCanvasDocumentRoot(doc);
  const legacyRootScene = doc.getMap<unknown>("structured-scene");
  const pageIds = new Set([
    ...root.pageOrder.toArray(),
    ...Array.from(root.pages.keys()),
  ]);
  const hasStructuredPage = Array.from(pageIds).some(
    (pageId) => readField(root.pages.get(pageId), "kind") === "structured"
  );
  const hasLegacyRoot = legacyRootScene.size > 0;
  if (!hasStructuredPage && !hasLegacyRoot && root.meta.get("mode") !== "structured") {
    return false;
  }

  doc.transact(() => {
    if (root.pages.size === 0 && hasLegacyRoot) {
      const pageId = getDefaultCanvasPageId(documentId);
      root.pages.set(pageId, { id: pageId, kind: "cell-plane" });
      root.pageOrder.push([pageId]);
      pageIds.add(pageId);
    }

    for (const pageId of pageIds) {
      const stored = root.pages.get(pageId);
      const structured = readField(stored, "kind") === "structured" ||
        (root.pages.size === 1 && hasLegacyRoot);
      if (!structured) continue;

      const prefix = `canvas-page:${encodeURIComponent(pageId)}:`;
      const scene = doc.getMap<unknown>(prefix + "structured-scene");
      const source = scene.size > 0 ? scene : legacyRootScene;
      const operations = doc.getArray(prefix + "cell-plane-operations");
      operations.delete(0, operations.length);
      const bootstrap = gridEntriesToCellPlaneOperation(
        `legacy-structured-flatten:${documentId}:${pageId}`,
        sceneToGridEntries(decodeSceneMap(source))
      );
      if (bootstrap) operations.push([bootstrap]);

      root.pages.set(pageId, {
        id: pageId,
        kind: "cell-plane",
        ...(typeof readField(stored, "name") === "string"
          ? { name: readField(stored, "name") }
          : {}),
        ...(readField(stored, "size") ? { size: readField(stored, "size") } : {}),
      });
      scene.clear();
      doc.getMap(prefix + "structured-components").clear();
    }

    legacyRootScene.clear();
    doc.getMap("structured-components").clear();
    root.meta.set("mode", "freeform");
    root.meta.set("schemaVersion", CANVAS_DOCUMENT_SCHEMA_VERSION);
    root.meta.set("documentId", documentId);
    if (typeof root.meta.get("activePageId") !== "string") {
      root.meta.set("activePageId", root.pageOrder.get(0));
    }
  }, "legacy-structured-flatten");
  return true;
};
