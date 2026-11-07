import { expect, test } from 'vitest';
import { describeMinimapCell, minimapColorKey, resolveMinimapColor } from './content.js';

test('minimap occupancy uses complete graphemes, foreground inheritance and background priority', () => {
  expect(describeMinimapCell({ char: '🦀', color: '#000000' })).toEqual({
    width: 2,
    regions: [{ y: 0, height: 1, color: { kind: 'foreground' } }],
  });
  expect(describeMinimapCell({ char: '界', color: '#123456' })).toEqual({
    width: 2,
    regions: [{ y: 0, height: 1, color: { kind: 'literal', value: '#123456' } }],
  });
  expect(describeMinimapCell({ char: 'e\u0301', color: '#abcdef' }).width).toBe(1);
  expect(describeMinimapCell({ char: '👩🏽‍💻', color: '#abcdef' }).width).toBe(2);
  for (const char of [' ', ''])
    expect(describeMinimapCell({ char, color: '#ff0000' }).regions).toEqual([]);
  for (const char of [' ', 'A'])
    expect(
      describeMinimapCell({ char, color: '#ff0000', bgColor: '#112233' }).regions[0]!.color
    ).toEqual({
      kind: 'literal',
      value: '#112233',
    });
  expect(
    describeMinimapCell({ char: ' ', color: '#ff0000', bgColor: 'transparent' }).regions
  ).toEqual([]);
  // Preserve the existing artifact sentinel: an explicitly backed foreground is authored.
  expect(
    describeMinimapCell({ char: 'A', color: '#000000', bgColor: 'transparent' }).regions[0]!.color
  ).toEqual({ kind: 'literal', value: '#000000' });
});

test('default color resolves at the Host boundary; equivalent RGB keys and ties stay stable', () => {
  const inherited = describeMinimapCell({ char: 'A', color: '#000000' }).regions[0]!.color;
  expect(resolveMinimapColor(inherited, '#eeeeee')).toBe('#eeeeee');
  expect(resolveMinimapColor(inherited, '#111111')).toBe('#111111');
  const literal = { kind: 'literal', value: '#EEe' } as const;
  expect(resolveMinimapColor(literal, '#000000')).toBe('#EEe');
  expect(minimapColorKey(literal)).toBe(minimapColorKey(inherited, '#eeeeee'));
  expect(minimapColorKey(inherited)).toBe('foreground');
});

test('half blocks preserve upper/lower paints and solid blocks ignore their background', () => {
  for (const char of ['▀', '▄']) {
    const ink = { kind: 'literal', value: '#cc4400' },
      paper = { kind: 'literal', value: '#2266bb' };
    expect(describeMinimapCell({ char, color: ink.value, bgColor: paper.value })).toEqual({
      width: 1,
      regions: [
        { y: 0, height: 0.5, color: char === '▀' ? ink : paper },
        { y: 0.5, height: 0.5, color: char === '▄' ? ink : paper },
      ],
    });
  }
  expect(describeMinimapCell({ char: '█', color: '#cc4400', bgColor: '#2266bb' }).regions).toEqual([
    { y: 0, height: 1, color: { kind: 'literal', value: '#cc4400' } },
  ]);
  expect(describeMinimapCell({ char: '▀', color: '#000000' }).regions).toEqual([
    { y: 0, height: 0.5, color: { kind: 'foreground' } },
  ]);
});
