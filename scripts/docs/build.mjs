import { spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cwd = path.join(root, 'apps/docs');
const run = (command, args, target) => {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', env: { ...process.env, DOCS_BUILD_TARGET: target } });
  if (result.status !== 0) process.exit(result.status ?? 1);
};
for (const target of ['engineering', 'product']) {
  run(process.execPath, [path.join(root, 'scripts/docs/build-with-retry.mjs')], target);
}
const output = path.join(cwd, 'dist');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(path.join(cwd, 'build/client'), output, { recursive: true });
// The product artifact contains no engineering pages or resources.
const fallback = await readFile(path.join(output, '__spa-fallback.html'), 'utf8');
const notFound = fallback
  .replace(/<link rel="modulepreload"[^>]*>/g, '')
  .replace('</head>', '<title>Page not found · CharDesk</title><meta name="robots" content="noindex, nofollow" /></head>')
  .replace(/<body>[\s\S]*<\/body>/, '<body><main class="manual-error" id="manual-content"><h1>Page not found</h1><p>There is no guide at this address.</p><a href="/">Back to the manual</a></main></body>');
await writeFile(path.join(output, '404.html'), notFound);
await writeFile(path.join(output, '_headers'), '/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n');
await writeFile(path.join(output, '_redirects'), '/getting-started / 301\n');
