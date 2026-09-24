import { describe, expect, it } from "vitest";
import { CellUiRuntime, FocusManager, Markdown, Root, auditSemanticSnapshot, commandForInput, createKeyInput, extractCellRange } from "./index.js";
import { parseCellMarkdown } from "./markdown.js";

describe("Markdown typography", () => {
  it("parses common GFM without executing HTML or unsafe links", () => {
    const blocks = parseCellMarkdown(`# Notes\n\n- [x] Done\n- [ ] Next\n\n> Quote\n\n[Safe](https://example.com) [Unsafe](javascript:alert(1))\n\n<img src=x onerror=alert(1)>`);
    expect(blocks.map((block) => block.kind)).toEqual(["heading", "list", "quote", "paragraph", "paragraph"]);
    expect(blocks[1]).toMatchObject({ items: [{ marker: "[x]" }, { marker: "[ ]" }] });
    expect(blocks[3]).toMatchObject({ content: expect.arrayContaining([expect.objectContaining({ href: "https://example.com" })]) });
    expect(JSON.stringify(blocks)).not.toContain('href":"javascript:');
    expect(JSON.stringify(blocks)).toContain("<img src=x onerror=alert(1)>");
  });

  it("commits readable Cells, document roles, and one link command", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 32, height: 16 }, presentation: "text" });
    const frame = runtime.render(<Root><Markdown id="readme" source={`# Notes\n\nRead [Guide](https://example.com).\n\n- One\n- Two\n\n> Quote\n\n\`\`\`ts\nconst x = 1\n\`\`\``} /></Root>);
    const text = frame.buffer.toText({ trimEnd: true });
    expect(text).toContain("# Notes");
    expect(frame.buffer.get(0, 0)).toMatchObject({ text: "#" });
    expect(frame.buffer.get(0, 0)?.style.bold).not.toBe(true);
    expect(frame.buffer.get(2, 0)).toMatchObject({ text: "N", style: { bold: true } });
    expect(text).toContain("Guide ↗");
    expect(text).toContain("• One");
    expect(text).toContain("│ Quote");
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
    expect(extractCellRange(frame.buffer, { x: 0, y: 0, width: 32, height: 16 }, { trimEnd: true }))
      .toContain("Guide ↗");
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
    expect(text).toContain("• Parent");
    expect(text).toContain("  • Child");
    expect(text).toContain("│ Name");
    expect(text).toContain("世界");
    expect([...frame.semantics.nodes.values()].map((node) => node.role)).toEqual(expect.arrayContaining([
      "list", "listitem", "table", "row", "cell",
    ]));
    const rows = [...frame.tree.nodes.values()].filter((node) => node.markdownRole === "row");
    expect(rows).toHaveLength(2);
    const cellXs = (rowId: string) => frame.tree.nodes.get(rowId)!.children
      .filter((id) => frame.tree.nodes.get(id)?.markdownRole === "cell")
      .map((id) => frame.scene.entries.get(id)!.layoutBounds.x);
    expect(cellXs(rows[0]!.id)).toEqual(cellXs(rows[1]!.id));
    expect(auditSemanticSnapshot(frame.semantics)).toEqual([]);
    runtime.dispose();
  });

  it("accepts an empty file", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 12, height: 3 } });
    expect(() => runtime.render(<Root><Markdown source="" /></Root>)).not.toThrow();
    runtime.dispose();
  });
});
