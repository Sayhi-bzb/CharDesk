import {
  CHARDESK_CONTENT_THEMES,
  CHARDESK_LIGHT_CONTENT_THEME,
  resolveCharDeskContentTheme,
} from "@chardesk/rendering/theme";
import type {
  TextRenderThemeMap,
  TextRenderThemeMode,
  TextRenderThemeOverrides,
} from "./types";

export const TEXT_RENDER_THEME_MODES = ["light", "dark"] as const satisfies
  readonly TextRenderThemeMode[];

export const createTextRenderThemeMap = <Value>(
  create: (mode: TextRenderThemeMode) => Value
): TextRenderThemeMap<Value> => Object.fromEntries(
  TEXT_RENDER_THEME_MODES.map((mode) => [mode, create(mode)])
) as TextRenderThemeMap<Value>;

export const DEFAULT_TEXT_RENDER_THEME = CHARDESK_LIGHT_CONTENT_THEME;
export const DEFAULT_TEXT_RENDER_THEMES: TextRenderThemeMap<
  typeof CHARDESK_LIGHT_CONTENT_THEME
> = CHARDESK_CONTENT_THEMES;

export const resolveTextRenderTheme = (
  mode: TextRenderThemeMode,
  overrides: TextRenderThemeOverrides = {}
) => resolveCharDeskContentTheme({
  ...DEFAULT_TEXT_RENDER_THEMES[mode],
  ...overrides,
});
