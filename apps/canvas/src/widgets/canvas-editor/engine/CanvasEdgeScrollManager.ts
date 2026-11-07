import { CanvasEdgeScroll } from '@chardesk/editor-core/interaction/edgeScroll';
import type { CanvasCameraManager } from './CanvasCameraManager';
import { CANVAS_FRAME_INVALIDATION, type CanvasFrameScheduler } from './FrameScheduler';
export { EDGE_SCROLL_DELAY_MS } from '@chardesk/editor-core/interaction/edgeScroll';

/** Browser frames and camera translation adapt the shared viewport scroll policy. */
export class CanvasEdgeScrollManager extends CanvasEdgeScroll {
  constructor(scheduler: CanvasFrameScheduler, camera: CanvasCameraManager) {
    super(
      {
        request: (tick) =>
          scheduler.request('edge-scroll', CANVAS_FRAME_INVALIDATION.presentation, tick),
        cancel: () => scheduler.cancel('edge-scroll'),
      },
      (x, y) => camera.panBy(-x, -y)
    );
  }
}
