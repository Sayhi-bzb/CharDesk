import type * as Y from 'yjs';
import type { ContentVersion } from './persistenceState.js';

export type CanvasContentChange = Readonly<{ documentId: string; version: string }>;

export class CanvasVersionConflict extends Error {
  readonly code = 'version_conflict';
  readonly documentId: string;
  readonly baseVersion: string;
  readonly currentVersion: string;
  constructor(
    documentId: string,
    baseVersion: string,
    currentVersion: string
  ) {
    super('Canvas content changed. Read the current version before retrying.');
    this.name = 'CanvasVersionConflict';
    this.documentId = documentId;
    this.baseVersion = baseVersion;
    this.currentVersion = currentVersion;
  }
}

export class CanvasContentVersions {
  private readonly publish: (notify: () => void) => void;
  constructor(publish: (notify: () => void) => void = (notify) => notify()) {
    this.publish = publish;
  }
  readonly #documents = new WeakMap<
    Y.Doc,
    { epoch: string; incarnation: string; revision: number; unrecorded: number; restored?: string }
  >();
  readonly #listeners = new Set<(change: CanvasContentChange) => void>();

  track(documentId: string, doc: Y.Doc, tracked: (transaction: Y.Transaction) => boolean = () => false) {
    if (this.#documents.has(doc)) return;
    const state = { epoch: globalThis.crypto.randomUUID(), incarnation: globalThis.crypto.randomUUID(), revision: 0, unrecorded: 0 };
    this.#documents.set(doc, state);
    const changed = new WeakSet<Y.Transaction>();
    const before = (transaction: Y.Transaction) => {
      const meta = doc.share.get('document-meta');
      const contentChanged = [...transaction.changed].some(
        ([type, keys]) => type !== meta || [...keys].some((key) => key !== 'activePageId')
      );
      if (!contentChanged) return;
      state.revision++;
      if (!tracked(transaction)) state.unrecorded++;
      changed.add(transaction);
    };
    const notify = () => {
      const change = Object.freeze({ documentId, version: this.get(doc) });
      for (const listener of this.#listeners) listener(change);
    };
    const after = (transaction: Y.Transaction) => {
      if (changed.has(transaction)) this.publish(notify);
    };
    doc.on('beforeObserverCalls', before);
    doc.on('afterTransaction', after);
    doc.on('destroy', () => {
      doc.off('beforeObserverCalls', before);
      doc.off('afterTransaction', after);
    });
  }

  get(doc: Y.Doc): ContentVersion {
    const state = this.#documents.get(doc);
    if (!state) throw new Error('Canvas content is not tracked.');
    return (state.revision === 0 && state.restored
      ? state.restored
      : `${state.epoch}:${state.revision}`) as ContentVersion;
  }

  lineage(doc: Y.Doc) {
    const state = this.#documents.get(doc);
    if (!state) throw new Error('Canvas content is not tracked.');
    return `${state.incarnation}:${state.unrecorded}`;
  }

  restore(doc: Y.Doc, version: string) {
    if (!version || version.length > 256) throw new Error('Invalid content version.');
    const state = this.#documents.get(doc);
    if (!state) throw new Error('Canvas content is not tracked.');
    state.epoch = globalThis.crypto.randomUUID();
    state.revision = 0;
    state.restored = version;
  }

  subscribe(listener: (change: CanvasContentChange) => void) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  dispose() {
    this.#listeners.clear();
  }
}
