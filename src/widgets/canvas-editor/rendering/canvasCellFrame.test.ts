import { describe, expect, it } from "vitest";
import { createGridSurfaceReader } from "@/domains/canvas/public";
import { formatCharDeskCellFrame } from "@chardesk/rendering";
import { createCanvasCellFrame } from "./canvasCellFrame";

describe("Canvas Cell Frame adapter", () => {
  it("projects sparse Canvas cells to the shared inspectable frame", () => {
    const reader = createGridSurfaceReader(new Map([
      ["-1,0", { char: "界", color: "#ffffff" }],
      ["2,1", { char: "A", color: "#ffffff" }],
    ]));
    const frame = createCanvasCellFrame(
      reader,
      { x: -1, y: 0, width: 4, height: 2 }
    );
    expect(formatCharDeskCellFrame(frame, { trimEnd: true })).toBe("界\n   A");
    expect(frame.source.get({ x: 2, y: 1 })?.visual.text).toBe("A");
  });

  it("forwards incremental revisions without coupling rendering to the domain", () => {
    const reader = createGridSurfaceReader(new Map([["0,0", { char: "x", color: "#fff" }]]));
    expect(createCanvasCellFrame(reader, { x: 0, y: 0, width: 1, height: 1 }).revision).toBe(0);
  });

  it("projects a range move as one final visual state", () => {
    const reader = createGridSurfaceReader(new Map([
      ["0,0", { char: "A", color: "#fff" }],
      ["1,0", { char: "B", color: "#fff" }],
      ["3,0", { char: "X", color: "#fff" }],
      ["4,0", { char: "Y", color: "#fff" }],
    ]));
    const overlay = createGridSurfaceReader(new Map([
      ["3,0", { char: "A", color: "#fff" }],
    ]));
    const frame = createCanvasCellFrame(
      reader,
      { x: 0, y: 0, width: 5, height: 1 },
      "full",
      {
        hiddenSpans: [
          { y: 0, minX: 0, maxX: 1 },
          { y: 0, minX: 3, maxX: 4 },
        ],
        overlay,
      }
    );

    expect(formatCharDeskCellFrame(frame, { trimEnd: true })).toBe("   A");
    expect(frame.source.get({ x: 0, y: 0 })).toBeUndefined();
    expect(frame.source.get({ x: 3, y: 0 })?.visual.text).toBe("A");
    expect(frame.source.get({ x: 4, y: 0 })).toBeUndefined();
  });

});
