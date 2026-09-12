export type CanvasSessionActivationIntent = Readonly<{
  generation: number;
}>;

/** Arbitrates commands that may replace the active Canvas after async work. */
export class CanvasSessionActivationCoordinator {
  #generation = 0;

  begin = (): CanvasSessionActivationIntent => ({
    generation: ++this.#generation,
  });

  isCurrent = (intent: CanvasSessionActivationIntent) =>
    intent.generation === this.#generation;
}
