import { describe, expect, it, vi } from "vitest";
import { traceCellGraphicCorner, traceCellGraphicPath } from "./cell-graphics-path.js";

const bounds = { x: 0, y: 0, width: 9, height: 20 };
function trace(path: string, width = 1, transform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) {
  const ctx = { moveTo: vi.fn(), lineTo: vi.fn() };
  traceCellGraphicPath(ctx as unknown as CanvasRenderingContext2D, path, bounds, width, transform);
  return ctx;
}

describe("Box stroke alignment", () => {
  it("snaps the cross axis without shortening Cell-edge endpoints", () => {
    const horizontal = trace("M0,.5 L1,.5");
    expect(horizontal.moveTo).toHaveBeenCalledWith(0, 10.5);
    expect(horizontal.lineTo).toHaveBeenCalledWith(9, 10.5);
    const vertical = trace("M.5,0 L.5,1");
    expect(vertical.moveTo).toHaveBeenCalledWith(4.5, 0);
    expect(vertical.lineTo).toHaveBeenCalledWith(4.5, 20);
    expect(trace("M0,.5 L1,.5", 2).moveTo).toHaveBeenCalledWith(0, 10);
  });

  it("accounts for DPR, signed scales and fractional translation", () => {
    for (const scale of [1, 1.25, 2, -2]) for (const offset of [0.2, 0.5]) {
      const width = 1 / Math.abs(scale);
      const ctx = trace("M0,.5 L1,.5", width, { a: scale, b: 0, c: 0, d: scale, e: offset, f: offset });
      const y = ctx.moveTo.mock.calls[0]![1] as number;
      expect(y * scale + offset - 0.5).toBeCloseTo(Math.round(y * scale + offset - 0.5), 10);
      expect(ctx.lineTo.mock.calls[0]![0]).toBe(9);
    }
  });

  it("mirrors equal-radius quarter circles with tangent straight connections", () => {
    for (const scale of [1, 1.25, 2, -2]) for (const offset of [0, 0.2, 0.5]) {
      const transform = { a: scale, b: 0, c: 0, d: scale, e: offset, f: offset };
      const width = 2 / Math.abs(scale);
      const x = trace("M.5,0 L.5,1", width, transform).moveTo.mock.calls[0]![0] as number;
      const y = trace("M0,.5 L1,.5", width, transform).moveTo.mock.calls[0]![1] as number;
      const radius = Math.min(x, 9 - x, y, 20 - y);
      for (const dx of [-1, 1]) for (const dy of [-1, 1]) {
        const ctx = { moveTo: vi.fn(), lineTo: vi.fn(), arc: vi.fn() };
        traceCellGraphicCorner(ctx as unknown as CanvasRenderingContext2D, { x: dx, y: dy }, bounds, width, transform);
        expect(ctx.moveTo).toHaveBeenCalledWith(x, dy > 0 ? 20 : 0);
        expect(ctx.lineTo.mock.calls).toEqual([[x, y + dy * radius], [dx > 0 ? 9 : 0, y]]);
        const [cx, cy, r, start, end, ccw] = ctx.arc.mock.calls[0] as [number, number, number, number, number, boolean];
        expect([cx, cy, r, ccw]).toEqual([x + dx * radius, y + dy * radius, radius, dx !== dy]);
        expect(cx + r * Math.cos(start)).toBeCloseTo(x);
        expect(cy + r * Math.sin(start)).toBeCloseTo(y + dy * radius);
        expect(cx + r * Math.cos(end)).toBeCloseTo(x + dx * radius);
        expect(cy + r * Math.sin(end)).toBeCloseTo(y);
        const sweep = ((ccw ? start - end : end - start) + 2 * Math.PI) % (2 * Math.PI);
        expect(sweep).toBeCloseTo(Math.PI / 2);
        for (let i = 0; i <= 16; i++) {
          const angle = start + (ccw ? -1 : 1) * sweep * i / 16;
          const px = cx + r * Math.cos(angle), py = cy + r * Math.sin(angle);
          expect(px).toBeGreaterThanOrEqual(-1e-10);
          expect(px).toBeLessThanOrEqual(9 + 1e-10);
          expect(py).toBeGreaterThanOrEqual(-1e-10);
          expect(py).toBeLessThanOrEqual(20 + 1e-10);
          expect((px - x) * dx).toBeGreaterThanOrEqual(-1e-10);
          expect((py - y) * dy).toBeGreaterThanOrEqual(-1e-10);
        }
      }
    }
  });

  it("keeps transformed corner geometry unsnapped and zero-radius paths connected", () => {
    const ctx = { moveTo: vi.fn(), lineTo: vi.fn(), arc: vi.fn() };
    traceCellGraphicCorner(ctx as unknown as CanvasRenderingContext2D, { x: 1, y: 1 }, bounds, 2,
      { a: 1, b: 0.2, c: 0, d: 1 });
    expect(ctx.moveTo).toHaveBeenCalledWith(4.5, 20);
    expect(ctx.arc).toHaveBeenCalledWith(9, 14.5, 4.5, Math.PI, -Math.PI / 2, false);
    ctx.arc.mockClear();
    ctx.lineTo.mockClear();
    traceCellGraphicCorner(ctx as unknown as CanvasRenderingContext2D, { x: 1, y: 1 }, { ...bounds, width: 1 }, 2);
    expect(ctx.arc).not.toHaveBeenCalled();
    expect(ctx.lineTo.mock.calls).toEqual([[1, 10], [1, 10]]);
  });

  it("keeps diagonals and rotated or sheared paths unsnapped", () => {
    expect(trace("M0,0 L1,1").lineTo).toHaveBeenCalledWith(9, 20);
    for (const transform of [{ a: 1, b: 0.2, c: 0, d: 1, e: 0, f: 0 }, { a: 1, b: 0, c: 0.2, d: 1, e: 0, f: 0 }]) {
      expect(trace("M0,.5 L1,.5", 1, transform).moveTo).toHaveBeenCalledWith(0, 10);
    }
  });
});

describe("Cell graphic vector paths", () => {
  it("traces the complete command subset used by xterm definitions", () => {
    const ctx = {
      moveTo: vi.fn(), lineTo: vi.fn(), bezierCurveTo: vi.fn(), quadraticCurveTo: vi.fn(),
      ellipse: vi.fn(), closePath: vi.fn(),
    };
    traceCellGraphicPath(ctx as unknown as CanvasRenderingContext2D,
      "M.1,.2 H.2 V.3 L.4,.5 C.4,.5,.5,.6,.6,.7 Q.7,.8,.8,.7 T.9,.5 A.1,.2,0,0,1,.1,.2 Z",
      bounds, 1, undefined, false);
    expect(ctx.moveTo).toHaveBeenCalledOnce();
    expect(ctx.lineTo).toHaveBeenCalledTimes(3);
    expect(ctx.bezierCurveTo).toHaveBeenCalledOnce();
    expect(ctx.quadraticCurveTo).toHaveBeenCalledTimes(2);
    expect(ctx.ellipse).toHaveBeenCalledOnce();
    expect(ctx.closePath).toHaveBeenCalledOnce();
  });

  it("rejects path commands outside the pinned absolute subset", () => {
    expect(() => traceCellGraphicPath({} as CanvasRenderingContext2D,
      "M0,0 S1,1,1,0", bounds, 1)).toThrow("Unsupported Cell graphic path syntax: S");
  });
});
