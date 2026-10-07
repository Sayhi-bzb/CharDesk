import { layoutCharDeskTextRuns } from "@chardesk/protocol";
import { describe, expect, it } from "vitest";
import { getCharGraphText } from "./index.js";
import { detectMarkdownText, renderMarkdown } from "./markdown-default.js";

describe("renderMarkdown", () => {
  it("reports only top-level rendered headings with their output rows", async () => {
    const rendered = await renderMarkdown([
      "# Intro", "", "> # Quoted", "", "```md", "# Code", "```", "", "## Details", "", "### End",
    ].join("\n"));
    const lines = getCharGraphText(rendered).split("\n");

    expect(rendered.headings?.map(({ level, label, row }) => ({
      level, label, text: lines[row],
    }))).toEqual([
      { level: 1, label: "# Intro", text: "# Intro" },
      { level: 2, label: "## Details", text: "## Details" },
      { level: 3, label: "### End", text: "### End" },
    ]);
  });

  it("keeps heading rows aligned after wrapped headings", async () => {
    const rendered = await renderMarkdown("# " + "long heading ".repeat(8) + "\n\n## Next", {
      proseWrapWidth: 20,
    });
    const lines = getCharGraphText(rendered).split("\n");

    expect(rendered.headings).toHaveLength(2);
    expect(rendered.headings?.[1]?.row).toBeGreaterThan(2);
    expect(lines[rendered.headings![1]!.row]).toBe("## Next");
  });
  it("wraps pasted prose by display cells without splitting words, graphemes, or links", async () => {
    const source = `# ${"word ".repeat(18)}尾巴\n\n> ${"汉字".repeat(41)}\n\n- ${"hello ".repeat(14)}end\n\n${"alpha ".repeat(13)}[linked](https://example.com) 👩‍💻`;
    const rendered = await renderMarkdown(source, { proseWrapWidth: 80 });
    const lines = getCharGraphText(rendered).split("\n");

    expect(lines.every((line) => layoutCharDeskTextRuns([{ text: line }]).width <= 80)).toBe(true);
    expect(lines[0]?.startsWith("# ")).toBe(true);
    expect(lines[1]?.startsWith("  ")).toBe(true);
    expect(lines.some((line) => line.startsWith("│ "))).toBe(true);
    expect(lines.some((line) => line.startsWith("- "))).toBe(true);
    expect(lines.some((line) => line.startsWith("  hello"))).toBe(true);
    expect(rendered.fragments.find((part) => part.text.includes("linked"))?.href)
      .toBe("https://example.com");
    expect(getCharGraphText(rendered)).toContain("👩‍💻");
  });

  it("preserves nested list order and block boundaries inside list items", async () => {
    const rendered = await renderMarkdown([
      "4. **检查首条 `session_meta`**：",
      "   - `forked_from_id`：父会话",
      "   - `history_base`：分页历史依赖",
      "",
      "   递归复制相关 rollout，保留目录结构与文件名。依赖也可能位于 `archived_sessions/`。",
      "6. 在目标机器恢复并核对历史：",
      "",
      "   ```bash",
      "   codex resume <SESSION_ID> --cd ~/projects/resume",
      "   ```",
      "",
      "   `resume` 和 `--cd` 是官方支持的恢复方式；文件复制与依赖整理属于手动迁移。",
    ].join("\n"));
    const lines = getCharGraphText(rendered).split("\n");
    const nested = lines.findIndex((line) => line.includes("history_base"));
    const followUp = lines.findIndex((line) => line.includes("递归复制相关"));
    const code = lines.findIndex((line) => line.includes("codex resume"));
    const explanation = lines.findIndex((line) => line.includes("官方支持的恢复方式"));

    expect(nested).toBeGreaterThanOrEqual(0);
    expect(followUp).toBeGreaterThan(nested);
    expect(code).toBeGreaterThanOrEqual(0);
    expect(explanation).toBeGreaterThan(code);
    expect(lines[code]).not.toContain("resume 和");
  });

  it("leaves code and tables untouched when prose wrapping is enabled", async () => {
    const source = [
      "```text", "x".repeat(90), "```", "", "| Heading | Value |", "| --- | --- |", `| ${"x".repeat(90)} | item |`,
    ].join("\n");
    const plain = await renderMarkdown(source);
    const wrapped = await renderMarkdown(source, { proseWrapWidth: 80 });
    expect(getCharGraphText(wrapped)).toBe(getCharGraphText(plain));
  });

  it("splits an overlong Latin word only at a cell boundary", async () => {
    const rendered = await renderMarkdown(`# ${"a".repeat(79)}👩‍💻尾`, {
      proseWrapWidth: 80,
    });
    const lines = getCharGraphText(rendered).split("\n");
    expect(lines.every((line) => layoutCharDeskTextRuns([{ text: line }]).width <= 80)).toBe(true);
    expect(lines.map((line) => line.slice(2)).join("")).toBe(`${"a".repeat(79)}👩‍💻尾`);
    expect(lines.some((line) => line.includes("👩‍💻"))).toBe(true);
  });

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
