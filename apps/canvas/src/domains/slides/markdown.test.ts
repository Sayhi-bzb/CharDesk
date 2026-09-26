import { describe, expect, it } from 'vitest';
import { parseSlideMarkdown } from './markdown';

const createSource = (body: string[], metadata: string[] = ['title: Agent Deck']) =>
  ['---', 'chardesk: slides/v1', ...metadata, '---', ...body].join('\n');

describe('CharDesk Slides Markdown', () => {
  it('parses ordered plain and ANSI slides', async () => {
    const result = await parseSlideMarkdown(
      createSource([
        '## Intro',
        '',
        '```text size=4x2',
        'AB',
        '界',
        '```',
        '',
        '## Color',
        '',
        '```chardesk size=4x2',
        '[31mR[0m',
        '```',
      ])
    );

    expect(result.title).toBe('Agent Deck');
    expect(result.slideDeck).toMatchObject({
      activeSlideId: 'slide-1',
      slides: [
        { id: 'slide-1', name: 'Intro', size: { columns: 4, rows: 2 } },
        { id: 'slide-2', name: 'Color', size: { columns: 4, rows: 2 } },
      ],
    });
    expect(result.slideDeck.slides[0].grid.map(([key]) => key)).toEqual(['0,0', '1,0', '0,1']);
    expect(result.slideDeck.slides[1].grid[0][1].color).toBe('#800000');
  });

  it('uses the widescreen default when slide sizes are omitted', async () => {
    const result = await parseSlideMarkdown(
      createSource([
        '## Plain',
        '```text',
        'A',
        '```',
        '## ANSI',
        '```ansi',
        '\u001b[31mB\u001b[0m',
        '```',
        '## CharDesk',
        '```chardesk',
        '[32mC[0m',
        '```',
      ])
    );

    expect(result.slideDeck.slides.map((slide) => slide.size)).toEqual([
      { columns: 100, rows: 27 },
      { columns: 100, rows: 27 },
      { columns: 100, rows: 27 },
    ]);
  });

  it('uses fallback names and clips overflow, including wide boundary cells', async () => {
    const result = await parseSlideMarkdown(
      createSource(['```text size=4x2', 'ABCDE', 'abc界', 'third', '```'])
    );

    expect(result.slideDeck.slides[0].name).toBe('Slide 1');
    expect(result.slideDeck.slides[0].grid.map(([key]) => key)).toEqual([
      '0,0',
      '1,0',
      '2,0',
      '3,0',
      '0,1',
      '1,1',
      '2,1',
    ]);
  });

  it('parses independent slide sizes', async () => {
    const result = await parseSlideMarkdown(
      createSource([
        '## Wide',
        '```text size=100x27',
        'A',
        '```',
        '## Compact',
        '```ansi size=40x12',
        'B',
        '```',
      ])
    );

    expect(result.slideDeck.slides.map((slide) => slide.size)).toEqual([
      { columns: 100, rows: 27 },
      { columns: 40, rows: 12 },
    ]);
  });

  it('resolves auto sizes from compiled slide content', async () => {
    const result = await parseSlideMarkdown(
      createSource([
        '## Plain',
        '```text size=auto',
        'A界',
        'B',
        '```',
        '## Layout',
        '````chargraph size=auto',
        '**A**',
        '|||',
        '```json',
        '{"gpu":true}',
        '```',
        '````',
      ])
    );

    expect(result.slideDeck.slides[0]).toMatchObject({
      size: { columns: 11, rows: 6 },
    });
    expect(result.slideDeck.slides[0].grid.map(([key]) => key)).toEqual([
      '4,2',
      '5,2',
      '4,3',
    ]);
    expect(result.slideDeck.slides[1].size.columns).toBeGreaterThan(13);
    expect(result.slideDeck.slides[1].size.rows).toBeGreaterThan(4);
    expect(result.slideDeck.slides[1].grid.some(([, cell]) => cell.char === 'A')).toBe(true);
    expect(result.slideDeck.slides[1].grid.map(([, cell]) => cell.char).join('')).toContain('gpu');
  });

  it('pads empty auto content around its one-cell minimum size', async () => {
    const result = await parseSlideMarkdown(
      createSource(['## Empty', '```text size=auto', '', '```'])
    );

    expect(result.slideDeck.slides[0]).toMatchObject({
      size: { columns: 9, rows: 5 },
      grid: [],
    });
  });

  it.each([
    ['missing header', ['```text', 'A', '```'].join('\n')],
    ['bad version', ['---', 'chardesk: slides/v2', '---', '```text size=4x2', 'A', '```'].join('\n')],
    ['legacy header', ['---', 'asciicanvas: slides/v2', '---', '```text size=4x2', 'A', '```'].join('\n')],
    ['legacy fence', createSource(['```asciicanvas size=4x2', 'A', '```'])],
    ['bad size', createSource(['```text size=wide', 'A', '```'])],
    ['unknown block info', createSource(['```text compact', 'A', '```'])],
    ['no slides', createSource(['Nothing here'])],
    ['open fence', createSource(['```text size=4x2', 'A'])],
  ])('rejects %s', async (_label, source) => {
    await expect(parseSlideMarkdown(source)).rejects.toThrow();
  });

  it('compiles explicit CharGraph slide fences', async () => {
    const result = await parseSlideMarkdown(
      createSource([
        '## Layout',
        '````chargraph size=8x2',
        'A',
        '|||',
        '**B**',
        '````',
      ])
    );

    expect(result.slideDeck.slides[0].grid.map(([key, cell]) => [key, cell.char])).toEqual([
      ['0,0', 'A'],
      ['5,0', 'B'],
    ]);
    expect(result.slideDeck.slides[0].grid[1]?.[1].attrs?.bold).toBe(true);
  });

  it('renders nested CharGraph data fences instead of storing their source', async () => {
    const result = await parseSlideMarkdown(
      createSource([
        '## Data',
        '````chargraph size=20x4',
        '```json',
        '{"gpu":true}',
        '```',
        '````',
      ])
    );
    const text = result.slideDeck.slides[0].grid.map(([, cell]) => cell.char).join('');

    expect(text).toContain('gpu');
    expect(text).toContain('true');
    expect(text).not.toContain('```');
  });
});
