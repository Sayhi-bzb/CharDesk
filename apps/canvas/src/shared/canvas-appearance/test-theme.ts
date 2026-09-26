import type { CanvasVisualTheme } from "./runtime";

type CanvasVisualThemeOverrides = Readonly<{
  host?: Partial<CanvasVisualTheme["host"]>;
  motion?: Partial<CanvasVisualTheme["motion"]>;
  surface?: Partial<CanvasVisualTheme["surface"]>;
  canvas?: Partial<Omit<CanvasVisualTheme["canvas"], "artifact">> & {
    artifact?: Partial<CanvasVisualTheme["canvas"]["artifact"]>;
  };
}>;

export const createCanvasVisualThemeFixture = (
  overrides: CanvasVisualThemeOverrides = {}
): CanvasVisualTheme => ({
  host: {
    background: "#ffffff",
    foreground: "#000000",
    overlay: "rgba(0, 0, 0, 0.3)",
    previewText: "#000000",
    ...overrides.host,
  },
  motion: { slowMs: 240, reduced: false, ...overrides.motion },
  surface: { radiusPx: 12, ...overrides.surface },
  canvas: {
    selectionSurface: "rgba(0, 0, 0, 0.12)",
    selectionBorder: "#000000",
    rangeSurface: "rgba(0, 0, 0, 0.12)",
    rangeBorder: "#000000",
    rangeSurfaceEffect: "tint",
    textCursorSurface: "#000000",
    textCursorForeground: "#ffffff",
    pickerOuter: "#ffffff",
    pickerInner: "#000000",
    pickerAccent: "#996600",
    eraserSurface: "rgba(255, 0, 0, 0.3)",
    minimapSurface: "#ffffff",
    minimapContent: "#000000",
    minimapViewportSurface: "rgba(0, 0, 0, 0.35)",
    minimapViewportBorder: "#000000",
    workspaceSurface: "#f5f5f5",
    pageShadow: "rgba(0, 0, 0, 0.18)",
    ...overrides.canvas,
    artifact: {
      foreground: "#000000",
      background: "#ffffff",
      grid: "#eeeeee",
      ...overrides.canvas?.artifact,
    },
  },
});
