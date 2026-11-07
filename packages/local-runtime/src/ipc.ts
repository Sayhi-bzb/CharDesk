import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { atomicWrite } from './storage.ts';
import type { AppPaths } from './appPaths.ts';
import type { TerminalWorkspace } from './workspace.ts';
import type { LocalSessions } from './sessions.ts';
import { localCapabilities } from './capabilities.ts';
import type { CanvasReadAppearance } from '../../canvas-capabilities/src/read.ts';

type Endpoint = {
  version: 1;
  instance: string;
  pid: number;
  url: string;
  token: string;
  paths: string[];
  sessions: string[];
};
export async function startLocalEndpoint(
  paths: AppPaths,
  workspace: TerminalWorkspace,
  sessions: LocalSessions,
  readAppearance?: () => CanvasReadAppearance | undefined
) {
  const directory = join(paths.state, 'runtimes');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const instance = randomUUID(),
    token = randomBytes(32).toString('hex'),
    path = join(directory, `${instance}.json`);
  const capabilities = localCapabilities(workspace, sessions, true, readAppearance);
  let closing = false;
  let tail = Promise.resolve();
  let pending = 0;
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    maxRequestBodySize: 1024 * 1024,
    async fetch(request) {
      if (closing) return new Response('Closing', { status: 503 });
      if (
        request.headers.has('origin') ||
        request.headers.get('authorization') !== `Bearer ${token}` ||
        request.headers.get('x-chardesk-instance') !== instance
      )
        return new Response('Unauthorized', { status: 403 });
      if (request.method !== 'POST' || new URL(request.url).pathname !== '/call')
        return new Response('Not found', { status: 404 });
      if (pending >= 128)
        return Response.json(
          { ok: false, code: 'runtime_busy', message: 'Local runtime capacity reached.' },
          { status: 429 }
        );
      pending++;
      let resolve!: () => void;
      const previous = tail;
      tail = new Promise<void>((done) => (resolve = done));
      try {
        await previous;
        request.signal.throwIfAborted();
        const body = (await request.json()) as {
          name: string;
          input: Record<string, unknown>;
          file?: string;
          session?: string;
        };
        const file = body.file
          ? workspace.files.find((file) => file.path === body.file)
          : body.session
            ? workspace.files.find((file) => sessions.forFile(file)?.id === body.session)
            : undefined;
        if ((body.file || body.session) && !file)
          return Response.json({ ok: false, code: 'not_owner' }, { status: 409 });
        const input = { ...body.input, ...(file ? { canvasId: sessions.forFile(file)?.id } : {}) };
        return Response.json(await capabilities.execute(body.name, input));
      } catch (error) {
        return Response.json(
          { ok: false, code: 'invalid_request', message: String(error) },
          { status: 400 }
        );
      } finally {
        pending--;
        resolve();
      }
    },
  });
  const snapshot = (): Endpoint => ({
    version: 1,
    instance,
    pid: process.pid,
    url: `http://127.0.0.1:${server.port}`,
    token,
    paths: workspace.files.map((file) => file.path),
    sessions: workspace.files.flatMap((file) => {
      const record = sessions.forFile(file);
      return record ? [record.id] : [];
    }),
  });
  let writes = Promise.resolve();
  let published = '';
  const publish = () => {
    const value = JSON.stringify(snapshot());
    if (value === published) return;
    published = value;
    writes = writes.then(() => atomicWrite(path, value));
    void writes.catch(() => {});
  };
  publish();
  await writes;
  const detach = workspace.model.subscribe(publish);
  let stopped = false;
  const close = async () => {
    if (stopped) return;
    stopped = true;
    closing = true;
    detach();
    await tail;
    server.stop(true);
    await writes.catch(() => {});
    await unlink(path).catch(() => {});
  };
  return Object.assign(close, {
    async pause() {
      closing = true;
      await tail;
    },
    resume() {
      if (!stopped) closing = false;
    },
  });
}
export type LocalEndpoint = Awaited<ReturnType<typeof startLocalEndpoint>>;
export async function callRunningSession(
  paths: AppPaths,
  target: { file?: string; session?: string },
  name: string,
  input: Record<string, unknown>
) {
  const directory = join(paths.state, 'runtimes');
  const names = await readdir(directory).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  for (const nameOfFile of names.filter((name) => name.endsWith('.json'))) {
    let entry: Endpoint;
    try {
      entry = JSON.parse(await readFile(join(directory, nameOfFile), 'utf8'));
    } catch {
      continue;
    }
    if (
      entry.version !== 1 ||
      !(target.file
        ? entry.paths.includes(target.file)
        : target.session
          ? entry.sessions.includes(target.session)
          : false)
    )
      continue;
    try {
      process.kill(entry.pid, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') continue;
      throw error;
    }
    const url = new URL(entry.url);
    if (url.hostname !== '127.0.0.1' || url.protocol !== 'http:')
      throw new Error('Invalid local endpoint.');
    try {
      const response = await fetch(new URL('/call', url), {
        method: 'POST',
        redirect: 'error',
        headers: { authorization: `Bearer ${entry.token}`, 'x-chardesk-instance': entry.instance },
        body: JSON.stringify({ name, input, ...target }),
        signal: AbortSignal.timeout(30000),
      });
      return { found: true as const, result: await response.json() };
    } catch {
      return {
        found: true as const,
        result: {
          ok: false,
          code: 'execution_unknown',
          message: 'Owner connection lost. Inspect before retrying; no write was replayed.',
        },
      };
    }
  }
  return { found: false as const };
}
