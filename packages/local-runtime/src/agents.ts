export type AgentIdentity = { id: string; name: string };
/** Claimed identity, not authentication. Never infer people from socket counts. */
export function parseAgentIdentity(value: unknown): AgentIdentity | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected an agent identity.');
  const { id, name = id } = value as Record<string, unknown>;
  if (
    typeof id !== 'string' ||
    !/^[A-Za-z0-9._:-]{1,128}$/.test(id) ||
    typeof name !== 'string' ||
    !name.trim() ||
    name.length > 80 ||
    /[\p{Cc}\p{Cf}]/u.test(name)
  )
    throw new Error(
      'Agent ID must be 1–128 ASCII letters, digits, dots, underscores, colons or hyphens; name must be 1–80 visible characters.'
    );
  return { id, name: name.trim() };
}

export type AgentActivityStatus = 'working' | 'completed' | 'failed' | 'interrupted';
export type AgentInvocation = { argv?: string[]; input?: Record<string, unknown> };
export type AgentInvocationDetails = { argv: string[] | null; input: string | null };
export function parseAgentInvocation(value: unknown): AgentInvocation | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected invocation metadata.');
  const { argv, input } = value as Record<string, unknown>;
  if (
    argv !== undefined &&
    (!Array.isArray(argv) ||
      argv.length > 256 ||
      !argv.every((arg) => typeof arg === 'string') ||
      argv.join('').length > 65536)
  )
    throw new Error('Invalid command arguments.');
  if (input !== undefined && (!input || typeof input !== 'object' || Array.isArray(input)))
    throw new Error('Expected invocation input object.');
  return {
    ...(argv ? { argv: [...(argv as string[])] } : {}),
    ...(input ? { input: input as Record<string, unknown> } : {}),
  };
}
export type CanvasAgentActivity = {
  id: number;
  canvasId: string;
  agentId: string;
  name: string;
  operation: string;
  status: AgentActivityStatus;
  startedAt: number;
  updatedAt: number;
  revision: number;
  readRevision: number;
};
export type ActivityReceipt = { id: number; revision: number };
export interface AgentInboxStorage {
  create(
    canvasId: string,
    identity: AgentIdentity,
    operation: string,
    now: number,
    invocation?: AgentInvocation
  ): number;
  details(canvasId: string, id: number): AgentInvocationDetails | undefined;
  finish(id: number, status: Exclude<AgentActivityStatus, 'working'>, now: number): void;
  list(canvasId: string, read: boolean, limit: number, offset: number): CanvasAgentActivity[];
  count(canvasId: string, read: boolean): number;
  markRead(canvasId: string, seen: readonly ActivityReceipt[]): void;
  close(): void;
}

/** Advisory inbox. A failed notification must never turn a committed Canvas edit into a failed call. */
export class CanvasAgents {
  #store?: AgentInboxStorage;
  #listeners = new Set<() => void>();
  #disposed = false;
  error?: string;
  constructor(
    readonly path: string,
    createStore: () => AgentInboxStorage,
    private now = Date.now
  ) {
    try {
      this.#store = createStore();
    } catch (error) {
      this.error = String(error);
    }
  }
  subscribe(listener: () => void) {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
  #emit() {
    for (const listener of this.#listeners) listener();
  }
  #access<T>(action: (store: AgentInboxStorage) => T, fallback: T, clearError = false): T {
    if (this.#disposed || !this.#store) return fallback;
    try {
      const result = action(this.#store);
      if (clearError) this.error = undefined;
      return result;
    } catch (error) {
      const message = String(error);
      if (this.error !== message) {
        this.error = message;
        this.#emit();
      }
      return fallback;
    }
  }
  list(canvasId: string, read = false, limit = 50, offset = 0) {
    return this.#access((store) => store.list(canvasId, read, limit, offset), []);
  }
  count(canvasId: string, read = false) {
    return this.#access((store) => store.count(canvasId, read), 0);
  }
  details(canvasId: string, id: number) {
    return this.#access((store) => store.details(canvasId, id), undefined);
  }
  begin(
    canvasId: string,
    identity: AgentIdentity,
    operation: string,
    invocation?: AgentInvocation
  ): (status?: Exclude<AgentActivityStatus, 'working'>) => void {
    const id = this.#access(
      (store) => store.create(canvasId, identity, operation, this.now(), invocation),
      null,
      true
    );
    if (id === null) return () => {};
    this.#emit();
    let finished = false;
    return (status: Exclude<AgentActivityStatus, 'working'> = 'completed') => {
      if (finished || this.#disposed) return;
      finished = true;
      this.#access((store) => store.finish(id, status, this.now()), undefined, true);
      this.#emit();
    };
  }
  markRead(canvasId: string, seen: readonly ActivityReceipt[]) {
    if (!seen.length) return true;
    const saved = this.#access(
      (store) => {
        store.markRead(canvasId, seen);
        return true;
      },
      false,
      true
    );
    if (saved) this.#emit();
    return saved;
  }
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#listeners.clear();
    try {
      this.#store?.close();
    } catch (error) {
      this.error = String(error);
    }
  }
}
