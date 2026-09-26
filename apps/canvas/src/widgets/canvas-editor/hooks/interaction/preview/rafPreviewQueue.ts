type RafScheduler = {
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame: (handle: number) => void;
};

const getDefaultRafScheduler = (): RafScheduler => ({
  requestAnimationFrame: (callback) => window.requestAnimationFrame(callback),
  cancelAnimationFrame: (handle) => window.cancelAnimationFrame(handle),
});

type RafPreviewQueue<T> = {
  queue: (value: T) => void;
  flush: (options?: { useLast?: boolean }) => T | null;
  clearLast: () => void;
  cancel: () => void;
};

export const createRafPreviewQueue = <T>({
  onFlush,
  scheduler = getDefaultRafScheduler(),
}: {
  onFlush: (value: T) => void;
  scheduler?: RafScheduler;
}): RafPreviewQueue<T> => {
  let queued: T | null = null;
  let last: T | null = null;
  let rafId: number | null = null;

  const flush = (options: { useLast?: boolean } = {}) => {
    if (rafId !== null) {
      scheduler.cancelAnimationFrame(rafId);
      rafId = null;
    }
    const value = queued ?? (options.useLast ? last : null);
    if (!value) return null;
    queued = null;
    last = value;
    onFlush(value);
    return value;
  };

  const queue = (value: T) => {
    queued = value;
    last = value;
    if (rafId !== null) return;
    rafId = scheduler.requestAnimationFrame(() => {
      rafId = null;
      flush();
    });
  };

  const cancel = () => {
    if (rafId !== null) {
      scheduler.cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  return {
    queue,
    flush,
    clearLast: () => {
      last = null;
    },
    cancel,
  };
};
