import type { UiRuntimeTheme } from "@chardesk/ui";
import type { CanvasArtifactPalette } from "@/shared/metrics/artifactPalette";
import { DEFAULT_ARTIFACT_CANVAS_PALETTE } from "@/shared/metrics/artifactPalette";
import { areJsonValuesEqual } from "@/shared/utils/equality";

export type ResolvedCanvasTheme = "light" | "dark";
export type CanvasVisualTheme = UiRuntimeTheme;
export type CanvasInteractionPalette = UiRuntimeTheme["canvas"];

export type CanvasAppearanceSnapshot = Readonly<{
  resolvedTheme: ResolvedCanvasTheme;
  visualTheme: CanvasVisualTheme | null;
  palette: CanvasArtifactPalette;
  revision: number;
}>;

const freezeVisualTheme = (theme: CanvasVisualTheme): CanvasVisualTheme =>
  Object.freeze({
    host: Object.freeze({ ...theme.host }),
    motion: Object.freeze({ ...theme.motion }),
    surface: Object.freeze({ ...theme.surface }),
    canvas: Object.freeze({
      ...theme.canvas,
      artifact: Object.freeze({ ...theme.canvas.artifact }),
    }),
  });

const toArtifactPalette = (
  theme: CanvasVisualTheme
): CanvasArtifactPalette => Object.freeze({
  color: theme.canvas.artifact.foreground,
  background: theme.canvas.artifact.background,
  grid: theme.canvas.artifact.grid,
});

/** Host-theme projection for Canvas consumers, including imperative commands. */
export function createCanvasAppearanceRuntime() {
  let snapshot: CanvasAppearanceSnapshot = {
    resolvedTheme: "light",
    visualTheme: null,
    palette: DEFAULT_ARTIFACT_CANVAS_PALETTE,
    revision: 0,
  };
  let disposed = false;
  const listeners = new Set<() => void>();

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    sync: (
      resolvedTheme: ResolvedCanvasTheme,
      visualTheme: CanvasVisualTheme
    ) => {
      if (
        disposed ||
        (snapshot.resolvedTheme === resolvedTheme &&
          areJsonValuesEqual(snapshot.visualTheme, visualTheme))
      ) return;
      const frozenTheme = freezeVisualTheme(visualTheme);
      snapshot = {
        resolvedTheme,
        visualTheme: frozenTheme,
        palette: toArtifactPalette(frozenTheme),
        revision: snapshot.revision + 1,
      };
      listeners.forEach((listener) => listener());
    },
    dispose: () => {
      disposed = true;
      listeners.clear();
    },
  };
}

export type CanvasAppearanceRuntime = ReturnType<
  typeof createCanvasAppearanceRuntime
>;
