import { resolve } from 'node:path';
import type { FreeformEditorSessionOptions } from '@chardesk/editor-core/runtime';
import type { parseOptions } from './options.ts';
import type { AppPaths } from './appPaths.ts';
import { LocalSessions } from './sessions.ts';
import { TerminalWorkspace } from './workspace.ts';
import { WorkspacePersistence } from './persistence.ts';
import { CanvasFile, readOptional, resolveCanvasFilePath } from './document.ts';
import { createWelcomeSource } from './welcome.ts';

/** Interactive composition only; explicit files take precedence over restored navigation. */
export async function openLocalWorkspace(
  options: ReturnType<typeof parseOptions>,
  paths: AppPaths,
  editorOptions: FreeformEditorSessionOptions = {},
  reservedPaths: string[] = [],
  cwd = process.cwd()
) {
  const sessions = await LocalSessions.open(paths, editorOptions);
  let persistence: WorkspacePersistence | undefined, workspace: TerminalWorkspace | undefined;
  try {
    reservedPaths = await Promise.all(reservedPaths.map((path) => resolveCanvasFilePath(path)));
    if (
      reservedPaths.some(
        (path) => path === sessions.paths.catalog || path.startsWith(`${sessions.paths.catalog}-`)
      )
    )
      throw new Error('Settings and session catalog storage must use separate filenames.');
    const warnings = await sessions.repairPending();
    const legacyCanvas = resolve(cwd, 'terminal-canvas.chardesk');
    const first = options.files[0]
      ? await resolveCanvasFilePath(resolve(cwd, options.files[0]))
      : legacyCanvas;
    const checkpointPath = options.workspacePath
      ? resolve(cwd, options.workspacePath)
      : sessions.paths.workspace;
    const checkpoint = await resolveCanvasFilePath(checkpointPath);
    if (reservedPaths.includes(checkpoint) || reservedPaths.includes(`${checkpoint}.lock`))
      throw new Error('Settings and workspace storage must use separate filenames.');
    persistence = await WorkspacePersistence.open(
      checkpoint,
      options.workspacePath ? undefined : `${first}.workspace.json`,
      {
        identify: (path) => sessions.catalog.findPath(path)?.id,
        shouldRestore: (path, id) =>
          !sessions.catalog.findPath(path)?.removing &&
          (id ? !sessions.catalog.wasRemoved(id) : !sessions.catalog.wasPathRemoved(path)),
        recover: async (source, title) => {
          const record = await sessions.createManaged(title, source);
          return new CanvasFile(record.path, record.name, await readOptional(record.path));
        },
      }
    );
    const restored = await persistence.restore(editorOptions);
    workspace = restored ?? undefined;
    if (!workspace) {
      if (persistence.hasCheckpoint) workspace = TerminalWorkspace.empty(editorOptions);
      else if (options.files.length)
        workspace = await TerminalWorkspace.open(first, '', editorOptions);
      else if ((await readOptional(legacyCanvas)) !== null)
        workspace = await TerminalWorkspace.open(legacyCanvas, '', editorOptions);
      else {
        const records = sessions.list();
        if (!records.length) {
          const record = options.blank
            ? await sessions.createManaged()
            : await sessions.createManaged('Welcome', createWelcomeSource());
          workspace = await TerminalWorkspace.open(record.path, '', editorOptions);
        } else {
          const recent = records.find((record) => record.status === 'ready' && !record.removing);
          if (recent) {
            try {
              if ((await readOptional(recent.path)) === null)
                throw new Error('Canvas file is missing. Its session entry was preserved.');
              workspace = await TerminalWorkspace.open(recent.path, '', editorOptions);
            } catch (error) {
              warnings.push(error instanceof Error ? error.message : String(error));
            }
          }
          workspace ??= TerminalWorkspace.empty(editorOptions);
        }
      }
    }
    workspace.reservePaths([
      persistence.path,
      `${persistence.path}.lock`,
      sessions.paths.catalog,
      ...reservedPaths,
    ]);
    await sessions.attach(workspace);
    for (const input of options.files) await sessions.openPath(resolve(cwd, input));
    if (workspace.files.length) {
      const current = sessions.forFile(workspace.active);
      if (current) sessions.catalog.touch(current.id);
    }
    return { workspace, sessions, persistence, restored: Boolean(restored), warnings };
  } catch (error) {
    await persistence?.abandon();
    await sessions.dispose();
    workspace?.dispose();
    throw error;
  }
}
