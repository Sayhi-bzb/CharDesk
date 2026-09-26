import type { Point } from "@/shared/types";
import type { CanvasLinkHit } from "../core/linkHitTesting";
import { shouldUseCanvasLinkPointer } from "../core/hitTesting";

export type HoverInteractionController = {
  updateLinkHover: (hit: CanvasLinkHit | null) => void;
  clearLinkHover: () => void;
  updateColorPickerHover: (point: Point | null) => void;
  setCursor: (cursor: string) => void;
  getLinkCandidate: () => CanvasLinkHit | null;
};

export const createHoverInteractionController = ({
  setCursor,
  setHoveredLink,
  setHoveredGrid,
}: {
  setCursor: (cursor: string) => void;
  setHoveredLink: (hit: CanvasLinkHit | null) => void;
  setHoveredGrid: (point: Point | null) => void;
}): HoverInteractionController => {
  let linkCandidate: CanvasLinkHit | null = null;

  const updateLinkHover: HoverInteractionController["updateLinkHover"] = (hit) => {
    linkCandidate = hit;
    setHoveredLink(hit);
    setCursor(shouldUseCanvasLinkPointer(hit) ? "pointer" : "");
  };

  const clearLinkHover: HoverInteractionController["clearLinkHover"] = () => {
    updateLinkHover(null);
  };

  const updateColorPickerHover = (point: Point | null) => {
    setHoveredGrid(point);
    setCursor("crosshair");
  };

  return {
    updateLinkHover,
    clearLinkHover,
    updateColorPickerHover,
    setCursor,
    getLinkCandidate: () => linkCandidate,
  };
};
