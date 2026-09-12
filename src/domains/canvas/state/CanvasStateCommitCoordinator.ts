import type { StoreApi } from "zustand";
import type { EditorState } from "./interfaces";
import type { CanvasHistoryMode } from "./CanvasDocumentRegistry";

export type CanvasCommandStatePort<State extends object = EditorState> = Pick<
  StoreApi<State>,
  "getState" | "setState"
>;

/**
 * Publishes one committed Canvas snapshot for a synchronous command, while
 * allowing nested commands to read each other's pending state.
 */
export class CanvasStateCommitCoordinator<State extends object = EditorState>
  implements CanvasCommandStatePort<State> {
  readonly #store: CanvasCommandStatePort<State>;
  #depth = 0;
  #draft: State | null = null;
  #dirty = false;
  #afterCommit = new Set<() => void>();
  #historyModes: CanvasHistoryMode[] = [];

  constructor(store: CanvasCommandStatePort<State>) {
    this.#store = store;
  }

  getState = (): State => this.#draft ?? this.#store.getState();

  setState: StoreApi<State>["setState"] = ((update, replace) => {
    if (this.#depth === 0) {
      if (replace === true) {
        this.#store.setState(
          update as State | ((state: State) => State),
          true
        );
      } else {
        this.#store.setState(update, false);
      }
      return;
    }

    const current = this.#draft!;
    const updated = typeof update === "function" ? update(current) : update;
    if (Object.is(updated, current)) return;

    this.#draft =
      replace === true || typeof updated !== "object" || updated === null
        ? (updated as State)
        : Object.assign({}, current, updated);
    this.#dirty = true;
  }) as StoreApi<State>["setState"];

  deferUntilCommitted = (callback: () => void) => {
    if (this.#depth === 0) {
      callback();
      return;
    }
    this.#afterCommit.add(callback);
  };

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
    return mode === "save" || mode === "merge" ? "merge" : "none";
  };

  run = <Result>(command: () => Result): Result => {
    const outermost = this.#depth === 0;
    if (outermost) {
      this.#draft = this.#store.getState();
      this.#dirty = false;
    }
    this.#depth += 1;

    try {
      const result = command();
      if (
        typeof result === "object" &&
        result !== null &&
        "then" in result
      ) {
        throw new TypeError(
          "CanvasStateCommitCoordinator cannot span an async boundary"
        );
      }
      return result;
    } finally {
      this.#depth -= 1;
      if (outermost) this.#commit();
    }
  };

  #commit() {
    const draft = this.#draft!;
    const shouldPublish = this.#dirty;
    const callbacks = [...this.#afterCommit];
    this.#draft = null;
    this.#dirty = false;
    this.#afterCommit.clear();

    if (shouldPublish) this.#store.setState(draft, true);
    callbacks.forEach((callback) => callback());
  }
}

type CanvasCommandMap = Record<string, (...args: never[]) => unknown>;

export const coordinateCanvasCommands = <Commands extends CanvasCommandMap>(
  commits: CanvasStateCommitCoordinator,
  commands: Commands
): Commands => Object.fromEntries(
  Object.entries(commands).map(([name, command]) => [
    name,
    (...args: never[]) => commits.run(() => command(...args)),
  ])
) as Commands;
