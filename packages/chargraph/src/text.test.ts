import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { getCharGraphText } from "./fragments.js";
import { renderCharGraphText } from "./text.js";

describe("canonical CharGraph text renderer", () => {
  const asciiSponge = readFileSync(new URL("./__fixtures__/ascii-sponge.txt", import.meta.url), "utf8");

  it.each([asciiSponge, " /\\_/\\\n( o.o )\n > ^ <"])(
    "preserves unfenced ASCII artwork without consuming Markdown punctuation",
    async (source) => {
      const rendered = await renderCharGraphText(source);
      expect(rendered.renderer).toBe("raw");
      expect(getCharGraphText(rendered)).toBe(source);
    }
  );

  it("renders Markdown around fenced ASCII artwork", async () => {
    const rendered = await renderCharGraphText(`**Artwork**\n\n\`\`\`text\n${asciiSponge}\`\`\``);
    expect(rendered.renderer).toBe("markdown");
    expect(getCharGraphText(rendered)).toContain(asciiSponge.trimEnd());
    expect(rendered.fragments.find((part) => part.text === "Artwork")?.attrs?.bold).toBe(true);
  });

  it.each([
    "|   |   |\n|---|---|\n|   |   |",
    " [a]()\n [b]()\n [c]()",
    " **a**\n **b**\n **c**",
  ])("keeps punctuation-heavy Markdown available in auto mode", async (source) => {
    expect((await renderCharGraphText(source)).renderer).toBe("markdown");
  });
  it("renders fenced JSON while keeping retired delimiters literal", async () => {
    const rendered = await renderCharGraphText([
      "Input",
      "```json",
      '{"name":"CharDesk","ready":true}',
      "```",
      "|||",
      "Output",
    ].join("\n"));
    const output = getCharGraphText(rendered);

    expect(rendered.renderer).toBe("markdown");
    expect(output).toContain("|||");
    expect(output).toContain("name");
    expect(output).toContain("CharDesk");
    expect(output).not.toContain("```json");
  });

  it("keeps a standalone row boundary as a Markdown thematic break", async () => {
    const rendered = await renderCharGraphText("Top\n\n---\n\nBottom");

    expect(rendered.renderer).toBe("markdown");
    expect(getCharGraphText(rendered)).toBe("Top\n\n———\n\nBottom");
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

    expect(rendered.renderer).toBe("markdown");
    expect(getCharGraphText(rendered)).toBe("    ┌─┐\n    │A│\n    └─┘\n\nB");
  });

  it("preserves ASCII frames in auto mode", async () => {
    const source = "    +---+\n    | A |\n    +---+";
    const rendered = await renderCharGraphText(source);

    expect(rendered.renderer).toBe("raw");
    expect(getCharGraphText(rendered)).toBe(source);
  });

  it("treats delimiters inside code as literal content", async () => {
    const source = "A\n|||\nB\n---\nC";
    const rendered = await renderCharGraphText(["```text", source, "```"].join("\n"));
    expect(getCharGraphText(rendered)).toBe(source);
  });

  it("lets explicit ANSI colors win while Markdown attributes merge", async () => {
    const rendered = await renderCharGraphText("[31m**red**[0m", { mode: "markdown" });

    expect(rendered.pipeline).toEqual(["ansi", "markdown"]);
    expect(rendered.fragments.every((fragment) => fragment.color === "#800000"))
      .toBe(true);
    expect(rendered.fragments.every((fragment) => fragment.attrs?.bold)).toBe(true);
  });
});

describe("Auto block boundaries", () => {
  const art = "    ┌─┐\n    │A│\n    └─┘";

  it("preserves artwork locally while rendering the surrounding Markdown", async () => {
    const result = await renderCharGraphText(`**Before**\n\n${art}\n\n\n**After**`);
    expect(getCharGraphText(result)).toBe(`Before\n\n${art}\n\n\nAfter`);
    expect(result.fragments.filter((part) => part.attrs?.bold).map((part) => part.text))
      .toEqual(["Before", "After"]);
  });

  it("preserves uncertain paragraphs without wrapping, escaping, or joining lines", async () => {
    const plain = "alpha  beta\n    gamma\\delta\nnext";
    const result = await renderCharGraphText(`**Title**\n\n${plain}`, {
      markdown: { proseWrapWidth: 4 },
    });
    expect(getCharGraphText(result)).toContain(plain);
  });

  it("does not reinterpret ANSI artwork or Markdown-looking ANSI text", async () => {
    const result = await renderCharGraphText(`\u001b[31m**red**\n${art}\u001b[0m`);
    expect(result.pipeline).toEqual(["ansi"]);
    expect(getCharGraphText(result)).toBe(`**red**\n${art}`);
    expect(result.fragments.some((part) => part.color === "#800000")).toBe(true);
  });

  it("keeps CRLF source ranges bounded across literal and Markdown blocks", async () => {
    const source = `**Title**\r\n\r\n${art.replaceAll("\n", "\r\n")}`;
    const result = await renderCharGraphText(source);
    expect(getCharGraphText(result)).toBe(`Title\n\n${art}`);
    expect(result.fragments.every((part) => !part.origin ||
      (part.origin.from >= 0 && part.origin.to <= source.length))).toBe(true);
  });
});

describe("reported long Markdown content", () => {
  const source = readFileSync(new URL("./__fixtures__/logistics.md", import.meta.url), "utf8");

  it.each([1, 20])("renders %s copies without a length-dependent format fallback", async (copies) => {
    const result = await renderCharGraphText(Array(copies).fill(source).join("\n\n"));
    expect(result.renderer).toBe("markdown");
    expect(getCharGraphText(result)).not.toContain("```text");
    expect(getCharGraphText(result)).toContain("   ├─ 催件   → 确认运单");
    expect(result.fragments.some((part) => part.text.includes("语音交互问题的判断能力") && part.attrs?.bold))
      .toBe(true);
    expect(result.diagnostics).toEqual([]);
  });
});
