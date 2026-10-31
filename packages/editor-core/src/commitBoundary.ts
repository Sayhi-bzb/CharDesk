/** One final publication boundary for nested synchronous commands in every Host. */
export class SynchronousCommitBoundary {
  #depth = 0;
  readonly #afterCommit = new Set<() => void>();
  readonly #hooks: { begin?: () => void; commit?: () => void };

  constructor(hooks: { begin?: () => void; commit?: () => void } = {}) {
    this.#hooks = hooks;
  }

  get isRunning() {
    return this.#depth > 0;
  }

  deferUntilCommitted = (callback: () => void) => {
    if (this.isRunning) this.#afterCommit.add(callback);
    else callback();
  };

  run = <Result>(command: () => Result): Result => {
    const outermost = !this.isRunning;
    if (outermost) this.#hooks.begin?.();
    this.#depth++;
    try {
      const result = command();
      if (typeof result === 'object' && result !== null && 'then' in result) {
        throw new TypeError('SynchronousCommitBoundary cannot span an async boundary');
      }
      return result;
    } finally {
      this.#depth--;
      if (outermost) {
        const callbacks = [...this.#afterCommit];
        this.#afterCommit.clear();
        this.#hooks.commit?.();
        callbacks.forEach((callback) => callback());
      }
    }
  };
}
