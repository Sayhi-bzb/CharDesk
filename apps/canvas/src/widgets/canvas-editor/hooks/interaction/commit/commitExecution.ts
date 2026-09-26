import type { Point, SelectionArea } from "@/shared/types";
import type { DragEndCommitDecision } from "./commitInteraction";
import type { SelectionCommitDecision } from "../preview/selectionInteraction";

export type SelectionCommitExecutor = {
  fillArea: (selection: SelectionArea) => void;
  setStaticGridActiveCell: (point: Point) => void;
  setStaticGridSelectionRange: (selection: SelectionArea) => void;
  appendStaticGridSelectionRange: (selection: SelectionArea) => void;
  clearSelections: () => void;
  clearSelectionPreview: () => void;
};

export type DragEndCommitExecutor = {
  commitScratch: () => void;
  forceHistorySave: () => void;
};

export const executeSelectionCommitDecision = (
  decision: SelectionCommitDecision,
  executor: SelectionCommitExecutor
): void => {
  switch (decision.type) {
    case "fill":
      executor.fillArea(decision.selection);
      break;
    case "setStaticGridActiveCell":
      executor.setStaticGridActiveCell(decision.point);
      break;
    case "setStaticGridSelectionRange":
      executor.setStaticGridSelectionRange(decision.selection);
      break;
    case "appendStaticGridSelectionRange":
      executor.appendStaticGridSelectionRange(decision.selection);
      break;
    case "none":
      break;
  }

  if (decision.type !== "none") {
    executor.clearSelectionPreview();
  }
};

export const executeDragEndCommitDecision = (
  decision: DragEndCommitDecision,
  executor: DragEndCommitExecutor
): void => {
  switch (decision.type) {
    case "commitScratch":
      executor.commitScratch();
      break;
    case "forceHistorySave":
      executor.forceHistorySave();
      break;
    case "none":
      break;
  }
};
