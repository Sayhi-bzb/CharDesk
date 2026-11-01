import { randomUUID } from 'node:crypto';
import { join, relative, isAbsolute, sep } from 'node:path';
import { parseCanvasDocument, serializeCanvasDocument } from '@chardesk/editor-core/documentText';
import type { FreeformEditorSessionOptions } from '@chardesk/editor-core/runtime';
import { TerminalCanvas } from './model.ts';
import { CanvasFile, readOptional, resolveCanvasFilePath } from './document.ts';
import { initializeAppPaths, type AppPaths } from './appPaths.ts';
import { LocalSessionCatalog, type LocalSession } from './sessionCatalog.ts';
import type { TerminalWorkspace } from './workspace.ts';
import { atomicWrite } from './storage.ts';

/** Long-lived session identity and file ownership, separate from the open editor workspace. */
export class LocalSessions {
  #workspace: TerminalWorkspace | null = null;
  #owned = new Map<string, ReturnType<LocalSessionCatalog['claim']>>();
  #intent = 0;
  #disposed = false;
  private constructor(
    readonly paths: AppPaths,
    readonly catalog: LocalSessionCatalog,
    private editorOptions: FreeformEditorSessionOptions
  ) {}
  static async open(paths: AppPaths, editorOptions: FreeformEditorSessionOptions = {}) {
    const normalized = await initializeAppPaths(paths);
    return new LocalSessions(
      normalized,
      new LocalSessionCatalog(normalized.catalog),
      editorOptions
    );
  }
  get workspace() {
    if (!this.#workspace) throw new Error('Session workspace is not attached.');
    return this.#workspace;
  }
  #claim(path: string) {
    let owner = this.#owned.get(path);
    if (!owner) {
      owner = this.catalog.claim(path);
      this.#owned.set(path, owner);
    }
    return owner;
  }
  #release(path: string) {
    this.#owned.get(path)?.release();
    this.#owned.delete(path);
  }
  #checkIntent(intent: number) {
    if (this.#disposed || intent !== this.#intent) throw new Error('Session opening cancelled.');
  }
  #assertPath(path: string) {
    const within = (directory: string) => {
      const rest = relative(directory, path);
      return rest === '' || (rest !== '..' && !rest.startsWith(`..${sep}`) && !isAbsolute(rest));
    };
    if (
      within(this.paths.config) ||
      within(this.paths.state) ||
      within(this.paths.cache) ||
      (within(this.paths.data) && !within(this.paths.canvases))
    )
      throw new Error('This path belongs to CharDesk application storage.');
  }
  list(archived = false) {
    return this.catalog.list(archived);
  }
  forFile(file: CanvasFile) {
    return this.catalog.findPath(file.path);
  }
  cancelPending() {
    ++this.#intent;
    this.#workspace?.cancelPendingOpen();
  }
  async attach(workspace: TerminalWorkspace) {
    if (this.#workspace) throw new Error('Session workspace is already attached.');
    this.#workspace = workspace;
    for (const file of workspace.files) {
      this.#assertPath(file.path);
      file.writeGuard = this.#claim(file.path).verify;
      if (file.baselineSource === null) await workspace.saveFile(file);
      this.catalog.register(file.path, file.title);
    }
  }
  async #finishPending(record: LocalSession, seed: string) {
    const owner = this.#claim(record.path);
    const current = await readOptional(record.path);
    owner.verify();
    if (current !== null && current !== seed)
      throw new Error(
        'Incomplete session has conflicting file content; both copies were preserved.'
      );
    if (current === null)
      await atomicWrite(record.path, seed, async () => {
        owner.verify();
        if ((await readOptional(record.path)) !== null)
          throw new Error('Session file appeared during creation.');
      });
    return this.catalog.ready(record.id);
  }
  async repairPending() {
    const errors: string[] = [];
    for (const row of this.catalog.pending()) {
      if (!row.seed) {
        errors.push(`${row.name}: creation snapshot unavailable`);
        continue;
      }
      const ownedBefore = this.#owned.has(row.path);
      try {
        parseCanvasDocument(row.seed);
        await this.#finishPending({ ...row, archived: Boolean(row.archived) }, row.seed);
      } catch (error) {
        errors.push(`${row.name}: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        if (!ownedBefore) this.#release(row.path);
      }
    }
    return errors;
  }
  async createManaged(name?: string, source?: string) {
    const id = randomUUID(),
      path = join(this.paths.canvases, `${id}.chardesk`);
    this.#claim(path);
    let model: TerminalCanvas | undefined;
    try {
      const document = source ? parseCanvasDocument(source).document : undefined;
      if (document) document.id = randomUUID();
      model = new TerminalCanvas('', { ...this.editorOptions, ...(document ? { document } : {}) });
      const seed = serializeCanvasDocument(model.documents.getDocumentDraft()!, name ?? 'Canvas');
      const record = this.catalog.prepare(id, path, name, seed);
      return await this.#finishPending(record, seed);
    } catch (error) {
      this.#release(path);
      throw error;
    } finally {
      model?.dispose();
    }
  }
  async #open(record: LocalSession, intent: number) {
    if (record.status !== 'ready')
      throw new Error('Session creation is incomplete. Restart to retry recovery.');
    this.#checkIntent(intent);
    if ((await readOptional(record.path)) === null)
      throw new Error('Canvas file is missing. Its session entry was preserved.');
    this.#checkIntent(intent);
    const owner = this.#claim(record.path);
    try {
      this.#checkIntent(intent);
      const file = await this.workspace.openFile(record.path);
      file.writeGuard = owner.verify;
      if (record.archived) this.catalog.archive(record.id, false, record.revision);
      this.catalog.touch(record.id);
      return file;
    } catch (error) {
      if (!this.workspace.files.some((file) => file.path === record.path))
        this.#release(record.path);
      throw error;
    }
  }
  open(id: string) {
    const record = this.catalog.get(id);
    if (!record) return Promise.reject(new Error('Session no longer exists.'));
    return this.#open(record, ++this.#intent);
  }
  async openPath(input: string) {
    const intent = ++this.#intent;
    const path = await resolveCanvasFilePath(input);
    this.#checkIntent(intent);
    this.#assertPath(path);
    const existing = this.catalog.findPath(path);
    if (existing) return this.#open(existing, intent);
    const owner = this.#claim(path);
    try {
      const file = await this.workspace.openFile(path);
      file.writeGuard = owner.verify;
      if (file.baselineSource === null) await this.workspace.saveFile(file);
      this.catalog.register(path, file.title);
      return file;
    } catch (error) {
      if (!this.workspace.files.some((file) => file.path === path)) this.#release(path);
      throw error;
    }
  }
  async create(name?: string) {
    const intent = ++this.#intent;
    const record = await this.createManaged(name);
    try {
      return await this.#open(record, intent);
    } catch (error) {
      if (!this.workspace.files.some((file) => file.path === record.path))
        this.#release(record.path);
      throw error;
    }
  }
  rename(id: string, name: string, revision: number) {
    return this.catalog.rename(id, name, revision);
  }
  async duplicate(id: string) {
    const intent = ++this.#intent,
      record = this.catalog.get(id);
    if (!record) throw new Error('Session no longer exists.');
    const opened = this.workspace.files.find((file) => file.path === record.path);
    const source = opened
      ? serializeCanvasDocument(
          this.workspace.model.documents.getDocumentDraft(opened.address!.documentId)!,
          record.name
        )
      : await readOptional(record.path);
    if (source === null) throw new Error('Canvas file is missing.');
    this.#checkIntent(intent);
    const copy = await this.createManaged(`${record.name} copy`, source);
    try {
      return await this.#open(copy, intent);
    } catch (error) {
      if (!this.workspace.files.some((file) => file.path === copy.path)) this.#release(copy.path);
      throw error;
    }
  }
  async close(file: CanvasFile) {
    await this.workspace.settleSaves();
    if (this.workspace.needsSave(file)) await this.workspace.saveFile(file);
    if (!this.workspace.close(this.workspace.files.indexOf(file)))
      throw new Error('Canvas changed while closing. Try again.');
    this.#release(file.path);
  }
  async archive(id: string, archived: boolean, revision: number) {
    const record = this.catalog.get(id);
    if (!record || record.revision !== revision)
      throw new Error('Session changed. Refresh the list and try again.');
    const opened = this.workspace.files.find((file) => file.path === record.path);
    if (archived && opened) await this.close(opened);
    return this.catalog.archive(id, archived, revision);
  }
  async dispose() {
    this.#disposed = true;
    this.cancelPending();
    await this.#workspace?.settleSaves();
    for (const path of this.#owned.keys()) this.#release(path);
    this.catalog.close();
  }
}
