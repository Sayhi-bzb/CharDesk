import type { ActivationBlinkCount } from "./activation-feedback-config.js";

/** Pure visual timing: no widget identity, command, frame, or theme. */
export class ConfirmationSequence {
  #phases = 0;
  #index = 0;
  get running(): boolean { return this.#index < this.#phases; }
  get visible(): boolean { return this.running && this.#index % 2 === 0; }
  get index(): number { return this.#index; }
  start(count: ActivationBlinkCount): void {
    this.#phases = count * 2;
    this.#index = 0;
  }
  advance(): boolean {
    if (!this.running) return false;
    this.#index += 1;
    return true;
  }
  clear(): void { this.start(0); }
}
