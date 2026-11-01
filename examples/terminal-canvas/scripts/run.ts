import { prepareSnapshotFonts } from './snapshotFonts.ts';
import { readFileSync, constants } from 'node:fs';
import { cp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('..', import.meta.url));
const config = JSON.parse(readFileSync(resolve(directory, 'tsconfig.json'), 'utf8')) as {
  compilerOptions: { baseUrl: string; paths: Record<string, string[]> };
};
const root = resolve(directory, config.compilerOptions.baseUrl);
const command = process.argv[2] ?? 'start';
// One source dataset; the built terminal distribution carries its local resources.
await cp(
  resolve(root, 'apps/canvas/public/data/characters'),
  resolve(directory, 'dist/characters'),
  { recursive: true, mode: constants.COPYFILE_FICLONE }
);
await prepareSnapshotFonts(root, resolve(directory, 'dist/snapshot-fonts'));
const tests = [...new Bun.Glob('src/*.test.ts').scanSync({ cwd: directory })];
const result = await Bun.build({
  entrypoints: [
    ...(command === 'test' ? tests : ['src/main.ts']).map((path) => resolve(directory, path)),
    // CharGraph creates this worker relative to the compiled entrypoint.
    resolve(root, 'packages/chargraph/src/layout/elk-worker.ts'),
  ],
  target: 'bun',
  outdir: resolve(directory, 'dist'),
  naming: '[name].[ext]',
  external: [
    '@opentui/core',
    '@opentui/core/*',
    'bun:test',
    'yjs',
    '@napi-rs/canvas',
    '@napi-rs/clipboard',
    '@teddyzhu/clipboard',
  ],
  plugins: [
    {
      name: 'chardesk-demo-sources',
      setup(build) {
        // Reused sources have their own tsconfigs; resolve the demo's aliases
        // explicitly so no web workspace install or generated dist is required.
        build.onResolve({ filter: /^(@chardesk\/|@\/)/ }, ({ path }) => {
          const candidate =
            config.compilerOptions.paths[path]?.[0] ??
            Object.entries(config.compilerOptions.paths).flatMap(([key, values]) => {
              const prefix = key.endsWith('*') ? key.slice(0, -1) : null;
              return prefix && path.startsWith(prefix)
                ? [values[0]!.replace('*', path.slice(prefix.length))]
                : [];
            })[0];
          if (!candidate) return;
          return { path: Bun.resolveSync(resolve(root, candidate), root) };
        });
      },
    },
  ],
});
if (!result.success) throw new AggregateError(result.logs, 'Demo build failed');
if (command !== 'build') {
  const executable =
    command === 'test'
      ? [
          'test',
          ...result.outputs
            .filter((output) => output.path.endsWith('.test.js'))
            .map((output) => output.path),
        ]
      : [resolve(directory, 'dist/main.js'), ...process.argv.slice(3)];
  const child = Bun.spawn([process.execPath, ...executable], {
    cwd: directory,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });
  const forward = () => child.kill('SIGTERM');
  process.on('SIGTERM', forward);
  try {
    process.exitCode = await child.exited;
  } finally {
    process.off('SIGTERM', forward);
  }
}
