import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CHARDESK_TEXT_PROTOCOL_VERSION,
  decodeCharDeskTextRuns,
  getGraphemeCellWidth,
  getTextCellWidth,
  isEmojiGrapheme,
  layoutCharDeskTextRuns,
  layoutCharDeskTextRunsToRows,
  parseCharDeskText,
  parseCharDeskTextRows,
  splitGraphemes,
  stripCharDeskAnsi,
  UNICODE_DATA_VERSION,
} from "./index.js";
import type {
  ParseCharDeskTextOptions,
  ParsedCharDeskText,
} from "./index.js";

type Fixture = {
  name: string;
  source: string;
  options?: ParseCharDeskTextOptions;
  expected: Partial<ParsedCharDeskText>;
};

const fixtures = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../fixtures/v1.json", import.meta.url)),
    "utf8"
  )
) as Fixture[];

describe("CharDesk Text Protocol v1 conformance", () => {
  for (const fixture of fixtures) {
    it(fixture.name, () => {
      const parsed = parseCharDeskText(fixture.source, fixture.options);
      expect(parsed).toMatchObject(fixture.expected);
    });
  }

  it("publishes pinned protocol and Unicode versions", () => {
    expect(CHARDESK_TEXT_PROTOCOL_VERSION).toBe(1);
    expect(UNICODE_DATA_VERSION).toBe("17.0.0");
  });

  it("classifies complete emoji graphemes independently of renderers", () => {
    expect(isEmojiGrapheme("A")).toBe(false);
    expect(isEmojiGrapheme("♥")).toBe(false);
    expect(isEmojiGrapheme("♥️")).toBe(true);
    expect(isEmojiGrapheme("🇨🇳")).toBe(true);
    expect(isEmojiGrapheme("1️⃣")).toBe(true);
    expect(isEmojiGrapheme("👩🏽‍💻")).toBe(true);
  });

  it("measures text width from a streaming grapheme traversal", () => {
    expect(getTextCellWidth("Ae\u0301你👩🏽‍💻🇨🇳1️⃣")).toBe(10);
  });

  it("supports standard and shorthand SGR color forms", () => {
    const parsed = parseCharDeskText(
      "\u001b[31mA\u001b[48;5;21mB[38;2;1;2;3mC[0mD",
      { defaultStyle: { color: "#abcdef" } }
    );

    expect(parsed.cells).toMatchObject([
      { text: "A", color: "#800000" },
      { text: "B", color: "#800000", bgColor: "#0000ff" },
      { text: "C", color: "#010203", bgColor: "#0000ff" },
      { text: "D", color: "#abcdef" },
    ]);
  });

  it("keeps ordinary and unknown bracket text literal in auto mode", () => {
    const parsed = parseCharDeskText("hello [world] [999mA");

    expect(parsed.plainText).toBe("hello [world] [999mA");
    expect(parsed.hasAnsi).toBe(false);
  });

  it("distinguishes ambiguous empty shorthand resets from explicit ANSI", () => {
    expect(parseCharDeskText("[markdown")).toMatchObject({
      plainText: "arkdown",
      hasAnsi: true,
      ansiEvidence: "ambiguous",
    });
    expect(parseCharDeskText("[31mred[0m")).toMatchObject({
      plainText: "red",
      hasAnsi: true,
      ansiEvidence: "explicit",
    });
    expect(parseCharDeskText("\u001b[mreset")).toMatchObject({
      plainText: "reset",
      ansiEvidence: "explicit",
    });
  });

  it("decodes ANSI into styled runs without applying a layout default", () => {
    expect(decodeCharDeskTextRuns("[31mA界[0m\nB")).toMatchObject({
      text: "A界\nB",
      ansiEvidence: "explicit",
      runs: [
        { text: "A界", color: "#800000" },
        { text: "\nB" },
      ],
    });
  });

  it("consumes unknown SGR in ansi mode and reports it", () => {
    const parsed = parseCharDeskText("[999mA", { syntax: "ansi" });

    expect(parsed.plainText).toBe("A");
    expect(parsed.hasAnsi).toBe(true);
    expect(parsed.diagnostics).toMatchObject([
      { code: "unsupported-sgr", offset: 0, length: 5 },
    ]);
  });

  it("supports shorthand OSC 8 links adjacent to SGR", () => {
    const parsed = parseCharDeskText(
      "]8;;https://example.com[1;38;2;255;255;255m Link ]8;;[0m"
    );

    expect(parsed.plainText).toBe(" Link ");
    expect(parsed.cells.every((cell) => cell.href === "https://example.com")).toBe(
      true
    );
    expect(parsed.cells[0]).toMatchObject({
      color: "#ffffff",
      attrs: { bold: true },
    });
  });

  it("resolves inverse as an attribute without rewriting stored colors", () => {
    const [cell] = parseCharDeskText(
      "[7;38;2;10;20;30;48;2;40;50;60mA"
    ).cells;

    expect(cell).toMatchObject({
      color: "#0a141e",
      bgColor: "#28323c",
      attrs: { inverse: true },
    });
  });

  it("normalizes line endings, expands tabs, and preserves a trailing line", () => {
    const parsed = parseCharDeskText("A\tB\rC\r\n", { tabSize: 4 });

    expect(parsed.plainText).toBe("A   B\nC\n");
    expect(parsed).toMatchObject({ width: 5, height: 3 });
  });

  it("returns a zero-sized document for empty or control-only input", () => {
    expect(parseCharDeskText("")).toMatchObject({
      width: 0,
      height: 0,
      cells: [],
    });
    expect(parseCharDeskText("\u0001")).toMatchObject({
      width: 0,
      height: 0,
      cells: [],
      diagnostics: [{ code: "unsupported-control" }],
    });
  });

  it("strips style and link controls without losing visible text", () => {
    expect(
      stripCharDeskAnsi(
        "[31mA[0m ]8;;https://example.com\\B]8;;\\"
      )
    ).toBe("A B");
  });

  it("segments grapheme clusters and applies deterministic cell widths", () => {
    expect(splitGraphemes("é👩🏽‍💻🇨🇳")).toEqual(["é", "👩🏽‍💻", "🇨🇳"]);
    expect(getGraphemeCellWidth("é")).toBe(1);
    expect(getGraphemeCellWidth("界")).toBe(2);
    expect(getGraphemeCellWidth("👩🏽‍💻")).toBe(2);
    expect(getGraphemeCellWidth("󰄳")).toBe(1);
  });

  it("rejects invalid tab sizes", () => {
    expect(() => parseCharDeskText("A", { tabSize: 0 })).toThrow(RangeError);
  });

  it("lays out styled runs with shared grapheme and tab geometry", () => {
    const parsed = layoutCharDeskTextRuns(
      [
        { text: "A界", attrs: { bold: true } },
        { text: "\tB\nC", href: "https://example.com" },
      ],
      { defaultStyle: { color: "#ffffff" }, tabSize: 4 }
    );

    expect(parsed).toMatchObject({ plainText: "A界 B\nC", width: 5, height: 2 });
    expect(parsed.cells).toMatchObject([
      { x: 0, y: 0, text: "A", color: "#ffffff", attrs: { bold: true } },
      { x: 1, y: 0, text: "界", width: 2, attrs: { bold: true } },
      { x: 3, y: 0, text: " ", href: "https://example.com" },
      { x: 4, y: 0, text: "B", href: "https://example.com" },
      { x: 0, y: 1, text: "C", href: "https://example.com" },
    ]);
  });

  it("keeps large uniform input compact as one span per row", () => {
    const source = Array.from({ length: 1_000 }, () => "a".repeat(100)).join("\n");
    const parsed = parseCharDeskTextRows(source);

    expect(parsed).toMatchObject({ width: 100, height: 1_000 });
    expect(parsed.rows).toHaveLength(1_000);
    expect(parsed.rows.every((row) => row.spans.length === 1)).toBe(true);
  });

  it("splits compact spans only at style boundaries", () => {
    const parsed = layoutCharDeskTextRunsToRows([
      { text: "ab", color: "#ffffff" },
      { text: "cd", color: "#ff0000" },
    ]);

    expect(parsed.rows[0]?.spans).toMatchObject([
      { x: 0, width: 2, text: "ab", color: "#ffffff" },
      { x: 2, width: 2, text: "cd", color: "#ff0000" },
    ]);
  });
});
