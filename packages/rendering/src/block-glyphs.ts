export type GlyphRect = Readonly<{ x: number; y: number; width: number; height: number }>;

const rect = (x: number, y: number, width: number, height: number): GlyphRect => ({ x, y, width, height });
const blocks = new Map<string, readonly GlyphRect[]>([
  ["▀", [rect(0, 0, 1, 0.5)]],
  ["▐", [rect(0.5, 0, 0.5, 1)]],
  ["▔", [rect(0, 0, 1, 0.125)]],
  ["▕", [rect(0.875, 0, 0.125, 1)]],
]);
for (let part = 1; part <= 8; part++) {
  blocks.set(String.fromCodePoint(0x2580 + part), [rect(0, 1 - part / 8, 1, part / 8)]);
}
for (let part = 1; part <= 7; part++) {
  blocks.set(String.fromCodePoint(0x2590 - part), [rect(0, 0, part / 8, 1)]);
}
// Bits: upper-left, upper-right, lower-left, lower-right. Disjoint quadrants
// preserve alpha coverage even when a glyph contains three filled quarters.
const quarters = [4, 8, 1, 13, 9, 7, 11, 2, 6, 14];
quarters.forEach((mask, index) => {
  blocks.set(String.fromCodePoint(0x2596 + index), [0, 1, 2, 3]
    .filter((bit) => mask & (1 << bit))
    .map((bit) => rect((bit % 2) / 2, Math.floor(bit / 2) / 2, 0.5, 0.5)));
});

export const blockGlyphRects = (text: string): readonly GlyphRect[] | undefined => blocks.get(text);

export type AxisTransform = Readonly<{ a: number; b: number; c: number; d: number; e?: number; f?: number }>;

/** Snap absolute edges, never dimensions, so adjacent regions share an edge. */
export const alignCanvasRect = (bounds: GlyphRect, transform?: AxisTransform): GlyphRect => {
  if (!transform || transform.b !== 0 || transform.c !== 0 || !transform.a || !transform.d) return bounds;
  const x = (value: number) => (Math.round(value * transform.a + (transform.e ?? 0)) - (transform.e ?? 0)) / transform.a;
  const y = (value: number) => (Math.round(value * transform.d + (transform.f ?? 0)) - (transform.f ?? 0)) / transform.d;
  const left = x(bounds.x);
  const top = y(bounds.y);
  return { x: left, y: top, width: x(bounds.x + bounds.width) - left, height: y(bounds.y + bounds.height) - top };
};
