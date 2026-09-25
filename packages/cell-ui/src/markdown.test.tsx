import { describe, expect, it } from "vitest";
import {
  Box, CellUiRuntime, FocusManager, Markdown, Root, ScrollArea, Text,
  auditSemanticSnapshot, commandForInput, createCellRangeSnapshot, createKeyInput,
  resolveCellUiTheme, type MarkdownCodeBlock,
} from "./index.js";
import { CLASSIC_MAC_DARK_THEME, CLASSIC_MAC_LIGHT_THEME } from "./theme.js";

describe("Markdown reading projection", () => {
  it("renders prose and inline styles without source delimiters, then copies what is visible", () => {
    const source = "# Notes\n\n**Bold** *italic* ~~old~~ and `code`.";
    const runtime = new CellUiRuntime({ viewport: { width: 40, height: 6 } });
    const frame = runtime.render(<Root><Markdown source={source} /></Root>);
    const text = frame.buffer.toText({ trimEnd: true });
    expect(text).toContain("Notes\n\nBold italic old and code.");
    expect(text).not.toContain("**");
    expect(text).not.toContain("~~");
    expect(frame.buffer.get(0, 0)?.style).toMatchObject({ bold: true, color: CLASSIC_MAC_LIGHT_THEME.markdownColors.accent });
    expect(frame.buffer.get(0, 2)?.style.bold).toBe(true);
    expect(frame.buffer.get(5, 2)?.style.italic).toBe(true);
    expect(frame.buffer.get(12, 2)?.style.strike).toBe(true);
    expect(frame.buffer.get(20, 2)?.style.backgroundColor).toBe(CLASSIC_MAC_LIGHT_THEME.markdownColors.codeBackground);
    expect(createCellRangeSnapshot(frame.buffer, { x: 0, y: 0 }, { x: 39, y: 2 })?.text)
      .toBe("Notes\n\nBold italic old and code.");
    runtime.dispose();
  });

  it("keeps safe links actionable and leaves unsafe URLs and raw HTML inert", () => {
    const source = "[Guide](https://example.com) [Bad](javascript:alert(1))\n\n![Flow](flow.png)\n\n<img src=x onerror=alert(1)>";
    const runtime = new CellUiRuntime({ viewport: { width: 45, height: 10 } });
    const frame = runtime.render(<Root><Markdown source={source} /></Root>);
    expect(frame.buffer.toText({ trimEnd: true })).toContain("Guide Bad\n\n[Image: Flow]\n\n[HTML omitted]");
    const links = [...frame.semantics.nodes.values()].filter((node) => node.role === "link");
    expect(links.map(({ href }) => href)).toEqual(["https://example.com", "flow.png"]);
    expect(auditSemanticSnapshot(frame.semantics)).toEqual([]);
    const focus = new FocusManager();
    expect(commandForInput({ type: "semantic", targetId: links[0]!.id, action: "activate" }, frame, focus))
      .toEqual({ type: "open-link", targetId: links[0]!.id, href: "https://example.com" });
    focus.sync(frame.tree, links[0]!.id);
    expect(commandForInput(createKeyInput({ key: "Enter", phase: "down" }), frame, focus))
      .toEqual({ type: "open-link", targetId: links[0]!.id, href: "https://example.com" });
    runtime.dispose();
  });

  it("renders nested lists, tasks, quotes, rules, and table values as readable Cells", () => {
    const source = "- [x] Parent\n  - Child\n\n> Quote\n\n---\n\n| Name | Value |\n| :--- | ---: |\n| A | 世界 |";
    const runtime = new CellUiRuntime({ viewport: { width: 32, height: 14 } });
    const frame = runtime.render(<Root><Markdown source={source} /></Root>);
    const text = frame.buffer.toText({ trimEnd: true });
    expect(text).toContain("☑ Parent");
    expect(text).toContain("• Child");
    expect(text).toContain("│ Quote");
    expect(text).toContain("───");
    expect(text).toContain("Name  Value");
    expect(text).toMatch(/A\s+世界/u);
    expect(text).not.toContain("| :---");
    expect([...frame.semantics.nodes.values()].map(({ role }) => role)).toEqual(expect.arrayContaining([
      "list", "listitem", "blockquote", "table", "row", "cell",
    ]));
    expect(auditSemanticSnapshot(frame.semantics)).toEqual([]);
    runtime.dispose();
  });

  it("keeps wide rendered tables and code horizontally scrollable", () => {
    const source = "| A very long heading | Another heading |\n| --- | --- |\n| x | y |\n\n```ts\nconst longValue = 12345678901234567890;\n```";
    const runtime = new CellUiRuntime({ viewport: { width: 16, height: 8 } });
    const render = (scrollX: number) => runtime.render(<Root><ScrollArea id="markdown-scroll" scrollX={scrollX}
      style={{ width: 16, height: 8 }}><Markdown source={source} /></ScrollArea></Root>);
    const first = render(0);
    expect(first.scene.entries.get("markdown-scroll")?.scrollMetrics?.horizontalTrack).toBeDefined();
    expect(first.buffer.toText({ trimEnd: true })).toContain("A very long");
    expect(render(20).buffer.toText({ trimEnd: true })).toContain("heading");
    runtime.dispose();
  });

  it("hides code fences but preserves code bytes and optional highlighted spans", () => {
    const source = "```ts\nconst ready = true;\n```";
    const runtime = new CellUiRuntime({ viewport: { width: 30, height: 5 } });
    const frame = runtime.render(<Root><Markdown source={source} highlightCodeLine={(line) => [
      { content: line.slice(0, 5), color: "#123456" }, { content: line.slice(5) },
    ]} /></Root>);
    const text = frame.buffer.toText({ trimEnd: true });
    expect(text).toContain("const ready = true;");
    expect(text).not.toContain("```");
    const codeCell = frame.buffer.get(1, 1);
    expect(codeCell?.style.color).toBe("#123456");
    runtime.dispose();
  });

  it("retains raw code metadata for a Cell descriptor slot", () => {
    const source = "Before\n\n```js\none\n```\n\nBetween\n\n```ts\ntwo\n```\n\nAfter";
    const seen: MarkdownCodeBlock[] = [];
    const runtime = new CellUiRuntime({ viewport: { width: 24, height: 16 } });
    const frame = runtime.render(<Root><Markdown source={source} renderCodeBlock={(block) => {
      seen.push(block);
      return <Box id={"slot-" + block.index}><Text>{"slot " + block.index}</Text></Box>;
    }} /></Root>);
    expect(seen).toMatchObject([
      { index: 0, startLine: 2, endLine: 5, language: "js", code: "one", raw: "```js\none\n```" },
      { index: 1, startLine: 8, endLine: 11, language: "ts", code: "two", raw: "```ts\ntwo\n```" },
    ]);
    expect(frame.buffer.toText({ trimEnd: true })).toContain("Before\n\nslot 0\n\nBetween\n\nslot 1\n\nAfter");
    runtime.dispose();
  });

  it("resolves code and link colors from the current theme", () => {
    const theme = resolveCellUiTheme({ background: "#000000", foreground: "#FFFFFF" });
    const runtime = new CellUiRuntime({ viewport: { width: 24, height: 3 }, theme });
    const frame = runtime.render(<Root><Markdown source="`code` [Guide](https://example.com)" /></Root>);
    expect(frame.buffer.get(0, 0)?.style).toMatchObject({
      color: CLASSIC_MAC_DARK_THEME.markdownColors.codeForeground,
      backgroundColor: CLASSIC_MAC_DARK_THEME.markdownColors.codeBackground,
    });
    runtime.setTheme({ markdownColors: { link: "#123456", codeBackground: "#eeeeee" } });
    const rethemed = runtime.render(<Root><Markdown source="`code` [Guide](https://example.com)" /></Root>);
    expect(rethemed.buffer.get(5, 0)?.style.color).toBe("#123456");
    runtime.dispose();
  });

  it("accepts an empty source", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 12, height: 3 } });
    expect(() => runtime.render(<Root><Markdown source="" /></Root>)).not.toThrow();
    runtime.dispose();
  });
});
