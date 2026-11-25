import { Worker } from 'node:worker_threads';
import * as Y from 'yjs';
import type { CanvasDocumentAddress } from '@chardesk/editor-core/canvasDocumentModel';
import type { TerminalCanvas } from './model.ts';
import type { ContentProof, ContentVersion, SemanticContentId } from '@chardesk/editor-core/persistenceState';

export type SerializationRequest = {
  id: number;
  documentId: string;
  update?: Uint8Array;
  source?: string;
  title: string;
};
type SerializedContent = { source: string; semanticId: SemanticContentId };
export type SerializationReply = { id: number } & (SerializedContent | { error: string });
export type DocumentTextSnapshot = ContentProof & SerializedContent & { contentVersion: ContentVersion };

export class DocumentSerializer {
  #worker: Worker | null = null;
  #disposed = false;
  #nextId = 0;
  #pending = new Map<
    number,
    { resolve: (content: SerializedContent) => void; reject: (error: Error) => void }
  >();
  #cache = new WeakMap<Y.Doc, { key: string; snapshot: Promise<DocumentTextSnapshot> }>();

  capture(
    model: TerminalCanvas,
    address: CanvasDocumentAddress,
    title: string
  ): Promise<DocumentTextSnapshot> {
    if (this.#disposed) return Promise.reject(new Error('Document serializer is closed.'));
    const document = model.documents.getCollaborationDocument(address.documentId);
    if (!document) return Promise.reject(new Error('Document is no longer open.'));
    const proof = model.contentProofAt(address);
    const contentVersion = proof.version;
    const key = JSON.stringify([
      contentVersion,
      model.documents.getDocumentAddress(address.documentId)?.pageId,
      title,
    ]);
    const cached = this.#cache.get(document);
    if (cached?.key === key) return cached.snapshot;
    const update = Y.encodeStateAsUpdate(document);
    const snapshot = this.#serialize(address.documentId, title, update).then((content) => ({
      ...proof,
      contentVersion,
      ...content,
    }));
    const entry = { key, snapshot };
    this.#cache.set(document, entry);
    void snapshot.catch(() => {
      if (this.#cache.get(document) === entry) this.#cache.delete(document);
    });
    return snapshot;
  }
  identityForSource(source: string) {
    if (this.#disposed) return Promise.reject(new Error('Document serializer is closed.'));
    return this.#serialize('baseline', '', undefined, source).then((content) => content.semanticId);
  }
  #serialize(documentId: string, title: string, update?: Uint8Array, source?: string) {
    if (!this.#worker) {
      const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js';
      const worker = new Worker(new URL(`./document-worker.${extension}`, import.meta.url));
      this.#worker = worker;
      worker.on('message', (reply: SerializationReply) => {
        const pending = this.#pending.get(reply.id);
        if (!pending) return;
        this.#pending.delete(reply.id);
        if ('error' in reply) pending.reject(new Error(reply.error));
        else pending.resolve({ source: reply.source, semanticId: reply.semanticId });
        if (!this.#pending.size) worker.unref();
      });
      const failed = (error: Error) => {
        if (this.#worker !== worker) return;
        this.#worker = null;
        for (const pending of this.#pending.values()) pending.reject(error);
        this.#pending.clear();
      };
      worker.on('error', failed);
      worker.on('exit', (code) =>
        failed(new Error(`Document serialization worker exited (${code}).`))
      );
    }
    const id = ++this.#nextId;
    this.#worker.ref();
    return new Promise<SerializedContent>((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      try {
        this.#worker!.postMessage({ id, documentId, title, update, source } satisfies SerializationRequest);
      } catch (error) {
        this.#pending.delete(id);
        if (!this.#pending.size) this.#worker!.unref();
        reject(error);
      }
    });
  }
  dispose() {
    this.#disposed = true;
    for (const pending of this.#pending.values())
      pending.reject(new Error('Document serializer is closed.'));
    this.#pending.clear();
    void this.#worker?.terminate();
    this.#worker = null;
    this.#cache = new WeakMap();
  }
}
