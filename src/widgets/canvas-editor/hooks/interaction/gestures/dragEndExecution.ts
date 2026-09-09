import type { ToolType } from "@/domains/canvas/public";
import type { CanvasInteractionState } from "@/domains/editor/public";
import type { CanvasMode } from "@/domains/sessions/public";
import type { Point, SelectionArea } from "@/shared/types";
import { isPrimaryDragState } from "@/domains/editor/public";
import { executeDragEndCommitDecision, executeSelectionCommitDecision, type DragEndCommitExecutor, type SelectionCommitExecutor } from "../commit/commitExecution";
import { resolveDragEndCommitDecision } from "../commit/commitInteraction";
import { resolveSelectionCommitDecision } from "../preview/selectionInteraction";
import type { SelectionPreviewController } from "../preview/selectionPreviewController";

export type PrimaryDragEndExecutor = SelectionCommitExecutor &
  DragEndCommitExecutor & {
    flushSelectionPreview: () => void;
    getSelectionPreview: () => SelectionArea | null;
    resetDragState: () => void;
  };

type PrimaryDragEndContext = {
  state: CanvasInteractionState;
  tool: ToolType;
};

export const executePrimaryDragEnd = (
  context: PrimaryDragEndContext,
  executor: PrimaryDragEndExecutor
): boolean => {
  if (context.state.type === "selecting") {
    executor.flushSelectionPreview();
    executeSelectionCommitDecision(
      resolveSelectionCommitDecision({
        selection: executor.getSelectionPreview(),
        tool: context.tool,
        append: context.state.append === true,
      }),
      executor
    );
    executor.resetDragState();
    return true;
  }
  if (!isPrimaryDragState(context.state)) return false;
  executeDragEndCommitDecision(
    resolveDragEndCommitDecision({ state: context.state }),
    executor
  );
  executor.resetDragState();
  return true;
};

export const createPrimaryDragEndExecutor = ({
  selectionPreview,
  fillArea,
  setStaticGridActiveCell,
  setStaticGridSelectionRange,
  appendStaticGridSelectionRange,
  clearSelections,
  commitScratch,
  forceHistorySave,
  resetDragState,
}: {
  selectionPreview: SelectionPreviewController;
  fillArea: SelectionCommitExecutor["fillArea"];
  setStaticGridActiveCell: SelectionCommitExecutor["setStaticGridActiveCell"];
  setStaticGridSelectionRange: SelectionCommitExecutor["setStaticGridSelectionRange"];
  appendStaticGridSelectionRange: SelectionCommitExecutor["appendStaticGridSelectionRange"];
  clearSelections: SelectionCommitExecutor["clearSelections"];
  commitScratch: DragEndCommitExecutor["commitScratch"];
  forceHistorySave: DragEndCommitExecutor["forceHistorySave"];
  resetDragState: () => void;
}): PrimaryDragEndExecutor => ({
  flushSelectionPreview: () => selectionPreview.flush(),
  getSelectionPreview: () => selectionPreview.get(),
  fillArea,
  setStaticGridActiveCell,
  setStaticGridSelectionRange,
  appendStaticGridSelectionRange,
  clearSelections,
  clearSelectionPreview: () => selectionPreview.set(null, { immediate: true }),
  commitScratch,
  forceHistorySave,
  resetDragState,
});

export const createPrimaryDragEndHandler = ({ executor }: { executor: PrimaryDragEndExecutor }) => ({
  state,
  tool,
}: {
  state: CanvasInteractionState;
  tool: ToolType;
  canvasMode: CanvasMode;
  resolvedEndGrid: Point | null;
}) => executePrimaryDragEnd({ state, tool }, executor);
