import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('CharDesk favicon', () => {
  it('uses the same pixel icon for the app and Cell UI gallery', () => {
    const icon = read('public/icon.svg');
    expect(read('apps/cell-ui/public/icon.svg')).toBe(icon);
    expect(icon).toContain('viewBox="0 0 24 24"');
    expect(icon).toContain('prefers-color-scheme: dark');
    expect([...icon.matchAll(/\bfill="([^"]+)"/g)].map((match) => match[1])).toEqual([
      'currentColor',
      'currentColor',
    ]);
  });

  it.each(['index.html', 'apps/site/index.html', 'apps/chargraph/index.html', 'apps/cell-ui/index.html'])(
    '%s references the shared icon',
    (path) => {
      expect(read(path)).toMatch(/<link\s+rel="icon"[^>]*href="(?:\.\/|\/)icon\.svg"/);
    },
  );
});
