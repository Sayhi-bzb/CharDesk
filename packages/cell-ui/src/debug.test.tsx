import { describe, expect, it } from "vitest";
import { Box, Button, CellUiRuntime, ResizeHandle, Root, Splitter, Text } from "./index.js";
import { cellDebugReference, inspectCellFrame, inspectCellWidget, verifyCellFrame } from "./debug.js";

describe("Cell debug inspection", () => {
  it("returns a serializable owner, hit stack and semantic snapshot", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 16, height: 3 } });
    const frame = runtime.render(
      <Root id="root"><Box id="toolbar"><Button id="play" label="Play"><Text>Play</Text></Button></Box></Root>,
    );
    const snapshot = inspectCellFrame(frame, { x: 1, y: 0 });
    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      cell: { text: "P" },
      ownerId: "play/text[0]",
      ownerRef: expect.stringMatching(/^play\/[a-z0-9]{7}\/text\[0\]$/),
      hitStack: expect.arrayContaining(["play", "toolbar", "root"]),
      semantic: { id: "play", role: "button", label: "Play" },
    });
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
    expect(inspectCellWidget(frame, "play")).toMatchObject({ semantic: { id: "play" } });
    expect(verifyCellFrame(frame)).toEqual([]);
    expect(cellDebugReference("timeline-range-abc123/text[0]").ref).toBe("timeline-range/abc123/text[0]");
    expect(cellDebugReference("cc:range:0123456789abcdef/text[0]").ref).toMatch(/^range\/[a-z0-9]{7}\/text\[0\]$/);
    const structural = cellDebugReference("root[0]/box[0]/box[1]/text[0]");
    expect(structural.ref).toMatch(/^root\/[a-z0-9]{7}$/);
    expect(structural.ref.length).toBeLessThan(20);
    runtime.dispose();
  });

  it("exposes semantic control state needed to verify editor primitives", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 8, height: 2 } });
    const frame = runtime.render(<Root><Splitter orientation="vertical"><ResizeHandle id="resize" label="Resize pane" resize={{ value: 4, min: 2, max: 6 }} /></Splitter></Root>);
    expect(inspectCellWidget(frame, "resize")).toMatchObject({
      semantic: {
        id: "resize",
        role: "separator",
        orientation: "vertical",
        valueNow: 4,
        valueMin: 2,
        valueMax: 6,
      },
    });
    runtime.dispose();
  });
});
