import { describe, expect, it } from "vitest";
import { getGraphemeCellWidth } from "@chardesk/protocol";
import { CellUiRuntime, Root, ScrollArea, Text } from "./index.js";
import { walkCellTextRows, walkCellTextRowsInRange, type CellTextGlyphPlacement } from "./text-lines.js";

describe("shared Cell text rows", () => {
  it("places graphemes with the same wrapping used for measurement", () => {
    const placed: Array<{ segment: string; column: number; row: number }> = [];
    expect(walkCellTextRows("ab中cd", 4, ({ segment, column, row }) => {
      placed.push({ segment, column, row });
    })).toEqual({ width: 4, height: 2 });
    expect(placed).toEqual([
      { segment: "a", column: 0, row: 0 },
      { segment: "b", column: 1, row: 0 },
      { segment: "中", column: 2, row: 0 },
      { segment: "c", column: 0, row: 1 },
      { segment: "d", column: 1, row: 1 },
    ]);
  });

  it("preserves empty rows and Unicode grapheme boundaries", () => {
    const text = "é👩‍💻\t\n\nZ";
    const placed: string[] = [];
    const measured = walkCellTextRows(text, 20, ({ segment, row }) => {
      placed.push(`${row}:${segment}`);
    });
    expect(measured).toEqual({
      width: getGraphemeCellWidth("é") + getGraphemeCellWidth("👩‍💻") + getGraphemeCellWidth("\t"),
      height: 3,
    });
    expect(placed).toEqual(["0:é", "0:👩‍💻", "0:\t", "2:Z"]);
    expect(walkCellTextRows("", 4)).toEqual({ width: 0, height: 1 });
  });

  it("preserves placement and source offsets after long text becomes prepared", () => {
    const value = `${"ab中👩‍💻é\t\n".repeat(20)}last`;
    const collect = (width: number) => {
      const glyphs: Array<{ segment: string; offset: number; column: number; row: number; width: number }> = [];
      const size = walkCellTextRows(value, width, (glyph) => { glyphs.push(glyph); });
      return { size, glyphs };
    };
    const cold = collect(4);
    expect(collect(4)).toEqual(cold);
    expect(collect(4)).toEqual(cold);
    expect(cold.glyphs[2]).toEqual({ segment: "中", offset: 2, column: 2, row: 0, width: 2 });
    expect(cold.glyphs[3]).toEqual({ segment: "👩‍💻", offset: 3, column: 0, row: 1, width: 2 });
    const narrow = collect(1);
    expect(narrow.size.height).toBeGreaterThan(cold.size.height);
    expect(narrow.glyphs.map(({ segment, offset }) => [segment, offset]))
      .toEqual(cold.glyphs.map(({ segment, offset }) => [segment, offset]));
    expect(walkCellTextRows(value, 4, ({ row }) => row < 2)).toEqual({ width: 4, height: 3 });
  });

  it("gives Yoga and the painter the same row geometry", () => {
    for (const [value, width] of [
      ["ab中cd", 4], ["é👩‍💻\tZ\nnext", 8], ["first\n\nlast", 5], ["a中b", 1],
    ] as const) {
      const runtime = new CellUiRuntime({ viewport: { width: 20, height: 20 } });
      const frame = runtime.render(<Root><Text id="sample" style={{ width }}>{value}</Text></Root>);
      const expected = walkCellTextRows(value, width);
      expect(frame.layout.entries.get("sample")?.rect.height).toBe(expected.height);
      walkCellTextRows(value, width, ({ segment, column, row, width: glyphWidth }) => {
        if (glyphWidth > width) return false;
        expect(frame.buffer.get(column, row)?.text).toBe(segment);
      });
      runtime.dispose();
    }
  });

  it("keeps the existing narrow-cell and height clipping behavior", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 1, height: 3 } });
    const frame = runtime.render(<Root><Text id="narrow" style={{ width: 1, height: 3 }}>a中b</Text></Root>);
    expect(walkCellTextRows("a中b", 1)).toEqual({ width: 2, height: 3 });
    expect(frame.buffer.toText({ trimEnd: true })).toBe("a\n\n");
    runtime.dispose();

    const clipped = new CellUiRuntime({ viewport: { width: 3, height: 1 } });
    expect(clipped.render(<Root><Text style={{ width: 3, height: 1 }}>abcd</Text></Root>)
      .buffer.toText({ trimEnd: true })).toBe("abc");
    clipped.dispose();
  });

  it("matches full-walk placements and source offsets across deep windows and rewraps", () => {
    const values = [
      `${"ab中👩‍💻é\n\n".repeat(240)}end`,
      `${"ab中👩‍💻é\n\n".repeat(240)}changed`,
      `${"🇺🇸🇨🇦👨‍👩‍👧‍👦 x\n".repeat(200)}end`,
    ];
    for (const value of values) for (const width of [2, 4, 9]) {
      const all: CellTextGlyphPlacement[] = [];
      const { height } = walkCellTextRows(value, width, (glyph) => { all.push(glyph); });
      for (const first of [35, Math.floor(height / 2), Math.max(0, height - 4)]) {
        const actual: typeof all = [];
        walkCellTextRowsInRange(value, width, first, first + 3, (glyph) => { actual.push(glyph); });
        expect(actual).toEqual(all.filter(({ row }) => row >= first && row < first + 3));
      }
    }
  });

  it("paints a deeply scrolled long Text with the same Cells and source copy data", () => {
    const value = `${"ab中👩‍💻é\n\n".repeat(240)}end`;
    const runtime = new CellUiRuntime({ viewport: { width: 12, height: 4 } });
    for (const scrollY of [0, 180, 350, 50]) {
      const frame = runtime.render(<Root><ScrollArea id="scroll" scrollY={scrollY}
        style={{ width: 12, height: 4 }}><Text id="long" markdownSource>{value}</Text></ScrollArea></Root>);
      const entry = frame.scene.entries.get("long")!;
      const { contentBounds: bounds, contentClip: clip } = entry;
      let visibleGlyphs = 0;
      walkCellTextRows(value, bounds.width, ({ segment, column, row, width }) => {
        if (row >= bounds.height || width > bounds.width) return false;
        const x = bounds.x + column;
        const y = bounds.y + row;
        if (x >= clip.x && x + width <= clip.x + clip.width && y >= clip.y && y < clip.y + clip.height) {
          visibleGlyphs += 1;
          expect(frame.buffer.get(x, y)).toMatchObject({ text: segment, ownerId: "long", copyText: segment });
        }
      });
      expect(visibleGlyphs).toBeGreaterThan(0);
    }
    runtime.dispose();
  });

  it("retains the narrow-cell stop before a deeply scrolled viewport", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 3, height: 3 } });
    const value = "a中b\n".repeat(100);
    const frame = runtime.render(<Root><ScrollArea scrollY={40} style={{ width: 3, height: 3 }}>
      <Text id="narrow-long" style={{ width: 1 }}>{value}</Text>
    </ScrollArea></Root>);
    for (let y = 0; y < 3; y += 1) for (let x = 0; x < 3; x += 1) {
      const cell = frame.buffer.get(x, y);
      if (cell?.ownerId === "narrow-long") expect(cell.text).toBe(" ");
    }
    runtime.dispose();
  });
});
