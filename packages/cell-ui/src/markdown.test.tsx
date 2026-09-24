import { describe, expect, it } from "vitest";
import { CellUiRuntime, FocusManager, Markdown, Root, ScrollArea, auditSemanticSnapshot, commandForInput, createCellRangeSnapshot, createCellUiRenderFrame, createKeyInput, extractCellRange, resolveCellUiTheme } from "./index.js";
import { parseCellMarkdown } from "./markdown.js";

describe("Markdown typography", () => {
  it("parses common GFM without executing HTML or unsafe links", () => {
    const source = `# Notes\n\n- [x] Done\n- [ ] Next\n\n> Quote\n\n[Safe](https://example.com) [Unsafe](javascript:alert(1))\n\n<img src=x onerror=alert(1)>`;
    const lines = parseCellMarkdown(source);
    expect(lines.map((line) => line.text).join("\n")).toBe(source);
    expect(lines.map((line) => line.kind)).toContain("quote");
    expect(lines.filter((line) => line.kind === "list").map((line) => line.text)).toEqual(["- [x] Done", "- [ ] Next"]);
    expect(lines.flatMap((line) => line.content)).toEqual(expect.arrayContaining([expect.objectContaining({ href: "https://example.com" })]));
    expect(JSON.stringify(lines)).not.toContain('href":"javascript:');
  });

  it("commits readable Cells, document roles, and one link command", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 64, height: 16 }, presentation: "text" });
    const frame = runtime.render(<Root><Markdown id="readme" source={`# Notes\n\nRead [Guide](https://example.com).\n\n- One\n- Two\n\n> Quote\n\n\`\`\`ts\nconst x = 1\n\`\`\``} /></Root>);
    const text = frame.buffer.toText({ trimEnd: true });
    expect(text).toContain("# Notes");
    expect(frame.buffer.get(0, 0)).toMatchObject({ text: "#" });
    expect(frame.buffer.get(0, 0)?.style.bold).not.toBe(true);
    expect(frame.buffer.get(2, 0)).toMatchObject({ text: "N", style: { bold: true } });
    expect(text).toContain("[Guide](https://example.com)");
    expect(text).toContain("- One\n- Two");
    expect(text).toContain("> Quote");
    expect(text).toContain("```ts");
    const semantics = [...frame.semantics.nodes.values()];
    expect(semantics).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "heading", level: 1 }),
      expect.objectContaining({ role: "list" }),
      expect.objectContaining({ role: "blockquote" }),
    ]));
    const link = semantics.find((node) => node.role === "link")!;
    expect(link).toMatchObject({ href: "https://example.com", actions: ["focus", "activate"] });
    expect(auditSemanticSnapshot(frame.semantics)).toEqual([]);
    expect(extractCellRange(frame.buffer, { x: 0, y: 0, width: 64, height: 16 }, { trimEnd: true }))
      .toContain("[Guide](https://example.com)");
    const focus = new FocusManager();
    expect(commandForInput({ type: "semantic", targetId: link.id, action: "activate" }, frame, focus))
      .toEqual({ type: "open-link", targetId: link.id, href: "https://example.com" });
    focus.sync(frame.tree, link.id);
    expect(commandForInput(createKeyInput({ key: "Enter", phase: "down" }), frame, focus))
      .toEqual({ type: "open-link", targetId: link.id, href: "https://example.com" });
    runtime.dispose();
  });

  it("keeps nested lists and tables structured within a narrow Cell viewport", () => {
    const source = `- Parent\n  - Child\n\n| Name | Value |\n| --- | --- |\n| A | 世界 |`;
    const runtime = new CellUiRuntime({ viewport: { width: 20, height: 12 } });
    const frame = runtime.render(<Root><Markdown source={source} /></Root>);
    const text = frame.buffer.toText({ trimEnd: true });
    expect(text).toContain("- Parent");
    expect(text).toContain("  - Child");
    expect(text).toContain("| Name | Value |");
    expect(text).toContain("| ---  | ---   |");
    expect(createCellRangeSnapshot(frame.buffer, { x: 0, y: 0 }, { x: 19, y: 5 })?.text)
      .toContain("| --- | --- |");
    expect(text).toContain("世界");
    expect([...frame.semantics.nodes.values()].map((node) => node.role)).toEqual(expect.arrayContaining([
      "list", "listitem", "table", "row", "cell",
    ]));
    const rows = [...frame.tree.nodes.values()].filter((node) => node.markdownRole === "row");
    expect(rows).toHaveLength(3);
    const cellXs = (rowId: string) => frame.tree.nodes.get(rowId)!.children
      .filter((id) => frame.tree.nodes.get(id)?.markdownRole === "cell")
      .map((id) => frame.scene.entries.get(id)!.layoutBounds.x);
    expect(cellXs(rows[0]!.id)).toEqual([0, 7]);
    expect(cellXs(rows[1]!.id)).toEqual([0, 7]);
    expect(cellXs(rows[2]!.id)).toEqual([0, 7]);
    expect(auditSemanticSnapshot(frame.semantics)).toEqual([]);
    runtime.dispose();
  });

  it("keeps Markdown source visible while styling only the enclosed text", () => {
    const source = [
      "`inline code`",
      "~~Old wording~~",
      "*This text will be italic*",
      "**This text will be bold**",
      "| Left columns  | Right columns |",
      "| ------------- |:-------------:|",
      "| left foo      | right foo     |",
    ].join("\n");
    expect(parseCellMarkdown(source).map((line) => line.text).join("\n")).toBe(source);
    const runtime = new CellUiRuntime({ viewport: { width: 80, height: 10 }, presentation: "text" });
    const frame = runtime.render(<Root><Markdown source={source} /></Root>);
    expect(frame.buffer.toText({ trimEnd: true }).split("\n").slice(0, 7)).toEqual(source.split("\n"));
    const styled = (x: number, y: number) => frame.buffer.get(x, y)!.style;
    expect(styled(0, 0).backgroundColor).toBeUndefined();
    expect(styled(1, 0)).toMatchObject({ color: "#FFFFFF", backgroundColor: "#000000" });
    expect(styled(12, 0).backgroundColor).toBeUndefined();
    expect(styled(0, 1).strike).not.toBe(true);
    expect(styled(2, 1).strike).toBe(true);
    expect(styled(13, 1).strike).not.toBe(true);
    expect(styled(0, 2).italic).not.toBe(true);
    expect(styled(1, 2).italic).toBe(true);
    expect(styled(0, 3).bold).not.toBe(true);
    expect(styled(2, 3).bold).toBe(true);
    const renderFrame = createCellUiRenderFrame(frame);
    expect(renderFrame.source.get({ x: 2, y: 1 })?.visual.attrs?.strike).toBe(true);
    expect(renderFrame.source.get({ x: 1, y: 2 })?.visual.attrs?.italic).toBe(true);
    runtime.dispose();
  });

  it("keeps wide table rows intact for horizontal Cell scrolling", () => {
    const source = "| Left columns  | Right columns |\n| ------------- |:-------------:|\n| left foo      | right foo     |";
    const runtime = new CellUiRuntime({ viewport: { width: 20, height: 4 } });
    const render = (scrollX: number) => runtime.render(<Root><ScrollArea id="markdown-scroll" scrollX={scrollX}
      style={{ width: 20, height: 4 }}><Markdown source={source} /></ScrollArea></Root>);
    const first = render(0);
    expect(first.scene.entries.get("markdown-scroll")?.scrollMetrics?.horizontalTrack).toBeDefined();
    expect(first.buffer.toText({ trimEnd: true })).toContain("Left columns");
    expect(render(15).buffer.toText({ trimEnd: true })).toContain("Right columns");
    runtime.dispose();
  });

  it("aligns ragged table columns and centers a short rule without changing Cell Range copy", () => {
    const source = "| Left | Right |\n| :--- | ---: |\n| x | long |\n\n---";
    const runtime = new CellUiRuntime({ viewport: { width: 32, height: 6 } });
    const frame = runtime.render(<Root><Markdown source={source} /></Root>);
    const visual = frame.buffer.toText({ trimEnd: true }).split("\n");
    expect(visual[0]).toContain("| Left | Right |");
    expect(visual[2]).toContain("| x    |  long |");
    expect(visual[4]).toBe(`${" ".repeat(14)}---`);
    expect(createCellRangeSnapshot(frame.buffer, { x: 0, y: 0 }, { x: 31, y: 4 })?.text)
      .toBe(source);
    runtime.dispose();
  });

  it("keeps source whitespace in a partial range and inverts inline code in dark mode", () => {
    const theme = resolveCellUiTheme({ background: "#000000", foreground: "#FFFFFF" });
    const source = "| 中 | value |\n| :- | --: |\n| x | y |\n\n---  \n`code`";
    const runtime = new CellUiRuntime({ viewport: { width: 24, height: 6 }, theme });
    const frame = runtime.render(<Root><Markdown source={source} /></Root>);
    expect(createCellRangeSnapshot(frame.buffer, { x: 0, y: 0 }, { x: 23, y: 5 })?.text).toBe(source);
    const partial = createCellRangeSnapshot(frame.buffer, { x: 0, y: 2 }, { x: 11, y: 2 })?.text;
    expect(partial).toBe("| x | y");
    expect(frame.buffer.get(0, 5)?.style.backgroundColor).toBeUndefined();
    expect(frame.buffer.get(1, 5)?.style).toMatchObject({ color: "#000000", backgroundColor: "#FFFFFF" });
    runtime.dispose();
  });

  it("centers a rule in the visible viewport beside a horizontally scrolling table", () => {
    const source = "| A very long heading | Another heading |\n| --- | --- |\n| x | y |\n\n---";
    const runtime = new CellUiRuntime({ viewport: { width: 16, height: 6 } });
    const frame = runtime.render(<Root><ScrollArea style={{ width: 16, height: 6 }}>
      <Markdown source={source} />
    </ScrollArea></Root>);
    expect(frame.scene.entries.get([...frame.tree.nodes.values()].find((node) => node.kind === "scroll-area")!.id)
      ?.scrollMetrics?.horizontalTrack).toBeDefined();
    expect(frame.buffer.toText({ trimEnd: true }).split("\n")[4]).toBe("      ---");
    runtime.dispose();
  });

  it("styles nested emphasis without styling source delimiters or fenced code", () => {
    const source = "# **Bold** heading ##\n***mix*** and \\*literal\\*\n```md\n*code*\n```";
    const runtime = new CellUiRuntime({ viewport: { width: 40, height: 5 } });
    const frame = runtime.render(<Root><Markdown source={source} /></Root>);
    const cell = (x: number, y: number) => frame.buffer.get(x, y)!;
    expect(cell(0, 0).style.bold).not.toBe(true);
    expect(cell(2, 0).style.bold).not.toBe(true);
    expect(cell(4, 0).style.bold).toBe(true);
    expect(cell(20, 0).style.bold).not.toBe(true);
    expect(cell(0, 1).style.bold).not.toBe(true);
    expect(cell(3, 1).style).toMatchObject({ bold: true, italic: true });
    expect(cell(0, 3).style.italic).not.toBe(true);
    expect(frame.buffer.toText({ trimEnd: true }).split("\n").slice(0, 5)).toEqual(source.split("\n"));
    runtime.dispose();
  });

  it("accepts an empty file", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 12, height: 3 } });
    expect(() => runtime.render(<Root><Markdown source="" /></Root>)).not.toThrow();
    runtime.dispose();
  });
});
