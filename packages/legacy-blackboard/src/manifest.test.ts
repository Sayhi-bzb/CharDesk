import { describe, expect, it } from "vitest";
import { parseBlackboardManifest } from "./manifest.js";

const manifest = (areas: string, extra = "") => `
chardesk: blackboard/v1
title: GPU
panels:
  introduction:
    source: panels/introduction.panel
  architecture:
    source: panels/architecture.panel
  draft:
    source: panels/draft.panel
layout:
  areas: ${areas}
${extra}`;

describe("parseBlackboardManifest", () => {
  it("decodes ordered Slide panels with auto size by default", () => {
    const parsed = parseBlackboardManifest(`
chardesk: blackboard/v2
mode: slide
title: GPU deck
panels:
  opening:
    source: panels/opening.panel
    title: Opening
  details:
    source: panels/details.panel
    size: 80x24
  draft:
    source: panels/draft.panel
layout:
  pages: [opening, details]
`);

    expect(parsed.manifest).toMatchObject({
      chardesk: "blackboard/v2",
      mode: "slide",
      panels: {
        opening: { source: "panels/opening.panel", title: "Opening" },
        details: { source: "panels/details.panel", size: "80x24" },
      },
      layout: { pages: ["opening", "details"] },
    });
    expect(parsed.manifest.panels.opening?.size).toBeUndefined();
    expect(parsed.warnings).toEqual([
      expect.objectContaining({ code: "unused-panel", panel: "draft" }),
    ]);
  });

  it("decodes named rectangular areas and default gaps", () => {
    const parsed = parseBlackboardManifest(manifest(
      "[[introduction, architecture], [null, architecture]]",
    ));
    expect(parsed.manifest).toMatchObject({
      chardesk: "blackboard/v1",
      title: "GPU",
      layout: {
        areas: [["introduction", "architecture"], [null, "architecture"]],
        gap: { column: 4, row: 1 },
      },
    });
    expect(parsed.warnings).toEqual([
      expect.objectContaining({ code: "unused-panel", panel: "draft" }),
    ]);
  });

  it("accepts explicit zero gaps", () => {
    const parsed = parseBlackboardManifest(manifest(
      "[[introduction, architecture]]",
      "  gap: { column: 0, row: 0 }",
    ));
    expect(parsed.manifest.layout.gap).toEqual({ column: 0, row: 0 });
  });

  it.each([
    ["unknown fields", `${manifest("[[introduction]]")}\ncolor: red`, "color is not supported"],
    ["unknown panels", manifest("[[missing]]"), "unknown panel"],
    [
      "duplicate Slide pages",
      `chardesk: blackboard/v2\nmode: slide\npanels:\n  a: { source: a.panel }\nlayout:\n  pages: [a, a]`,
      "duplicate panel",
    ],
    ["ragged matrices", manifest("[[introduction, architecture], [architecture]]"), "exactly 2"],
    [
      "non-rectangular spans",
      manifest("[[architecture, architecture], [architecture, introduction]]"),
      "filled rectangle",
    ],
  ])("rejects %s", (_name, source, message) => {
    expect(() => parseBlackboardManifest(source)).toThrow(message);
  });
});
