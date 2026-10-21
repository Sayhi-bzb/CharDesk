import { randomUUID } from 'node:crypto';
import { BridgeError, cancelled, isWrite, REQUEST_LIMITS, requestTimeout, unknownExecution } from './protocol.mjs';

export class BridgeRequests {
  #pending = new Map();
  #callers = new Map();

  constructor({ limits = REQUEST_LIMITS, timeoutFor = requestTimeout, onChange = () => {} } = {}) {
    this.limits = limits;
    this.timeoutFor = timeoutFor;
    this.onChange = onChange;
  }

  get status() {
    return { activeRequests: this.#pending.size, activeCallers: this.#callers.size, requestLimits: this.limits };
  }

  run(clientId, name, input, signal, dispatch) {
    if (signal.aborted) return Promise.reject(cancelled());
    const count = this.#callers.get(clientId) || 0;
    if (this.#pending.size >= this.limits.global || count >= this.limits.perCaller) {
      return Promise.reject(new BridgeError('bridge_busy', 'Local MCP request capacity reached. Retry after current requests finish.', 429));
    }
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      const entry = {
        id, forwarded: false, settled: false,
        finish: (error, result, uncertain = false) => {
          if (entry.settled) return;
          entry.settled = true;
          clearTimeout(timer);
          signal.removeEventListener('abort', abort);
          this.#pending.delete(id);
          const remaining = this.#callers.get(clientId) - 1;
          if (remaining) this.#callers.set(clientId, remaining);
          else this.#callers.delete(clientId);
          this.onChange();
          if (error) reject(uncertain && entry.forwarded && isWrite(name, input) ? unknownExecution(error.message) : error);
          else resolve(result);
        },
      };
      const abort = () => entry.finish(cancelled(), undefined, true);
      const timer = setTimeout(() => entry.finish(new BridgeError('request_timeout', 'Canvas page timed out.', 504), undefined, true), this.timeoutFor(name));
      this.#pending.set(id, entry);
      this.#callers.set(clientId, count + 1);
      signal.addEventListener('abort', abort, { once: true });
      this.onChange();
      // Observe dispatch failures immediately, including failures during sourceRef I/O.
      Promise.resolve().then(() => dispatch(entry)).catch((error) => entry.finish(error));
    });
  }

  reply(id, result, error) {
    this.#pending.get(id)?.finish(error ? new BridgeError('request_failed', error, 502) : null, result);
  }

  failAll(error) {
    for (const entry of this.#pending.values()) entry.finish(error, undefined, true);
  }
}
