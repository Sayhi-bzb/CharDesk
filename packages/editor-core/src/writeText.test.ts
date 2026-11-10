import { describe, expect, it } from "vitest";
import { createGridSurfaceReader, type GridCell } from "@chardesk/cell-plane";
import {
  measureCanvasMutationImpact,
  prepareCanvasErase,
} from "./writeText.js";

describe("projection mutation impact", () => {
  it("counts stored spaces with backgrounds, attributes and links", () => {
    const surface = createGridSurfaceReader(
      new Map<string, GridCell>([
        ["-2,3", { char: " ", color: "red", bgColor: "blue" }],
        [
          "-1,3",
          {
            char: " ",
            color: "green",
            attrs: { underline: true },
            href: "https://example.com",
          },
        ],
      ]),
    );
    expect(
      measureCanvasMutationImpact(
        surface,
        prepareCanvasErase({ x: -2, y: 3 }, [2, 1]).patch,
      ),
    ).toMatchObject({ clearedCells: 2, clearedBounds: [-2, 3, 2, 1] });
  });

  it.each([-33, -1, 31])(
    "counts the wide owner once when erasing its trailing column at %s",
    (x) => {
      const surface = createGridSurfaceReader(
        new Map<string, GridCell>([
          [`${x},0`, { char: "界", color: "red", bgColor: "blue" }],
          [`${x + 2},0`, { char: "!", color: "green" }],
        ]),
      );
      for (const [from, width] of [
        [x, 2],
        [x + 1, 1],
      ]) {
        expect(
          measureCanvasMutationImpact(
            surface,
            prepareCanvasErase({ x: from!, y: 0 }, [width!, 1]).patch,
          ),
        ).toMatchObject({ clearedCells: 1, clearedBounds: [x, 0, 2, 1] });
      }
    },
  );

  it("deduplicates overlapping erases and spans against the same logical Cell", () => {
    const surface = createGridSurfaceReader(
      new Map([["0,0", { char: "界", color: "red" }]]),
    );
    expect(
      measureCanvasMutationImpact(surface, {
        rows: [
          {
            y: 0,
            erase: [
              { from: 0, to: 1 },
              { from: 1, to: 1 },
            ],
            spans: [{ x: 0, text: "  ", color: "red", bgColor: "blue" }],
          },
        ],
      }),
    ).toMatchObject({ clearedCells: 1, clearedBounds: [0, 0, 2, 1] });
  });

  it("reports no affected Cells in a large empty interval", () => {
    expect(
      measureCanvasMutationImpact(createGridSurfaceReader(new Map()), {
        rows: [
          { y: 9, erase: [{ from: -1_000_000, to: 1_000_000 }], spans: [] },
        ],
      }),
    ).toMatchObject({ clearedCells: 0, clearedBounds: null });
  });
});
