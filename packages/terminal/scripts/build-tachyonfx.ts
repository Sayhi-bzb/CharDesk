import { execFileSync } from 'node:child_process';
import { copyFileSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const target = resolve(root, '.tmp/tachyonfx-target');
const manifest = resolve(root, 'packages/terminal/tachyonfx/Cargo.toml');
const environment = {
  ...process.env,
  CARGO_HOME: process.env.CARGO_HOME ?? resolve(root, '.tmp/tachyonfx-cargo'),
  CARGO_TARGET_DIR: target,
};
if (process.platform === 'darwin') {
  const sysroot = execFileSync('rustc', ['--print', 'sysroot'], { encoding: 'utf8' }).trim();
  environment.DYLD_LIBRARY_PATH = [join(sysroot, 'lib'), process.env.DYLD_LIBRARY_PATH]
    .filter(Boolean)
    .join(':');
}
execFileSync(
  'cargo',
  [
    'build',
    '--locked',
    '--manifest-path',
    manifest,
    '--release',
    '--target',
    'wasm32-unknown-unknown',
  ],
  { stdio: 'inherit', env: environment }
);
copyFileSync(
  join(target, 'wasm32-unknown-unknown/release/chardesk_tachyonfx.wasm'),
  resolve(root, 'packages/terminal/src/tachyonfx.wasm')
);
const metadata = JSON.parse(
  execFileSync(
    'cargo',
    ['metadata', '--locked', '--manifest-path', manifest, '--format-version', '1'],
    { encoding: 'utf8', env: environment }
  )
);
const notices = metadata.packages
  .filter((entry: { source: string | null }) => entry.source)
  .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name))
  .flatMap((entry: { name: string; version: string; manifest_path: string }) => {
    const directory = dirname(entry.manifest_path);
    return readdirSync(directory)
      .filter((name) => /^(LICENSE|COPYING)([.-]|$)/i.test(name))
      .map(
        (name) =>
          `${entry.name} ${entry.version} — ${name}\n\n${readFileSync(join(directory, name), 'utf8')}`
      );
  });
writeFileSync(
  resolve(root, 'packages/terminal/tachyonfx/THIRD-PARTY-LICENSES.txt'),
  notices
    .join('\n\n-----\n\n')
    .replace(/\r\n/g, '\n')
    .replace(/[\t ]+$/gm, '')
    .trimEnd() + '\n'
);
