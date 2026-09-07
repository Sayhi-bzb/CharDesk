import { describe, expect, it } from "vitest";
import { formatCharDeskCellFrame } from "@chardesk/rendering";
import { CellBuffer } from "../../packages/cell-ui/src/buffer.js";
import { createCellUiRenderFrame } from "../../packages/cell-ui/src/frame.js";
import type { FrameSnapshot } from "../../packages/cell-ui/src/types.js";
import { createGridSurfaceReader } from "../../src/domains/canvas/public.js";
import { createCanvasCellFrame } from "../../src/widgets/canvas-editor/rendering/canvasCellFrame.js";

describe("Cell frame adapter parity", () => {
  it("matches dense Cell UI and sparse Canvas Unicode snapshots", () => {
    const viewport = { x: 0, y: 0, width: 6, height: 2 };
    const buffer = new CellBuffer(viewport);
    buffer.writeGrapheme(0, 0, "界", "dense");
    buffer.writeGrapheme(3, 0, "A", "dense");
    buffer.writeGrapheme(1, 1, "👋", "dense");
    const denseFrame = createCellUiRenderFrame({
      revision: 7,
      buffer,
      scene: { viewport },
      invalidation: { dirtyRegions: [] },
    } as unknown as FrameSnapshot, "full");
    const sparseFrame = createCanvasCellFrame(createGridSurfaceReader(new Map([
      ["0,0", { char: "界", color: "#ffffff" }],
      ["3,0", { char: "A", color: "#ffffff" }],
      ["1,1", { char: "👋", color: "#ffffff" }],
    ])), viewport);

    expect(formatCharDeskCellFrame(denseFrame)).toBe(
      formatCharDeskCellFrame(sparseFrame)
    );
    expect(formatCharDeskCellFrame(sparseFrame)).toBe("界 A  \n 👋   ");
  });
});
