import type { SelectionPreviewController } from "../preview/selectionPreviewController";

type DragResetExecutor = {
  clearScratch: () => void;
  clearSelectionPreview: () => void;
  clearStaticRangeMovePreview: () => void;
};

type DragResetController = {
  reset: () => void;
};

const executeDragReset = (executor: DragResetExecutor): void => {
  executor.clearScratch();
  executor.clearSelectionPreview();
  executor.clearStaticRangeMovePreview();
};

export const createDragResetController = ({
  clearScratch,
  selectionPreview,
  clearStaticRangeMovePreview,
}: {
  clearScratch: () => void;
  selectionPreview: SelectionPreviewController;
  clearStaticRangeMovePreview: () => void;
}): DragResetController => ({
  reset: () => {
    executeDragReset({
      clearScratch,
      clearSelectionPreview: () =>
        selectionPreview.set(null, { immediate: true }),
      clearStaticRangeMovePreview,
    });
  },
});
