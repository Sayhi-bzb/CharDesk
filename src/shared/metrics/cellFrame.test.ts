import { describe, expect, it } from "vitest";
import { formatCharDeskCellFrame } from "@chardesk/rendering";
import type { GridCell, GridCellSource } from "@/shared/types";
import { createGridMapSource } from "@/shared/utils/grid-source";
import { createGridCellFrame } from "./cellFrame";

describe("createGridCellFrame", () => {
  it("preserves sparse Unicode positions and wide-cell occupancy", () => {
    const source = createGridMapSource(
      new Map<string, GridCell>([
        ["-1,0", { char: "界", color: "#ffffff" }],
        ["2,1", { char: "A", color: "#ffffff" }],
      ])
    );
    const frame = createGridCellFrame(source, {
      x: -1,
      y: 0,
      width: 4,
      height: 2,
    });

    expect(formatCharDeskCellFrame(frame, { trimEnd: true })).toBe(
      "界\n   A"
    );
    expect(frame.source.get({ x: -1, y: 0 })?.visual.width).toBe(2);
  });

  it("treats present cells as opaque replacements", () => {
    const source = createGridMapSource(
      new Map<string, GridCell>([
        ["0,0", { char: "A", color: "#111111" }],
        ["1,0", { char: " ", color: "#111111", bgColor: "#eeeeee" }],
        ["2,0", { char: "B", color: "#111111", attrs: { inverse: true } }],
      ])
    );
    const frame = createGridCellFrame(source, {
      x: 0,
      y: 0,
      width: 3,
      height: 1,
    });

    expect(frame.source.get({ x: 0, y: 0 })).toMatchObject({
      drawBackground: true,
      drawText: true,
    });
    expect(frame.source.get({ x: 1, y: 0 })).toMatchObject({
      drawBackground: true,
      drawText: false,
    });
    expect(frame.source.get({ x: 2, y: 0 })).toMatchObject({
      drawBackground: true,
      drawText: true,
    });
  });

  it("forwards a source revision when the capability is present", () => {
    const base = createGridMapSource(new Map());
    const source: GridCellSource & { getRevision(): number } = {
      ...base,
      getRevision: () => 17,
    };

    expect(
      createGridCellFrame(source, { x: 0, y: 0, width: 1, height: 1 })
        .revision
    ).toBe(17);
  });
});
