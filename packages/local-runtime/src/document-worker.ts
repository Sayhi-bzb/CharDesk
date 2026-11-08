import { parentPort } from 'node:worker_threads';
import * as Y from 'yjs';
import { CanvasDocumentRegistry } from '@chardesk/editor-core';
import { serializeCanvasDocument } from '@chardesk/editor-core/documentText';
import type { SerializationRequest, SerializationReply } from './documentSerialization.ts';

parentPort!.on('message', ({ id, documentId, title, update }: SerializationRequest) => {
  const registry = new CanvasDocumentRegistry(documentId);
  const doc = new Y.Doc({ guid: documentId });
  try {
    Y.applyUpdate(doc, update);
    registry.adoptDocument(documentId, doc);
    // The shared serializer still validates the complete native text before it can reach disk.
    const source = serializeCanvasDocument(registry.getDocumentDraft(documentId)!, title);
    parentPort!.postMessage({ id, source } satisfies SerializationReply);
  } catch (error) {
    parentPort!.postMessage({
      id,
      error: error instanceof Error ? error.message : String(error),
    } satisfies SerializationReply);
  } finally {
    registry.dispose();
    doc.destroy();
  }
});
