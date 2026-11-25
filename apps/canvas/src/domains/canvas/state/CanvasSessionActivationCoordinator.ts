type CanvasSessionActivationIntent = Readonly<{
  generation: number;
}>;

export class CanvasSessionActivationCoordinator {
  #generation = 0;

  begin = (): CanvasSessionActivationIntent => ({
    generation: ++this.#generation,
  });

  isCurrent = (intent: CanvasSessionActivationIntent) =>
    intent.generation === this.#generation;
}
