import type { Point } from "@/shared/types";
import type { CanvasCameraManager } from "./CanvasCameraManager";
import {
  CANVAS_FRAME_INVALIDATION,
  type CanvasFrameScheduler,
} from "./FrameScheduler";

const EDGE_SCROLL_DISTANCE = 56;
export const EDGE_SCROLL_DELAY_MS = 250;
const EDGE_SCROLL_EASE_MS = 300;
const EDGE_SCROLL_MAX_SPEED = 720;

type EdgeScrollSession = {
  clientPoint: Point;
  getBounds: () => Pick<DOMRect, "left" | "top" | "width" | "height"> | null;
  isEnabled: () => boolean;
  onCameraMove: () => void;
};

const getAxisProximity = (
  position: number,
  start: number,
  length: number
): number => {
  const local = position - start;
  if (local < EDGE_SCROLL_DISTANCE) {
    return -Math.min(1, (EDGE_SCROLL_DISTANCE - local) / EDGE_SCROLL_DISTANCE);
  }
  if (local > length - EDGE_SCROLL_DISTANCE) {
    return Math.min(
      1,
      (local - (length - EDGE_SCROLL_DISTANCE)) / EDGE_SCROLL_DISTANCE
    );
  }
  return 0;
};

/** Moves the camera while an eligible drag remains near a viewport edge. */
export class CanvasEdgeScrollManager {
  private readonly scheduler: CanvasFrameScheduler;
  private readonly camera: CanvasCameraManager;
  private session: EdgeScrollSession | null = null;
  private edgeEnteredAt: number | null = null;
  private previousFrameAt: number | null = null;
  private scheduled = false;
  private disposed = false;

  constructor(scheduler: CanvasFrameScheduler, camera: CanvasCameraManager) {
    this.scheduler = scheduler;
    this.camera = camera;
  }

  update(session: EdgeScrollSession): void {
    if (this.disposed) return;
    this.session = session;
    if (!session.isEnabled() || !this.getProximity(session)) {
      this.stopLoop();
      return;
    }
    this.schedule();
  }

  stop(): void {
    this.session = null;
    this.stopLoop();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
  }

  private schedule(): void {
    if (this.scheduled || this.disposed) return;
    this.scheduled = true;
    this.scheduler.request(
      "edge-scroll",
      CANVAS_FRAME_INVALIDATION.presentation,
      this.tick
    );
  }

  private readonly tick = (timestamp: number) => {
    this.scheduled = false;
    const session = this.session;
    if (!session || !session.isEnabled()) {
      this.stop();
      return;
    }
    const proximity = this.getProximity(session);
    if (!proximity) {
      this.stopLoop();
      return;
    }

    if (this.edgeEnteredAt === null) this.edgeEnteredAt = timestamp;
    const elapsedAtEdge = timestamp - this.edgeEnteredAt;
    const frameElapsed = Math.min(
      32,
      Math.max(0, timestamp - (this.previousFrameAt ?? timestamp))
    );
    this.previousFrameAt = timestamp;
    if (elapsedAtEdge >= EDGE_SCROLL_DELAY_MS && frameElapsed > 0) {
      const eased = Math.min(
        1,
        (elapsedAtEdge - EDGE_SCROLL_DELAY_MS) / EDGE_SCROLL_EASE_MS
      );
      const distance = (EDGE_SCROLL_MAX_SPEED * eased * frameElapsed) / 1000;
      if (distance > 0) {
        this.camera.panBy(-proximity.x * distance, -proximity.y * distance);
        session.onCameraMove();
      }
    }
    this.schedule();
  };

  private getProximity(session: EdgeScrollSession): Point | null {
    const bounds = session.getBounds();
    if (!bounds) return null;
    const proximity = {
      x: getAxisProximity(session.clientPoint.x, bounds.left, bounds.width),
      y: getAxisProximity(session.clientPoint.y, bounds.top, bounds.height),
    };
    return proximity.x === 0 && proximity.y === 0 ? null : proximity;
  }

  private stopLoop(): void {
    this.scheduler.cancel("edge-scroll");
    this.scheduled = false;
    this.edgeEnteredAt = null;
    this.previousFrameAt = null;
  }
}
