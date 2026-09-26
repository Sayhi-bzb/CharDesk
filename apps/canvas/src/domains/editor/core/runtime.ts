import { EditorCommandRegistry } from "./commandRegistry";
import type { EditorExtension } from "./extension";
import { EditorKeymap } from "./keymap";
import { EditorRootStateNode } from "./stateNode";
import { EditorStateScopeRegistry } from "./scopeRegistry";
import type {
  Disposable,
  EditorCommandHost,
  EditorHistoryPort,
  EditorInputEvent,
  EditorShortcutContext,
  EditorStateAdapter,
  EditorTransactionMode,
  EditorTransactionPort,
} from "./types";
export type { EditorShortcutContext } from "./types";

type EditorRuntimeOptions<State> = {
  state: EditorStateAdapter<State>;
  history: EditorHistoryPort;
  transactions: EditorTransactionPort;
  onToolChange?: (id: string) => void;
};

const toDispose = (value: void | (() => void) | Disposable): (() => void) | null => {
  if (typeof value === "function") return value;
  if (value && typeof value.dispose === "function") return () => value.dispose();
  return null;
};

export class EditorRuntime<State, Event = EditorInputEvent>
  implements EditorCommandHost<State>, Disposable
{
  readonly commands = new EditorCommandRegistry<State>(this);
  readonly keymap = new EditorKeymap<EditorShortcutContext<State>>();
  readonly scopes = new EditorStateScopeRegistry();
  readonly history: EditorHistoryPort;
  readonly root: EditorRootStateNode<State, Event>;

  readonly #state: EditorStateAdapter<State>;
  readonly #transactions: EditorTransactionPort;
  readonly #onToolChange?: (id: string) => void;
  readonly #extensions = new Map<string, EditorExtension<State, Event>>();
  readonly #commandDisposers: Array<() => void> = [];
  readonly #scopeDisposers: Array<() => void> = [];
  readonly #keymapDisposers: Array<() => void> = [];
  readonly #managerFactories: NonNullable<EditorExtension<State>["managers"]>[number][] = [];
  readonly #setupCallbacks: NonNullable<EditorExtension<State, Event>["setup"]>[] = [];
  readonly #lifecycleDisposers: Array<() => void> = [];
  #started = false;
  #disposed = false;

  constructor(options: EditorRuntimeOptions<State>) {
    this.#state = options.state;
    this.history = options.history;
    this.#transactions = options.transactions;
    this.#onToolChange = options.onToolChange;
    this.root = new EditorRootStateNode<State, Event>(this);
  }

  getState = (): Readonly<State> => this.#state.get();

  subscribe = (listener: (state: State, previous: State) => void) =>
    this.#state.subscribe(listener);

  transact = <Result>(fn: () => Result, mode: EditorTransactionMode = "save") =>
    this.#transactions.run(fn, mode);

  registerExtension(extension: EditorExtension<State, Event>) {
    if (this.#started) throw new Error("Editor extensions must be registered before start()");
    if (this.#disposed) throw new Error("Cannot register an extension on a disposed editor");
    if (this.#extensions.has(extension.id)) {
      throw new Error(`Editor extension ${extension.id} is already registered`);
    }

    for (const tool of extension.tools ?? []) {
      if (this.root.children.has(tool.id)) {
        throw new Error(`Editor tool ${tool.id} is already registered`);
      }
    }

    const registeredCommands: Array<() => void> = [];
    const registeredScopes: Array<() => void> = [];
    const registeredTools: string[] = [];
    const registeredKeybindings: Array<() => void> = [];
    const commandDisposerStart = this.#commandDisposers.length;
    const scopeDisposerStart = this.#scopeDisposers.length;
    const keymapDisposerStart = this.#keymapDisposers.length;
    try {
      for (const command of extension.commands ?? []) {
        const dispose = this.commands.register(extension.id, command);
        registeredCommands.push(dispose);
        this.#commandDisposers.push(dispose);
      }
      for (const scope of extension.stateScopes ?? []) {
        const dispose = this.scopes.register(extension.id, scope);
        registeredScopes.push(dispose);
        this.#scopeDisposers.push(dispose);
      }
      for (const binding of extension.keybindings ?? []) {
        const dispose = this.keymap.register(extension.id, binding);
        registeredKeybindings.push(dispose);
        this.#keymapDisposers.push(dispose);
      }
      for (const tool of extension.tools ?? []) {
        const node = tool.create(this, this.root);
        if (node.id !== tool.id) {
          throw new Error(`Tool definition ${tool.id} created state node ${node.id}`);
        }
        this.root.addChild(node);
        registeredTools.push(tool.id);
      }
      this.#managerFactories.push(...(extension.managers ?? []));
      if (extension.setup) this.#setupCallbacks.push(extension.setup);
      this.#extensions.set(extension.id, extension);
    } catch (error) {
      registeredCommands.forEach((dispose) => dispose());
      registeredScopes.forEach((dispose) => dispose());
      registeredKeybindings.forEach((dispose) => dispose());
      registeredTools.forEach((id) => this.root.removeChild(id));
      this.#commandDisposers.splice(commandDisposerStart);
      this.#scopeDisposers.splice(scopeDisposerStart);
      this.#keymapDisposers.splice(keymapDisposerStart);
      throw error;
    }
    return this;
  }

  start(initialToolId?: string) {
    if (this.#disposed) throw new Error("Cannot start a disposed editor");
    if (this.#started) return this;
    this.#started = true;
    try {
      for (const factory of this.#managerFactories) {
        const manager = factory.create(this);
        this.#lifecycleDisposers.push(() => manager.dispose());
      }
      for (const setup of this.#setupCallbacks) {
        const dispose = toDispose(setup(this));
        if (dispose) this.#lifecycleDisposers.push(dispose);
      }
      this.root.enter();
      if (initialToolId) this.setCurrentTool(initialToolId);
      return this;
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  setCurrentTool = (id: string) => {
    if (!this.root.children.has(id)) return false;
    this.root.transition(id);
    this.#onToolChange?.(id);
    return true;
  };

  getCurrentToolId = () => this.root.getCurrent()?.id ?? null;

  getCurrentStatePath = () => {
    let current = this.root.getCurrent();
    if (!current) return this.root.getPath();
    while (current.getCurrent()) current = current.getCurrent()!;
    return current.getPath();
  };

  dispatch(event: Event) {
    if (!this.#started || this.#disposed) return false;
    return this.root.dispatch(event);
  }

  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.root.exit(undefined, "dispose");
    for (const dispose of this.#lifecycleDisposers.reverse()) dispose();
    for (const dispose of this.#commandDisposers.reverse()) dispose();
    for (const dispose of this.#scopeDisposers.reverse()) dispose();
    for (const dispose of this.#keymapDisposers.reverse()) dispose();
    this.#lifecycleDisposers.length = 0;
    this.#commandDisposers.length = 0;
    this.#scopeDisposers.length = 0;
    this.#keymapDisposers.length = 0;
  }
}
