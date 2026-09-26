import type { EditorStateScopeDefinition } from "./extension";

export type RegisteredEditorStateScope = EditorStateScopeDefinition & { owner: string };

export class EditorStateScopeRegistry {
  readonly #definitions = new Map<string, RegisteredEditorStateScope>();

  register(owner: string, definition: EditorStateScopeDefinition) {
    const existing = this.#definitions.get(definition.key);
    if (existing) {
      throw new Error(`Editor state scope ${definition.key} is already owned by ${existing.owner}`);
    }
    this.#definitions.set(definition.key, { ...definition, owner });
    return () => {
      if (this.#definitions.get(definition.key)?.owner === owner) {
        this.#definitions.delete(definition.key);
      }
    };
  }

  get(key: string) {
    return this.#definitions.get(key);
  }

  list() {
    return [...this.#definitions.values()];
  }
}
