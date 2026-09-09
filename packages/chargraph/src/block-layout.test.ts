import { parseCharDeskText } from "@chardesk/protocol";
import { describe, expect, it } from "vitest";
import {
  parseBlockLayout,
  renderBlockLayoutDocument,
  renderCharGraphText,
  serializeBlockLayout,
} from "./index.js";
import { getCharGraphText } from "./fragments.js";

const blockSources = (source: string) =>
  parseBlockLayout(source).document?.rows.map((row) =>
    row.map((block) => block.source)
  );

describe("block layout stream", () => {
  it("uses standalone boundary lines without wrapping content", () => {
    expect(blockSources("AA\nAA\n|||\nBB\nBB\n---\nCC\n|||\nDD")).toEqual([
      ["AA\nAA", "BB\nBB"],
      ["CC", "DD"],
    ]);
  });

  it("accepts whitespace around controls and normalizes CRLF", () => {
    const source = "A\r\n  |||  \r\nB\r\n\t---\t\r\nC";
    const parsed = parseBlockLayout(source);
    expect(parsed.document?.rows.map((row) => row.map((block) => block.source))).toEqual([
      ["A", "B"],
      ["C"],
    ]);
    expect(parsed.boundaries).toEqual({ fields: 1, rows: 1 });
    expect(parsed.document?.rows[0]?.[0]?.range).toEqual({ from: 0, to: 3 });
    expect(parsed.document?.rows[1]?.[0]?.range.to).toBe(source.length);
  });

  it("keeps escaped controls as literal canvas content", () => {
    expect(blockSources("A\n|||\n\\|||\n\\---\n---\nB")).toEqual([
      ["A", "|||\n---"],
      ["B"],
    ]);
  });

  it("round-trips literal control lines through the serializer", () => {
    const parsed = parseBlockLayout("A\n|||\n\\|||\n\\\\---\n---\nB");
    expect(parsed.document).not.toBeNull();

    const serialized = serializeBlockLayout(parsed.document!);
    expect(blockSources(serialized)).toEqual(
      parsed.document?.rows.map((row) => row.map((block) => block.source))
    );
  });

  it("allows empty blocks at every boundary", () => {
    expect(blockSources("|||\n---\n|||")).toEqual([
      ["", ""],
      ["", ""],
    ]);
  });

  it("does not recognize ordinary canvas text", () => {
    const parsed = parseBlockLayout("A\nB\n{still content}");
    expect(parsed).toEqual({
      document: null,
      recognized: false,
      boundaries: { fields: 0, rows: 0 },
      diagnostics: [],
    });
  });

  it("places fields right and rows below the tallest field", async () => {
    const rendered = await renderCharGraphText(
      "AA\nAA\nAA\n|||\nB\n---\nC\n|||\nDD",
      { layout: { columnGap: 2, rowGap: 1 } }
    );

    expect(getCharGraphText(rendered)).toBe("AA  B\nAA\nAA\n\nC  DD");
  });

  it("centers only table and Mermaid groups inside each field", async () => {
    const rendered = await renderCharGraphText([
      "123456789012",
      "",
      "| A | B |",
      "|---|---|",
      "| 1 | 2 |",
      "|||",
      "Label",
      "",
      "```mermaid",
      "flowchart LR",
      "  A[1] --> B[2]",
      "```",
    ].join("\n"), { layout: { columnGap: 4 } });

    expect(getCharGraphText(rendered)).toBe([
      "123456789012    Label",
      "",
      "   A    B       ╭───╮   ╭───╮",
      "  ━━━  ━━━      │ 1 ├──>│ 2 │",
      "   1    2       ╰───╯   ╰───╯",
    ].join("\n"));
  });

  it("keeps ordinary Markdown groups start-aligned inside wider fields", async () => {
    const rendered = await renderCharGraphText(
      "123456789\n\n**界**\n|||\nX",
      { layout: { columnGap: 2 } }
    );

    expect(getCharGraphText(rendered)).toBe("123456789  X\n\n界");
  });

  it("applies explicit end alignment without changing the field width", async () => {
    const rendered = await renderBlockLayoutDocument({
      rows: [[{ source: "", range: { from: 0, to: 0 } }]],
    }, async () => ({
      fragments: [{ text: "AB\n123456" }],
      recognized: true,
      diagnostics: [],
      visualGroups: [
        { fromRow: 0, toRow: 1, inlineAlignment: "end" },
        { fromRow: 1, toRow: 2, inlineAlignment: "start" },
      ],
    }));

    expect(getCharGraphText(rendered)).toBe("    AB\n123456");
  });

  it("ignores visual groups outside the rendered field", async () => {
    const rendered = await renderBlockLayoutDocument({
      rows: [[{ source: "A", range: { from: 0, to: 1 } }]],
    }, async () => ({
      fragments: [{ text: "A" }],
      recognized: true,
      diagnostics: [],
      visualGroups: [{
        fromRow: 0,
        toRow: Number.MAX_SAFE_INTEGER,
        inlineAlignment: "center",
      }],
    }));

    expect(getCharGraphText(rendered)).toBe("A");
  });

  it("uses protocol width and preserves CharDesk styles", async () => {
    const rendered = await renderCharGraphText(
      "[1m你👋[m\n|||\n한글",
      { layout: { columnGap: 1 } }
    );
    const output = getCharGraphText(rendered);

    expect(output).toBe("你👋 한글");
    expect(parseCharDeskText(output).width).toBe(9);
    expect(rendered.fragments.some((fragment) => fragment.attrs?.bold)).toBe(true);
  });
});
