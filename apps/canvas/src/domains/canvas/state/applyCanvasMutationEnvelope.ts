import type * as Y from "yjs";
import { getCanvasDocumentRoot, readCanvasPageOrder, readCanvasYPage, createCanvasYPage, writeCanvasDocumentMetadata } from "./canvasDocumentModel";
import type { CanvasMutationEnvelope } from "./canvasMutationEnvelope";

export const applyCanvasMutationEnvelopeToDocument = (
  doc: Y.Doc,
  envelope: CanvasMutationEnvelope
) => {
  const root = getCanvasDocumentRoot(doc);
  doc.transact(() => {
    if (envelope.kind === "cell-plane") {
      readCanvasYPage(root, envelope.pageId)?.operations.push([envelope.operation]);
      return;
    }
    if (envelope.kind === "anchors") {
      const page = readCanvasYPage(root, envelope.pageId);
      if (!page) return;
      if (envelope.operation) page.operations.push([envelope.operation]);
      for (const change of envelope.changes) {
        if (change.value) page.anchors.set(change.id, change.value);
        else page.anchors.delete(change.id);
      }
      return;
    }
    if (envelope.kind === "page-metadata") {
      root.pages.set(envelope.page.id, envelope.page);
      return;
    }
    if (envelope.kind === "page-upsert") {
      const current = readCanvasYPage(root, envelope.page.id);
      if (current) {
        current.operations.delete(0, current.operations.length);
      }
      createCanvasYPage(root, envelope.page, `checkpoint-tail:${envelope.page.id}`);
      return;
    }
    if (envelope.kind === "page-delete") {
      readCanvasYPage(root, envelope.pageId)?.anchors.clear();
      root.pages.delete(envelope.pageId);
      const index = root.pageOrder.toArray().indexOf(envelope.pageId);
      if (index >= 0) root.pageOrder.delete(index, 1);
      return;
    }
    root.pageOrder.delete(0, root.pageOrder.length);
    root.pageOrder.push([...envelope.pageIds]);
    writeCanvasDocumentMetadata(
      root,
      envelope.documentId,
      envelope.mode,
      envelope.activePageId
    );
  }, "canvas-checkpoint-tail");
  if (readCanvasPageOrder(root).length === 0) {
    throw new Error(`Canvas checkpoint tail removed every page: ${envelope.documentId}`);
  }
};
