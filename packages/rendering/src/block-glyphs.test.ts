import { expect, it } from "vitest";
import { alignCanvasRect, blockGlyphRects } from "./block-glyphs.js";

it("maps all solid blocks to disjoint normalized rectangles, excluding shades", () => {
  for (let code = 0x2580; code <= 0x259f; code++) {
    const parts = blockGlyphRects(String.fromCodePoint(code));
    if (code >= 0x2591 && code <= 0x2593) {
      expect(parts).toBeUndefined();
      continue;
    }
    expect(parts?.length).toBeGreaterThan(0);
    for (const a of parts!) {
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.y).toBeGreaterThanOrEqual(0);
      expect(a.x + a.width).toBeLessThanOrEqual(1);
      expect(a.y + a.height).toBeLessThanOrEqual(1);
      for (const b of parts!) {
        if (a === b) continue;
        expect(Math.min(a.x + a.width, b.x + b.width) <= Math.max(a.x, b.x)
          || Math.min(a.y + a.height, b.y + b.height) <= Math.max(a.y, b.y)).toBe(true);
      }
    }
  }
  expect(blockGlyphRects("█")).toEqual([{ x: 0, y: 0, width: 1, height: 1 }]);
  expect(blockGlyphRects("▟")).toEqual([
    { x: 0.5, y: 0, width: 0.5, height: 0.5 },
    { x: 0, y: 0.5, width: 0.5, height: 0.5 },
    { x: 0.5, y: 0.5, width: 0.5, height: 0.5 },
  ]);
  for (const text of ["A", "界", "👋", "▬", "─", "█\u0301"]) expect(blockGlyphRects(text)).toBeUndefined();
});

it("shares fractional pixel edges without expanding collapsed pieces", () => {
  const transform = { a: 1.25, b: 0, c: 0, d: 1.25, e: 0.3, f: 0.2 };
  const left = alignCanvasRect({ x: 0, y: 0, width: 4.5, height: 19 }, transform);
  const right = alignCanvasRect({ x: 4.5, y: 0, width: 4.5, height: 19 }, transform);
  expect(left.x + left.width).toBe(right.x);
  expect(alignCanvasRect({ x: 0, y: 0, width: 0.01, height: 0.01 }, transform).width).toBe(0);
  const bounds = { x: 0.1, y: 0.1, width: 9, height: 19 };
  expect(alignCanvasRect(bounds, { ...transform, b: 1 })).toBe(bounds);
});
