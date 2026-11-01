import { randomUUID } from 'node:crypto';
import { mkdir, open, unlink } from 'node:fs/promises';
import { dirname, basename, join, isAbsolute, resolve } from 'node:path';
import { parseCanvasDocument, serializeCanvasDocument } from '@chardesk/editor-core/documentText';
import { readEditorView, type EditorView } from '@chardesk/editor-core/viewState';
import type { FreeformEditorSessionOptions } from '@chardesk/editor-core/runtime';
import { CanvasFile, readOptional, resolveCanvasFilePath } from './document.ts';
import { TerminalWorkspace } from './workspace.ts';
import { atomicWrite, sourceDigest } from './storage.ts';

type SavedView = { pageId: string; state: EditorView };
type SavedFile = {
  path: string;
  title: string;
  source: string;
  baselineDigest: string | null;
  dirty: boolean;
  views: SavedView[];
};
type Checkpoint = { version: 1; activePath: string | null; files: SavedFile[] };
export type PersistenceStatus = { phase: 'saving' | 'saved' | 'error'; message?: string };
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
function invalid(): never {
  throw new Error('Invalid workspace checkpoint; the original checkpoint was preserved.');
}

function decode(source: string): Checkpoint {
  let raw: unknown;
  try {
    raw = JSON.parse(source);
  } catch {
    return invalid();
  }
  if (
    !object(raw) ||
    raw.version !== 1 ||
    !Array.isArray(raw.files) ||
    !(raw.activePath === null || typeof raw.activePath === 'string')
  )
    invalid();
  const paths = new Set<string>();
  const files: SavedFile[] = raw.files.map((file: unknown) => {
    if (
      !object(file) ||
      typeof file.path !== 'string' ||
      !isAbsolute(file.path) ||
      paths.has(file.path) ||
      typeof file.title !== 'string' ||
      typeof file.source !== 'string' ||
      typeof file.dirty !== 'boolean' ||
      !(
        file.baselineDigest === null ||
        (typeof file.baselineDigest === 'string' && /^[a-f0-9]{64}$/.test(file.baselineDigest))
      ) ||
      !Array.isArray(file.views)
    )
      invalid();
    paths.add(file.path);
    const { document } = parseCanvasDocument(file.source);
    const pages = new Set(document.pages.map((page) => page.id));
    const seen = new Set<string>();
    const views = file.views.map((view: unknown) => {
      if (
        !object(view) ||
        typeof view.pageId !== 'string' ||
        !pages.has(view.pageId) ||
        seen.has(view.pageId)
      )
        invalid();
      seen.add(view.pageId);
      return { pageId: view.pageId, state: readEditorView(view.state) };
    });
    return {
      path: file.path,
      title: file.title,
      source: file.source,
      baselineDigest: file.baselineDigest,
      dirty: file.dirty,
      views,
    };
  });
  if (files.length ? !paths.has(String(raw.activePath)) : raw.activePath !== null) invalid();
  return { version: 1, activePath: raw.activePath, files };
}

export class WorkspacePersistence {
  readonly #owner = JSON.stringify({ pid: process.pid, token: randomUUID() });
  #checkpoint: Checkpoint | null = null;
  #workspace: TerminalWorkspace | null = null;
  #detach = () => {};
  #timer: ReturnType<typeof setTimeout> | null = null;
  #saveTimer: ReturnType<typeof setTimeout> | null = null;
  #queue: Promise<void> = Promise.resolve();
  #closed: Promise<void> | null = null;
  #active = false;
  #options: Parameters<WorkspacePersistence['start']>[1] = {};
  #saving = false;
  readonly #failed = new Map<CanvasFile, string>();
  readonly #sources = new Map<CanvasFile, { version: string; source: string }>();
  recovered = 0;
  readonly conflicts: string[] = [];
  private constructor(readonly path: string) {}

  get hasCheckpoint() {
    return this.#checkpoint !== null;
  }

