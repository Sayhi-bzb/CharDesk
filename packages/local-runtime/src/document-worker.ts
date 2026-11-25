import { parentPort } from 'node:worker_threads';
import * as Y from 'yjs';
import { CanvasDocumentRegistry } from '@chardesk/editor-core';
import { parseCanvasDocument, serializeCanvasDocument } from '@chardesk/editor-core/documentText';
import { semanticDocumentSource, type SemanticContentId } from '@chardesk/editor-core/persistenceState';
import { sourceDigest } from './storage.ts';
import type { SerializationRequest, SerializationReply } from './documentSerialization.ts';

parentPort!.on('message', ({ id, documentId, title, update, source: baseline }: SerializationRequest) => {
  const registry = new CanvasDocumentRegistry(documentId);
  const doc = new Y.Doc({ guid: documentId });
  try {
    if (update) {
      Y.applyUpdate(doc, update);
      registry.adoptDocument(documentId, doc);
    }
    const draft = baseline === undefined ? registry.getDocumentDraft(documentId)! : parseCanvasDocument(baseline).document;
    const source = baseline ?? serializeCanvasDocument(draft, title);
    const semanticId = sourceDigest(semanticDocumentSource(draft))! as SemanticContentId;
    parentPort!.postMessage({ id, source, semanticId } satisfies SerializationReply);
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
