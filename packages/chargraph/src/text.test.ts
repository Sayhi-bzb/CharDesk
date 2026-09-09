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