  static async open(input: string, legacyPath?: string) {
    await mkdir(dirname(resolve(input)), { recursive: true });
    const persistence = new WorkspacePersistence(await resolveCanvasFilePath(input));
    const lock = `${persistence.path}.lock`;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const handle = await open(lock, 'wx', 0o600);
        try {
          await handle.writeFile(persistence.#owner);
          await handle.sync();
        } catch (error) {
          // This descriptor was created exclusively by this attempt.
          await unlink(lock).catch(() => {});
          throw error;
        } finally {
          await handle.close();
        }
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        const previous = await readOptional(lock);
        let owner: unknown;
        try {
          owner = JSON.parse(previous ?? '');
        } catch {
          throw new Error(`Workspace lock is incomplete: ${lock}`);
        }
        if (!object(owner) || !Number.isSafeInteger(owner.pid) || Number(owner.pid) < 1)
          throw new Error('Invalid workspace lock.');
        let alive = true;
        try {
          process.kill(Number(owner.pid), 0);
        } catch (signalError) {
          if ((signalError as NodeJS.ErrnoException).code === 'ESRCH') alive = false;
          else throw signalError;
        }
        if (alive)
          throw new Error(
            'Workspace is already open. Use a different --workspace path for another instance.'
          );
        if ((await readOptional(lock)) === previous)
          await unlink(lock).catch((unlinkError: NodeJS.ErrnoException) => {
            if (unlinkError.code !== 'ENOENT') throw unlinkError;
          });
      }
    }
    try {
      if ((await readOptional(lock)) !== persistence.#owner)
        throw new Error('Workspace lock could not be acquired.');
      let source = await readOptional(persistence.path);
      if (
        source === null &&
        legacyPath &&
        resolve(legacyPath) !== persistence.path &&
        (await readOptional(legacyPath)) !== null
      ) {
        const legacy = await WorkspacePersistence.open(legacyPath);
        try {
          source = await readOptional(legacy.path);
          if (source !== null) {
            decode(source);
            await atomicWrite(persistence.path, source);
          }
        } finally {
          await legacy.abandon();
        }
      }
      persistence.#checkpoint = source === null ? null : decode(source);
      return persistence;
    } catch (error) {
      await persistence.#release();
      throw error;
    }
  }
  async #release() {
    const path = `${this.path}.lock`;
    if ((await readOptional(path)) === this.#owner) await unlink(path);
  }
  async restore(options: FreeformEditorSessionOptions): Promise<TerminalWorkspace | null> {
    let workspace: TerminalWorkspace | null = this.#workspace;
    const restored = new Map<string, CanvasFile>();
    const install = (file: CanvasFile, source: string, views: SavedView[], dirty: boolean) => {
      const pages = new Set(parseCanvasDocument(source).document.pages.map((page) => page.id));
      const availableViews = views.filter((view) => pages.has(view.pageId));
      if (workspace) workspace.addRecovered(file, source, availableViews, dirty);
      else workspace = TerminalWorkspace.fromRecovery(file, source, availableViews, dirty, options);
    };
    try {
      for (const saved of this.#checkpoint?.files ?? []) {
        const current = await readOptional(saved.path),
          digest = sourceDigest(current);
        if (digest === saved.baselineDigest || digest === sourceDigest(saved.source)) {
          const file = new CanvasFile(saved.path, saved.title, current);
          const dirty = saved.dirty && digest !== sourceDigest(saved.source);
          install(file, saved.source, saved.views, dirty);
          restored.set(saved.path, file);
          if (dirty) this.recovered++;
          continue;
        }
        if (current !== null) {
          let native = false;
          try {
            parseCanvasDocument(current);
            native = true;
          } catch {
            /* Keep non-native external data untouched. */
          }
          if (native) {
            const original = new CanvasFile(saved.path, saved.title, current);
            install(original, current, [], false);
            restored.set(saved.path, original);
            if (!saved.dirty) continue;
          }
        }
        const recoveredPath = join(
          dirname(saved.path),
          `${basename(saved.path, '.chardesk')}.recovered-${randomUUID()}.chardesk`
        );
        const recovered = new CanvasFile(recoveredPath, `${saved.title} (recovered)`, null);
        install(recovered, saved.source, saved.views, true);
        restored.set(saved.path, recovered);
        this.recovered++;
        this.conflicts.push(saved.path);
      }
      if (workspace && this.#checkpoint?.activePath) {
        const selected = restored.get(this.#checkpoint.activePath);
        if (selected) workspace.switchTo(workspace.files.indexOf(selected));
      }
      return workspace;
    } catch (error) {
      workspace?.dispose();
      throw error;
    }
  }
  start(
    workspace: TerminalWorkspace,
    options: {
      autosaveMs?: number;
      checkpointMs?: number;
      onStatus?: (status: PersistenceStatus) => void;
    } = {}
  ) {
    if (this.#active || this.#closed) throw new Error('Workspace persistence has already started.');
    this.#workspace = workspace;
    this.#active = true;
    this.#options = options;
    const report = (status: PersistenceStatus) => {
      if (this.#active) options.onStatus?.(status);
    };
    const changed = () => {
      if (!this.#active) return;
      // Throttle checkpoints so continuous typing cannot postpone recovery indefinitely.
      if (!this.#timer)
        this.#timer = setTimeout(() => {
          this.#timer = null;
          void this.flush().catch((error) =>
            report({ phase: 'error', message: String(error.message ?? error) })
          );
        }, options.checkpointMs ?? 150);
      if (this.#saveTimer) clearTimeout(this.#saveTimer);
      if ((options.autosaveMs ?? 800) >= 0)
        this.#saveTimer = setTimeout(() => {
          this.#saveTimer = null;
          if (this.#saving) return;
          this.#saving = true;
          void (async () => {
            for (const file of workspace.files) {
              if (!this.#active) break;
              const version = workspace.model.versionAt(file.address!);
              if (!workspace.needsSave(file) || this.#failed.get(file) === version) continue;
              report({ phase: 'saving' });
              try {
                await workspace.saveFile(file);
                this.#failed.delete(file);
                report({ phase: 'saved' });
              } catch (error) {
                this.#failed.set(file, version);
                report({
                  phase: 'error',
                  message: `${file.path}: ${error instanceof Error ? error.message : String(error)}`,
                });
              }
            }
          })().finally(() => {
            this.#saving = false;
            if (
              this.#active &&
              workspace.files.some(
                (file) =>
                  workspace.needsSave(file) &&
                  this.#failed.get(file) !== workspace.model.versionAt(file.address!)
              )
            )
              changed();
          });
        }, options.autosaveMs ?? 800);
    };
    this.#detach = workspace.model.subscribe(changed);
    changed();
  }
  #capture(): Checkpoint {
    const workspace = this.#workspace!;
    const files: SavedFile[] = [];
    for (const file of this.#sources.keys())
      if (!workspace.files.includes(file)) this.#sources.delete(file);
    for (const file of this.#failed.keys())
      if (!workspace.files.includes(file)) this.#failed.delete(file);
    for (const file of workspace.files) {
      const dirty = workspace.model.isDirtyAt(file.address!);
      const version = JSON.stringify([
        workspace.model.versionAt(file.address!),
        workspace.model.documents.getDocumentAddress(file.address!.documentId)?.pageId,
      ]);
      let cached = this.#sources.get(file);
      if (cached?.version !== version) {
        cached = {
          version,
          source: serializeCanvasDocument(
            workspace.model.documents.getDocumentDraft(file.address!.documentId)!,
            file.title
          ),
        };
        this.#sources.set(file, cached);
      }
      const source = cached!.source;
      const pages = workspace.model.documents.getPageDescriptors(file.address!.documentId);
      files.push({
        path: file.path,
        title: file.title,
        source,
        baselineDigest: file.baselineDigest,
        dirty,
        views: pages.map((page) => ({
          pageId: page.id,
          state: workspace.model.viewAt({ documentId: file.address!.documentId, pageId: page.id }),
        })),
      });
    }
    return {
      version: 1,
      activePath: files.some((file) => file.path === workspace.active.path)
        ? workspace.active.path
        : (files[0]?.path ?? null),
      files,
    };
  }
  flush() {
    if (!this.#workspace) return Promise.resolve();
    const checkpoint = this.#capture();
    const task = this.#queue
      .catch(() => {})
      .then(() =>
        atomicWrite(this.path, JSON.stringify(checkpoint), async () => {
          if ((await readOptional(`${this.path}.lock`)) !== this.#owner)
            throw new Error('Workspace lock ownership changed.');
        })
      );
    this.#queue = task;
    return task;
  }
  close() {
    if (this.#closed) return this.#closed;
    this.#active = false;
    this.#detach();
    if (this.#timer) clearTimeout(this.#timer);
    if (this.#saveTimer) clearTimeout(this.#saveTimer);
    this.#timer = null;
    this.#saveTimer = null;
    this.#closed = (async () => {
      try {
        await this.#workspace?.settleSaves();
        // Save before releasing the workspace, even if the idle timer has not fired.
        // Keep recovery current when a document cannot be written.
        try {
          await this.#workspace?.saveAll();
        } finally {
          await this.flush();
        }
        await this.#release();
      } catch (error) {
        this.#closed = null;
        if (this.#workspace) this.start(this.#workspace, this.#options);
        throw error;
      }
    })();
    return this.#closed;
  }
  async abandon() {
    this.#active = false;
    this.#detach();
    if (this.#timer) clearTimeout(this.#timer);
    if (this.#saveTimer) clearTimeout(this.#saveTimer);
    this.#timer = null;
    this.#saveTimer = null;
    await this.#queue.catch(() => {});
    await this.#release();
  }
}
