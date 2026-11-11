import { expect, it } from "vitest";
import { compileCharDeskText, materializeCompiledCharDeskText } from "./compiler.js";
import { createCharDeskMarkdownRenderOptions } from "./markdown-theme.js";

it("styles literal source without consuming Markdown characters or indentation", async () => {
  const source = "**literal**\n              ↓ 检查";
  const result = await compileCharDeskText(source, {
    semanticSpans: [{ from: 0, to: 11, roles: ["strong"] }],
    markdown: createCharDeskMarkdownRenderOptions(),
  });
  expect(result.plainText).toBe(source);
  const cells = materializeCompiledCharDeskText(result).cells;
  expect(cells.find(cell => cell.text === "↓")).toMatchObject({ x: 14, y: 1 });
  expect(cells[0]).toMatchObject({ text: "*", attrs: { bold: true }, color: "#0969da" });
});

it("keeps HTML code literal, unwrapped, and syntax-highlighted using shared code rendering", async () => {
  const source = "    const message = 'long code stays on the original line';";
  const result = await compileCharDeskText(source, {
    semanticSpans: [{ from: 0, to: source.length, roles: [], preformatted: true, codeBlockId: 0, codeLanguage: "js" }],
    markdown: { ...createCharDeskMarkdownRenderOptions(), proseWrapWidth: 12 },
  });
  expect(result.plainText).toBe(source);
  expect(result.height).toBe(1);
  expect(result.fragments.find(part => part.text.includes("const"))?.color?.toLowerCase()).toBe("#0969da");
  expect(result.fragments.find(part => part.text.includes("long code"))?.color?.toLowerCase()).toBe("#1a7f37");
});

it("keeps heading metadata aligned after semantic text wraps", async () => {
  const first = "A long heading with several words";
  const source = first + "\nNext";
  const result = await compileCharDeskText(source, {
    semanticSpans: [
      { from: 0, to: first.length, roles: ["heading-1"], headingLevel: 1 },
      { from: first.length + 1, to: source.length, roles: ["heading-2"], headingLevel: 2 },
    ],
    markdown: { ...createCharDeskMarkdownRenderOptions(), proseWrapWidth: 12 },
  });
  expect(result.headings).toEqual([
    { row: 0, level: 1, label: first },
    { row: result.height - 1, level: 2, label: "Next" },
  ]);
});

it("honors disabled features and per-feature colors on semantic spans", async () => {
  const result = await compileCharDeskText("bold code", {
    semanticSpans: [
      { from: 0, to: 4, roles: ["strong", "link"], href: "https://example.com" },
      { from: 5, to: 9, roles: ["inline-code"] },
    ],
    markdown: createCharDeskMarkdownRenderOptions({ features: {
      strong: { enabled: false }, link: { enabled: false },
      "inline-code": { colors: { foreground: "#123456" } },
    } }),
  });
  expect(result.plainText).toBe("bold code");
  expect(result.fragments[0]?.attrs?.bold).not.toBe(true);
  expect(result.fragments[0]?.href).toBeUndefined();
  expect(result.fragments.find(part => part.text === "code")?.color).toBe("#123456");
});

it("keeps a wide emoji grapheme intact when an HTML style boundary crosses its code points", async () => {
  const result = await compileCharDeskText("👩‍💻界", {
    semanticSpans: [{ from: 0, to: 2, roles: ["strong"] }],
  });
  expect(materializeCompiledCharDeskText(result).cells.map(cell => ({ x: cell.x, width: cell.width, text: cell.text })))
    .toEqual([{ x: 0, width: 2, text: "👩‍💻" }, { x: 2, width: 2, text: "界" }]);
});
