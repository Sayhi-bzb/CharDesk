import type { CellRect } from "./types.js";

export type AnchoredOverlaySide = "above" | "below";

export type AnchoredOverlayPlacement = Readonly<{
  bounds: CellRect;
  side: AnchoredOverlaySide;
  constrained: boolean;
}>;

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value));

export const placeAnchoredOverlay = (
  anchor: CellRect,
  desired: Readonly<{ width: number; height: number }>,
  viewport: CellRect
): AnchoredOverlayPlacement => {
  const width = Math.min(desired.width, viewport.width);
  const x = clamp(anchor.x, viewport.x, viewport.x + viewport.width - width);
  const viewportBottom = viewport.y + viewport.height;
  const anchorBottom = anchor.y + anchor.height;
  const below = Math.max(0, viewportBottom - anchorBottom);
  const above = Math.max(0, anchor.y - viewport.y);
  const side: AnchoredOverlaySide = desired.height <= below
    ? "below"
    : desired.height <= above
      ? "above"
      : below >= above
        ? "below"
        : "above";
  const available = side === "below" ? below : above;
  const height = Math.min(desired.height, available);
  const y = side === "below" ? anchorBottom : anchor.y - height;
  return {
    bounds: { x, y, width, height },
    side,
    constrained: width < desired.width || height < desired.height,
  };
};
