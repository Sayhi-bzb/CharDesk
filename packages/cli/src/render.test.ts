import { describe, expect, it } from "vitest";
import { decodeCharDeskTextRuns } from "@chardesk/protocol";
import {
  CharDeskCliRenderError,
  compileInspectSource,
  compileSource,
  renderSource,
  renderSourceToPng,
} from "./render.js";

const expectPng = (bytes: Uint8Array) => {
  expect(Array.from(bytes.slice(0, 8))).toEqual([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
};

describe("headless CharDesk PNG renderer", () => {
  it("inspects retired delimiters in the same grid used for rendering", async () => {
    const source = "A\n|||\nB";
    const result = await compileInspectSource({ source, inputMode: "chargraph" });
    expect(result).toMatchObject({ projection: "canvas", columns: 3, rows: 3 });
    expect(result.document.plainText).toBe(source);
  });

  it("renders CharGraph Markdown without a DOM", async () => {
    const result = await renderSourceToPng({
      source: [
        "# Status",
        "|||",
        "```json",
        '{"ready":true}',
        "```",
        "---",
        "中文🙂",
      ].join("\n"),
      inputMode: "chargraph",
      scale: 1,
      padding: 0,
    });

    expectPng(result.bytes);
    expect(result).toMatchObject({
      renderer: "markdown",
      pipeline: ["markdown"],
      diagnostics: [],
    });
    expect(result.columns).toBeGreaterThan(0);
    expect(result.rows).toBeGreaterThan(1);
    expect(result.width).toBe(result.columns * 9);
  });

  it("renders materialized ESC-less ANSI without running Markdown", async () => {
    const result = await renderSourceToPng({
      source: "[31;1mRed 界[0m",
      inputMode: "chardesk",
      scale: 1,
    });

    expectPng(result.bytes);
    expect(result).toMatchObject({
      renderer: "chardesk",
      pipeline: ["chardesk"],
      columns: 6,
      rows: 1,
      diagnostics: [],
    });
  });

  it("rasterizes TeX function operators without native fallback crashes", async () => {
    const result = await renderSourceToPng({
      source: String.raw`$$v = \frac{V_{\max}[S]}{K_m(1 + \frac{[I]}{K_i}) + [S]}$$`,
      inputMode: "chargraph",
      scale: 1,
    });

    expectPng(result.bytes);
    expect(result.diagnostics).toEqual([]);
  });

  it("materializes one compilation as plain, ANSI, and ESC-less CharDesk text", async () => {
    const options = {
      source: "**Ready** 界",
      inputMode: "chargraph" as const,
    };
    const plain = await renderSource({ ...options, format: "text" });
    const ansi = await renderSource({ ...options, format: "ansi" });
    const chardesk = await renderSource({ ...options, format: "chardesk" });

    expect(new TextDecoder().decode(plain.bytes)).toBe("Ready 界");
    expect(new TextDecoder().decode(ansi.bytes)).toContain("\u001b[");
    const chardeskText = new TextDecoder().decode(chardesk.bytes);
    expect(chardeskText).not.toContain("\u001b");
    expect(chardeskText).toContain("[1m");
    expect(decodeCharDeskTextRuns(chardeskText, { syntax: "ansi" }))
      .toMatchObject({ text: "Ready 界", diagnostics: [] });
    expect(plain).toMatchObject({ columns: 8, rows: 1, diagnostics: [] });
  });

  it("checks content without loading a raster backend", async () => {
    await expect(compileSource({
      source: "```mermaid\nflowchart LR\nA-->B\n```",
      inputMode: "chargraph",
    })).resolves.toMatchObject({
      renderer: "markdown",
      pipeline: ["markdown"],
      diagnostics: [],
    });
  });

  it("renders unsupported Mermaid source while keeping diagnostics out of the artifact", async () => {
    const source = "```mermaid\nflowchart LR\nA-->B\nclick A https://example.com\n```";
    const result = await renderSource({
      source,
      inputMode: "chargraph",
      format: "text",
    });
    const artifact = new TextDecoder().decode(result.bytes);

    expect(artifact).toBe(source);
    expect(artifact).not.toContain("Mermaid source preserved:");
    expect(result.diagnostics[0]?.message)
      .toMatch(/^Mermaid source preserved:/u);
  });

  it("rejects terminal escapes and oversized images", async () => {
    await expect(renderSourceToPng({
      source: "\u001b[31mRed\u001b[0m",
      inputMode: "chardesk",
    })).rejects.toMatchObject<Partial<CharDeskCliRenderError>>({
      code: "terminal-escape",
    });

    await expect(renderSourceToPng({
      source: "A".repeat(1000),
      inputMode: "chargraph",
      scale: 4,
    })).rejects.toMatchObject<Partial<CharDeskCliRenderError>>({
      code: "image-too-large",
    });
  });
});
