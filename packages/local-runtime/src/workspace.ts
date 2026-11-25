import { randomUUID } from 'node:crypto';
import type { FreeformEditorSessionOptions } from '@chardesk/editor-core/runtime';
import { CanvasFile, resolveCanvasFilePath } from './document.ts';
import { TerminalCanvas } from './model.ts';
import { parseCanvasDocument } from '@chardesk/editor-core/documentText';
import { DocumentSerializer } from './documentSerialization.ts';
import { OperationCoordinator, type OperationContext, type OperationTicket } from './operations.ts';

export class TerminalWorkspace {
  readonly model: TerminalCanvas;
  readonly #files: CanvasFile[];
  #disposed = false;
  readonly operations = new OperationCoordinator();
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
    initial.file?.attach(this.model, this.#serializer);
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
    );
  }
  requireActive() {
    const file = this.active;
    if (!file) throw new Error('No active canvas.');
    return file;
  }
  get dirty() {
    return this.#files.some((file) => this.model.isDirtyAt(file.address!));
  }
  switchTo(index: number, context?: OperationContext) {
    const file = this.#files[index];
    if (!file || this.#disposed) return false;
    const ticket = this.operations.begin(context);
    if (!ticket.activate) return ticket.commit(() => false);
    return ticket.commit(() => this.model.switchDocument(file.address!.documentId));
  }
  cancelPendingOpen() {
    this.operations.cancel();
  }
  reservePaths(paths: readonly string[]) {
    if (this.#files.some((file) => paths.includes(file.path)))
      throw new Error('Workspace checkpoint must use a separate filename.');
    for (const path of paths) this.#reserved.add(path);
  }
  openFile(input: string, context?: OperationContext) {
    return this.operations.run(context, async (ticket) => {
      const file = await this.prepareFile(input, ticket);
      return this.commitOpen(file, ticket);
    });
  }
  async prepareFile(input: string, ticket: OperationTicket) {
    const path = await resolveCanvasFilePath(input);
    if (this.#reserved.has(path)) throw new Error('This path is reserved for workspace storage.');
    ticket.assertCurrent();
    const existing = this.#files.findIndex((file) => file.path === path);
    if (existing >= 0) return this.#files[existing]!;
    const loaded = await CanvasFile.open(path, '', this.options);
    try {
      ticket.assertCurrent();
      const document = loaded.model.documents.getDocumentDraft()!;
      if (this.model.documents.getDocument(document.id))
        document.id = randomUUID();
      loaded.file.address = { documentId: document.id, pageId: document.activePageId };
      this.#files.push(loaded.file);
      try {
        ticket.publish(() => this.model.editor.transact(() => {
          this.model.documents.registerDocument(
            document.id,
            { ...document, grid: [] },
            { replace: true }
          );
          this.model.markSavedAt(loaded.file.address!, this.model.versionAt(loaded.file.address!));
          loaded.file.attach(this.model, this.#serializer);
        }));
      } catch (error) {
        this.#files.pop();
        throw error;
      }
      ticket.effect(`registered:${loaded.file.path}`);
      return loaded.file;
    } finally {
      loaded.model.dispose();
    }
  }
  commitOpen(file: CanvasFile, ticket: OperationTicket, finish: () => void = () => {}) {
    this.guardFile(ticket, file);
    return ticket.commit(() => this.model.editor.transact(() => {
      finish();
      if (ticket.activate || !this.active) {
        const previous = this.model.documents.getActiveDocumentId();
        this.model.switchDocument(file.address!.documentId);
        if (!this.#files.some((candidate) => candidate.address!.documentId === previous))
          this.model.forgetDocument(previous);
      }
      return file;
    }));
  }
  needsSave(file = this.requireActive()) {
    return file.baselineSource === null || this.model.isDirtyAt(file.address!);
  }
  async saveAll() {
    for (const file of this.#files) if (this.needsSave(file)) await this.saveFile(file);
  }
  saveFile(file = this.requireActive()) {
    return this.#fileOperation(file, () => file.save(this.model, this.#serializer), true);
  }
  captureFile(file = this.requireActive()) {
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
  reloadFile(file = this.requireActive(), preservedLocalVersion?: string, context?: OperationContext) {
    return this.operations.run(context, (ticket) => this.#reloadFile(file, preservedLocalVersion, { ticket }));
  }
  #reloadFile(file: CanvasFile, preservedLocalVersion?: string, context?: OperationContext) {
    const ticket = this.guardFile(this.operations.begin(context), file);
    return this.#fileOperation(file, async () => {
      ticket.assertCurrent();
      if (this.#disposed || this.active !== file)
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
      ) return ticket.commit(() => {});
      const { document } = parseCanvasDocument(snapshot.source, file.address!.documentId);
      const latest = await file.source.read();
      if (snapshot.digest !== latest.digest || snapshot.source !== latest.source)
        throw new Error('Source changed again. Check changes and retry.');
      if (
        this.#disposed ||
        this.active !== file ||
        version !== this.model.versionAt(file.address!) ||
        (this.model.isDirtyAt(file.address!) && version !== preservedLocalVersion)
      )
        throw new Error('Reload target changed. Your edits were preserved.');
      file.writeGuard?.();
      ticket.assertCurrent();
      const oldAddress = this.model.documents.getActiveAddress();
      const views = new Map(
        this.model.documents
          .getPageDescriptors(document.id)
          .map((page) => [page.id, this.model.viewAt({ documentId: document.id, pageId: page.id })])
      );
      if (document.pages.some((page) => page.id === oldAddress.pageId))
        document.activePageId = oldAddress.pageId;
      else views.set(document.activePageId, views.get(oldAddress.pageId)!);
      ticket.commit(() => this.model.editor.transact(() => {
        this.model.cancelPendingPaste();
        this.model.documents.resetDocument(document.id, { ...document, grid: [] });
        this.model.switchDocument(document.id, document.activePageId);
        file.address = { documentId: document.id, pageId: document.activePageId };
        for (const page of document.pages) {
          const view = views.get(page.id);
          if (view) this.model.restoreViewAt({ documentId: document.id, pageId: page.id }, view);
        }
        file.source.accept(snapshot.source!);
        file.afterReload?.();
        this.model.markSaved();
      }));
    });
  }
  async settleSaves() {
    await Promise.allSettled([...this.#saves.values()]);
  }
  guardFile(ticket: OperationTicket, file: CanvasFile, retired: () => boolean = () => false) {
    const address = file.address;
    const document = address && this.model.documents.getCollaborationDocument(address.documentId);
    return ticket.guard(() => !this.#disposed && (retired() || (this.#files.includes(file) &&
      file.address === address && !!address &&
      this.model.documents.getCollaborationDocument(address.documentId) === document)));
  }
  closeFile(file: CanvasFile, context?: OperationContext) {
    return this.operations.run(context, (ticket) => this.#closeFile(file, { ticket }));
  }
  async #closeFile(file: CanvasFile, context?: OperationContext) {
    const ticket = this.guardFile(this.operations.begin(context), file);
    await this.settleSaves();
    if (this.needsSave(file)) await this.saveFile(file);
    return ticket.commit(() => {
      if (!this.close(this.#files.indexOf(file)))
        throw new Error('Canvas changed while closing. Try again.');
      ticket.effect(`closed:${file.path}`);
    });
  }
  saveCopy(input: string, context?: OperationContext) {
    return this.operations.run(context, (ticket) => this.#saveCopy(input, { ticket }));
  }
  async #saveCopy(input: string, context?: OperationContext) {
    const ticket = this.operations.begin(context);
    const original = this.requireActive();
    this.guardFile(ticket, original);
    const assertCurrent = () => {
      ticket.assertCurrent();
      if (this.#disposed || !this.#files.includes(original))
        throw new Error('Copy cancelled.');
      original.writeGuard?.();
    };
    const path = await resolveCanvasFilePath(input);
    assertCurrent();
    if (this.#reserved.has(path)) throw new Error('This path is reserved for workspace storage.');
    if (path === original.path) throw new Error('Choose a different filename for the copy.');
    if (this.#files.some((file) => file.path === path))
      throw new Error('That filename is already open in this workspace.');
    const { readOptional } = await import('./document.ts');
    if ((await readOptional(path)) !== null)
      throw new Error('Choose a new filename; the target already exists.');
    assertCurrent();
    const copy = new CanvasFile(path, original.title, null);
    copy.address = original.address;
    copy.writeGuard = assertCurrent;
    const saving = copy.save(this.model, this.#serializer, { markSaved: false });
    this.#saves.set(copy, saving);
    try {
      await saving;
    } finally {
      this.#saves.delete(copy);
    }
    ticket.effect(`file:${copy.path}`);
    assertCurrent();
    copy.writeGuard = undefined;
    const index = this.#files.indexOf(original);
    ticket.commit(() => this.model.editor.transact(() => {
      this.#files[index] = copy;
      this.#errors.delete(original);
      copy.attach(this.model, this.#serializer);
    }));
  }
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
      file.attach(this.model, this.#serializer);
      for (const view of views)
        this.model.restoreViewAt({ documentId: document.id, pageId: view.pageId }, view.state);
    });
  }
  close(index: number, discard = false) {
    const file = this.#files[index];
    if (!file || (!discard && this.model.isDirtyAt(file.address!))) return false;
    const last = this.#files.length === 1;
    if (!last && file === this.active)
      this.model.switchDocument(this.#files[index === 0 ? 1 : index - 1]!.address!.documentId);
    this.#files.splice(index, 1);
    file.disposePersistence();
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
    this.operations.dispose();
    this.#serializer.dispose();
    this.#files.forEach((file) => file.disposePersistence());
    this.model.dispose();
  }
}
