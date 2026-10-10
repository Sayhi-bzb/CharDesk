import { describe, expect, it } from "vitest";
import { createCellSurfaceGeometryTransform } from "./browser-surface-geometry.js";

describe("CellSurface geometry transform", () => {
  it.each([0, 1, 2])("keeps scene/client coordinates aligned with guard %i", (guardCells) => {
    const surface = {
      getBoundingClientRect: () => new DOMRect(100, 200, 400, 200),
    } as unknown as Element;
    const transform = createCellSurfaceGeometryTransform({
      surface,
      viewport: { width: 20, height: 8 },
      overlayViewport: { width: 20, height: 11 },
      metrics: { cellWidth: 10, cellHeight: 20, fontSize: 15, fontFamily: "monospace" },
      guardCells,
    });

    expect(transform.contentOriginPx).toEqual({
      left: 100 + guardCells * 10,
      top: 200 + guardCells * 20,
    });
    expect(transform.clientToScenePoint({
      clientX: 100 + (guardCells + 3) * 10 + 1,
      clientY: 200 + (guardCells + 4) * 20 + 1,
    })).toEqual({ x: 3, y: 4 });
    expect(transform.sceneToSurfaceRect({ x: 3, y: 4, width: 2, height: 1 }))
      .toMatchObject({ left: (guardCells + 3) * 10, top: (guardCells + 4) * 20, width: 20, height: 20 });
  });
});
