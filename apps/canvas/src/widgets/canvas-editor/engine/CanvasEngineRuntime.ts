import { CanvasFrameScheduler } from "./FrameScheduler";
import {
  CanvasCameraManager,
  type CanvasCameraPort,
} from "./CanvasCameraManager";
import { CanvasRenderActivity } from "./CanvasRenderActivity";
import { CanvasRenderExperience } from "./CanvasRenderExperience";

type CanvasEngineManager = {
  dispose: () => void;
};

/** Internal lifetime boundary for the imperative canvas engine. */
export class CanvasEngineRuntime {
  readonly frameScheduler: CanvasFrameScheduler;
  readonly renderActivity: CanvasRenderActivity;
  readonly renderExperience: CanvasRenderExperience;
  readonly camera: CanvasCameraManager;
  private readonly managers = new Map<string, CanvasEngineManager>();
  private ownerCount = 0;
  private releaseGeneration = 0;
  private disposed = false;

  constructor(
    cameraPort: CanvasCameraPort,
    frameScheduler = new CanvasFrameScheduler()
  ) {
    this.frameScheduler = frameScheduler;
    this.renderActivity = new CanvasRenderActivity();
    this.renderExperience = new CanvasRenderExperience();
    this.camera = new CanvasCameraManager(
      frameScheduler,
      cameraPort,
      () => {
        this.renderExperience.recordViewportActivity();
        this.renderActivity.markViewportActivity();
      }
    );
  }

  /**
   * Keeps the runtime alive while a React owner is mounted. Disposal is deferred
   * one microtask so StrictMode's simulated unmount/remount can reacquire it.
   */
  acquire(): () => void {
    if (this.disposed) return () => undefined;
    this.ownerCount += 1;
    this.releaseGeneration += 1;
    let released = false;

    return () => {
      if (released) return;
      released = true;
      this.ownerCount = Math.max(0, this.ownerCount - 1);
      const generation = ++this.releaseGeneration;
      queueMicrotask(() => {
        if (
          !this.disposed &&
          this.ownerCount === 0 &&
          this.releaseGeneration === generation
        ) {
          this.dispose();
        }
      });
    };
  }

  registerManager<T extends CanvasEngineManager>(key: string, manager: T): T {
    if (this.disposed) {
      manager.dispose();
      return manager;
    }
    const previous = this.managers.get(key);
    if (previous !== manager) previous?.dispose();
    this.managers.set(key, manager);
    return manager;
  }

  unregisterManager(key: string, manager?: CanvasEngineManager): void {
    const current = this.managers.get(key);
    if (!current || (manager && current !== manager)) return;
    this.managers.delete(key);
    current.dispose();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.ownerCount = 0;
    this.releaseGeneration += 1;
    [...this.managers.values()].reverse().forEach((manager) => manager.dispose());
    this.managers.clear();
    this.camera.dispose();
    this.renderActivity.dispose();
    this.frameScheduler.dispose();
  }
}
