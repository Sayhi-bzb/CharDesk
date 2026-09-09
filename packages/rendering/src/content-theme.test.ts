import { describe, expect, it } from "vitest";
import {
  CHARDESK_CONTENT_THEME_TOKENS,
  CHARDESK_CONTENT_THEMES,
  resolveCharDeskContentTheme,
} from "./content-theme";

describe("content theme", () => {
  it("provides complete light and dark palettes", () => {
    expect(Object.keys(CHARDESK_CONTENT_THEMES.light)).toEqual(
      CHARDESK_CONTENT_THEME_TOKENS
    );
    expect(Object.keys(CHARDESK_CONTENT_THEMES.dark)).toEqual(
      CHARDESK_CONTENT_THEME_TOKENS
    );
  });

  it("resolves overrides and legacy muted input", () => {
    expect(resolveCharDeskContentTheme({
      accent: "#123456",
      muted: "#654321",
    })).toMatchObject({
      accent: "#123456",
      "muted-foreground": "#654321",
      "border-subtle": "#654321",
      "grid-subtle": "#654321",
    });
  });
});
