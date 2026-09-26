import { describe, expect, it, vi } from "vitest";
import { createRafPreviewQueue } from "@/widgets/canvas-editor/hooks/interaction/preview/rafPreviewQueue";

const createScheduler = () => {
  let nextId = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  return {
    requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    }),
    cancelAnimationFrame: vi.fn((id: number) => {
      callbacks.delete(id);
    }),
    flush: () => {
      const queued = Array.from(callbacks.values());
      callbacks.clear();
      queued.forEach((callback) => callback(0));
    },
  };
};

describe("raf preview queue", () => {
  it("coalesces queued values and flushes the latest value on RAF", () => {
    const scheduler = createScheduler();
    const onFlush = vi.fn();
    const queue = createRafPreviewQueue<number>({ onFlush, scheduler });

    queue.queue(1);
    queue.queue(2);

    expect(scheduler.requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(onFlush).not.toHaveBeenCalled();

    scheduler.flush();

    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith(2);
  });

  it("flushes the last queued value when requested for commit", () => {
    const scheduler = createScheduler();
    const onFlush = vi.fn();
    const queue = createRafPreviewQueue<number>({ onFlush, scheduler });

    queue.queue(5);
    expect(queue.flush({ useLast: true })).toBe(5);
    scheduler.flush();

    expect(scheduler.cancelAnimationFrame).toHaveBeenCalledWith(1);
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith(5);
  });

  it("does not return a stale value after clearLast", () => {
    const scheduler = createScheduler();
    const queue = createRafPreviewQueue<number>({
      onFlush: vi.fn(),
      scheduler,
    });

    queue.queue(3);
    queue.flush();
    queue.clearLast();

    expect(queue.flush({ useLast: true })).toBeNull();
  });

  it("cancels a pending RAF without clearing the last queued value", () => {
    const scheduler = createScheduler();
    const onFlush = vi.fn();
    const queue = createRafPreviewQueue<number>({ onFlush, scheduler });

    queue.queue(9);
    queue.cancel();
    scheduler.flush();

    expect(onFlush).not.toHaveBeenCalled();
    expect(queue.flush({ useLast: true })).toBe(9);
  });
});
