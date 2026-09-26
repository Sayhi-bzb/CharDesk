import type {
  AnyEditorCommandDefinition,
  EditorCommandContext,
  EditorCommandDefinition,
  EditorCommandHost,
  EditorCommandResult,
} from "./types";

const unhandled = (reason: string): EditorCommandResult => ({
  handled: false,
  status: "unhandled",
  reason,
});

const rejected = (reason: string): EditorCommandResult => ({
  handled: true,
  status: "rejected",
  reason,
});

type RegisteredCommand<State> = {
  owner: string;
  definition: AnyEditorCommandDefinition<State>;
};

export class EditorCommandRegistry<State> {
  readonly #commands = new Map<string, RegisteredCommand<State>>();
  readonly #host: EditorCommandHost<State>;

  constructor(host: EditorCommandHost<State>) {
    this.#host = host;
  }

  register(owner: string, definition: AnyEditorCommandDefinition<State>) {
    const existing = this.#commands.get(definition.id);
    if (existing) {
      throw new Error(
        `Editor command ${definition.id} is already registered by ${existing.owner}`
      );
    }
    this.#commands.set(definition.id, { owner, definition });
    return () => {
      const current = this.#commands.get(definition.id);
      if (current?.definition === definition) this.#commands.delete(definition.id);
    };
  }

  has(id: string) {
    return this.#commands.has(id);
  }

  list() {
    return [...this.#commands.values()].map(({ definition }) => definition);
  }

  canExecute<Input>(
    command: string | EditorCommandDefinition<State, Input>,
    input: Input,
    source = "api"
  ) {
    const definition = this.#resolve(command);
    if (!definition) return false;
    const context = this.#context(source);
    return definition.canExecute?.(input, context) ?? true;
  }

  execute<Input, Data>(
    command: string | EditorCommandDefinition<State, Input, Data>,
    input: Input,
    source = "api"
  ): EditorCommandResult<Data> {
    const definition = this.#resolve(command);
    if (!definition) return unhandled("unknown-command") as EditorCommandResult<Data>;
    const context = this.#context(source);
    if (definition.canExecute && !definition.canExecute(input, context)) {
      return rejected("precondition-failed") as EditorCommandResult<Data>;
    }
    return definition.execute(input, context) as EditorCommandResult<Data>;
  }

  #resolve<Input, Data>(
    command: string | EditorCommandDefinition<State, Input, Data>
  ): EditorCommandDefinition<State, Input, Data> | undefined {
    if (typeof command === "string") {
      return this.#commands.get(command)?.definition as
        | EditorCommandDefinition<State, Input, Data>
        | undefined;
    }
    const registered = this.#commands.get(command.id)?.definition;
    return registered === command ? command : undefined;
  }

  #context(source: string): EditorCommandContext<State> {
    return {
      editor: this.#host,
      state: this.#host.getState(),
      source,
    };
  }
}
