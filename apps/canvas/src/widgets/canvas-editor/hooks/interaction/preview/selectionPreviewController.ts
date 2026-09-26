import type { SelectionArea } from "@/shared/types";

type RafScheduler = {
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame: (handle: number) => void;
};

const getDefaultRafScheduler = (): RafScheduler => ({
  requestAnimationFrame: (callback) => window.requestAnimationFrame(callback),
  cancelAnimationFrame: (handle) => window.cancelAnimationFrame(handle),
});

export type SelectionPreviewController = {
  get: () => SelectionArea | null;
  set: (
    selection: SelectionArea | null,
    options?: { immediate?: boolean }
  ) => void;
  flush: () => void;
  cancel: () => void;
};

export const createSelectionPreviewController = ({
  setPreview,
  scheduler = getDefaultRafScheduler(),
}: {
  setPreview: (selection: SelectionArea | null) => void;
  scheduler?: RafScheduler;
}): SelectionPreviewController => {
  let current: SelectionArea | null = null;
  let rafId: number | null = null;

  const flush = () => {
    if (rafId !== null) {
      scheduler.cancelAnimationFrame(rafId);
      rafId = null;
    }
    setPreview(current);
  };

  const set = (
    selection: SelectionArea | null,
    options: { immediate?: boolean } = {}
  ) => {
    current = selection;
    if (options.immediate) {
      flush();
      return;
    }
    if (rafId !== null) return;
    rafId = scheduler.requestAnimationFrame(() => {
      rafId = null;
      setPreview(current);
    });
  };

  const cancel = () => {
    if (rafId !== null) {
      scheduler.cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  return {
    get: () => current,
    set,
    flush,
    cancel,
  };
};
