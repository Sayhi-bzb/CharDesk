import type { ToolType } from '@/domains/canvas/public';
import type { CanvasInteractionState } from '@/domains/editor/public';
import type { CanvasMode } from '@/domains/sessions/public';
import type { Point } from '@/shared/types';
import { isPrimaryDragState } from '@/domains/editor/public';
import {
  executeDragEndCommitDecision,
  executeSelectionCommitDecision,
  type DragEndCommitExecutor,
  type SelectionCommitExecutor,
} from '../commit/commitExecution';
import { resolveDragEndCommitDecision } from '../commit/commitInteraction';
import type { SelectionCommitDecision } from '../preview/selectionInteraction';
import type { SelectionPreviewController } from '../preview/selectionPreviewController';

type PrimaryDragEndExecutor = DragEndCommitExecutor & {
  commitSelection: (decision: SelectionCommitDecision) => void;
  resetDragState: () => void;
};

type PrimaryDragEndContext = {
  state: CanvasInteractionState;
  tool: ToolType;
};

const executePrimaryDragEnd = (
  context: PrimaryDragEndContext,
  executor: PrimaryDragEndExecutor
): boolean => {
  if (!isPrimaryDragState(context.state)) return false;
  executeDragEndCommitDecision(resolveDragEndCommitDecision({ state: context.state }), executor);
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
  fillArea: SelectionCommitExecutor['fillArea'];
  setStaticGridActiveCell: SelectionCommitExecutor['setStaticGridActiveCell'];
  setStaticGridSelectionRange: SelectionCommitExecutor['setStaticGridSelectionRange'];
  appendStaticGridSelectionRange: SelectionCommitExecutor['appendStaticGridSelectionRange'];
  clearSelections: SelectionCommitExecutor['clearSelections'];
  commitScratch: DragEndCommitExecutor['commitScratch'];
  forceHistorySave: DragEndCommitExecutor['forceHistorySave'];
  resetDragState: () => void;
}): PrimaryDragEndExecutor => ({
  commitSelection: (decision) => {
    executeSelectionCommitDecision(decision, {
      fillArea,
      setStaticGridActiveCell,
      setStaticGridSelectionRange,
      appendStaticGridSelectionRange,
      clearSelections,
      clearSelectionPreview: () => selectionPreview.set(null, { immediate: true }),
    });
    resetDragState();
  },
  commitScratch,
  forceHistorySave,
  resetDragState,
});

export const createPrimaryDragEndHandler =
  ({ executor }: { executor: PrimaryDragEndExecutor }) =>
  ({
    state,
    tool,
  }: {
    state: CanvasInteractionState;
    tool: ToolType;
    canvasMode: CanvasMode;
    resolvedEndGrid: Point | null;
  }) =>
    executePrimaryDragEnd({ state, tool }, executor);
