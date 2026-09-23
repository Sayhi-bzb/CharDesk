import type { CellRect } from "./types.js";

type AnchoredOverlaySide = "above" | "below";

type AnchoredOverlayPlacement = Readonly<{
  bounds: CellRect;
  side: AnchoredOverlaySide;
  constrained: boolean;
}>;

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value));

export const placeAnchoredOverlay = (
  anchor: CellRect,
  desired: Readonly<{ width: number; height: number }>,
  viewport: CellRect,
  options: Readonly<{ preferredSide?: AnchoredOverlaySide; gap?: number }> = {},
): AnchoredOverlayPlacement => {
  const gap = Math.max(0, Math.trunc(options.gap ?? 0));
  const width = Math.min(desired.width, viewport.width);
  const x = clamp(anchor.x, viewport.x, viewport.x + viewport.width - width);
  const viewportBottom = viewport.y + viewport.height;
  const anchorBottom = anchor.y + anchor.height;
  const below = Math.max(0, viewportBottom - anchorBottom - gap);
  const above = Math.max(0, anchor.y - viewport.y - gap);
  const preferredSide = options.preferredSide ?? "below";
  const otherSide = preferredSide === "below" ? "above" : "below";
  const availableFor = (side: AnchoredOverlaySide) => side === "below" ? below : above;
  const side: AnchoredOverlaySide = desired.height <= availableFor(preferredSide)
    ? preferredSide
    : desired.height <= availableFor(otherSide)
      ? otherSide
      : availableFor(preferredSide) >= availableFor(otherSide) ? preferredSide : otherSide;
  const available = side === "below" ? below : above;
  const height = Math.min(desired.height, available);
  const y = side === "below" ? anchorBottom + gap : anchor.y - gap - height;
  return {
    bounds: { x, y, width, height },
    side,
    constrained: width < desired.width || height < desired.height,
  };
};
