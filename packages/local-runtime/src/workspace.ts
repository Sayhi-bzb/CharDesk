import { randomUUID } from 'node:crypto';
import type { FreeformEditorSessionOptions } from '@chardesk/editor-core/runtime';
import { CanvasFile, resolveCanvasFilePath } from './document.ts';
import { TerminalCanvas } from './model.ts';
import { parseCanvasDocument } from '@chardesk/editor-core/documentText';
import { DocumentSerializer } from './documentSerialization.ts';

/** Host-owned file catalog; document, interaction and history live in the shared Session. */
export class TerminalWorkspace {
  readonly model: TerminalCanvas;
  readonly #files: CanvasFile[];
  #disposed = false;
  #openIntent = 0;
  readonly #saves = new Map<CanvasFile, Promise<void>>();
  readonly #reserved = new Set<string>();
  readonly #serializer = new DocumentSerializer();
  readonly #errors = new Map<CanvasFile, string>();
  errorFor(file: CanvasFile) {
    return this.#errors.get(file);
  }
  private constructor(
    initial: { file?: CanvasFile; model: TerminalCanvas },
    readonly options: FreeformEditorSessionOptions
  ) {
    this.model = initial.model;
    this.#files = initial.file ? [initial.file] : [];
  }
  static empty(options: FreeformEditorSessionOptions = {}) {
    const model = new TerminalCanvas('', options);
    model.setTool('pan');
    model.markSaved();
    return new TerminalWorkspace({ model }, options);
  }
  static async open(path: string, initialBody = '', options: FreeformEditorSessionOptions = {}) {
    const initial = await CanvasFile.open(path, initialBody, options);
    initial.model.setTool('pan');
    return new TerminalWorkspace(initial, options);
  }
  static fromRecovery(
    file: CanvasFile,
    source: string,
    views: readonly { pageId: string; state: unknown }[],
    dirty: boolean,
    options: FreeformEditorSessionOptions = {}
  ) {
    const { document } = parseCanvasDocument(source);
    const model = new TerminalCanvas('', { ...options, document });
    try {
      file.address = model.documents.getActiveAddress();
      model.setTool('pan');
      if (dirty) model.markDirtyAt(file.address);
      for (const view of views)
        model.restoreViewAt({ documentId: document.id, pageId: view.pageId }, view.state);
      return new TerminalWorkspace({ file, model }, options);
    } catch (error) {
      model.dispose();
      throw error;
    }
  }
  get files(): readonly CanvasFile[] {
    return this.#files;
  }
  get active() {
    return this.#files.find(
      (file) => file.address?.documentId === this.model.documents.getActiveDocumentId()
    )!;
  }
  get dirty() {
    return this.#files.some((file) => this.model.isDirtyAt(file.address!));
  }
  switchTo(index: number) {
    const file = this.#files[index];
    if (!file || this.#disposed) return false;
    this.#openIntent++;
    return this.model.switchDocument(file.address!.documentId);
  }
  cancelPendingOpen() {
    this.#openIntent++;
  }
  reservePaths(paths: readonly string[]) {
    if (this.#files.some((file) => paths.includes(file.path)))
      throw new Error('Workspace checkpoint must use a separate filename.');
    for (const path of paths) this.#reserved.add(path);
  }
  async openFile(input: string) {
    const intent = ++this.#openIntent;
    const path = await resolveCanvasFilePath(input);
    if (this.#reserved.has(path)) throw new Error('This path is reserved for workspace storage.');
    if (this.#disposed || intent !== this.#openIntent) throw new Error('Open cancelled.');
    const existing = this.#files.findIndex((file) => file.path === path);
    if (existing >= 0) {
      this.switchTo(existing);
      return this.#files[existing]!;
    }
    const emptyDocument = this.#files.length ? null : this.model.documents.getActiveDocumentId();
    const loaded = await CanvasFile.open(path, '', this.options);
    try {
      if (this.#disposed || intent !== this.#openIntent) throw new Error('Open cancelled.');
      const document = loaded.model.documents.getDocumentDraft()!;
      if (this.model.documents.getDocument(document.id)) document.id = randomUUID();
      // Publish the catalog before Session observers see the new active document.
      loaded.file.address = { documentId: document.id, pageId: document.activePageId };
      this.#files.push(loaded.file);
      try {
        this.model.editor.transact(() => {
          this.model.documents.activateDocument(
            document.id,
            { ...document, grid: [] },
            { replace: true }
          );
          this.model.markSaved();
          this.model.setTool('pan');
        });
      } catch (error) {
        this.#files.pop();
        throw error;
      }
      if (emptyDocument) this.model.forgetDocument(emptyDocument);
      return loaded.file;
    } finally {
      loaded.model.dispose();
    }
  }
  needsSave(file = this.active) {
    return file.baselineSource === null || this.model.isDirtyAt(file.address!);
  }
  async saveAll() {
    for (const file of this.#files) if (this.needsSave(file)) await this.saveFile(file);
  }
  saveFile(file = this.active) {
    return this.#fileOperation(file, () => file.save(this.model, this.#serializer), true);
  }
  captureFile(file = this.active) {
    return this.#serializer.capture(this.model, file.address!, file.title);
  }
  #fileOperation(file: CanvasFile, run: () => Promise<void>, trackSaveFailure = false) {
    const pending = (this.#saves.get(file) ?? Promise.resolve())
      .catch(() => {})
      .then(() => {
        if (!this.#files.includes(file)) throw new Error('Document is no longer open.');
        return run();
      })
      .then(
        () => {
          this.#errors.delete(file);
          if (!this.#disposed) this.model.editor.transact(() => {});
        },
        (error) => {
          if (trackSaveFailure)
            this.#errors.set(file, error instanceof Error ? error.message : String(error));
          if (!this.#disposed) this.model.editor.transact(() => {});
          throw error;
        }
      );
    this.#saves.set(file, pending);
    void pending
      .finally(() => {
        if (this.#saves.get(file) === pending) this.#saves.delete(file);
      })
      .catch(() => {});
    return pending;
  }
  async inspectSources(onlyChanged = false) {
    await Promise.all(
      this.#files.map((file) =>
        onlyChanged ? file.source.inspectIfChanged() : file.source.inspect()
      )
    );
  }
  sourceState(file = this.active) {
    if (!file) return { state: 'current' as const, digest: null };
    const observation = file.source.observation;
    return {
      ...observation,
      state:
        observation.state === 'changed' && this.model.isDirtyAt(file.address!)
          ? ('conflict' as const)
          : observation.state,
    };
  }
  /** Explicit reload is serialized with saving, validates before mutation and retains page views. */
  reloadFile(file = this.active, preservedLocalVersion?: string) {
    const intent = this.#openIntent;
    return this.#fileOperation(file, async () => {
      if (this.#disposed || this.active !== file || intent !== this.#openIntent)
        throw new Error('Reload target changed.');
      const version = this.model.versionAt(file.address!);
      if (this.model.isDirtyAt(file.address!) && version !== preservedLocalVersion)
        throw new Error('Local edits are present. Preserve a copy before reloading.');
      const snapshot = await file.source.read();
      if (snapshot.source === null)
        throw new Error('Source file is missing. Your canvas was preserved.');
      if (
        snapshot.digest === file.baselineDigest &&
        snapshot.source === file.baselineSource &&
        !this.model.isDirtyAt(file.address!)
      )
        return;
      const { document } = parseCanvasDocument(snapshot.source, file.address!.documentId);
      const latest = await file.source.read();
      if (snapshot.digest !== latest.digest || snapshot.source !== latest.source)
        throw new Error('Source changed again. Check changes and retry.');
      if (
        this.#disposed ||
        this.active !== file ||
        intent !== this.#openIntent ||
        version !== this.model.versionAt(file.address!) ||
        (this.model.isDirtyAt(file.address!) && version !== preservedLocalVersion)
      )
        throw new Error('Reload target changed. Your edits were preserved.');
      file.writeGuard?.();
      const oldAddress = this.model.documents.getActiveAddress();
      const views = new Map(
        this.model.documents
          .getPageDescriptors(document.id)
          .map((page) => [page.id, this.model.viewAt({ documentId: document.id, pageId: page.id })])
      );
      if (document.pages.some((page) => page.id === oldAddress.pageId))
        document.activePageId = oldAddress.pageId;
      else views.set(document.activePageId, views.get(oldAddress.pageId)!);
      this.model.editor.transact(() => {
        this.model.cancelPendingPaste();
        this.model.documents.resetDocument(document.id, { ...document, grid: [] });
        this.model.switchDocument(document.id, document.activePageId);
        file.address = { documentId: document.id, pageId: document.activePageId };
        for (const page of document.pages) {
          const view = views.get(page.id);
          if (view) this.model.restoreViewAt({ documentId: document.id, pageId: page.id }, view);
        }
        file.source.accept(snapshot.source!);
        this.model.markSaved();
      });
    });
  }
  async settleSaves() {
    await Promise.allSettled([...this.#saves.values()]);
  }
  async saveCopy(input: string) {
    const original = this.active;
    const path = await resolveCanvasFilePath(input);
    if (this.#reserved.has(path)) throw new Error('This path is reserved for workspace storage.');
    if (path === original.path) throw new Error('Choose a different filename for the copy.');
    if (this.#files.some((file) => file.path === path))
      throw new Error('That filename is already open in this workspace.');
    const { readOptional } = await import('./document.ts');
    if ((await readOptional(path)) !== null)
      throw new Error('Choose a new filename; the target already exists.');
    const copy = new CanvasFile(path, original.title, null);
    copy.address = original.address;
    const saving = copy.save(this.model, this.#serializer);
    this.#saves.set(copy, saving);
    try {
      await saving;
    } finally {
      this.#saves.delete(copy);
    }
    const index = this.#files.indexOf(original);
    if (index >= 0) this.#files[index] = copy;
    this.#errors.delete(original);
    this.model.editor.transact(() => {});
  }
  /** Installs a validated recovery snapshot without changing the original disk file. */
  addRecovered(
    file: CanvasFile,
    source: string,
    views: readonly { pageId: string; state: unknown }[],
    dirty: boolean
  ) {
    const { document } = parseCanvasDocument(source);
    if (this.model.documents.getDocument(document.id)) document.id = randomUUID();
    file.address = { documentId: document.id, pageId: document.activePageId };
    this.#files.push(file);
    this.model.editor.transact(() => {
      this.model.documents.activateDocument(
        document.id,
        { ...document, grid: [] },
        { replace: true }
      );
      if (!dirty) this.model.markSaved();
      for (const view of views)
        this.model.restoreViewAt({ documentId: document.id, pageId: view.pageId }, view.state);
    });
  }
  close(index: number, discard = false) {
    const file = this.#files[index];
    if (!file || (!discard && this.model.isDirtyAt(file.address!))) return false;
    const last = this.#files.length === 1;
    if (!last && file === this.active) this.switchTo(index === 0 ? 1 : index - 1);
    this.#files.splice(index, 1);
    this.#errors.delete(file);
    if (last)
      this.model.editor.transact(() => {
        this.model.documents.activateDocument(randomUUID(), { grid: [] });
        this.model.markSaved();
        this.model.setTool('pan');
      });
    this.model.forgetDocument(file.address!.documentId);
    return true;
  }
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#openIntent++;
    this.#serializer.dispose();
    this.model.dispose();
  }
}
