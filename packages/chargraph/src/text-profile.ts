import {
  CHARDESK_MARKDOWN_FEATURES,
  type CharDeskMarkdownFeatureStates,
} from './markdown-modules.js';
import { createCharDeskMarkdownRenderOptions } from './markdown-theme.js';
import {
  CHARDESK_RENDER_THEME_TOKENS,
  CHARDESK_RENDER_THEMES,
  type CharDeskRenderTheme,
  type CharDeskRenderThemeMode,
} from './render-theme.js';
import type { CharGraphTextMode } from './text.js';

export const MARKDOWN_WRAP_WIDTH_MIN = 60;
export const MARKDOWN_WRAP_WIDTH_MAX = 200;
export type CharDeskTextFeatureConfig = {
  enabled: boolean;
  colors: Record<CharDeskRenderThemeMode, Record<string, string>>;
};
export type CharDeskTextFeatureSettings = Record<string, CharDeskTextFeatureConfig>;
export type CharDeskTextRenderProfile = {
  mode: CharGraphTextMode;
  markdownWrapEnabled: boolean;
  markdownWrapWidth: number;
  markdownAutoAnchorsEnabled: boolean;
  renderThemes: Record<CharDeskRenderThemeMode, Partial<CharDeskRenderTheme>>;
  features: CharDeskTextFeatureSettings;
};
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const color = (value: unknown) =>
  typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value.toLowerCase() : undefined;
const themeMap = <T>(build: (mode: CharDeskRenderThemeMode) => T) => ({
  light: build('light'),
  dark: build('dark'),
});

export function createDefaultTextFeatureSettings(): CharDeskTextFeatureSettings {
  return Object.fromEntries(
    CHARDESK_MARKDOWN_FEATURES.map((feature) => [
      `markdown.${feature.id}`,
      { enabled: feature.defaultEnabled, colors: themeMap(() => ({})) },
    ])
  );
}

/** Current schema validation shared by all hosts. Host adapters own legacy storage migrations. */
export function normalizeCharDeskTextRenderProfile(value: unknown): CharDeskTextRenderProfile {
  const source = object(value),
    themes = object(source.renderThemes),
    features = object(source.features);
  const mode = ['auto', 'raw', 'ansi', 'markdown'].includes(String(source.mode))
    ? (source.mode as CharGraphTextMode)
    : 'auto';
  const renderThemes = themeMap((mode) => {
    const sourceTheme = object(themes[mode] ?? (mode === 'light' ? source.renderTheme : undefined));
    return Object.fromEntries(
      CHARDESK_RENDER_THEME_TOKENS.flatMap((token) => {
        const value =
          color(sourceTheme[token]) ??
          (['muted-foreground', 'border-subtle', 'grid-subtle'].includes(token)
            ? color(sourceTheme.muted)
            : undefined);
        return value ? [[token, value]] : [];
      })
    );
  });
  return {
    mode,
    markdownWrapEnabled: source.markdownWrapEnabled !== false,
    markdownWrapWidth:
      typeof source.markdownWrapWidth === 'number' && Number.isInteger(source.markdownWrapWidth)
        ? Math.max(
            MARKDOWN_WRAP_WIDTH_MIN,
            Math.min(MARKDOWN_WRAP_WIDTH_MAX, source.markdownWrapWidth)
          )
        : 80,
    markdownAutoAnchorsEnabled: source.markdownAutoAnchorsEnabled !== false,
    renderThemes,
    features: Object.fromEntries(
      CHARDESK_MARKDOWN_FEATURES.map((feature) => {
        const config = object(features[`markdown.${feature.id}`]),
          colors = object(config.colors);
        return [
          `markdown.${feature.id}`,
          {
            enabled: typeof config.enabled === 'boolean' ? config.enabled : feature.defaultEnabled,
            colors: themeMap((mode) => {
              const values = object(colors[mode]);
              return Object.fromEntries(
                Object.keys(feature.colorSlots).flatMap((slot) =>
                  color(values[slot]) ? [[slot, color(values[slot])!]] : []
                )
              );
            }),
          },
        ];
      })
    ),
  };
}

export const DEFAULT_TEXT_RENDER_PROFILE = normalizeCharDeskTextRenderProfile(undefined);

export function createTextProfileFeatureOptions(
  settings: CharDeskTextFeatureSettings,
  theme: CharDeskRenderTheme,
  forced: boolean,
  mode: CharDeskRenderThemeMode
) {
  const features: CharDeskMarkdownFeatureStates = {};
  for (const feature of CHARDESK_MARKDOWN_FEATURES) {
    const config = settings[`markdown.${feature.id}`];
    if (config)
      features[feature.id] = {
        enabled: config.enabled,
        colors: Object.fromEntries(
          Object.keys(feature.colorSlots).flatMap((slot) => {
            const value = color(config.colors[mode][slot]);
            return value ? [[slot, value]] : [];
          })
        ),
      };
  }
  return createCharDeskMarkdownRenderOptions({ theme, features, forced });
}

export function createTextProfileMarkdownOptions(
  profile: CharDeskTextRenderProfile,
  options: {
    theme?: CharDeskRenderTheme;
    themeMode?: CharDeskRenderThemeMode;
    forced?: boolean;
  } = {}
) {
  const mode = options.themeMode ?? 'light';
  const theme = {
    ...(options.theme ?? CHARDESK_RENDER_THEMES[mode]),
    ...profile.renderThemes[mode],
  };
  return {
    ...createTextProfileFeatureOptions(
      profile.features,
      theme,
      options.forced ?? profile.mode === 'markdown',
      mode
    ),
    ...(profile.markdownWrapEnabled ? { proseWrapWidth: profile.markdownWrapWidth } : {}),
  };
}
