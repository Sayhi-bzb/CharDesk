import * as Y from "yjs";
import { describe, expect, it } from "vitest";
import { CellPlaneIndex, type CellPlaneOperation } from "../cell-plane/model";
import {
  CANVAS_DOCUMENT_SCHEMA_VERSION,
  getCanvasDocumentRoot,
  readCanvasPageDescriptor,
} from "./canvasDocumentModel";
import { migrateLegacyStructuredDocument } from "./migrateLegacyStructuredDocument";

describe("legacy Structured document migration", () => {
  it("flattens scene nodes into one active CellPlane page", () => {
    const documentId = "legacy-document";
    const pageId = "legacy-page";
    const doc = new Y.Doc({ guid: documentId });
    const root = getCanvasDocumentRoot(doc);
    root.meta.set("mode", "structured");
    root.pages.set(pageId, { id: pageId, kind: "structured", name: "Legacy" });
    root.pageOrder.push([pageId]);
    const prefix = `canvas-page:${encodeURIComponent(pageId)}:`;
    doc.getMap(prefix + "structured-scene").set("title", {
      id: "title",
      type: "text",
      order: 1,
      position: { x: 2, y: 3 },
      text: "Old",
      style: { color: "#123456" },
    });

    expect(migrateLegacyStructuredDocument(doc, documentId)).toBe(true);

    expect(root.meta.get("mode")).toBe("freeform");
    expect(root.meta.get("schemaVersion")).toBe(CANVAS_DOCUMENT_SCHEMA_VERSION);
    expect(readCanvasPageDescriptor(pageId, root.pages.get(pageId))).toEqual({
      id: pageId,
      kind: "cell-plane",
      name: "Legacy",
    });
    expect(doc.getMap(prefix + "structured-scene").size).toBe(0);
    const index = new CellPlaneIndex(
      doc.getArray<CellPlaneOperation>(prefix + "cell-plane-operations").toArray()
    );
    expect(index.getCell({ x: 2, y: 3 })?.char).toBe("O");
    expect(index.getCell({ x: 4, y: 3 })?.char).toBe("d");
    index.dispose();
    doc.destroy();
  });

  it("leaves current CellPlane documents untouched", () => {
    const doc = new Y.Doc({ guid: "current" });
    const root = getCanvasDocumentRoot(doc);
    root.meta.set("mode", "freeform");

    expect(migrateLegacyStructuredDocument(doc, "current")).toBe(false);
    doc.destroy();
  });
});
