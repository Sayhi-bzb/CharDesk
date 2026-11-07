import { expect, it } from 'vitest';
import {
  createDefaultTextFeatureSettings,
  createTextProfileMarkdownOptions,
  normalizeCharDeskTextRenderProfile,
} from './text-profile.js';

it('normalizes the shared profile without sharing mutable defaults or accepting unknown colors/features', () => {
  const profile = normalizeCharDeskTextRenderProfile({
    mode: 'bad',
    markdownWrapWidth: 1000,
    markdownWrapEnabled: false,
    renderThemes: { dark: { foreground: '#ABCDEF', muted: '#123456', bad: '#ffffff' } },
    features: {
      'markdown.link': {
        enabled: false,
        colors: {
          light: { foreground: '#ABCDEF', invalid: '#000000' },
          dark: { foreground: 'red' },
        },
      },
      'future.unknown': { enabled: true },
    },
  });
  expect(profile.mode).toBe('auto');
  expect(profile.markdownWrapWidth).toBe(200);
  expect(profile.renderThemes.dark).toEqual({
    foreground: '#abcdef',
    'muted-foreground': '#123456',
    'border-subtle': '#123456',
    'grid-subtle': '#123456',
  });
  expect(profile.features['markdown.link']).toEqual({
    enabled: false,
    colors: { light: { foreground: '#abcdef' }, dark: {} },
  });
  expect(profile.features['future.unknown']).toBeUndefined();
  expect(createTextProfileMarkdownOptions(profile).proseWrapWidth).toBeUndefined();
  const fresh = createDefaultTextFeatureSettings();
  fresh['markdown.link']!.colors.light.foreground = '#123456';
  expect(createDefaultTextFeatureSettings()['markdown.link']!.colors.light).toEqual({});
  expect(normalizeCharDeskTextRenderProfile({ markdownWrapWidth: 2 }).markdownWrapWidth).toBe(60);
});
