import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderIcon } from '../../assets/logo/generate.mjs';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('CharDesk favicon', () => {
  it('uses the same icon across all five app entry points', () => {
    const icon = read('assets/logo/icon.svg');
    expect(read('apps/site/public/icon.svg')).toBe(icon);
    expect(read('apps/canvas/public/icon.svg')).toBe(icon);
    expect(read('apps/cell-ui/public/icon.svg')).toBe(icon);
    expect(read('apps/docs/public/icon.svg')).toBe(icon);
    expect(read('apps/chargraph/public/icon.svg')).toBe(icon);
    expect(icon).toBe(renderIcon());
    expect(icon).toContain(':root { color: #000; }');
    expect(icon).toContain('@media (prefers-color-scheme: dark) { :root { color: #fff; } }');
  });

  it.each([
    'apps/canvas/index.html',
    'apps/site/index.html',
    'apps/chargraph/index.html',
    'apps/cell-ui/index.html',
    'apps/docs/reader/root.tsx',
  ])('%s references the shared icon', (path) => {
    expect(read(path)).toMatch(/<link\s+rel="icon"[^>]*href="(?:\.\/|\/)icon\.svg"/);
  });
});
