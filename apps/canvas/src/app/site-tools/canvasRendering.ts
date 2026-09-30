import type { TextRenderContext, TextRenderingRuntime } from "@/domains/document/public";

/** App-level composition: Canvas commands only receive rendering-neutral spans. */
export type CanvasToolRendering = Readonly<{
  render: TextRenderingRuntime["renderCompact"];
  getProfile: TextRenderingRuntime["getProfile"];
  getContext: () => TextRenderContext;
}>;

export const describeCanvasWriteRendering = (rendering: CanvasToolRendering): string => {
  const profile = rendering.getProfile();
  return `Write rendering (current settings, not content provenance): ${JSON.stringify({
    mode: profile.mode,
    theme: rendering.getContext().themeMode,
    markdownWrapWidth: profile.markdownWrapEnabled ? profile.markdownWrapWidth : null,
    features: Object.fromEntries(Object.entries(profile.features).map(([id, feature]) => [id, feature.enabled])),
  })}\nWrite accepts text using these settings; only rendered Cells are stored, not the input source. Source-backed Canvases require source-file editing.`;
};
