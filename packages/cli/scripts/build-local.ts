import { readFile, cp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareSnapshotFonts } from '../../terminal/scripts/snapshotFonts.ts';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const directory = resolve(root, 'packages/cli');
const config = JSON.parse(await readFile(resolve(root, 'packages/cli/tsconfig.json'), 'utf8'));
const result = await Bun.build({
  entrypoints: [
    resolve(directory, 'src/cli.ts'),
    resolve(directory, 'src/raster-worker.ts'),
    resolve(root, 'packages/chargraph/src/layout/elk-worker.ts'),
    resolve(root, 'packages/local-runtime/src/document-worker.ts'),
  ],
  target: 'node',
  splitting: true,
  naming: '[name].[ext]',
  outdir: resolve(directory, 'dist'),
  external: [
    'bun:sqlite',
    'quickjs-emscripten',
    'ajv',
    'jsonc-parser',
    'd3-scale',
    'elkjs',
    'marked',
    'marked-alert',
    'open',
    'saxes',
    'shiki',
    'temml',
    'yaml',
    '@opentui/core',
    '@opentui/core/*',
    '@napi-rs/canvas',
    '@napi-rs/clipboard',
    '@teddyzhu/clipboard',
  ],
  plugins: [
    {
      name: 'chardesk-workspace-sources',
      setup(build) {
        // Workspace sources have their own tsconfigs; resolve product aliases
        // explicitly so no web workspace install or generated dist is required.
        build.onResolve({ filter: /^(@chardesk\/|@\/)/ }, ({ path }) => {
          if (path.startsWith('@chardesk/legacy-blackboard/'))
            return {
              path: resolve(root, 'packages/legacy-blackboard/src', path.split('/').at(-1) + '.ts'),
            };
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
if (!result.success) throw new AggregateError(result.logs, 'CLI bundle failed');
await cp(
  resolve(root, 'apps/canvas/public/data/characters'),
  resolve(directory, 'dist/characters'),
  { recursive: true }
);
await prepareSnapshotFonts(root, resolve(directory, 'dist/snapshot-fonts'));
