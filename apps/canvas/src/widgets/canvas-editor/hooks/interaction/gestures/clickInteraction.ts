import type { CanvasLinkHit } from "../core/linkHitTesting";
import type { CanvasInteractionState } from "@/domains/editor/public";

export type CanvasClickDecision =
  | { type: "consume-color-picker-click" }
  | { type: "open-link"; hit: CanvasLinkHit }
  | { type: "none" };

export const resolveCanvasClickDecision = ({
  colorPickerClickPending,
  interactionMode,
  linkHit,
  shouldOpenLink,
}: {
  colorPickerClickPending: boolean;
  interactionMode: CanvasInteractionState["type"];
  linkHit: CanvasLinkHit | null;
  shouldOpenLink: boolean;
}): CanvasClickDecision => {
  if (colorPickerClickPending) return { type: "consume-color-picker-click" };
  if (interactionMode !== "idle") return { type: "none" };

  return linkHit && shouldOpenLink
    ? { type: "open-link", hit: linkHit }
    : { type: "none" };
};
