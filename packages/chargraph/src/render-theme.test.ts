import { describe, expect, it } from "vitest";
import {
  CHARDESK_DARK_RENDER_THEME,
  CHARDESK_LIGHT_RENDER_THEME,
  CHARDESK_RENDER_THEME_TOKENS,
  resolveCharDeskRenderTheme,
} from "./render-theme.js";

const luminance = (hex: string) => {
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  };
  const rgb = [1, 3, 5].map((offset) =>
    Number.parseInt(hex.slice(offset, offset + 2), 16)
  );
  return 0.2126 * linear(rgb[0]!)
    + 0.7152 * linear(rgb[1]!)
    + 0.0722 * linear(rgb[2]!);
};

const contrast = (left: string, right: string) => {
  const [lighter, darker] = [luminance(left), luminance(right)]
    .sort((a, b) => b - a);
  return (lighter! + 0.05) / (darker! + 0.05);
};

describe("CharDesk render theme", () => {
  it("publishes the Canvas-adapted Primer light palette", () => {
    expect(CHARDESK_LIGHT_RENDER_THEME).toEqual({
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
    expect(Object.keys(CHARDESK_LIGHT_RENDER_THEME))
      .toEqual([...CHARDESK_RENDER_THEME_TOKENS]);
  });

  it("migrates legacy muted input without overriding explicit split roles", () => {
    expect(resolveCharDeskRenderTheme({
      muted: "#777777",
      "grid-subtle": "#888888",
    })).toMatchObject({
      "muted-foreground": "#777777",
      "border-subtle": "#777777",
      "grid-subtle": "#888888",
    });
  });

  it("publishes the matching Primer dark palette", () => {
    expect(CHARDESK_DARK_RENDER_THEME).toEqual({
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
    expect(Object.keys(CHARDESK_DARK_RENDER_THEME))
      .toEqual([...CHARDESK_RENDER_THEME_TOKENS]);
  });

  it("keeps semantic text readable and structural strokes stronger than grids", () => {
    const textTokens = [
      "foreground",
      "accent",
      "info",
      "done",
      "success",
      "warning",
      "danger",
      "muted-foreground",
    ] as const;

    expect(textTokens.every((token) =>
      contrast(
        CHARDESK_LIGHT_RENDER_THEME[token],
        CHARDESK_LIGHT_RENDER_THEME.background
      ) >= 4.5
    )).toBe(true);
    expect(contrast(
      CHARDESK_LIGHT_RENDER_THEME["border-subtle"],
      CHARDESK_LIGHT_RENDER_THEME.background
    ))
      .toBeGreaterThan(
        contrast(
          CHARDESK_LIGHT_RENDER_THEME["grid-subtle"],
          CHARDESK_LIGHT_RENDER_THEME.background
        )
      );

    expect(textTokens.every((token) =>
      contrast(
        CHARDESK_DARK_RENDER_THEME[token],
        CHARDESK_DARK_RENDER_THEME.background
      ) >= 4.5
    )).toBe(true);
    expect(contrast(
      CHARDESK_DARK_RENDER_THEME["border-subtle"],
      CHARDESK_DARK_RENDER_THEME.background
    )).toBeGreaterThan(
      contrast(
        CHARDESK_DARK_RENDER_THEME["grid-subtle"],
        CHARDESK_DARK_RENDER_THEME.background
      )
    );
  });
});
