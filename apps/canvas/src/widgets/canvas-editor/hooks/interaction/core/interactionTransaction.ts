import type { EditorHistoryCheckpoint } from "@chardesk/editor-core/editor/types";

type CanvasInteractionTransactionController = {
  begin: () => void;
  complete: () => void;
  cancel: () => void;
  hasActive: () => boolean;
};

export const createCanvasInteractionTransactionController = ({
  createCheckpoint,
}: {
  createCheckpoint: () => EditorHistoryCheckpoint;
}): CanvasInteractionTransactionController => {
  let checkpoint: EditorHistoryCheckpoint | null = null;

  return {
    begin: () => {
      checkpoint?.cancel();
      checkpoint = createCheckpoint();
    },
    complete: () => {
      const active = checkpoint;
      checkpoint = null;
      active?.commit();
    },
    cancel: () => {
      const active = checkpoint;
      checkpoint = null;
      active?.cancel();
    },
    hasActive: () => checkpoint !== null,
  };
};
