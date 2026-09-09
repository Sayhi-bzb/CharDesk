import type { CanvasInteractionState } from "@/domains/editor/public";

export type DragEndCommitDecision =
  | { type: "none" }
  | { type: "commitScratch" }
  | { type: "forceHistorySave" };

export const resolveDragEndCommitDecision = ({
  state,
}: {
  state: CanvasInteractionState;
}): DragEndCommitDecision => {
  switch (state.type) {
    case "drawing":
      if (state.tool === "brush") return { type: "commitScratch" };
      if (state.tool === "eraser") return { type: "forceHistorySave" };
      return { type: "none" };
    case "shapePreview":
      return { type: "commitScratch" };
    default:
      return { type: "none" };
  }
};
