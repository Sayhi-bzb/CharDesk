import { describe, expect, it } from "vitest";
import { formatCharDeskStyleNotes, type CharDeskStyleNoteCell } from "./style-notes.js";

describe("Cell style notes", () => {
  it("merges horizontal and vertical runs in absolute coordinates without mutating input", () => {
    const cells: CharDeskStyleNoteCell[] = [
      { x: 12, y: -1, width: 1, color: "#f00", attrs: { bold: true } },
      { x: 10, y: -2, width: 2, color: "#f00", attrs: { bold: true } },
      { x: 10, y: -1, width: 2, color: "#f00", attrs: { bold: true } },
      { x: 12, y: -2, width: 1, color: "#f00", attrs: { bold: true } },
    ];
    const before = structuredClone(cells);
    expect(formatCharDeskStyleNotes(cells, { coordinates: "explicit" })).toBe("styles:\n  y=-2..-1 x=10..12{fg:#f00;bold}");
    expect(formatCharDeskStyleNotes(cells)).toBe("styles:\n  -2--1:10-12{fg:#f00;bold}");
    expect(cells).toEqual(before);
  });

  it("retains all supported attributes and quoted links, but does not bridge gaps", () => {
    const cell: CharDeskStyleNoteCell = {
      x: 0, y: 0, width: 1, color: "#123", bgColor: "#456",
      attrs: { bold: true, italic: true, underline: true, strike: true, inverse: true },
      href: 'https://example.com/"\n',
    };
    const notes = formatCharDeskStyleNotes([cell, { ...cell, x: 2 }], { coordinates: "explicit" });
    expect(notes).toContain("y=0 x=0,y=0 x=2{");
    expect(notes).toContain(`fg:#123;bg:#456;bold;italic;underline;strike;inverse;link:${JSON.stringify(cell.href)}`);
    expect(notes.split("\n")).toHaveLength(2);
  });

  it("omits unstyled cells and bounds fragmented style output with an explicit notice", () => {
    expect(formatCharDeskStyleNotes([{ x: 0, y: 0, width: 1 }])).toBe("styles:none");
    const cells = Array.from({ length: 300 }, (_, x) => ({ x, y: 0, width: 1, color: x % 2 ? "#fff" : "#000" }));
    const notes = formatCharDeskStyleNotes(cells, { coordinates: "explicit" });
    expect(notes).toContain("styles:256/300 regions · narrow the viewport");
    expect(notes).not.toContain("x=256");
  });
});
