export const CHARDESK_CONTENT_THEME_TOKENS = [
  "foreground",
  "background",
  "accent",
  "accent-foreground",
  "info",
  "done",
  "success",
  "warning",
  "danger",
  "muted-foreground",
  "border-subtle",
  "grid-subtle",
  "surface",
  "surface-foreground",
] as const;

export type CharDeskContentThemeToken =
  typeof CHARDESK_CONTENT_THEME_TOKENS[number];

export type CharDeskContentTheme = Record<CharDeskContentThemeToken, string>;
export type CharDeskContentThemeMode = "light" | "dark";

/** Theme input accepted from current callers and profiles saved before muted split. */
export type CharDeskContentThemeInput = Partial<CharDeskContentTheme> & {
  readonly muted?: string;
};

export type CharDeskContentColorDefault =
  | { readonly kind: "inherit" }
  | { readonly kind: "token"; readonly token: CharDeskContentThemeToken }
  | {
      readonly kind: "mixed";
      readonly tokens: readonly CharDeskContentThemeToken[];
      readonly includesInherited?: boolean;
    };

export const CHARDESK_LIGHT_CONTENT_THEME: CharDeskContentTheme = Object.freeze({
  foreground: "#1f2328",
  background: "#ffffff",
  accent: "#0969da",
  "accent-foreground": "#ffffff",
  info: "#0969da",
  done: "#8250df",
  success: "#1a7f37",
  warning: "#9a6700",
  danger: "#d1242f",
  "muted-foreground": "#59636e",
  "border-subtle": "#818b98",
  "grid-subtle": "#d1d9e0",
  surface: "#f6f8fa",
  "surface-foreground": "#1f2328",
});

export const CHARDESK_DARK_CONTENT_THEME: CharDeskContentTheme = Object.freeze({
  foreground: "#f0f6fc",
  background: "#0d1117",
  accent: "#58a6ff",
  "accent-foreground": "#ffffff",
  info: "#58a6ff",
  done: "#a371f7",
  success: "#3fb950",
  warning: "#d29922",
  danger: "#f85149",
  "muted-foreground": "#8b949e",
  "border-subtle": "#30363d",
  "grid-subtle": "#21262d",
  surface: "#161b22",
  "surface-foreground": "#c9d1d9",
});

export const CHARDESK_CONTENT_THEMES: Readonly<
  Record<CharDeskContentThemeMode, CharDeskContentTheme>
> = Object.freeze({
  light: CHARDESK_LIGHT_CONTENT_THEME,
  dark: CHARDESK_DARK_CONTENT_THEME,
});

const MUTED_THEME_TOKENS = new Set<CharDeskContentThemeToken>([
  "muted-foreground",
  "border-subtle",
  "grid-subtle",
]);

export const resolveCharDeskContentTheme = (
  input: CharDeskContentThemeInput = {}
): CharDeskContentTheme => Object.freeze(Object.fromEntries(
  CHARDESK_CONTENT_THEME_TOKENS.map((token) => [
    token,
    input[token]
      ?? (MUTED_THEME_TOKENS.has(token) ? input.muted : undefined)
      ?? CHARDESK_LIGHT_CONTENT_THEME[token],
  ])
) as unknown as CharDeskContentTheme);

export const resolveCharDeskContentColor = (
  value: CharDeskContentColorDefault,
  theme: CharDeskContentTheme
) => value.kind === "token" ? theme[value.token] : undefined;
