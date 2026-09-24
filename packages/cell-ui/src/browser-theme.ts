import { useLayoutEffect, useState, type RefObject } from "react";
import { DEFAULT_CELL_UI_THEME, resolveCellUiTheme, type CellSemanticColors, type CellSemanticTone, type CellUiTheme } from "./theme.js";
import type { CellUiRecipe } from "./recipe.js";

export type CellCssTheme = Readonly<{
  theme: CellUiTheme;
  palette: Readonly<{ color: string; background: string }>;
  recipe: CellUiRecipe;
}>;

const fallback = DEFAULT_CELL_UI_THEME;
const semanticTones: readonly CellSemanticTone[] = ["info", "success", "warning", "danger"];
const defaults = {
  background: fallback.background,
  foreground: fallback.foreground,
  surface: fallback.surfaceStyle.backgroundColor!,
  "surface-elevated": fallback.elevatedSurfaceStyle.backgroundColor!,
  "button-solid": fallback.buttonSolidStyle.backgroundColor!,
  "button-solid-foreground": fallback.buttonSolidStyle.color!,
  "badge-neutral": fallback.badgeStyles.neutral.backgroundColor!,
  "badge-neutral-foreground": fallback.badgeStyles.neutral.color!,
  "badge-info": fallback.badgeStyles.info.backgroundColor!,
  "badge-info-foreground": fallback.badgeStyles.info.color!,
  "badge-success": fallback.badgeStyles.success.backgroundColor!,
  "badge-success-foreground": fallback.badgeStyles.success.color!,
  "badge-warning": fallback.badgeStyles.warning.backgroundColor!,
  "badge-warning-foreground": fallback.badgeStyles.warning.color!,
  "badge-error": fallback.badgeStyles.error.backgroundColor!,
  "badge-error-foreground": fallback.badgeStyles.error.color!,
  highlight: fallback.focusedSurfaceStyle.backgroundColor!,
  hover: fallback.hoveredItemStyle.backgroundColor!,
  "highlight-foreground": fallback.focusedSurfaceStyle.color!,
  "muted-foreground": fallback.secondaryStyle.color!,
  "disabled-foreground": fallback.disabledStyle.color!,
  border: fallback.borderStyle.color!,
  selection: fallback.textSelectionStyle.backgroundColor!,
  "selection-foreground": fallback.textSelectionStyle.color!,
  "range-surface": fallback.rangeStyle.surface,
  "range-border": fallback.rangeStyle.border,
  cursor: fallback.cursorStyle.color,
  "cursor-foreground": fallback.cursorStyle.textColor,
  "scrollbar-thumb": fallback.scrollThumbStyle.color!,
  "scrollbar-track": fallback.scrollTrackStyle.color!,
  "tone-info": fallback.semanticColors.info.text,
  "tone-info-surface": fallback.semanticColors.info.surface,
  "tone-info-surface-foreground": fallback.semanticColors.info.surfaceForeground,
  "tone-success": fallback.semanticColors.success.text,
  "tone-success-surface": fallback.semanticColors.success.surface,
  "tone-success-surface-foreground": fallback.semanticColors.success.surfaceForeground,
  "tone-warning": fallback.semanticColors.warning.text,
  "tone-warning-surface": fallback.semanticColors.warning.surface,
  "tone-warning-surface-foreground": fallback.semanticColors.warning.surfaceForeground,
  "tone-danger": fallback.semanticColors.danger.text,
  "tone-danger-surface": fallback.semanticColors.danger.surface,
  "tone-danger-surface-foreground": fallback.semanticColors.danger.surfaceForeground,
  "markdown-accent": fallback.markdownColors.accent,
  "markdown-link": fallback.markdownColors.link,
  "markdown-quote": fallback.markdownColors.quote,
  "markdown-muted": fallback.markdownColors.muted,
  "markdown-code-foreground": fallback.markdownColors.codeForeground,
  "markdown-code-background": fallback.markdownColors.codeBackground,
};

const readRangeSurfaceEffect = (
  source: CSSStyleDeclaration
): NonNullable<CellUiTheme["rangeStyle"]["surfaceEffect"]> => {
  const value = source.getPropertyValue("--cell-range-surface-effect").trim();
  return value === "tint" || value === "contrast"
    ? value
    : fallback.rangeStyle.surfaceEffect ?? "tint";
};

