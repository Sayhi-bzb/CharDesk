import { describe, expect, it } from "vitest";
import { DEFAULT_GRID_RENDER_METRICS } from "./renderMetrics";
import { resolveCellFrameCanvasLayout } from "./cellFrameLayout";

describe("resolveCellFrameCanvasLayout", () => {
  it("contains and centers a wide CellFrame", () => {
    const layout = resolveCellFrameCanvasLayout({
      viewportWidth: 160,
      viewportHeight: 90,
      frameViewport: { x: 0, y: 0, width: 44, height: 10 },
      metrics: DEFAULT_GRID_RENDER_METRICS,
    });

    expect(layout?.offset.x).toBeCloseTo(8);
    expect(layout?.offset.y).toBeGreaterThan(8);
    expect(layout?.width).toBeCloseTo(144);
    expect(layout?.height).toBeLessThanOrEqual(74);
  });

  it("contains and centers a tall CellFrame", () => {
    const layout = resolveCellFrameCanvasLayout({
      viewportWidth: 160,
      viewportHeight: 90,
      frameViewport: { x: 0, y: 0, width: 26, height: 24 },
      metrics: DEFAULT_GRID_RENDER_METRICS,
    });

    expect(layout?.offset.x).toBeGreaterThan(8);
    expect(layout?.offset.y).toBeCloseTo(8);
    expect(layout?.width).toBeLessThanOrEqual(144);
    expect(layout?.height).toBeCloseTo(74);
  });

  it("caps enlargement while retaining canonical cell proportions", () => {
    const layout = resolveCellFrameCanvasLayout({
      viewportWidth: 160,
      viewportHeight: 90,
      frameViewport: { x: 0, y: 0, width: 8, height: 1 },
      metrics: DEFAULT_GRID_RENDER_METRICS,
    });

    expect(layout).toMatchObject({
      offset: { x: 8, y: 25 },
      width: 144,
      height: 40,
      scale: 2,
    });
  });

  it("accounts for non-zero CellFrame viewport origins", () => {
    const layout = resolveCellFrameCanvasLayout({
      viewportWidth: 38,
      viewportHeight: 60,
      frameViewport: { x: 4, y: 2, width: 2, height: 2 },
      metrics: DEFAULT_GRID_RENDER_METRICS,
      padding: 1,
      maxScale: 1,
    });

    expect(layout).toMatchObject({
      offset: { x: -26, y: -30 },
      width: 18,
      height: 40,
      scale: 1,
    });
  });

  it("rejects an unmeasurable viewport", () => {
    expect(
      resolveCellFrameCanvasLayout({
        viewportWidth: 0,
        viewportHeight: 90,
        frameViewport: { x: 0, y: 0, width: 8, height: 1 },
        metrics: DEFAULT_GRID_RENDER_METRICS,
      })
    ).toBeNull();
  });
});
