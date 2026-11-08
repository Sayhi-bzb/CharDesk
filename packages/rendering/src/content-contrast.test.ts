import { expect, test } from 'vitest';
import {
  contentColorContrast,
  deriveContentNeutral,
  normalizeContentRgb,
} from './content-contrast.js';

test.each([
  ['#eee', '#eeeeee'],
  ['#Ab12Cd', '#ab12cd'],
  ['rgb(17, 34, 51)', '#112233'],
  ['rgb(17 34 51)', '#112233'],
  ['rgba(17, 34, 51, 1)', '#112233'],
  ['rgba(17, 34, 51, .5)', null],
  ['rgb(300, 0, 0)', null],
  ['oklch(0.5 0 0)', null],
])('opaque RGB normalization: %s', (input, expected) =>
  expect(normalizeContentRgb(input!)).toBe(expected)
);

test('neutral derivation retains contrast and hierarchy for light, dark and tinted palettes', () => {
  for (const [foreground, background] of [
    ['#111111', '#ffffff'],
    ['#eeeeee', '#111111'],
    ['#d7e4d7', '#182820'],
  ]) {
    const palette = { foreground: foreground!, background: background! };
    const text = deriveContentNeutral(palette, 0.65, 4.5),
      border = deriveContentNeutral(palette, 0.45, 3);
    expect(contentColorContrast(text, background!)).toBeGreaterThanOrEqual(4.5);
    expect(contentColorContrast(border, background!)).toBeGreaterThanOrEqual(3);
    expect(text).not.toBe(border);
    expect(text).not.toBe(foreground);
  }
});
