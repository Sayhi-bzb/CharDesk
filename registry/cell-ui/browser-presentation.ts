/** DOM presentation ownership; widget targets are resolved by the Scene. */
export class CellPresentationRegistry {
  current: HTMLCanvasElement | null = null;
  readonly #overlays = new Map<string, HTMLCanvasElement>();

  setOverlay(id: string, canvas: HTMLCanvasElement | null): void {
    if (canvas) this.#overlays.set(id, canvas);
    else this.#overlays.delete(id);
  }

  overlay(id: string): HTMLCanvasElement | undefined {
    return this.#overlays.get(id);
  }

  canvases(): HTMLCanvasElement[] {
    return [...(this.current ? [this.current] : []), ...this.#overlays.values()];
  }

  owns(target: EventTarget | null): boolean {
    return target !== null && this.canvases().some((canvas) => canvas === target);
  }

  acceptsPoint(x: number, y: number): boolean {
    const document = this.current?.ownerDocument;
    if (!document) return false;
    // DOM test environments may lack hit testing; browsers must prove ownership.
    if (typeof document.elementFromPoint !== "function") return true;
    return this.owns(document.elementFromPoint(x, y));
  }
}
