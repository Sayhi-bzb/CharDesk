import { CanvasEdgeScroll } from '@chardesk/editor-core/interaction/edgeScroll';
import type { CanvasCameraManager } from './CanvasCameraManager';
import { CANVAS_FRAME_INVALIDATION, type CanvasFrameQueue } from './FrameScheduler';
export { EDGE_SCROLL_DELAY_MS } from '@chardesk/editor-core/interaction/edgeScroll';

export class CanvasEdgeScrollManager extends CanvasEdgeScroll {
  constructor(scheduler: CanvasFrameQueue, camera: CanvasCameraManager) {
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
