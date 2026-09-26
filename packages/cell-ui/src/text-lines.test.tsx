import { describe, expect, it } from "vitest";
import { getGraphemeCellWidth } from "@chardesk/protocol";
import { CellUiRuntime, Root, Text } from "./index.js";
import { walkCellTextRows } from "./text-lines.js";

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
});
