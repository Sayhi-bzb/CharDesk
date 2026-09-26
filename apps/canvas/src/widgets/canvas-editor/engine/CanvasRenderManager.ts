import {
  CANVAS_FRAME_ALL,
  CANVAS_FRAME_INVALIDATION,
  type CanvasFrameInvalidation,
} from "./FrameScheduler";

type CanvasRenderLayer = "background" | "scratch" | "overlay";

const LAYER_BITS: Record<CanvasRenderLayer, CanvasFrameInvalidation> = {
  background: CANVAS_FRAME_INVALIDATION.background,
  scratch: CANVAS_FRAME_INVALIDATION.scratch,
  overlay: CANVAS_FRAME_INVALIDATION.overlay,
};

const inputsChanged = (
  previous: readonly unknown[] | undefined,
  next: readonly unknown[]
): boolean =>
  !previous ||
  previous.length !== next.length ||
  next.some((input, index) => input !== previous[index]);

/** Tracks layer dependencies; inputs become current only after their layer is drawn. */
export class CanvasRenderManager {
  private readonly committedInputs = new Map<CanvasRenderLayer, readonly unknown[]>();
  private pendingInputs: Record<CanvasRenderLayer, readonly unknown[]> | null = null;

  update(next: Record<CanvasRenderLayer, readonly unknown[]>): CanvasFrameInvalidation {
    this.pendingInputs = next;
    let invalidation = 0;
    (Object.keys(next) as CanvasRenderLayer[]).forEach((layer) => {
      const inputs = next[layer];
      if (!inputsChanged(this.committedInputs.get(layer), inputs)) return;
      invalidation |= LAYER_BITS[layer];
    });
    return invalidation;
  }

  commit(invalidation: CanvasFrameInvalidation): void {
    const pendingInputs = this.pendingInputs;
    if (!pendingInputs) return;
    (Object.keys(pendingInputs) as CanvasRenderLayer[]).forEach((layer) => {
      if (!CanvasRenderManager.includes(invalidation, layer)) return;
      this.committedInputs.set(layer, pendingInputs[layer]);
    });
  }

  reset(): CanvasFrameInvalidation {
    this.committedInputs.clear();
    return CANVAS_FRAME_ALL;
  }

  static includes(
    invalidation: CanvasFrameInvalidation,
    layer: CanvasRenderLayer
  ): boolean {
    return (invalidation & LAYER_BITS[layer]) !== 0;
  }
}
