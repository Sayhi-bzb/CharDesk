import { randomUUID } from 'node:crypto';
import { join, relative, isAbsolute, sep, dirname } from 'node:path';
import { realpath } from 'node:fs/promises';
import { parseCanvasDocument, serializeCanvasDocument } from '@chardesk/editor-core/documentText';
import type { FreeformEditorSessionOptions } from '@chardesk/editor-core/runtime';
import { TerminalCanvas } from './model.ts';
import { CanvasFile, readOptional, resolveCanvasFilePath } from './document.ts';
import { initializeAppPaths, type AppPaths } from './appPaths.ts';
import { LocalSessionCatalog, type LocalSession, type SessionDeletion } from './sessionCatalog.ts';
import type { TerminalWorkspace } from './workspace.ts';
import { atomicWrite } from './storage.ts';
import { sourceDigest } from './storage.ts';
import { LocalCanvasStore, type ContentRecovery } from './canvasStore.ts';
import { CanvasRecoveryRequired } from './recovery.ts';
import { CanvasAgents } from './agents.ts';
import { LocalAgentInboxStore } from './agentInboxStore.ts';
import type { OperationContext, OperationTicket } from './operations.ts';
import {
  inspectManagedFile,
  sameManagedFile,
  validateDeletionPaths,
  stageManagedDeletion,
  restoreManagedDeletion,
  finishManagedDeletion,
  type ManagedFileProof,
} from './managedDeletion.ts';

export type SessionRemovalPlan = Readonly<{
  record: LocalSession;
  file: { proof: ManagedFileProof | null } | null;
  fileUnavailable?: string;
}>;

