import { resolveAppPaths } from './appPaths.ts';
import { resolveCanvasFilePath } from './document.ts';
import { LocalSessions } from './sessions.ts';
import { TerminalWorkspace } from './workspace.ts';
import { localCapabilities } from './capabilities.ts';
import { callRunningSession } from './ipc.ts';
export async function executeLocal(
  name: string,
  input: Record<string, unknown>,
  target: { file?: string; session?: string } = {}
) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Expected an object.');
  if (input.canvasId !== undefined && (target.file || target.session))
    throw new Error('Conflicting targets.');
  const paths = resolveAppPaths();
  if (target.file) target = { file: await resolveCanvasFilePath(target.file) };
  const refKey = name === 'canvas_code' ? 'scriptRef' : 'sourceRef';
  if (input[refKey] !== undefined) {
    const reference = input[refKey];
    if (
      !['canvas_write', 'canvas_render', 'canvas_code'].includes(name) ||
      typeof reference !== 'string' ||
      !reference
    )
      throw new Error(`${refKey} requires a local text file.`);
    const key = name === 'canvas_code' ? 'script' : name === 'canvas_write' ? 'content' : 'source';
    if (input[key] !== undefined) throw new Error(`Provide ${refKey} or inline content, not both.`);
    const file = Bun.file(reference);
    if (file.size > 1024 * 1024) throw new Error(`${refKey} exceeds 1 MiB.`);
    const content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      await file.arrayBuffer()
    );
    if (name === 'canvas_code' && content.length > 32768)
      throw new Error('scriptRef exceeds the script limit.');
    const rest = { ...input };
    delete rest[refKey];
    input = { ...rest, [key]: content };
  }
  const remote = await callRunningSession(paths, target, name, input);
  if (remote.found) return remote.result;
  const sessions = await LocalSessions.open(paths);
  const workspace = TerminalWorkspace.empty();
  try {
    await sessions.attach(workspace);
    if (target.file) await sessions.openPath(target.file);
    else if (target.session) await sessions.open(target.session);
    else if (name !== 'canvas_manage')
      return { ok: false, code: 'invalid_input', message: 'Specify --file or --session.' };
    return await localCapabilities(workspace, sessions).execute(name, input);
  } finally {
    await sessions.dispose();
    workspace.dispose();
  }
}
