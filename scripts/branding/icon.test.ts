import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('CharDesk favicon', () => {
  it('uses the same icon for the app, product home, and Cell UI gallery', () => {
    const icon = read('apps/site/public/icon.svg');
    expect(read('apps/canvas/public/icon.svg')).toBe(icon);
    expect(read('apps/cell-ui/public/icon.svg')).toBe(icon);
    expect(read('apps/site/public/icon.svg')).toBe(icon);
    expect(icon).toContain('viewBox="0 0 24 24"');
    expect(icon).toContain(':root { color: #000; }');
    expect(icon).toContain('@media (prefers-color-scheme: dark) { :root { color: #fff; } }');
    expect(icon).toContain('M20 20H4v-2h4v-8H4v8H2V6');
  });

  it.each(['apps/canvas/index.html', 'apps/site/index.html', 'apps/chargraph/index.html', 'apps/cell-ui/index.html'])(
    '%s references the shared icon',
    (path) => {
      expect(read(path)).toMatch(/<link\s+rel="icon"[^>]*href="(?:\.\/|\/)icon\.svg"/);
    },
  );
});
