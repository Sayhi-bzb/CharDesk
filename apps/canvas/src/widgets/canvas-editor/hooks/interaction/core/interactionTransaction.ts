import type { CanvasHistoryCheckpoint } from "@/domains/canvas/public";

type CanvasInteractionTransactionController = {
  begin: () => void;
  complete: () => void;
  cancel: () => void;
  hasActive: () => boolean;
};

export const createCanvasInteractionTransactionController = ({
  createCheckpoint,
}: {
  createCheckpoint: () => CanvasHistoryCheckpoint;
}): CanvasInteractionTransactionController => {
  let checkpoint: CanvasHistoryCheckpoint | null = null;

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
