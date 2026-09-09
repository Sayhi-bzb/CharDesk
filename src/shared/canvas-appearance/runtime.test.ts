import { describe, expect, it, vi } from "vitest";
import { createCanvasAppearanceRuntime } from "./runtime";
import { createCanvasVisualThemeFixture } from "./test-theme";

describe("CanvasAppearanceRuntime", () => {
  it("publishes only semantic appearance changes", () => {
    const runtime = createCanvasAppearanceRuntime();
    const listener = vi.fn();
    runtime.subscribe(listener);
    const visualTheme = createCanvasVisualThemeFixture({
      host: { previewText: "#eee" },
      canvas: {
        artifact: {
          foreground: "#eee",
          background: "#111",
          grid: "#222",
        },
        selectionBorder: "#ddd",
        textCursorSurface: "#eee",
      },
    });

    runtime.sync("dark", visualTheme);
    runtime.sync("dark", createCanvasVisualThemeFixture({
      host: { previewText: "#eee" },
      canvas: {
        artifact: {
          foreground: "#eee",
          background: "#111",
          grid: "#222",
        },
        selectionBorder: "#ddd",
        textCursorSurface: "#eee",
      },
    }));

    expect(runtime.getSnapshot()).toEqual({
      resolvedTheme: "dark",
      visualTheme,
      palette: { color: "#eee", background: "#111", grid: "#222" },
      revision: 1,
    });
    expect(listener).toHaveBeenCalledOnce();
  });
});
