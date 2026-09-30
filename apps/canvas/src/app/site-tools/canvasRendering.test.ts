import { describe, expect, it } from "vitest";
import { describeCanvasWriteRendering } from "./canvasRendering";
import type { CanvasToolRendering } from "./canvasRendering";

const rendering = (overrides: Record<string, boolean> = {}) => ({
  getProfile: () => ({
    mode: "auto",
    markdownWrapEnabled: true,
    markdownWrapWidth: 80,
    features: {
      "markdown.strong": { enabled: overrides["markdown.strong"] ?? true },
      "markdown.table": { enabled: overrides["markdown.table"] ?? true },
    },
  }),
  getContext: () => ({ themeMode: "light" }),
}) as unknown as CanvasToolRendering;

describe("Canvas write rendering note", () => {
  it("uses a compact summary when all features are enabled", () => {
    const note = describeCanvasWriteRendering(rendering());
    expect(note).toContain("mode=auto theme=light wrap=80 markdown=all");
    expect(note).not.toContain("markdown.strong");
    expect(note.length).toBeLessThan(300);
  });

  it("names disabled features without expanding the full feature map", () => {
    const note = describeCanvasWriteRendering(rendering({ "markdown.table": false }));
    expect(note).toContain("markdown=1/2;disabled=markdown.table");
    expect(note).not.toContain('"features"');
  });
});
