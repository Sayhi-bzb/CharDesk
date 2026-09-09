import type { ActivationBlinkCount } from "./activation-feedback-config.js";

/** Pure visual timing: no widget identity, command, frame, or theme. */
export class ConfirmationSequence {
  #remaining = 0;
  #visible = false;
  get running(): boolean { return this.#remaining > 0; }
  get visible(): boolean { return this.#visible; }
  start(count: ActivationBlinkCount): void {
    this.#remaining = count;
    this.#visible = count > 0;
  }
  advance(): boolean {
    if (!this.running) return false;
    if (this.#visible) this.#remaining -= 1;
    this.#visible = !this.#visible && this.running;
    return true;
  }
  clear(): void { this.start(0); }
}
