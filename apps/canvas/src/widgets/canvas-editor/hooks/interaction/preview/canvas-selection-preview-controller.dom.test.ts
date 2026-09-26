import { describe, expect, it, vi } from "vitest";
import { createSelectionPreviewController } from "@/widgets/canvas-editor/hooks/interaction/preview/selectionPreviewController";
import type { SelectionArea } from "@/shared/types";

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

const selection = (x: number): SelectionArea => ({
  start: { x, y: x },
  end: { x: x + 1, y: x + 1 },
});

describe("selection preview controller", () => {
  it("coalesces selection preview updates into one RAF", () => {
    const scheduler = createScheduler();
    const setPreview = vi.fn();
    const controller = createSelectionPreviewController({
      setPreview,
      scheduler,
    });

    controller.set(selection(1));
    controller.set(selection(3));

    expect(scheduler.requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(setPreview).not.toHaveBeenCalled();
    expect(controller.get()).toEqual(selection(3));

    scheduler.flush();

    expect(setPreview).toHaveBeenCalledTimes(1);
    expect(setPreview).toHaveBeenCalledWith(selection(3));
  });

  it("flushes immediately and cancels a pending RAF", () => {
    const scheduler = createScheduler();
    const setPreview = vi.fn();
    const controller = createSelectionPreviewController({
      setPreview,
      scheduler,
    });

    controller.set(selection(1));
    controller.set(null, { immediate: true });
    scheduler.flush();

    expect(scheduler.cancelAnimationFrame).toHaveBeenCalledWith(1);
    expect(setPreview).toHaveBeenCalledTimes(1);
    expect(setPreview).toHaveBeenCalledWith(null);
  });

  it("cancels pending previews without changing the current selection value", () => {
    const scheduler = createScheduler();
    const setPreview = vi.fn();
    const controller = createSelectionPreviewController({
      setPreview,
      scheduler,
    });

    controller.set(selection(5));
    controller.cancel();
    scheduler.flush();

    expect(setPreview).not.toHaveBeenCalled();
    expect(controller.get()).toEqual(selection(5));
  });
});
