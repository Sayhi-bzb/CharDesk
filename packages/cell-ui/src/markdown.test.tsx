import { describe, expect, it } from "vitest";
import {
  Box, CellUiRuntime, FocusManager, Markdown, Root, ScrollArea, Text,
  auditSemanticSnapshot, commandForInput, createCellRangeSnapshot, createKeyInput,
  resolveCellUiTheme, type MarkdownCodeBlock,
} from "./index.js";
import { CLASSIC_MAC_DARK_THEME, CLASSIC_MAC_LIGHT_THEME } from "./theme.js";
import { hitTest } from "./scene.js";
import { revealCommandForTarget } from "./interaction.js";

describe("Markdown reading projection", () => {
  it("flows mixed Chinese and Latin prose across inline token boundaries", () => {
    const source = "19 世纪中后期麦克斯韦和玻尔兹曼共同提出玻尔兹曼分布。\n\n1985 年 Hinton 引入统计力学的玻尔兹曼分布。";
    const runtime = new CellUiRuntime({ viewport: { width: 42, height: 8 } });
    const frame = runtime.render(<Root><Markdown source={source} /></Root>);
    const lines = frame.buffer.toText({ trimEnd: true }).split("\n");
    expect(lines[0]).toMatch(/^19 世纪/u);
    expect(lines[3]).toMatch(/^1985 年 Hinton 引入/u);
    runtime.dispose();
  });

  it("keeps styles and one actionable link across wrapped inline lines", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 14, height: 8 } });
    const frame = runtime.render(<Root><Markdown source="19 **世纪** [阅读一份很长的指南](https://example.com) 结尾" /></Root>);
    const lines = frame.buffer.toText({ trimEnd: true }).split("\n");
    expect(lines[0]).toMatch(/^19 世纪/u);
    expect(frame.buffer.get(3, 0)?.style.bold).toBe(true);
    const links = [...frame.semantics.nodes.values()].filter((node) => node.role === "link");
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ label: "阅读一份很长的指南", href: "https://example.com" });
    const regions = frame.scene.entries.get(links[0]!.id)?.hitRegions ?? [];
    expect(new Set(regions.map((region) => region.y)).size).toBeGreaterThan(1);
    for (const region of regions) expect(hitTest(frame.scene, { x: region.x, y: region.y })[0]).toBe(links[0]!.id);
    expect(auditSemanticSnapshot(frame.semantics)).toEqual([]);
    runtime.dispose();
  });
  it("renders prose and inline styles without source delimiters, then copies what is visible", () => {
    const source = "# Notes\n\n**Bold** *italic* ~~old~~ and `code`.";
    const runtime = new CellUiRuntime({ viewport: { width: 40, height: 6 } });
    const frame = runtime.render(<Root><Markdown source={source} /></Root>);
    const text = frame.buffer.toText({ trimEnd: true });
    expect(text).toContain("# Notes\n\nBold italic old and code.");
    expect(text).not.toContain("**");
    expect(text).not.toContain("~~");
    expect(frame.buffer.get(0, 0)?.style).toMatchObject({ color: CLASSIC_MAC_LIGHT_THEME.markdownColors.accent });
    expect(frame.buffer.get(0, 0)?.style.bold).not.toBe(true);
    expect(frame.buffer.get(2, 0)?.style.bold).toBe(true);
    expect(frame.buffer.get(0, 2)?.style.bold).toBe(true);
    expect(frame.buffer.get(5, 2)?.style.italic).toBe(true);
    expect(frame.buffer.get(12, 2)?.style.strike).toBe(true);
    expect(frame.buffer.get(20, 2)?.style.backgroundColor).toBe(CLASSIC_MAC_LIGHT_THEME.markdownColors.codeBackground);
    expect(createCellRangeSnapshot(frame.buffer, { x: 0, y: 0 }, { x: 39, y: 2 })?.text)
      .toBe("# Notes\n\nBold italic old and code.");
    runtime.dispose();
  });

  it("shows heading depth with plain hashes while keeping semantic names clean", () => {
    const source = Array.from({ length: 6 }, (_, index) => `${"#".repeat(index + 1)} Level ${index + 1}`).join("\n\n");
    const runtime = new CellUiRuntime({ viewport: { width: 24, height: 12 } });
    const frame = runtime.render(<Root><Markdown source={source} /></Root>);
    const lines = frame.buffer.toText({ trimEnd: true }).split("\n");
    for (let level = 1; level <= 6; level += 1) {
      const row = (level - 1) * 2;
      expect(lines[row]).toBe(`${"#".repeat(level)} Level ${level}`);
      expect(frame.buffer.get(0, row)?.style.bold).not.toBe(true);
      expect(frame.buffer.get(level + 1, row)?.style.bold).toBe(true);
    }
    const headings = [...frame.semantics.nodes.values()].filter((node) => node.role === "heading");
    expect(headings.map(({ level, label }) => ({ level, label }))).toEqual(
      Array.from({ length: 6 }, (_, index) => ({ level: index + 1, label: `Level ${index + 1}` })),
    );
    runtime.dispose();
  });

  it("keeps the heading marker visible when its title wraps", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 9, height: 4 } });
    const frame = runtime.render(<Root><Markdown source="### Long heading" /></Root>);
    expect(frame.buffer.toText({ trimEnd: true })).toContain("### Long");
    expect(frame.buffer.toText({ trimEnd: true })).toContain("heading");
    expect([...frame.semantics.nodes.values()].find((node) => node.role === "heading"))
      .toMatchObject({ level: 3, label: "Long heading" });
    runtime.dispose();
  });

  it("centers a five-slash rule and copies its visible characters", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 21, height: 1 } });
    const frame = runtime.render(<Root><Markdown source="---" /></Root>);
    expect(frame.buffer.toText({ trimEnd: true })).toBe("        /////");
    expect(createCellRangeSnapshot(frame.buffer, { x: 8, y: 0 }, { x: 12, y: 0 })?.text)
      .toBe("/////");
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
    expect(text).toContain("/////");
    expect(text).toContain("Name │ Value");
    expect(text).toContain("─────┼──────");
    expect(text).toMatch(/A\s+│\s+世界/u);
    expect(text).not.toContain("| :---");
    expect([...frame.semantics.nodes.values()].map(({ role }) => role)).toEqual(expect.arrayContaining([
      "list", "listitem", "blockquote", "table", "row", "cell",
    ]));
    expect(auditSemanticSnapshot(frame.semantics)).toEqual([]);
    runtime.dispose();
  });

  it("paints a continuous quote rail across wraps and paragraph gaps without copying it", () => {
    const source = "> First paragraph wraps across several Cell rows.\n>\n> Second paragraph also wraps.";
    const runtime = new CellUiRuntime({ viewport: { width: 18, height: 10 } });
    const frame = runtime.render(<Root><Markdown source={source} /></Root>);
    const lines = frame.buffer.toText({ trimEnd: true }).split("\n");
    const railRows = lines.flatMap((line, row) => line.startsWith("│") ? [row] : []);
    expect(railRows.length).toBeGreaterThan(3);
    expect(railRows).toEqual(Array.from({ length: railRows.length }, (_, index) => index));
    const copied = createCellRangeSnapshot(frame.buffer, { x: 0, y: 0 }, { x: 17, y: railRows.at(-1)! })?.text;
    expect(copied).toContain("First paragraph");
    expect(copied).toContain("Second paragraph");
    expect(copied).not.toContain("│");
    runtime.dispose();
  });

  it("constrains wrapped and two-digit Markdown list items to the viewport", () => {
    const source = "9. First item wraps after these words\n10. Second item wraps after these words\n11. Third item wraps after these words";
    const runtime = new CellUiRuntime({ viewport: { width: 20, height: 12 } });
    const frame = runtime.render(<Root><Markdown source={source} /></Root>);
    const text = frame.buffer.toText({ trimEnd: true });
    expect(text).toContain("9. First item");
    expect(text).toContain("10. Second item");
    expect(text).toContain("11. Third item");
    for (const node of frame.tree.nodes.values()) {
      if (node.kind !== "markdown-inline") continue;
      const bounds = frame.scene.entries.get(node.id)?.contentBounds;
      if (bounds) expect(bounds.x + bounds.width).toBeLessThanOrEqual(20);
    }
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
    expect(render(20).buffer.toText({ trimEnd: true })).toContain("Another");
    runtime.dispose();
  });

  it("includes links after nested blocks in the scrollable Markdown extent", () => {
    const source = "# Field Notes\n\nCells make **structure** readable.\n\nRead [Philosophy](#/guides/philosophy).\n\n## Checklist\n\n- [x] Build UI\n- [ ] Share it\n- Keep notes\n  - Include the details\n\n## Steps\n\n1. Write Markdown\n2. Render Cells\n\n> Source stays yours.\n\n---\n\n## Code\n\n```ts\nconst ready = true;\n```\n\n## Table\n\n| Element | Cell output |\n| :--- | ---: |\n| Link | Focusable |\n| List | Structured |\n\nRead [Installation](#/guides/installation).\n\n## Fallbacks\n\n~~Old wording~~ stays visible.";
    const runtime = new CellUiRuntime({ viewport: { width: 44, height: 28 } });
    const frame = runtime.render(<Root><ScrollArea id="document-scroll" style={{ width: 44, height: 27 }}>
      <Markdown source={source} />
    </ScrollArea></Root>);
    const link = [...frame.semantics.nodes.values()].find((node) => node.role === "link" && node.label === "Installation")!;
    const linkBounds = frame.scene.entries.get(link.id)!.layoutBounds;
    const metrics = frame.scene.entries.get("document-scroll")!.scrollMetrics!;
    expect(linkBounds.y + linkBounds.height).toBeLessThanOrEqual(metrics.viewport.y + metrics.viewport.height + metrics.maxOffset.y);
    runtime.dispose();
  });

  it("reveals offscreen Markdown links by their text Cells, not a layout placeholder", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 20, height: 3 } });
    const source = "First paragraph.\n\nSecond paragraph.\n\nRead [Installation](https://example.com).";
    const render = (scrollY: number) => runtime.render(<Root><ScrollArea id="document-scroll"
      scrollY={scrollY} style={{ width: 20, height: 3 }}><Markdown source={source} /></ScrollArea></Root>);
    const first = render(0);
    const link = [...first.semantics.nodes.values()].find((node) => node.role === "link")!;
    expect(first.scene.entries.get(link.id)?.layoutBounds.height).toBeGreaterThan(0);
    const command = revealCommandForTarget(first, link.id);
    expect(command).toMatchObject({ type: "focus", reveal: { targetId: "document-scroll" } });
    const scrollY = command?.type === "focus" ? command.reveal?.scrollY ?? 0 : 0;
    expect(render(scrollY).buffer.toText({ trimEnd: true })).toContain("Installation");
    runtime.dispose();
  });


  it("shares a standalone code block's trailing guard with scrollbar rails", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 12, height: 6 } });
    const source = "```ts\nabcdefghijklmnop\nsecond long line\nthird long line\n```";
    const render = (width: number, height?: number, scrollX = 0, scrollY = 0) => runtime.render(<Root>
      <ScrollArea id="code-scroll" scrollX={scrollX} scrollY={scrollY}
        style={{ width, height, paddingRight: 2 }}>
        <Markdown source={source} />
      </ScrollArea>
    </Root>);
    const fitting = render(24);
    expect(fitting.scene.entries.get("code-scroll")?.scrollMetrics?.horizontalTrack).toBeNull();
    expect(fitting.layout.entries.get("code-scroll")?.paddingInsets).toMatchObject({ right: 3, bottom: 1 });
    expect(fitting.tree.nodes.get("code-scroll/box[0]")?.sharedScrollGuard).toBe(false);
    expect(fitting.layout.entries.get("code-scroll/box[0]")?.paddingInsets).toMatchObject({ right: 0, bottom: 0 });

    const autoHeight = render(12);
    const lastCodeRow = Math.max(...[...autoHeight.tree.nodes.values()]
      .filter((node) => node.markdownRole === "code")
      .map((node) => {
        const bounds = autoHeight.scene.entries.get(node.id)!.layoutBounds;
        return bounds.y + bounds.height;
      }));
    expect(autoHeight.scene.entries.get("code-scroll")?.scrollMetrics?.horizontalTrack?.y).toBe(lastCodeRow);

    const overflowing = render(12, 4);
    const metrics = overflowing.scene.entries.get("code-scroll")!.scrollMetrics!;
    expect(metrics.horizontalTrack).not.toBeNull();
    expect(metrics.verticalTrack).not.toBeNull();
    expect(overflowing.layout.entries.get("code-scroll")?.railInsets).toEqual({ right: 1, bottom: 1 });
    expect(overflowing.layout.entries.get("code-scroll")?.paddingInsets).toMatchObject({ right: 3, bottom: 1 });
    expect(overflowing.layout.entries.get("code-scroll/box[0]")?.paddingInsets).toMatchObject({ right: 0, bottom: 0 });
    expect(overflowing.buffer.toText({ trimEnd: true })).toContain("abcdefg");
    const end = render(12, 4, metrics.maxOffset.x, metrics.maxOffset.y);
    expect(end.buffer.toText({ trimEnd: true })).toContain("ng line");
    runtime.dispose();
  });

  it("keeps a code guard with its nearest ScrollArea", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 20, height: 7 } });
    const frame = runtime.render(<Root><ScrollArea id="outer" style={{ width: 20, height: 7 }}>
      <Box><ScrollArea id="inner" style={{ width: 16 }}>
        <Markdown source={"```text\ninside\n```"} />
      </ScrollArea></Box>
    </ScrollArea></Root>);
    expect(frame.tree.nodes.get("outer")?.sharedScrollGuard).toBe(false);
    expect(frame.tree.nodes.get("inner")?.sharedScrollGuard).toBe(true);
    expect(frame.layout.entries.get("outer")?.paddingInsets).toMatchObject({ right: 0, bottom: 0 });
    expect(frame.layout.entries.get("inner")?.paddingInsets).toMatchObject({ right: 1, bottom: 1 });
    runtime.dispose();
  });

  it("keeps Markdown table columns aligned and cell semantics free of dividers", () => {
    const source = "| Left | Center | Right |\n| :--- | :----: | ----: |\n| a | b | c |";
    const runtime = new CellUiRuntime({ viewport: { width: 28, height: 4 } });
    const frame = runtime.render(<Root><Markdown source={source} /></Root>);
    const [header, rule, data] = frame.buffer.toText({ trimEnd: true }).split("\n");
    expect(header?.split("│")).toHaveLength(3);
    expect(data?.split("│")).toHaveLength(3);
    expect(rule?.split("┼")).toHaveLength(3);
    expect([...header!.matchAll(/│/gu)].map((match) => match.index))
      .toEqual([...data!.matchAll(/│/gu)].map((match) => match.index));
    expect(data).toMatch(/a\s+│\s+b\s+│\s+c/u);
    const [left, center, right] = data!.split("│");
    expect(left?.indexOf("a")).toBe(0);
    expect(center?.indexOf("b")).toBe(3);
    expect(right?.indexOf("c")).toBe(5);
    const copied = createCellRangeSnapshot(frame.buffer, { x: 0, y: 0 }, { x: 27, y: 2 })?.text;
    expect(copied).toContain("│");
    expect(copied).toContain("┼");
    expect([...frame.semantics.nodes.values()].filter((node) => node.role === "cell")
      .map((node) => node.label)).toEqual(["Left", "Center", "Right", "a", "b", "c"]);
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
