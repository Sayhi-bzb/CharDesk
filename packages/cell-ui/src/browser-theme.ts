import { useLayoutEffect, useState, type RefObject } from "react";
import { DEFAULT_CELL_UI_THEME, type CellUiTheme } from "./theme.js";

export type CellCssTheme = Readonly<{
  theme: CellUiTheme;
  palette: Readonly<{ color: string; background: string }>;
}>;

const fallback = DEFAULT_CELL_UI_THEME;
const defaults = {
  background: fallback.background,
  foreground: fallback.foreground,
  surface: fallback.surfaceStyle.backgroundColor!,
  "surface-raised": fallback.raisedSurfaceStyle.backgroundColor!,
  "button-primary": fallback.buttonPrimaryStyle.backgroundColor!,
  "button-primary-foreground": fallback.buttonPrimaryStyle.color!,
  "button-primary-hover": fallback.buttonPrimaryHoverStyle.backgroundColor!,
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
};

const readRangeSurfaceEffect = (
  source: CSSStyleDeclaration
): NonNullable<CellUiTheme["rangeStyle"]["surfaceEffect"]> => {
  const value = source.getPropertyValue("--cell-range-surface-effect").trim();
  return value === "tint" || value === "contrast"
    ? value
    : fallback.rangeStyle.surfaceEffect ?? "tint";
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
    }
  } finally {
    probe.remove();
  }
  const highlight = { color: colors["highlight-foreground"], backgroundColor: colors.highlight };
  return {
    palette: { color: colors.foreground, background: colors.background },
    theme: {
      ...fallback,
      background: colors.background,
      foreground: colors.foreground,
      surfaceStyle: { backgroundColor: colors.surface },
      raisedSurfaceStyle: { backgroundColor: colors["surface-raised"] },
      buttonPrimaryStyle: {
        color: colors["button-primary-foreground"],
        backgroundColor: colors["button-primary"],
      },
      buttonPrimaryHoverStyle: {
        color: colors["button-primary-foreground"],
        backgroundColor: colors["button-primary-hover"],
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
  }));
  useLayoutEffect(() => {
    if (ref.current) setValue(readCellCssTheme(ref.current));
  }, [ref, revision]);
  return value;
};
