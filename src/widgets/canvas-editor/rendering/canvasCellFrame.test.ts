import { describe, expect, it } from "vitest";
import { createGridSurfaceReader } from "@/domains/canvas/public";
import { formatCharDeskCellFrame } from "@chardesk/rendering/canvas";
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
});
