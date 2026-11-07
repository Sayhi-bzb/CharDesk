import { SynchronousCommitBoundary } from './commitBoundary.js';
type StoreApi<State extends object> = {
  getState: () => State;
  setState: {
    (
      partial: State | Partial<State> | ((state: State) => State | Partial<State>),
      replace?: false
    ): void;
    (state: State | ((state: State) => State), replace: true): void;
  };
};

import type { CanvasHistoryMode } from './CanvasDocumentRegistry.js';

type CanvasCommandStatePort<State extends object = object> = Pick<
  StoreApi<State>,
  'getState' | 'setState'
>;

/**
 * Publishes one committed Canvas snapshot for a synchronous command, while
 * allowing nested commands to read each other's pending state.
 */
export class CanvasStateCommitCoordinator<
  State extends object = object,
> implements CanvasCommandStatePort<State> {
  readonly #store: CanvasCommandStatePort<State>;
  readonly #boundary: SynchronousCommitBoundary;
  #draft: State | null = null;
  #dirty = false;
  #historyModes: CanvasHistoryMode[] = [];

  constructor(store: CanvasCommandStatePort<State>) {
    this.#store = store;
    this.#boundary = new SynchronousCommitBoundary({
      begin: () => {
        this.#draft = this.#store.getState();
        this.#dirty = false;
      },
      commit: () => this.#commit(),
    });
  }

  getState = (): State => this.#draft ?? this.#store.getState();

  setState: StoreApi<State>['setState'] = ((update, replace) => {
    if (!this.#boundary.isRunning) {
      if (replace === true) {
        this.#store.setState(update as State | ((state: State) => State), true);
      } else {
        this.#store.setState(update, false);
      }
      return;
    }

    const current = this.#draft!;
    const updated = typeof update === 'function' ? update(current) : update;
    if (Object.is(updated, current)) return;

    this.#draft =
      replace === true || typeof updated !== 'object' || updated === null
        ? (updated as State)
        : Object.assign({}, current, updated);
    this.#dirty = true;
  }) as StoreApi<State>['setState'];

  deferUntilCommitted = (callback: () => void) => this.#boundary.deferUntilCommitted(callback);

  withHistory = <Result>(mode: CanvasHistoryMode, command: () => Result): Result => {
    this.#historyModes.push(mode);
    try {
      return command();
    } finally {
      this.#historyModes.pop();
    }
  };

  getDocumentHistoryMode = (): CanvasHistoryMode | undefined => {
    const mode = this.#historyModes.at(-1);
    if (!mode) return undefined;
    return mode === 'save' || mode === 'merge' ? 'merge' : 'none';
  };

  run = <Result>(command: () => Result): Result => this.#boundary.run(command);

  #commit() {
    const draft = this.#draft!;
    const shouldPublish = this.#dirty;
    this.#draft = null;
    this.#dirty = false;

    if (shouldPublish) this.#store.setState(draft, true);
  }
}

type CanvasCommandMap = Record<string, (...args: never[]) => unknown>;

export const coordinateCanvasCommands = <Commands extends CanvasCommandMap>(
  commits: Pick<CanvasStateCommitCoordinator, 'run'>,
  commands: Commands
): Commands =>
  Object.fromEntries(
    Object.entries(commands).map(([name, command]) => [
      name,
      (...args: never[]) => commits.run(() => command(...args)),
    ])
  ) as Commands;
