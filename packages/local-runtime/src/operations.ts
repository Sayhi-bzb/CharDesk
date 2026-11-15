export type OperationContext = Readonly<{ owner?: object; signal?: AbortSignal; ticket?: OperationTicket; activate?: boolean }>;

export class OperationCancelled extends Error {
  readonly code = 'operation_cancelled';
  constructor(readonly effects: readonly string[]) {
    super(effects.length ? 'Operation superseded; completed effects were retained.' : 'Operation cancelled.');
    this.name = 'OperationCancelled';
  }
}

/** One owner replaces its own pending intent; clients do not cancel one another. */
export class OperationCoordinator {
  readonly interactiveOwner = {};
  readonly #current = new WeakMap<object, OperationTicket>();
  readonly #pending = new Set<OperationTicket>();
  readonly #owned = new WeakSet<OperationTicket>();
  #disposed = false;
  begin(context: OperationContext = {}) {
    if (this.#disposed) throw new OperationCancelled([]);
    if (context.ticket) {
      if (!this.#owned.has(context.ticket)) throw new OperationCancelled([]);
      context.ticket.assertCurrent(); return context.ticket;
    }
    const owner = context.owner ?? this.interactiveOwner;
    this.#current.get(owner)?.cancel();
    const ticket: OperationTicket = new OperationTicket(
      () => !this.#disposed && this.#current.get(owner) === ticket,
      () => this.#pending.delete(ticket), context.signal, context.activate !== false);
    this.#current.set(owner, ticket);
    this.#pending.add(ticket);
    this.#owned.add(ticket);
    if (context.signal?.aborted) ticket.cancel();
    ticket.assertCurrent();
    return ticket;
  }
  cancel(owner = this.interactiveOwner) { this.#current.get(owner)?.cancel(); }
  async run<T>(context: OperationContext | undefined, prepare: (ticket: OperationTicket) => Promise<T>): Promise<T> {
    const ticket = this.begin(context);
    try { return await prepare(ticket); }
    finally { if (!context?.ticket) ticket.cancel(); }
  }
  dispose() {
    this.#disposed = true;
    for (const ticket of [...this.#pending]) ticket.cancel();
  }
}

export class OperationTicket {
  readonly id = globalThis.crypto.randomUUID();
  readonly #abort = new AbortController();
  readonly #effects: string[] = [];
  readonly #guards: Array<() => boolean> = [];
  #committed = false;
  #detach = () => {};
  constructor(private readonly current: () => boolean, private readonly retire: () => void,
    signal?: AbortSignal, readonly activate = true) {
    if (signal) {
      const abort = () => this.cancel();
      signal.addEventListener('abort', abort, { once: true });
      this.#detach = () => signal.removeEventListener('abort', abort);
    }
  }
  get signal() { return this.#abort.signal; }
  get outcome() { return { committed: this.#committed, effects: [...this.#effects], cancelled: this.signal.aborted }; }
  guard(check: () => boolean) { this.#guards.push(check); return this; }
  assertCurrent() {
    if (this.signal.aborted || !this.current() || this.#guards.some((check) => !check()))
      throw new OperationCancelled(this.#effects);
  }
  effect(description: string) { this.#effects.push(description); }
  publish<T>(publish: () => T): T {
    this.assertCurrent();
    const result = publish();
    if (result && typeof result === 'object' && 'then' in result)
      throw new TypeError('Operation publication must be synchronous.');
    return result;
  }
  commit<T>(publish: () => T): T {
    const result = this.publish(publish);
    this.#committed = true;
    this.#detach();
    this.retire();
    return result;
  }
  cancel() {
    if (this.#committed) return;
    this.#abort.abort();
    this.#detach();
    this.retire();
  }
}
