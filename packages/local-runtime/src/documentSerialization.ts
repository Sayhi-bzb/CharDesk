import { Worker } from 'node:worker_threads';
import * as Y from 'yjs';
import type { CanvasDocumentAddress } from '@chardesk/editor-core/canvasDocumentModel';
import type { TerminalCanvas } from './model.ts';

export type SerializationRequest = {
  id: number;
  documentId: string;
  update: Uint8Array;
  title: string;
};
export type SerializationReply = { id: number } & ({ source: string } | { error: string });
export type DocumentTextSnapshot = { version: string; source: string };

/** One workspace owns one lazy worker and shares its immutable captures between save and recovery. */
export class DocumentSerializer {
  #worker: Worker | null = null;
  #disposed = false;
  #nextId = 0;
  #pending = new Map<
    number,
    { resolve: (source: string) => void; reject: (error: Error) => void }
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
    const version = model.versionAt(address);
    const key = JSON.stringify([
      version,
      model.documents.getDocumentAddress(address.documentId)?.pageId,
      title,
    ]);
    const cached = this.#cache.get(document);
    if (cached?.key === key) return cached.snapshot;
    // Yjs encodes the stored span operations, without expanding them to individual cells on the UI thread.
    const update = Y.encodeStateAsUpdate(document);
    const snapshot = this.#serialize(address.documentId, title, update).then((source) => ({
      version,
      source,
    }));
    const entry = { key, snapshot };
    this.#cache.set(document, entry);
    void snapshot.catch(() => {
      if (this.#cache.get(document) === entry) this.#cache.delete(document);
    });
    return snapshot;
  }
  #serialize(documentId: string, title: string, update: Uint8Array) {
    if (!this.#worker) {
      const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js';
      const worker = new Worker(new URL(`./document-worker.${extension}`, import.meta.url));
      this.#worker = worker;
      worker.on('message', (reply: SerializationReply) => {
        const pending = this.#pending.get(reply.id);
        if (!pending) return;
        this.#pending.delete(reply.id);
        if ('error' in reply) pending.reject(new Error(reply.error));
        else pending.resolve(reply.source);
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
    return new Promise<string>((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      try {
        this.#worker!.postMessage({ id, documentId, title, update } satisfies SerializationRequest);
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
