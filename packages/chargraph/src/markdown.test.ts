import { layoutCharDeskTextRuns } from "@chardesk/protocol";
import { describe, expect, it } from "vitest";
import { getCharGraphText } from "./index.js";
import { detectMarkdownText, renderMarkdown } from "./markdown-default.js";

describe("renderMarkdown", () => {
  it("detects syntax without claiming plain prose", () => {
    expect(detectMarkdownText("plain prose")).toBe(false);
    expect(detectMarkdownText("**strong**")).toBe(true);
    expect(detectMarkdownText("![alt](image.png)")).toBe(true);
  });

  it("returns styled inline fragments and links without an ANSI round trip", async () => {
    const rendered = await renderMarkdown(
      "**Bold** [Docs](https://example.com) `code`",
      {
        styles: {
          strong: { attrs: { bold: true } },
          link: { color: "#0088cc", attrs: { underline: true } },
          "inline-code": { bgColor: "#eeeeee" },
        },
      }
    );

    expect(getCharGraphText(rendered)).toBe("Bold Docs code");
    expect(rendered.fragments.find((item) => item.text.includes("Bold"))?.attrs?.bold)
      .toBe(true);
    expect(rendered.fragments.find((item) => item.href)?.href)
      .toBe("https://example.com");
    expect(rendered.fragments.find((item) => item.text.includes("code"))?.bgColor)
      .toBe("#eeeeee");
  });

  it("renders hard breaks as newlines and composes nested emphasis", async () => {
    const source = "*First*  \n_Second_\n\n_You **can** combine them_";
    const rendered = await renderMarkdown(source, {
      styles: {
        emphasis: { attrs: { italic: true } },
        strong: { attrs: { bold: true } },
      },
    });
    const can = rendered.fragments.find((item) => item.text === "can");

    expect(getCharGraphText(rendered)).toBe("First\nSecond\n\nYou can combine them");
    expect(rendered.visualGroups).toEqual([
      { fromRow: 0, toRow: 2, inlineAlignment: "start" },
      { fromRow: 3, toRow: 4, inlineAlignment: "start" },
    ]);
    expect(getCharGraphText(rendered)).not.toContain("<br>");
    expect(can?.attrs).toMatchObject({ bold: true, italic: true });
    expect(rendered.fragments.filter((item) => /First|Second|You | combine/.test(item.text)))
      .toSatisfy((items: typeof rendered.fragments) =>
        items.every((item) => item.attrs?.italic === true)
      );
  });

  it("keeps internal blank rows inside one top-level visual group", async () => {
    const rendered = await renderMarkdown([
      "# Title",
      "",
      "```ts",
      "const first = 1;",
      "",
      "const second = 2;",
      "```",
    ].join("\n"));

    expect(rendered.visualGroups).toEqual([
      { fromRow: 0, toRow: 1, inlineAlignment: "start" },
      { fromRow: 2, toRow: 5, inlineAlignment: "start" },
    ]);
  });

  it("declares placement only from the block that owns it", async () => {
    const rendered = await renderMarkdown([
      "Paragraph",
      "",
      "| A | B |",
      "|---|---|",
      "| 1 | 2 |",
      "",
      "```mermaid",
      "flowchart LR",
      "  A --> B",
      "```",
    ].join("\n"));

    expect(rendered.visualGroups?.map((group) => group.inlineAlignment)).toEqual([
      "start",
      "center",
      "center",
    ]);

    const disabledTable = await renderMarkdown([
      "| A | B |",
      "|---|---|",
      "| 1 | 2 |",
    ].join("\n"), { forced: true, rules: { table: false } });
    const disabledMermaid = await renderMarkdown([
      "```mermaid",
      "flowchart LR",
      "  A --> B",
      "```",
    ].join("\n"), { extensionRules: { mermaid: false } });

    expect(disabledTable.visualGroups?.[0]?.inlineAlignment).toBe("start");
    expect(disabledMermaid.visualGroups?.[0]?.inlineAlignment).toBe("start");
  });

  it("preserves unsupported image and HTML source with diagnostics", async () => {
    const source = "![alt](image.png) <kbd>x</kbd>";
    const rendered = await renderMarkdown(source);

    expect(getCharGraphText(rendered)).toBe(source);
    expect(rendered.diagnostics).toHaveLength(3);
    expect(rendered.diagnostics.every((item) => item.code === "markdown-unsupported-token"))
      .toBe(true);
  });

  it("lays out CJK tables by display-cell width", async () => {
    const rendered = await renderMarkdown(
      "| 名 | Value |\n| :- | ----: |\n| 你 | 2 |"
    );
    const layout = layoutCharDeskTextRuns(rendered.fragments);
    const rows = Array.from({ length: layout.height }, (_, y) =>
      layout.cells.filter((cell) => cell.y === y).map((cell) => cell.text).join("")
    );

    expect(rows).toEqual([" 名    Value ", "━━━━  ━━━━━━━", " 你        2 "]);
    expect(layout.cells.find((cell) => cell.text === "你")?.x).toBe(1);
  });

  it("preserves disabled block syntax and consumes disabled inline markers", async () => {
    const heading = await renderMarkdown("# **Heading**", {
      forced: true,
      rules: { heading: false },
    });
    const strong = await renderMarkdown("**plain**", {
      forced: true,
      rules: { strong: false },
    });

    expect(getCharGraphText(heading)).toBe("# **Heading**");
    expect(getCharGraphText(strong)).toBe("plain");
  });

  it("renders Mermaid fences and preserves unsupported diagrams", async () => {
    const diagram = await renderMarkdown(
      "```mermaid\ngraph LR\n  A[开始] --> B[完成]\n```"
    );
    const unsupported = await renderMarkdown(
      "```mermaid\npie\n  title Unsupported\n```"
    );
    const partiallySupported = await renderMarkdown(
      "```mermaid\nflowchart LR\nA-->B\nclick A https://example.com\n```"
    );

    expect(getCharGraphText(diagram)).toContain("开始");
    expect(getCharGraphText(diagram)).not.toContain("```");
    expect(diagram.visualGroups?.[0]?.inlineAlignment).toBe("center");
    expect(getCharGraphText(unsupported)).toContain("```mermaid");
    expect(unsupported.visualGroups?.[0]?.inlineAlignment).toBe("start");
    expect(unsupported.diagnostics[0]?.code).toBe("markdown-mermaid-render-failed");
    expect(getCharGraphText(partiallySupported)).toContain("click A");
    expect(getCharGraphText(partiallySupported)).toContain("```mermaid");
    expect(partiallySupported.diagnostics[0]?.code)
      .toBe("markdown-mermaid-render-failed");
    expect(partiallySupported.diagnostics[0]?.message)
      .toMatch(/^Mermaid source preserved:/u);
  });

  it("renders inline, block, and fenced math through the syntax extension", async () => {
    const inline = await renderMarkdown(String.raw`Euler: $e^{i\pi}+1=0$.`);
    const block = await renderMarkdown("$$\n\\frac{a+b}{c+d}\n$$");
    const fenced = await renderMarkdown("```math\n\\begin{matrix}a&b\\\\c&d\\end{matrix}\n```");

    expect(getCharGraphText(inline)).toBe("Euler: e^(iπ) + 1 = 0.");
    expect(getCharGraphText(block)).toBe(" a + b\n───────\n c + d");
    expect(getCharGraphText(fenced)).toBe("⎡a  b⎤\n⎣c  d⎦");
  });

  it("recognizes parenthesis and bracket math delimiters", async () => {
    const inline = await renderMarkdown(String.raw`Value: \(x^2\).`);
    const block = await renderMarkdown("\\[\n\\sqrt{x+1}\n\\]");

    expect(getCharGraphText(inline)).toBe("Value: x².");
    expect(getCharGraphText(block)).toBe("  ─────\n √x + 1");
  });

  it("does not confuse escaped delimiters, currency, or incomplete math", async () => {
    const rendered = await renderMarkdown(String.raw`Cost: \$5; incomplete $x + 1.`);

    expect(getCharGraphText(rendered)).toBe("Cost: $5; incomplete $x + 1.");
  });

  it("supports separate inline and block math rules", async () => {
    const inline = await renderMarkdown("$x^2$", {
      extensionRules: { "inline-math": false },
    });
    const block = await renderMarkdown("$$\nx^2\n$$", {
      extensionRules: { "block-math": false },
    });

    expect(getCharGraphText(inline)).toBe("x^2");
    expect(getCharGraphText(block)).toBe("$$\nx^2\n$$");
  });

  it("keeps source origins deterministic for repeated text and CRLF", async () => {
    const source = "foo **foo**\r\nfoo";
    const rendered = await renderMarkdown(source, {
      styles: { strong: { attrs: { bold: true } } },
    });
    const first = rendered.fragments.find((item) => item.text === "foo ");
    const emphasized = rendered.fragments.find((item) => item.attrs?.bold);
    const last = rendered.fragments.findLast((item) => item.text === "foo");
    const newline = rendered.fragments.find((item) => item.text === "\n");

    expect(first?.origin).toEqual({ from: 0, to: 4 });
    expect(emphasized).toMatchObject({
      text: "foo",
      origin: { from: 6, to: 9 },
      attrs: { bold: true },
    });
    expect(newline?.origin).toEqual({ from: 11, to: 13 });
    expect(last?.origin).toEqual({ from: 13, to: 16 });
  });
});
