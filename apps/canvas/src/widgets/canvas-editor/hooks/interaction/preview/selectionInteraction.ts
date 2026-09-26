import type { SelectionArea } from "@/shared/types";
import type { ToolType } from "@/domains/canvas/public";

export type SelectionCommitDecision =
  | { type: "none" }
  | { type: "fill"; selection: SelectionArea }
  | { type: "setStaticGridActiveCell"; point: SelectionArea["start"] }
  | { type: "setStaticGridSelectionRange"; selection: SelectionArea }
  | { type: "appendStaticGridSelectionRange"; selection: SelectionArea };

const isSingleCellSelection = (selection: SelectionArea) =>
  selection.start.x === selection.end.x && selection.start.y === selection.end.y;

export const resolveSelectionCommitDecision = ({
  selection,
  tool,
  append = false,
}: {
  selection: SelectionArea | null;
  tool: ToolType;
  append?: boolean;
}): SelectionCommitDecision => {
  if (!selection) return { type: "none" };
  if (tool === "fill") return { type: "fill", selection };
  if (tool !== "select") return { type: "none" };

  if (append) return { type: "appendStaticGridSelectionRange", selection };
  return isSingleCellSelection(selection)
    ? { type: "setStaticGridActiveCell", point: selection.start }
    : { type: "setStaticGridSelectionRange", selection };
};