const readRecipe = (source: CSSStyleDeclaration): CellUiRecipe => {
  const value = source.getPropertyValue("--cell-default-control-variant").trim();
  if (value === "surface" || value === "ghost") return { defaultControlVariant: value };
  if (value && (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV) {
    console.warn("[cell-ui] Invalid --cell-default-control-variant; using component defaults.");
  }
  return {};
};

// One temporary color resolver per theme read, never DOM per Cell.
export const readCellCssTheme = (element: HTMLElement): CellCssTheme => {
  const view = element.ownerDocument.defaultView!;
  const source = view.getComputedStyle(element);
  const probe = element.ownerDocument.createElement("span");
  probe.style.cssText = "position:absolute;visibility:hidden;pointer-events:none;width:0;height:0;overflow:hidden";
  probe.setAttribute("aria-hidden", "true");
  element.append(probe);
  const colors = { ...defaults };
  const supplied = new Set<string>();
  try {
    for (const key of Object.keys(defaults) as (keyof typeof defaults)[]) {
      const token = `--cell-${key}`;
      const raw = source.getPropertyValue(token).trim();
      probe.style.color = "";
      if (raw) probe.style.color = raw;
      if (!probe.style.color || raw.includes("var(")) {
        const development = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV;
        if (development) console.warn(`[cell-ui] Missing or invalid ${token}; using default.`);
        continue;
      }
      colors[key] = view.getComputedStyle(probe).color;
      supplied.add(key);
    }
  } finally {
    probe.remove();
  }
  const highlight = { color: colors["highlight-foreground"], backgroundColor: colors.highlight };
  const semanticDefaults = resolveCellUiTheme({ background: colors.background }).semanticColors;
  const semanticColors = Object.fromEntries(semanticTones.map((tone) => {
    const key = `tone-${tone}` as keyof typeof colors;
    const surfaceKey = `tone-${tone}-surface` as keyof typeof colors;
    const foregroundKey = `tone-${tone}-surface-foreground` as keyof typeof colors;
    return [tone, {
      text: supplied.has(key) ? colors[key] : semanticDefaults[tone].text,
      surface: supplied.has(surfaceKey) ? colors[surfaceKey] : semanticDefaults[tone].surface,
      surfaceForeground: supplied.has(foregroundKey)
        ? colors[foregroundKey] : semanticDefaults[tone].surfaceForeground,
    }];
  })) as CellSemanticColors;
  const roleDefaults = resolveCellUiTheme({ background: colors.background, semanticColors });
  const roleColor = (key: keyof typeof colors, fallbackColor: string) =>
    supplied.has(key) ? colors[key] : fallbackColor;
  return {
    palette: { color: colors.foreground, background: colors.background },
    recipe: readRecipe(source),
    theme: {
      ...fallback,
      background: colors.background,
      foreground: colors.foreground,
      semanticColors,
      markdownColors: {
        accent: roleColor("markdown-accent", roleDefaults.markdownColors.accent),
        link: roleColor("markdown-link", roleDefaults.markdownColors.link),
        quote: roleColor("markdown-quote", roleDefaults.markdownColors.quote),
        muted: roleColor("markdown-muted", roleDefaults.markdownColors.muted),
        codeForeground: roleColor("markdown-code-foreground", roleDefaults.markdownColors.codeForeground),
        codeBackground: roleColor("markdown-code-background", roleDefaults.markdownColors.codeBackground),
      },
      surfaceStyle: { backgroundColor: colors.surface },
      elevatedSurfaceStyle: { backgroundColor: colors["surface-elevated"] },
      buttonSolidStyle: {
        color: colors["button-solid-foreground"],
        backgroundColor: colors["button-solid"],
      },
      badgeStyles: {
        neutral: { color: colors["badge-neutral-foreground"], backgroundColor: colors["badge-neutral"] },
        info: { color: roleColor("badge-info-foreground", roleDefaults.badgeStyles.info.color!),
          backgroundColor: roleColor("badge-info", roleDefaults.badgeStyles.info.backgroundColor!) },
        success: { color: roleColor("badge-success-foreground", roleDefaults.badgeStyles.success.color!),
          backgroundColor: roleColor("badge-success", roleDefaults.badgeStyles.success.backgroundColor!) },
        warning: { color: roleColor("badge-warning-foreground", roleDefaults.badgeStyles.warning.color!),
          backgroundColor: roleColor("badge-warning", roleDefaults.badgeStyles.warning.backgroundColor!) },
        error: { color: roleColor("badge-error-foreground", roleDefaults.badgeStyles.error.color!),
          backgroundColor: roleColor("badge-error", roleDefaults.badgeStyles.error.backgroundColor!) },
      },
      borderStyle: { color: colors.border },
      focusedSurfaceStyle: highlight,
      hoveredItemStyle: { backgroundColor: colors.hover },
      selectedStyle: highlight,
      secondaryStyle: { color: colors["muted-foreground"] },
      disabledStyle: { color: colors["disabled-foreground"] },
      textSelectionStyle: { color: colors["selection-foreground"], backgroundColor: colors.selection },
      cursorStyle: {
        ...fallback.cursorStyle,
        color: colors.cursor,
        textColor: colors["cursor-foreground"],
      },
      rangeStyle: {
        surface: colors["range-surface"],
        border: colors["range-border"],
        surfaceEffect: readRangeSurfaceEffect(source),
      },
      scrollThumbStyle: { color: colors["scrollbar-thumb"] },
      scrollTrackStyle: { color: colors["scrollbar-track"] },
    },
  };
};

export const useCellCssTheme = (
  ref: RefObject<HTMLElement | null>,
  revision: string | number
): CellCssTheme => {
  const [value, setValue] = useState<CellCssTheme>(() => ({
    theme: fallback,
    palette: { color: fallback.foreground, background: fallback.background },
    recipe: {},
  }));
  useLayoutEffect(() => {
    if (ref.current) setValue(readCellCssTheme(ref.current));
  }, [ref, revision]);
  return value;
};
