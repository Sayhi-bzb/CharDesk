import { afterEach, describe, expect, it, vi } from "vitest";

import { readUiRuntimeTheme } from "./runtime-theme.js";

const colors: Record<string, string> = {
  "--background": "rgb(250, 250, 250)",
  "--foreground": "rgb(20, 20, 20)",
  "--dialog-overlay": "rgba(20, 20, 20, 0.32)",
  "--canvas-preview-text": "rgb(20, 20, 20)",
  "--canvas-artifact-background": "rgb(250, 250, 250)",
  "--canvas-artifact-foreground": "rgb(20, 20, 20)",
  "--canvas-artifact-grid": "rgb(230, 230, 230)",
  "--canvas-selection-surface": "rgba(10, 20, 30, 0.12)",
  "--canvas-selection-border": "rgb(10, 20, 30)",
  "--canvas-text-cursor-surface": "rgb(20, 20, 20)",
  "--canvas-text-cursor-foreground": "rgb(250, 250, 250)",
  "--canvas-picker-outer": "rgb(250, 250, 250)",
  "--canvas-picker-inner": "rgb(20, 20, 20)",
  "--canvas-picker-accent": "rgb(180, 120, 0)",
  "--canvas-eraser-surface": "rgba(200, 0, 0, 0.3)",
  "--canvas-minimap-surface": "rgb(250, 250, 250)",
  "--canvas-minimap-content": "rgb(20, 20, 20)",
  "--canvas-minimap-viewport-surface": "rgba(80, 80, 80, 0.35)",
  "--canvas-minimap-viewport-border": "rgb(10, 20, 30)",
  "--canvas-workspace-surface": "rgb(240, 240, 240)",
  "--canvas-page-shadow": "rgba(20, 20, 20, 0.18)",
};

const tokenFrom = (value: string) => value.match(/var\((--[^)]+)\)/)?.[1] ?? "";

describe("readUiRuntimeTheme", () => {
  afterEach(() => vi.restoreAllMocks());

  it("resolves the complete typed runtime palette", () => {
    vi.spyOn(window, "getComputedStyle").mockImplementation((element) => ({
      color: colors[tokenFrom((element as HTMLElement).style.color)] ?? "",
      transitionDuration: "0.24s",
      borderTopLeftRadius: "12px",
    }) as CSSStyleDeclaration);

    const theme = readUiRuntimeTheme(document.body);
    expect(theme.motion.slowMs).toBe(240);
    expect(theme.surface.radiusPx).toBe(12);
    expect(theme.canvas.selectionBorder).toBe("rgb(10, 20, 30)");
    expect(theme.canvas.artifact).toEqual({
      foreground: "rgb(20, 20, 20)",
      background: "rgb(250, 250, 250)",
      grid: "rgb(230, 230, 230)",
    });
    expect(theme.host.previewText).toBe("rgb(20, 20, 20)");
  });

  it("fails with the missing contract field instead of using a local fallback", () => {
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      color: "",
      transitionDuration: "0.24s",
      borderTopLeftRadius: "12px",
    } as CSSStyleDeclaration);
    expect(() => readUiRuntimeTheme(document.body)).toThrow("--background");
  });
});
