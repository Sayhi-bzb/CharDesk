import { createCssVariablesTheme, type ThemeRegistration } from "shiki/core";
import {
  CHARDESK_RENDER_THEME_TOKENS,
  type CharDeskRenderTheme,
} from "./render-theme.js";

const codeThemeDefaults = (theme: CharDeskRenderTheme) => ({
  foreground: theme.foreground,
  background: theme.background,
  "token-link": theme.link,
  "token-string": theme.success,
  "token-comment": theme["muted-foreground"],
  "token-constant": theme.info,
  "token-keyword": theme.accent,
  "token-parameter": theme.foreground,
  "token-function": theme.info,
  "token-string-expression": theme.success,
  "token-punctuation": theme.foreground,
  "token-inserted": theme.success,
  "token-deleted": theme.danger,
  "token-changed": theme.warning,
  "ansi-black": theme.foreground,
  "ansi-red": theme.danger,
  "ansi-green": theme.success,
  "ansi-yellow": theme.warning,
  "ansi-blue": theme.accent,
  "ansi-magenta": theme.done,
  "ansi-cyan": theme.info,
  "ansi-white": theme.background,
  "ansi-bright-black": theme["muted-foreground"],
  "ansi-bright-red": theme.danger,
  "ansi-bright-green": theme.success,
  "ansi-bright-yellow": theme.warning,
  "ansi-bright-blue": theme.accent,
  "ansi-bright-magenta": theme.done,
  "ansi-bright-cyan": theme.info,
  "ansi-bright-white": theme.foreground,
});

const resolveCssVariableFallback = (value: string | undefined) => {
  if (!value?.startsWith("var(")) return value;
  return value.match(/^var\([^,]+,\s*([^)]+)\)$/)?.[1];
};

export const createCharDeskCodeTheme = (
  theme: CharDeskRenderTheme
): ThemeRegistration => {
  const generated = createCssVariablesTheme({
    name: `chardesk-render-${CHARDESK_RENDER_THEME_TOKENS.map(
      (token) => theme[token].replace(/^#/, "")
    ).join("-")}`,
    variablePrefix: "--chardesk-code-",
    variableDefaults: codeThemeDefaults(theme),
  });
  return {
    ...generated,
    colors: Object.fromEntries(Object.entries(generated.colors ?? {}).map(
      ([name, value]) => [name, resolveCssVariableFallback(value) ?? theme.foreground]
    )),
    tokenColors: generated.tokenColors?.map((rule) => ({
      ...rule,
      settings: {
        ...rule.settings,
        ...(rule.settings.foreground
          ? { foreground: resolveCssVariableFallback(rule.settings.foreground) }
          : {}),
        ...(rule.settings.background
          ? { background: resolveCssVariableFallback(rule.settings.background) }
          : {}),
      },
    })),
  };
};
