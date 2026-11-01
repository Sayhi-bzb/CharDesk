import { it, expect } from 'vitest';
import { buildRichClipboardHtml, parseRichClipboardHtml, parseRichClipboardText } from './rich.js';

it('round-trips portable rich HTML without interpreting markup, links or ANSI', () => {
  const cells = [
    {
      x: -2,
      y: 4,
      char: '🦀',
      color: '#123456',
      bgColor: '#abcdef',
      attrs: { bold: true, inverse: true },
      href: 'https://example.com/?a="<&',
    },
  ];
  const rich = JSON.stringify({ type: 'ascii-metropolis-zone', version: 1, cells });
  const html = buildRichClipboardHtml({ plain: '<script>界 & 🦀</script>', rich })!;
  expect(html).toContain('&lt;script&gt;');
  expect(html).not.toContain('<script>');
  expect(parseRichClipboardHtml(`<!--StartFragment-->${html}<!--EndFragment-->`)).toEqual({
    richCells: cells,
    plainText: null,
  });
  expect(
    parseRichClipboardText(
      JSON.stringify({
        type: 'ascii-metropolis-clipboard',
        surfaceCells: cells,
        structuredText: { text: 'legacy' },
      })
    )
  ).toEqual({ richCells: cells, plainText: 'legacy' });
});

it('rejects invalid and oversized rich data so hosts can fall back to plain text', () => {
  const valid = { x: 0, y: 0, char: 'A', color: '#000000' };
  for (const bad of [
    { ...valid, x: 1.5 },
    { ...valid, char: 'AB' },
    { ...valid, char: '\u001b' },
    { ...valid, attrs: { bold: 'yes' } },
    { ...valid, attrs: { hidden: true } },
    { ...valid, href: 'bad\nurl' },
  ])
    expect(parseRichClipboardText(JSON.stringify({ cells: [bad] }))).toBeNull();
  expect(parseRichClipboardText('{"cells":{}}')).toBeNull();
  expect(parseRichClipboardText('x'.repeat(16_777_217))).toBeNull();
  expect(parseRichClipboardHtml('<pre data-chardesk-clipboard="%xx">x</pre>')).toBeNull();
  expect(parseRichClipboardHtml('<pre>ordinary HTML</pre>')).toBeNull();
});
