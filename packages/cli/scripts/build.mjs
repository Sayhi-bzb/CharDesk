import { chmod, copyFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

await rm(new URL('../dist', import.meta.url), { recursive: true, force: true });
const runtimeRoot = fileURLToPath(new URL('../dist/runtime', import.meta.url));
await build({
  configFile: fileURLToPath(new URL('../../../apps/canvas/vite.config.ts', import.meta.url)),
  root: fileURLToPath(new URL('../../../apps/canvas', import.meta.url)),
  publicDir: false,
  base: './',
  build: {
    outDir: runtimeRoot,
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL('../../../apps/canvas/index.html', import.meta.url)),
    },
  },
});
await copyFile(
  new URL('../../../apps/canvas/public/icon.svg', import.meta.url),
  new URL('../dist/runtime/icon.svg', import.meta.url)
);
await copyFile(
  new URL('../../../apps/canvas/public/startup.css', import.meta.url),
  new URL('../dist/runtime/startup.css', import.meta.url)
);

execFileSync(process.execPath, [new URL('./build-local.ts', import.meta.url).pathname], {
  stdio: 'inherit',
});
await chmod(new URL('../dist/cli.js', import.meta.url), 0o755);
await Promise.all(
  ['LICENSE.beautiful-mermaid', 'LICENSE.marked-terminal', 'UPSTREAM.md'].map((name) =>
    copyFile(
      new URL(`../../chargraph/${name}`, import.meta.url),
      new URL(`../dist/${name}`, import.meta.url)
    )
  )
);
