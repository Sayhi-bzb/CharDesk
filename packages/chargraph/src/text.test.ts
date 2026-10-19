import { describe, expect, it } from "vitest";
import { getCharGraphText } from "./fragments.js";
import { renderCharGraphText } from "./text.js";

describe("canonical CharGraph text renderer", () => {
  it("renders fenced JSON inside a two-dimensional layout", async () => {
    const rendered = await renderCharGraphText([
      "Input",
      "```json",
      '{"name":"CharDesk","ready":true}',
      "```",
      "|||",
      "Output",
    ].join("\n"));
    const output = getCharGraphText(rendered);

    expect(rendered.renderer).toBe("block-layout");
    expect(output).toContain("name");
    expect(output).toContain("CharDesk");
    expect(output).not.toContain("```json");
  });

  it("keeps a standalone row boundary as a Markdown thematic break", async () => {
    const rendered = await renderCharGraphText("Top\n\n---\n\nBottom");

    expect(rendered.renderer).toBe("markdown");
    expect(getCharGraphText(rendered)).toBe("Top\n\n———\n\nBottom");
  });

  it("allows callers to explicitly activate row-only block layout", async () => {
    const rendered = await renderCharGraphText("Top\n---\nBottom", {
      layout: { activation: "any-boundary" },
    });

    expect(rendered.renderer).toBe("block-layout");
    expect(getCharGraphText(rendered)).toBe("Top\n\nBottom");
  });

  it("keeps ordinary pasted Markdown paragraphs start-aligned", async () => {
    const rendered = await renderCharGraphText([
      "也就是说，**不需要某一天突然出现“自我修改源码”的 AGI。**",
      "",
      "Codex/Research Agent 今天帮助研究员写代码、跑实验、分析结果，本身就可以是 RSI 的早期形态。",
      "",
      "文章明确说，OpenAI 正把研究方向朝 RSI 集中，因为他们认为继续处于 AI 前沿最终必须走这条路。([OpenAI][1])",
      "",
      "---",
    ].join("\n"));
    const lines = getCharGraphText(rendered).split("\n").filter(Boolean);

    expect(rendered.renderer).toBe("markdown");
    expect(lines.at(-1)).toBe("———");
    expect(lines.every((line) => !line.startsWith(" "))).toBe(true);
  });

  it("preserves spatial box-drawing text in auto mode", async () => {
    const source = [
      "                         ┌──────────────┐",
      "                         │    Query     │",
      "                         └──────┬───────┘",
      "                                │ starts",
      "                                ▼",
      "┌──────────┐              ┌──────────────┐",
      "│ Thread   │─────────────▶│    Turn      │",
      "└────┬─────┘   contains   └──────┬───────┘",
    ].join("\n");
    const rendered = await renderCharGraphText(source);

    expect(rendered.renderer).toBe("raw");
    expect(getCharGraphText(rendered)).toBe(source);
  });

  it("keeps explicit Markdown mode available for spatial-looking text", async () => {
    const rendered = await renderCharGraphText("    ┌─┐\n    │A│\n    └─┘", {
      mode: "markdown",
    });

    expect(rendered.renderer).toBe("markdown");
  });

  it.each(["```", "~~~", "````"])(
    "renders Markdown around a diagram fenced with %s in auto mode",
    async (fence) => {
      const diagram = "用户来电\n   │\n   ▼\n识别诉求\n   └─ 查物流 → 查询";
      const rendered = await renderCharGraphText([
        "**业务规则**",
        "",
        `${fence}text`,
        diagram,
        fence,
        "",
        "| 工具 | 用途 |",
        "| --- | --- |",
        "| query_tracking | 查询物流 |",
      ].join("\n"));

      expect(rendered.renderer).toBe("markdown");
      expect(getCharGraphText(rendered)).toContain(diagram);
      expect(getCharGraphText(rendered)).not.toContain(fence);
      expect(rendered.fragments.find((part) => part.text === "业务规则")?.attrs?.bold)
        .toBe(true);
      expect(getCharGraphText(rendered)).toContain("query_tracking");
    }
  );

  it.each(["blockquote", "list"])(
    "ignores fenced diagram glyphs inside a Markdown %s",
    async (container) => {
      const code = ["```text", "┌─┐", "│A│", "└─┘", "```"];
      const nested = container === "blockquote"
        ? code.map((line) => `> ${line}`)
        : ["- Diagram", ...code.map((line) => `  ${line}`)];
      const rendered = await renderCharGraphText([
        "**Rules**", "", ...nested,
      ].join("\n"));

      expect(rendered.renderer).toBe("markdown");
      expect(getCharGraphText(rendered)).toContain("│A│");
      expect(rendered.fragments.find((part) => part.text === "Rules")?.attrs?.bold)
        .toBe(true);
    }
  );

  it("still preserves unfenced spatial text beside a fenced block", async () => {
    const source = "    ┌─┐\n    │A│\n    └─┘\n\n```text\nB\n```";
    const rendered = await renderCharGraphText(source);

    expect(rendered.renderer).toBe("raw");
    expect(getCharGraphText(rendered)).toBe(source);
  });

  it("preserves ASCII frames in auto mode", async () => {
    const source = "    +---+\n    | A |\n    +---+";
    const rendered = await renderCharGraphText(source);

    expect(rendered.renderer).toBe("raw");
    expect(getCharGraphText(rendered)).toBe(source);
  });

  it("keeps escaped boundaries literal and leaves alternate Markdown rules available", async () => {
    const escaped = await renderCharGraphText("A\n|||\n\\---\n\\|||\n---\nB");
    const rule = await renderCharGraphText("***");

    expect(getCharGraphText(escaped)).toContain("---");
    expect(getCharGraphText(escaped)).toContain("|||");
    expect(getCharGraphText(escaped)).not.toMatch(/\\(?:---|\|\|\|)/u);
    expect(rule.renderer).toBe("markdown");
    expect(getCharGraphText(rule)).toBe("———");
  });

  it("lets explicit ANSI colors win while Markdown attributes merge", async () => {
    const rendered = await renderCharGraphText("[31m**red**[0m");

    expect(rendered.pipeline).toEqual(["ansi", "markdown"]);
    expect(rendered.fragments.every((fragment) => fragment.color === "#800000"))
      .toBe(true);
    expect(rendered.fragments.every((fragment) => fragment.attrs?.bold)).toBe(true);
  });
});