export class LocalSessions {
  readonly agents: CanvasAgents;
  #workspace: TerminalWorkspace | null = null;
  #owned = new Map<string, ReturnType<LocalSessionCatalog['claim']>>();
  #disposed = false;
  readonly #bound = new WeakSet<CanvasFile>();
  readonly #binding = new Map<CanvasFile, Promise<void>>();
  readonly recoveryMessages: string[] = [];
  private constructor(
    readonly paths: AppPaths,
    readonly catalog: LocalSessionCatalog,
    private editorOptions: FreeformEditorSessionOptions,
    readonly content: LocalCanvasStore
  ) {
    const path = join(paths.state, 'agents.sqlite');
    this.agents = new CanvasAgents(path, () => new LocalAgentInboxStore(path));
  }
  static async open(paths: AppPaths, editorOptions: FreeformEditorSessionOptions = {}) {
    const normalized = await initializeAppPaths(paths);
    const catalog = new LocalSessionCatalog(normalized.catalog);
    try {
      return new LocalSessions(
        normalized,
        catalog,
        editorOptions,
        new LocalCanvasStore(join(normalized.state, 'canvas.sqlite'))
      );
    } catch (error) {
      catalog.close();
      throw error;
    }
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
  #checkIntent(intent: OperationTicket) {
    intent.assertCurrent();
    if (this.#disposed) throw new Error('Session opening cancelled.');
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
  cancelPending(owner?: object) {
    this.#workspace?.operations.cancel(owner);
  }
  async #recoverCopy(record: LocalSession, recovery: ContentRecovery) {
    const owner = this.#claim(record.path);
    const id = this.content.recoveryCopyId(record.id);
    let copy = this.catalog.get(id);
    if (copy?.status === 'creating') {
      const seed = this.catalog.pending().find((row) => row.id === id)?.seed;
      if (!seed) throw new Error('Canvas recovery snapshot is unavailable.');
      copy = await this.#finishPending(copy, seed);
    }
    copy ??= await this.#createManaged(
      id,
      `${record.name.slice(0, 180)} recovered edits`,
      recovery.source
    );
    const source = await readOptional(copy.path);
    if (source === null)
      throw new Error('Recovery copy is unavailable; pending edits were preserved.');
    parseCanvasDocument(source);
    owner.verify();
    this.content.clearRecovery(record.id, recovery.version);
    this.recoveryMessages.push(
      `Recovered additional local edits in "${copy.name}"; the original Canvas was preserved.`
    );
    return copy;
  }
  #bind(file: CanvasFile, record: LocalSession): Promise<void> {
    if (this.#disposed) return Promise.reject(new Error('Session workspace is closed.'));
    if (this.#bound.has(file)) return Promise.resolve();
    const existing = this.#binding.get(file);
    if (existing) return existing;
    let resolve!: () => void, reject!: (error: unknown) => void;
    const ready = new Promise<void>((done, failed) => {
      resolve = done;
      reject = failed;
    });
    file.ready = ready;
    this.#binding.set(file, ready);
    void ready.catch(() => {});
    void this.#bindContent(file, record).then(
      () => {
        this.#bound.add(file);
        this.#binding.delete(file);
        file.ready = undefined;
        resolve();
      },
      (error) => {
        this.#binding.delete(file);
        reject(error);
      }
    );
    return ready;
  }
  async #bindContent(file: CanvasFile, record: LocalSession) {
    file.writeGuard = this.#claim(file.path).verify;
    const restore = () => {
      if (file.baselineDigest)
        this.workspace.model.documents.restoreContentVersion(
          file.address!.documentId,
          this.content.versionFor(record.id, file.baselineDigest)
        );
    };
    if (!this.workspace.model.isDirtyAt(file.address!)) restore();
    else if (file.baselineDigest) this.content.versionFor(record.id, file.baselineDigest);
    const recovery = this.content.recoveryFor(record.id);
    if (recovery) {
      const dirty = this.workspace.model.isDirtyAt(file.address!);
      const differentDirtySnapshot =
        dirty &&
        recovery.version !==
          this.workspace.model.documents.getContentVersion(file.address!.documentId) &&
        (await this.workspace.captureFile(file)).source !== recovery.source;
      if (!dirty && recovery.baselineDigest === file.baselineDigest) {
        const { document } = parseCanvasDocument(recovery.source);
        const documentId = file.address!.documentId;
        const active = this.workspace.model.documents.getActiveDocumentId() === documentId;
        this.workspace.model.editor.transact(() => {
          this.workspace.model.documents.resetDocument(documentId, { ...document, grid: [] });
          file.address = { documentId, pageId: document.activePageId };
          if (active) this.workspace.model.switchDocument(documentId, document.activePageId);
          this.workspace.model.documents.restoreContentVersion(documentId, recovery.version);
          this.workspace.model.markDirtyAt(file.address);
        });
      } else if (!dirty || differentDirtySnapshot) {
        const copy = await this.#recoverCopy(record, recovery);
        file.recoveredCanvasId = copy.id;
      }
    }
    file.afterReload = () => {
      restore();
      const recovery = this.content.recoveryFor(record.id);
      if (recovery) this.content.clearRecovery(record.id, recovery.version);
    };
    file.beforeSave = (snapshot) =>
      this.content.prepareVersion(
        record.id,
        sourceDigest(snapshot.source)!,
        snapshot.contentVersion
      );
    file.afterCapture = (snapshot) =>
      this.content.retainRecovery(
        record.id,
        file.baselineDigest,
        snapshot.source,
        snapshot.contentVersion
      );
    file.afterSave = (snapshot) =>
      this.content.acceptVersion(
        record.id,
        sourceDigest(snapshot.source)!,
        snapshot.contentVersion
      );
  }
  async attach(workspace: TerminalWorkspace) {
    if (this.#workspace) throw new Error('Session workspace is already attached.');
    this.#workspace = workspace;
    for (const file of workspace.files) {
      this.#assertPath(file.path);
      await this.#bind(file, this.catalog.register(file.path, file.title));
      if (file.baselineSource === null) await workspace.saveFile(file);
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
    for (const entry of this.catalog.deletions()) {
      try {
        await this.#repairRemoval(entry.sessionId);
      } catch (error) {
        errors.push(`Removal recovery: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
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
    return this.#createManaged(randomUUID(), name, source);
  }
  async #createManaged(id: string, name?: string, source?: string) {
    const path = join(this.paths.canvases, `${id}.chardesk`);
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
  async #open(record: LocalSession, intent: OperationTicket) {
    if (record.removing)
      throw new Error('Removal recovery is pending. Use X in Sessions to retry recovery.');
    if (record.status !== 'ready')
      throw new Error('Session creation is incomplete. Restart to retry recovery.');
    this.#checkIntent(intent);
    this.#claim(record.path);
    try {
      this.#checkIntent(intent);
      if ((await readOptional(record.path)) === null) {
        const recovery = this.content.recoveryFor(record.id);
        if (recovery) {
          const copy = await this.#recoverCopy(record, recovery);
          throw new CanvasRecoveryRequired(record.id, copy.id, copy.name);
        }
        throw new Error('Canvas file is missing. Its session entry was preserved.');
      }
      this.#checkIntent(intent);
      const file = await this.workspace.prepareFile(record.path, intent);
      this.#checkIntent(intent);
      await this.#bind(file, record);
      this.#checkIntent(intent);
      return this.workspace.commitOpen(file, intent, () => {
        if (record.archived) this.catalog.archive(record.id, false, record.revision);
        this.catalog.touch(record.id);
      });
    } catch (error) {
      if (!this.workspace.files.some((file) => file.path === record.path))
        this.#release(record.path);
      throw error;
    }
  }
  open(id: string, context?: OperationContext) {
    const record = this.catalog.get(id);
    if (!record) return Promise.reject(new Error('Session no longer exists.'));
    return this.workspace.operations.run(context, (ticket) => this.#open(record, ticket));
  }
  openPath(input: string, context?: OperationContext) {
    return this.workspace.operations.run(context, (ticket) => this.#openPath(input, { ticket }));
  }
  async #openPath(input: string, context?: OperationContext) {
    const intent = this.workspace.operations.begin(context);
    const path = await resolveCanvasFilePath(input);
    this.#checkIntent(intent);
    this.#assertPath(path);
    const existing = this.catalog.findPath(path);
    if (existing) return this.#open(existing, intent);
    await realpath(dirname(path));
    this.#checkIntent(intent);
    this.#claim(path);
    try {
      const file = await this.workspace.prepareFile(path, intent);
      this.#checkIntent(intent);
      await this.#bind(file, this.catalog.register(path, file.title));
      this.#checkIntent(intent);
      if (file.baselineSource === null) await this.workspace.saveFile(file);
      return this.workspace.commitOpen(file, intent);
    } catch (error) {
      if (!this.workspace.files.some((file) => file.path === path)) this.#release(path);
      throw error;
    }
  }
  create(name?: string, context?: OperationContext) {
    return this.workspace.operations.run(context, (ticket) => this.#create(name, { ticket }));
  }
  async #create(name?: string, context?: OperationContext) {
    const intent = this.workspace.operations.begin(context);
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
  duplicate(id: string, context?: OperationContext) {
    return this.workspace.operations.run(context, (ticket) => this.#duplicate(id, { ticket }));
  }
  async #duplicate(id: string, context?: OperationContext) {
    const intent = this.workspace.operations.begin(context),
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
  close(file: CanvasFile, context?: OperationContext) {
    return this.workspace.operations.run(context, (ticket) =>
      this.#close(file, async () => ticket.assertCurrent(), true, ticket));
  }
  async #close(
    file: CanvasFile,
    beforeClose: () => Promise<void> = async () => {},
    release = true,
    ticket?: OperationTicket,
    final = true
  ) {
    let retired = false;
    if (ticket) this.workspace.guardFile(ticket, file, () => retired);
    await this.workspace.settleSaves();
    if (this.workspace.needsSave(file)) await this.workspace.saveFile(file);
    await beforeClose();
    ticket?.assertCurrent();
    const publish = () => this.workspace.close(this.workspace.files.indexOf(file));
    if (!(ticket && final ? ticket.commit(publish) : publish()))
      throw new Error('Canvas changed while closing. Try again.');
    retired = true;
    ticket?.effect(`closed:${file.path}`);
    if (release) this.#release(file.path);
  }
  #record(id: string, revision: number, allowPending = false) {
    const record = this.catalog.get(id);
    if (!record || record.revision !== revision || (!allowPending && record.removing))
      throw new Error('Session changed or removal is pending. Refresh and try again.');
    return record;
  }
  async #assertManaged(record: LocalSession) {
    if (
      record.kind !== 'managed' ||
      record.status !== 'ready' ||
      record.path !== join(this.paths.canvases, `${record.id}.chardesk`) ||
      (await realpath(dirname(record.path))) !== this.paths.canvases
    )
      throw new Error(
        'Only owned managed canvas files can be deleted. External files are preserved.'
      );
  }
  async planRemoval(id: string, revision: number): Promise<SessionRemovalPlan> {
    const record = this.#record(id, revision);
    if (record.kind !== 'managed') return { record, file: null };
    try {
      await this.#assertManaged(record);
      const opened = this.workspace.files.find((file) => file.path === record.path);
      if (opened && this.workspace.needsSave(opened)) await this.workspace.saveFile(opened);
      const proof = await inspectManagedFile(record.path);
      this.#record(id, revision);
      return { record, file: { proof } };
    } catch (error) {
      return {
        record,
        file: null,
        fileUnavailable: error instanceof Error ? error.message : String(error),
      };
    }
  }
  removeRecord(id: string, revision: number, context?: OperationContext) {
    return this.workspace.operations.run(context, (ticket) => this.#removeRecord(id, revision, { ticket }));
  }
  async #removeRecord(id: string, revision: number, context?: OperationContext) {
    const intent = this.workspace.operations.begin(context),
      record = this.#record(id, revision),
      owner = this.#claim(record.path);
    const check = async () => {
      this.#checkIntent(intent);
      this.#record(id, revision);
      owner.verify();
    };
    try {
      const opened = this.workspace.files.find((file) => file.path === record.path);
      if (opened) await this.#close(opened, check, false, intent, false);
      await check();
      this.#checkIntent(intent);
      intent.commit(() => this.catalog.removeRecord(id, revision));
    } finally {
      if (!this.workspace.files.some((file) => file.path === record.path))
        this.#release(record.path);
    }
  }
  deleteManaged(plan: SessionRemovalPlan, context?: OperationContext) {
    return this.workspace.operations.run(context, (ticket) => this.#deleteManaged(plan, { ticket }));
  }
  async #deleteManaged(plan: SessionRemovalPlan, context?: OperationContext) {
    const intent = this.workspace.operations.begin(context),
      record = this.#record(plan.record.id, plan.record.revision);
    if (!plan.file || plan.record.path !== record.path)
      throw new Error('Review a managed file deletion first.');
    await this.#assertManaged(record);
    const owner = this.#claim(record.path);
    let entry: SessionDeletion | null = null;
    const check = async () => {
      this.#checkIntent(intent);
      owner.verify();
      this.#record(record.id, record.revision);
      await this.#assertManaged(record);
      if (!sameManagedFile(await inspectManagedFile(record.path), plan.file!.proof))
        throw new Error('Canvas changed. Refresh and review removal again.');
      this.#checkIntent(intent);
      owner.verify();
    };
    try {
      const opened = this.workspace.files.find((file) => file.path === record.path);
      if (opened) await this.#close(opened, check, false, intent, false);
      await check();
      const stagedPath = join(
        this.paths.data,
        'deletions',
        `${record.id}.${randomUUID()}.chardesk`
      );
      await validateDeletionPaths(this.paths, {
        sessionId: record.id,
        path: record.path,
        stagedPath,
      });
      this.#checkIntent(intent);
      entry = this.catalog.prepareDeletion({
        sessionId: record.id,
        path: record.path,
        stagedPath,
        revision: record.revision,
        proof: plan.file.proof === null ? null : JSON.stringify(plan.file.proof),
      });
      await stageManagedDeletion(entry);
      this.#checkIntent(intent);
      owner.verify();
      entry = intent.commit(() => this.catalog.commitDeletion(record.id));
      await finishManagedDeletion(entry);
      this.catalog.clearDeletion(record.id, 'removed');
    } catch (error) {
      if (entry?.state === 'removed')
        throw new Error(
          `Canvas removed; cleanup is pending at ${entry.stagedPath}: ${error instanceof Error ? error.message : String(error)}`
        );
      if (entry?.state === 'prepared') {
        try {
          await restoreManagedDeletion(entry);
          this.catalog.clearDeletion(record.id, 'prepared');
        } catch (recovery) {
          throw new Error(
            `${error instanceof Error ? error.message : String(error)} Recovery pending: ${recovery instanceof Error ? recovery.message : String(recovery)}`
          );
        }
      }
      throw error;
    } finally {
      if (!this.workspace.files.some((file) => file.path === record.path))
        this.#release(record.path);
    }
  }
  async repairRemoval(id: string, context?: OperationContext) {
    if (this.#workspace) return this.#workspace.operations.run(context, (ticket) => this.#repairRemoval(id, ticket));
    if (context) throw new Error('Session workspace is not attached.');
    return this.#repairRemoval(id);
  }
  async #repairRemoval(id: string, ticket?: OperationTicket) {
    const entry = this.catalog.deletion(id);
    if (!entry) return;
    if (!['prepared', 'removed'].includes(entry.state))
      throw new Error('Unknown removal state; files were preserved.');
    await validateDeletionPaths(this.paths, entry);
    ticket?.assertCurrent();
    const ownedBefore = this.#owned.has(entry.path);
    if (entry.state === 'prepared') this.#claim(entry.path).verify();
    try {
      if (entry.state === 'prepared') await restoreManagedDeletion(entry);
      else await finishManagedDeletion(entry);
      ticket?.effect(`removal-repaired:${id}`);
      this.catalog.clearDeletion(id, entry.state);
      ticket?.commit(() => {});
    } finally {
      if (!ownedBefore) this.#release(entry.path);
    }
  }
  preserveLocalAndReload(file: CanvasFile, context?: OperationContext) {
    return this.workspace.operations.run(context, (ticket) => this.#preserveLocalAndReload(file, { ticket }));
  }
  async #preserveLocalAndReload(file: CanvasFile, context?: OperationContext) {
    const intent = this.workspace.operations.begin(context);
    this.workspace.guardFile(intent, file);
    if (this.workspace.active !== file) throw new Error('Source target changed.');
    const version = this.workspace.model.versionAt(file.address!);
    const source = serializeCanvasDocument(
      this.workspace.model.documents.getDocumentDraft(file.address!.documentId)!,
      file.title
    );
    const copy = await this.createManaged(`${file.title} local copy`, source);
    intent.effect(`file:${copy.path}`);
    try {
      this.#checkIntent(intent);
      if (
        this.workspace.active !== file ||
        this.workspace.model.versionAt(file.address!) !== version
      )
        throw new Error('Local edits changed again. Retry after reviewing the copy.');
      await this.workspace.reloadFile(file, version, { ticket: intent });
      return copy;
    } catch (error) {
      throw new Error(
        `Local copy "${copy.name}" was saved; reload failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  archive(id: string, archived: boolean, revision: number, context?: OperationContext) {
    return this.workspace.operations.run(context, (ticket) => this.#archive(id, archived, revision, { ticket }));
  }
  async #archive(id: string, archived: boolean, revision: number, context?: OperationContext) {
    const ticket = this.workspace.operations.begin(context);
    const record = this.catalog.get(id);
    if (!record || record.revision !== revision)
      throw new Error('Session changed. Refresh the list and try again.');
    const opened = this.workspace.files.find((file) => file.path === record.path);
    if (opened) this.workspace.guardFile(ticket, opened);
    if (archived && opened) {
      await this.workspace.settleSaves();
      if (this.workspace.needsSave(opened)) await this.workspace.saveFile(opened);
    }
    return ticket.commit(() => {
      if (opened && archived && this.workspace.needsSave(opened))
        throw new Error('Canvas changed while archiving. Try again.');
      const updated = this.catalog.archive(id, archived, revision);
      if (opened && archived) {
        this.workspace.close(this.workspace.files.indexOf(opened));
        this.#release(opened.path);
      }
      return updated;
    });
  }
  async dispose() {
    this.#disposed = true;
    this.agents.dispose();
    this.cancelPending();
    await Promise.allSettled([...this.#binding.values()]);
    await this.#workspace?.settleSaves();
    for (const path of this.#owned.keys()) this.#release(path);
    this.catalog.close();
    this.content.close();
  }
}
