import type { CellTextStyle, WidgetNode } from "./types.js";
import type { CellUiTheme } from "./theme.js";

type Rgb = readonly [number, number, number];

const rgb = (color: string): Rgb | null => {
  const hex = color.trim().match(/^#([\da-f]{3}|[\da-f]{6})$/iu)?.[1];
  if (hex) {
    const full = hex.length === 3 ? [...hex].map((part) => part + part).join("") : hex;
    return [
      Number.parseInt(full.slice(0, 2), 16),
      Number.parseInt(full.slice(2, 4), 16),
      Number.parseInt(full.slice(4, 6), 16),
    ];
  }
  const channels = color.trim().match(/^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*(?:,\s*(1(?:\.0+)?))?\s*\)$/iu);
  if (!channels) return null;
  const values = channels.slice(1, 4).map(Number);
  return values.every((value) => value >= 0 && value <= 255)
    ? [values[0]!, values[1]!, values[2]!]
    : null;
};

const luminance = (color: Rgb): number => {
  const [red, green, blue] = color.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return red! * 0.2126 + green! * 0.7152 + blue! * 0.0722;
};

const contrast = (foreground: string, background: string): number | null => {
  const front = rgb(foreground);
  const back = rgb(background);
  if (!front || !back) return null;
  const first = luminance(front);
  const second = luminance(back);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
};

const readableColor = (
  candidate: string,
  background: string,
  minimum: number,
  alternatives: readonly (string | undefined)[],
): string => {
  const ratio = contrast(candidate, background);
  if (ratio === null || ratio >= minimum) return candidate;
  for (const alternative of alternatives) {
    if (alternative && (contrast(alternative, background) ?? 0) >= minimum) return alternative;
  }
  return (contrast("#000000", background) ?? 0) >= (contrast("#FFFFFF", background) ?? 0)
    ? "#000000" : "#FFFFFF";
};

export const resolveScrollbarAppearance = (
  node: WidgetNode,
  ownerStyle: CellTextStyle,
  theme: CellUiTheme,
  paintedBackground: string | undefined,
): Readonly<{ thumb: CellTextStyle; track: CellTextStyle }> => {
  const thumbBase = theme.scrollThumbStyle;
  const trackBase = theme.scrollTrackStyle;
  const background = paintedBackground ?? ownerStyle.backgroundColor ?? theme.background;
  const preferredThumb = node.kind === "text-area" && node.focusActive
    ? ownerStyle.color ?? theme.focusedSurfaceStyle.color ?? theme.foreground
    : thumbBase.color ?? theme.foreground;
  const thumbBackground = thumbBase.backgroundColor ?? background;
  const trackBackground = trackBase.backgroundColor ?? background;
  const thumbColor = readableColor(preferredThumb, thumbBackground, 3, [ownerStyle.color, theme.foreground]);
  return {
    thumb: {
      ...thumbBase,
      color: thumbColor,
    },
    track: {
      ...trackBase,
      color: node.presentation === "text" ? thumbColor
        : readableColor(trackBase.color ?? theme.secondaryStyle.color ?? theme.foreground,
          trackBackground, 1.5, [theme.secondaryStyle.color, ownerStyle.color, theme.foreground]),
    },
  };
};
