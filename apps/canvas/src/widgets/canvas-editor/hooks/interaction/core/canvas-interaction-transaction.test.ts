import { describe, expect, it, vi } from "vitest";
import { createCanvasInteractionTransactionController } from "./interactionTransaction";

describe("canvas interaction transaction", () => {
  it("commits the active checkpoint once", () => {
    const commit = vi.fn();
    const cancel = vi.fn();
    const controller = createCanvasInteractionTransactionController({
      createCheckpoint: () => ({ commit, cancel }),
    });

    controller.begin();
    expect(controller.hasActive()).toBe(true);
    controller.complete();
    controller.complete();

    expect(commit).toHaveBeenCalledOnce();
    expect(cancel).not.toHaveBeenCalled();
    expect(controller.hasActive()).toBe(false);
  });

  it("cancels an existing checkpoint before beginning another", () => {
    const firstCancel = vi.fn();
    const secondCancel = vi.fn();
    const checkpoints = [
      { commit: vi.fn(), cancel: firstCancel },
      { commit: vi.fn(), cancel: secondCancel },
    ];
    const controller = createCanvasInteractionTransactionController({
      createCheckpoint: () => checkpoints.shift()!,
    });

    controller.begin();
    controller.begin();
    controller.cancel();

    expect(firstCancel).toHaveBeenCalledOnce();
    expect(secondCancel).toHaveBeenCalledOnce();
  });
});
