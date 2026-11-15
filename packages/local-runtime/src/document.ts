import { realpath, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { parseCanvasDocument } from '@chardesk/editor-core/documentText';
import type { CanvasDocumentAddress } from '@chardesk/editor-core/canvasDocumentModel';
import { TerminalCanvas } from './model.ts';
import type { FreeformEditorSessionOptions } from '@chardesk/editor-core/runtime';
import { atomicWrite } from './storage.ts';
import { FileSourceBinding, readOptionalFileText as readOptional } from './fileSource.ts';
import { DocumentSerializer, type DocumentTextSnapshot } from './documentSerialization.ts';
import { DocumentSaveState, type ContentVersion, type HistoryPosition,
  type SavedContent, type SemanticContentId } from '@chardesk/editor-core/persistenceState';

export { readOptional };
export async function resolveCanvasFilePath(input: string): Promise<string> {
  const path = resolve(input);
  try {
    return await realpath(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const parent = dirname(path);
    if (parent === path) throw error;
    return join(await resolveCanvasFilePath(parent), basename(path));
  }
}

export class CanvasFile {
  readonly source: FileSourceBinding;
  #saving = false;
  address?: CanvasDocumentAddress;
  writeGuard?: () => void;
  beforeSave?: (snapshot: DocumentTextSnapshot) => void;
  afterCapture?: (snapshot: DocumentTextSnapshot) => void;
  afterSave?: (snapshot: DocumentTextSnapshot) => void;
  afterReload?: () => void;
  recoveredCanvasId?: string;
  persistedVersion?: string;
  ready?: Promise<void>;
  #state?: DocumentSaveState;
  #model?: TerminalCanvas;
  #encoder?: DocumentSerializer;
  #ownEncoder?: DocumentSerializer;
  #identityEncoder() { return this.#encoder ?? (this.#ownEncoder ??= new DocumentSerializer()); }

  attach(model: TerminalCanvas, encoder?: DocumentSerializer, publish = true) {
    this.#encoder = encoder;
    if (this.#model !== model || !this.#state) {
      const previous = this.#state?.baseline();
      const address = this.address!;
      const dirty = model.isDirtyAt(address);
      this.#state?.dispose();
      this.#model = model;
      this.#state = new DocumentSaveState({
        proof: () => model.contentProofAt(address),
        capture: () => {
          const proof = model.contentProofAt(address);
          const captured = this.#identityEncoder().capture(model, address, this.title);
          return { ...proof, semantic: () => captured.then((snapshot) => snapshot.semanticId) };
        },
        changed: () => model.editor.transact(() => {}),
        dispose: () => {
          if (this.#model === model) {
            this.#ownEncoder?.dispose();
            this.#ownEncoder = undefined;
          }
        },
      });
      if (previous) this.#state.acknowledge(dirty ? previous : { ...previous, ...model.contentProofAt(address) });
      else if (this.baselineSource !== null) {
        const source = this.baselineSource;
        let semantic: Promise<SemanticContentId> | undefined;
        const proof = model.contentProofAt(address);
        this.#state.acknowledge({ ...proof,
          ...(dirty ? { version: 'unverified-baseline' as ContentVersion,
            position: 'unverified-baseline' as HistoryPosition, lineage: 'unverified-baseline' } : {}),
          semantic: () => semantic ??= this.#identityEncoder().identityForSource(source)
            .catch((error) => { semantic = undefined; throw error; }),
        });
      } else if (!dirty) {
        const seed = model.capturePersistenceAt(address);
        let semantic: Promise<SemanticContentId> | undefined;
        this.#state.acknowledge({ ...seed,
          semantic: () => semantic ??= this.#identityEncoder().identityForSource(seed.semantic() as string)
            .catch((error) => { semantic = undefined; throw error; }),
        });
      }
    }
    if (publish) model.bindPersistenceAt(this.address!, this.#state);
  }
  disposePersistence() {
    this.#state?.dispose();
    this.#ownEncoder?.dispose();
  }
  constructor(
    readonly path: string,
    readonly title: string,
    source: string | null
  ) {
    this.source = new FileSourceBinding(path, source);
  }
  get baselineSource() {
    return this.source.baseline.source;
  }
  get baselineDigest() {
    return this.source.baseline.digest;
  }

  static async open(input: string, initialBody = '', options: FreeformEditorSessionOptions = {}) {
    const path = await resolveCanvasFilePath(input);
    const source = await readOptional(path);
    const parsed = source === null ? null : parseCanvasDocument(source);
    const model = new TerminalCanvas(source === null ? initialBody : '', {
      ...options,
      ...(parsed ? { document: parsed.document } : {}),
    });
    const file = new CanvasFile(path, parsed?.title ?? basename(path, '.chardesk'), source);
    file.address = model.documents.getActiveAddress();
    file.attach(model);
    return { file, model };
  }

  async save(
    model: TerminalCanvas,
    serializer?: DocumentSerializer,
    options: { markSaved?: boolean } = {}
  ) {
    if (this.ready) await this.ready;
    this.writeGuard?.();
    if (this.#saving) throw new Error('Save is already in progress.');
    this.#saving = true;
    const encoder = serializer ?? new DocumentSerializer();
    try {
      const address = this.address ?? model.documents.getActiveAddress();
      this.address = address;
      this.attach(model, serializer, options.markSaved !== false);
      const state = this.#state!;
      const incarnation = model.documents.getCollaborationDocument(address.documentId);
      const snapshot = await encoder.capture(model, address, this.title);
      const { source } = snapshot;
      this.writeGuard?.();
      this.afterCapture?.(snapshot);
      this.source.assertBaseline(await this.source.read());
      const mode = await stat(this.path)
        .then((info) => info.mode & 0o777)
        .catch((error: NodeJS.ErrnoException) => {
          if (error.code !== 'ENOENT') throw error;
          return 0o600;
        });
      await atomicWrite(
        this.path,
        source,
        async () => {
          this.writeGuard?.();
          this.source.assertBaseline(await this.source.read());
          this.beforeSave?.(snapshot);
        },
        mode
      );
      this.source.accept(source);
      this.afterSave?.(snapshot);
      this.persistedVersion = snapshot.contentVersion;
      const saved: SavedContent = { ...snapshot, semantic: () => snapshot.semanticId };
      if (options.markSaved !== false) {
        if (model.documents.getCollaborationDocument(address.documentId) === incarnation)
          model.acknowledgeSavedAt(address, saved, state);
      } else state.acknowledge(saved);
    } finally {
      this.#saving = false;
      if (!serializer) encoder.dispose();
    }
  }
}
