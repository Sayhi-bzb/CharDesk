import type { EditorCommandHost } from "./types";

export abstract class EditorStateNode<State, Event = unknown> {
  readonly editor: EditorCommandHost<State>;
  readonly id: string;
  readonly children = new Map<string, EditorStateNode<State, Event>>();
  readonly parent: EditorStateNode<State, Event> | null;
  readonly initial?: string;
  #current: EditorStateNode<State, Event> | null = null;
  #active = false;

  constructor(
    editor: EditorCommandHost<State>,
    id: string,
    parent: EditorStateNode<State, Event> | null = null,
    initial?: string
  ) {
    this.editor = editor;
    this.id = id;
    this.parent = parent;
    this.initial = initial;
  }

  addChild(child: EditorStateNode<State, Event>) {
    if (child.parent !== this) {
      throw new Error(`State node ${child.id} must be constructed with parent ${this.id}`);
    }
    if (this.children.has(child.id)) {
      throw new Error(`State node ${this.getPath()} already has child ${child.id}`);
    }
    this.children.set(child.id, child);
    return child;
  }

  removeChild(id: string) {
    const child = this.children.get(id);
    if (!child) return false;
    if (this.#current === child) {
      child.exit(undefined, "removed");
      this.#current = null;
    }
    return this.children.delete(id);
  }

  getCurrent() {
    return this.#current;
  }

  getIsActive() {
    return this.#active;
  }

  getPath(): string {
    return this.parent ? `${this.parent.getPath()}.${this.id}` : this.id;
  }

  enter(info?: unknown, from = "initial") {
    if (this.#active) return;
    this.#active = true;
    this.onEnter?.(info, from);
    if (this.initial) this.transition(this.initial, info);
  }

  exit(info?: unknown, to = "exit") {
    if (!this.#active) return;
    this.#current?.exit(info, to);
    this.#current = null;
    this.onExit?.(info, to);
    this.#active = false;
  }

  transition(path: string, info?: unknown) {
    const [nextId, ...rest] = path.split(".");
    const next = this.children.get(nextId);
    if (!next) throw new Error(`${this.getPath()} has no child state ${nextId}`);
    if (this.#current !== next) {
      const previous = this.#current;
      previous?.exit(info, nextId);
      this.#current = next;
      next.enter(info, previous?.id ?? "initial");
    }
    if (rest.length > 0) next.transition(rest.join("."), info);
    return next;
  }

  dispatch(event: Event): boolean {
    const activeChild = this.#current;
    if (this.onEvent?.(event) === true) return true;
    if (this.#active && activeChild && activeChild === this.#current) {
      return activeChild.dispatch(event);
    }
    return false;
  }

  protected onEnter?(info: unknown, from: string): void;
  protected onExit?(info: unknown, to: string): void;
  protected onEvent?(event: Event): boolean | void;
}

export class EditorRootStateNode<State, Event = unknown> extends EditorStateNode<
  State,
  Event
> {
  constructor(editor: EditorCommandHost<State>) {
    super(editor, "root");
  }
}
