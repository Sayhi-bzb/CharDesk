import { homedir } from 'node:os';
import { posix, win32 } from 'node:path';
import { mkdir, realpath } from 'node:fs/promises';

export type AppPaths = ReturnType<typeof resolveAppPaths>;
/** Pure path policy: read-only commands never create a user directory. */
export function resolveAppPaths({
  environment = process.env,
  platform = process.platform,
  home = homedir(),
}: { environment?: NodeJS.ProcessEnv; platform?: NodeJS.Platform; home?: string } = {}) {
  const path = platform === 'win32' ? win32 : posix;
  const base = (value: string | undefined, fallback: string) =>
    value && path.isAbsolute(value) ? value : fallback;
  const root = environment.CHARDESK_HOME;
  if (root && !path.isAbsolute(root)) throw new Error('CHARDESK_HOME must be an absolute path.');
  let config: string, data: string, state: string, cache: string;
  if (root) {
    config = path.join(root, 'config');
    data = path.join(root, 'data');
    state = path.join(root, 'state');
    cache = path.join(root, 'cache');
  } else if (platform === 'darwin') {
    config = path.join(home, 'Library', 'Preferences', 'chardesk');
    data = path.join(home, 'Library', 'Application Support', 'chardesk');
    state = path.join(data, 'state');
    cache = path.join(home, 'Library', 'Caches', 'chardesk');
  } else if (platform === 'win32') {
    const local = base(environment.LOCALAPPDATA, path.join(home, 'AppData', 'Local'));
    config = path.join(
      base(environment.APPDATA, path.join(home, 'AppData', 'Roaming')),
      'chardesk',
      'Config'
    );
    data = path.join(local, 'chardesk', 'Data');
    state = path.join(local, 'chardesk', 'State');
    cache = path.join(local, 'chardesk', 'Cache');
  } else {
    config = path.join(base(environment.XDG_CONFIG_HOME, path.join(home, '.config')), 'chardesk');
    data = path.join(
      base(environment.XDG_DATA_HOME, path.join(home, '.local', 'share')),
      'chardesk'
    );
    state = path.join(
      base(environment.XDG_STATE_HOME, path.join(home, '.local', 'state')),
      'chardesk'
    );
    cache = path.join(base(environment.XDG_CACHE_HOME, path.join(home, '.cache')), 'chardesk');
  }
  return {
    config,
    data,
    state,
    cache,
    overridden: Boolean(root),
    settings: path.join(config, 'terminal.json'),
    catalog: path.join(data, 'catalog.sqlite'),
    canvases: path.join(data, 'canvases'),
    workspace: path.join(state, 'workspaces', 'default.json'),
  };
}

/** Only interactive startup calls this; canonical roots also protect internal files. */
export async function initializeAppPaths(paths: AppPaths): Promise<AppPaths> {
  const directories = [paths.config, paths.data, paths.state, paths.cache];
  await Promise.all(directories.map((path) => mkdir(path, { recursive: true, mode: 0o700 })));
  const [config, data, state, cache] = await Promise.all(directories.map((path) => realpath(path)));
  const normalized = { ...paths, config: config!, data: data!, state: state!, cache: cache! };
  const path = process.platform === 'win32' ? win32 : posix;
  normalized.settings = path.join(config!, 'terminal.json');
  normalized.catalog = path.join(data!, 'catalog.sqlite');
  normalized.canvases = path.join(data!, 'canvases');
  normalized.workspace = path.join(state!, 'workspaces', 'default.json');
  await mkdir(normalized.canvases, { recursive: true, mode: 0o700 });
  await mkdir(path.dirname(normalized.workspace), { recursive: true, mode: 0o700 });
  normalized.canvases = await realpath(normalized.canvases);
  normalized.workspace = path.join(
    await realpath(path.dirname(normalized.workspace)),
    'default.json'
  );
  return normalized;
}
