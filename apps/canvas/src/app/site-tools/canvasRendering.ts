import type { TextRenderContext, TextRenderingRuntime } from "@/domains/document/public";

/** App-level composition: Canvas commands only receive rendering-neutral spans. */
export type CanvasToolRendering = Readonly<{
  render: TextRenderingRuntime["renderCompact"];
  getProfile: TextRenderingRuntime["getProfile"];
  getContext: () => TextRenderContext;
}>;

export const describeCanvasWriteRendering = (rendering: CanvasToolRendering): string => {
  const profile = rendering.getProfile();
  const features = Object.entries(profile.features);
  const disabled = features.filter(([, feature]) => !feature.enabled).map(([id]) => id);
  const featureSummary = disabled.length === 0
    ? "markdown=all"
    : `markdown=${features.length - disabled.length}/${features.length};disabled=${disabled.join(",")}`;
  const wrap = profile.markdownWrapEnabled ? `wrap=${profile.markdownWrapWidth}` : "wrap=off";
  return `Write rendering (current settings, not content provenance): mode=${profile.mode} theme=${rendering.getContext().themeMode} ${wrap} ${featureSummary}\nWrite accepts text using these settings; only rendered Cells are stored, not the input source. Source-backed Canvases require source-file editing.`;
};
