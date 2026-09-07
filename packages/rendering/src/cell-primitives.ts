export type CharDeskNormalizedCellRect = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export const CHARDESK_CELL_EDGE = {
  top: 1,
  right: 2,
  bottom: 4,
  left: 8,
} as const;

export type CharDeskCellEdgeMask = number;

export type CharDeskCellPrimitive =
  | Readonly<{
      kind: "line";
      edges: CharDeskCellEdgeMask;
      join: "square" | "rounded";
      weight: "single";
    }>
  | Readonly<{
      kind: "fill";
      regions: readonly CharDeskNormalizedCellRect[];
    }>;

export type AxisTransform = Readonly<{
  a: number;
  b: number;
  c: number;
  d: number;
  e?: number;
  f?: number;
}>;

/** Snap absolute edges, never dimensions, so adjacent regions share an edge. */
export const alignCanvasRect = (
  bounds: CharDeskNormalizedCellRect,
  transform?: AxisTransform
): CharDeskNormalizedCellRect => {
  if (!transform || transform.b !== 0 || transform.c !== 0 || !transform.a || !transform.d) return bounds;
  const x = (value: number) =>
    (Math.round(value * transform.a + (transform.e ?? 0)) - (transform.e ?? 0)) / transform.a;
  const y = (value: number) =>
    (Math.round(value * transform.d + (transform.f ?? 0)) - (transform.f ?? 0)) / transform.d;
  const left = x(bounds.x);
  const top = y(bounds.y);
  return {
    x: left,
    y: top,
    width: x(bounds.x + bounds.width) - left,
    height: y(bounds.y + bounds.height) - top,
  };
};
