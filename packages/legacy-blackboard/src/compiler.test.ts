import { describe, expect, it } from "vitest";
import { compileBlackboard } from "./compiler.js";

const source = (panelPath = "panels/content.panel") => `
chardesk: blackboard/v1
panels:
  content: { source: ${panelPath} }
layout:
  areas: [[content]]
`;

describe("compileBlackboard", () => {
  it("compiles ordered Slide panels and defaults every page to auto size", async () => {
    const panels = new Map([
      ["panels/opening.panel", "# GPU"],
      ["panels/details.panel", "```mermaid\nflowchart LR\nA --> B\n```"],
    ]);
    const compiled = await compileBlackboard({
      manifestSource: `
chardesk: blackboard/v2
mode: slide
title: GPU deck
panels:
  opening: { source: panels/opening.panel, title: Opening }
  details: { source: panels/details.panel, title: Details, size: 80x24 }
layout:
  pages: [opening, details]
`,
      fallbackTitle: "fallback",
      readPanel: async ({ source: path }) => panels.get(path)!,
    });

    expect(compiled).toMatchObject({ mode: "slide", title: "GPU deck" });
    expect(compiled.source).toContain("## Opening\n\n```chargraph size=auto");
    expect(compiled.source).toContain("## Details\n\n````chargraph size=80x24");
  });

  it("uses an injected Panel reader and the directory fallback title", async () => {
    const readPanel = async () => "[1m界[0m\n|||\n👩‍💻";
    await expect(compileBlackboard({
      manifestSource: source(),
      fallbackTitle: "gpu",
      readPanel,
    })).resolves.toMatchObject({
      mode: "freeform",
      title: "gpu",
      source: expect.stringContaining("👩‍💻"),
    });
  });

  it("materializes the standard CharGraph semantic colors", async () => {
    const readPanel = async () => [
      "```mermaid",
      "flowchart LR",
      "  A[GPU] --> B[Pixels]",
      "```",
      "",
      "```json",
      '{"kind":"graphics"}',
      "```",
    ].join("\n");
    const compiled = await compileBlackboard({
      manifestSource: source(),
      fallbackTitle: "gpu",
      readPanel,
    });

    expect(compiled.source).toContain("[38;2;9;105;218m");
    expect(compiled.source).toContain("[38;2;26;127;55m");
  });

  it("keeps explicit ANSI color above CharGraph semantic color", async () => {
    const compiled = await compileBlackboard({
      manifestSource: source(),
      fallbackTitle: "gpu",
      readPanel: async () => "[38;2;1;2;3m**custom**[0m",
    });

    expect(compiled.source).toContain("38;2;1;2;3m");
  });

  it.each([
    "../outside.panel",
    "/outside.panel",
    "panels\\outside.panel",
    "panels/./outside.panel",
  ])("rejects non-portable Panel path %s before reading", async (panelPath) => {
    const readPanel = async () => "unreachable";
    await expect(compileBlackboard({
      manifestSource: source(panelPath),
      fallbackTitle: "gpu",
      readPanel,
    })).rejects.toMatchObject({ code: "invalid-panel-path", panel: "content" });
  });
});
