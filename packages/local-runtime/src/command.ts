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
  if (input.sourceRef !== undefined) {
    if (!['canvas_write', 'canvas_render'].includes(name) || typeof input.sourceRef !== 'string')
      throw new Error('sourceRef requires write or render.');
    const key = name === 'canvas_write' ? 'content' : 'source';
    if (input[key] !== undefined) throw new Error('Provide sourceRef or inline content, not both.');
    const file = Bun.file(input.sourceRef);
    if (file.size > 1024 * 1024) throw new Error('sourceRef exceeds 1 MiB.');
    const rest = { ...input };
    delete rest.sourceRef;
    input = { ...rest, [key]: await file.text() };
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
