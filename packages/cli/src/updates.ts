import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gt, valid } from 'semver';
import { atomicWrite } from '@chardesk/local-runtime/storage';
import type { TerminalUpdates, UpdateState } from '../../terminal/src/updates.ts';

const DAY = 24 * 60 * 60 * 1000;
const registry = 'https://registry.npmjs.org/@chardesk%2fcli/latest';
type Cache = { checkedAt: number; latest: string };
type Dependencies = { fetch?: typeof fetch; now?: () => number; timeout?: number };

export class CliUpdates implements TerminalUpdates {
  state: UpdateState;
  readonly commands = [
    { label: 'npm (global)', command: 'npm install -g @chardesk/cli@latest' },
    { label: 'Bun (global)', command: 'bun add -g @chardesk/cli@latest' },
    { label: 'npx (one run)', command: 'npx -y @chardesk/cli@latest tui' },
  ];
  #listeners = new Set<() => void>();
  #pending?: Promise<void>;
  #forced = false;
  #fetching = false;
  #controller?: AbortController;
  #timer?: ReturnType<typeof setTimeout>;
  #nextCheck = 0;
  #automatic = false;
  #disposed = false;
  readonly #cachePath: string;
  readonly #fetch: typeof fetch;
  readonly #now: () => number;
  readonly #timeout: number;

  constructor(
    current: string,
    private cacheDirectory: string,
    dependencies: Dependencies = {}
  ) {
    this.state = {
      current,
      phase: valid(current) && !current.includes('-dev') ? 'idle' : 'development',
    };
    this.#cachePath = join(cacheDirectory, 'updates.json');
    this.#fetch = dependencies.fetch ?? fetch;
    this.#now = dependencies.now ?? Date.now;
    this.#timeout = dependencies.timeout ?? 3000;
  }
  subscribe(listener: () => void) {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
  #publish(state: UpdateState) {
    if (this.#disposed) return;
    this.state = state;
    for (const listener of this.#listeners) listener();
  }
  setAutomatic(enabled: boolean) {
    if (this.#disposed || this.#automatic === enabled) return;
    this.#automatic = enabled;
    clearTimeout(this.#timer);
    if (enabled) void this.#run(false);
    else if (!this.#forced) this.#controller?.abort();
  }
  check() {
    return this.#run(true);
  }
  async openReleaseNotes() {
    const { default: open } = await import('open');
    await open('https://github.com/Sayhi-bzb/CharDesk/releases');
  }
  #run(force: boolean): Promise<void> {
    if (this.#disposed || this.state.phase === 'development') return Promise.resolve();
    if (this.#pending) {
      if (force && !this.#fetching) return this.#pending.then(() => this.#run(true));
      if (force) this.#forced = true;
      return this.#pending;
    }
    this.#forced = force;
    this.#fetching = false;
    this.#pending = this.#check(force).finally(() => {
      this.#pending = undefined;
      if (this.#automatic && !this.#disposed) {
        clearTimeout(this.#timer);
        this.#timer = setTimeout(
          () => {
            void this.#run(false);
          },
          Math.max(1000, this.#nextCheck - this.#now())
        );
        this.#timer.unref();
      }
    });
    return this.#pending;
  }
  #accept(latest: string) {
    const available = gt(latest, this.state.current);
    this.#publish({
      current: this.state.current,
      latest,
      available,
      phase: available ? 'available' : 'current',
    });
  }
  async #check(force: boolean) {
    if (!force) {
      try {
        const cache = JSON.parse(await readFile(this.#cachePath, 'utf8')) as Cache;
        if (
          typeof cache.checkedAt === 'number' &&
          cache.checkedAt <= this.#now() &&
          this.#now() - cache.checkedAt < DAY &&
          typeof cache.latest === 'string' &&
          valid(cache.latest)
        ) {
          this.#nextCheck = cache.checkedAt + DAY;
          if (!this.#disposed && this.#automatic) this.#accept(cache.latest);
          return;
        }
      } catch { /* empty */ }
      if (!this.#automatic || this.#disposed) return;
    }
    const previous = this.state;
    this.#fetching = true;
    this.#nextCheck = this.#now() + DAY;
    this.#publish({ ...previous, phase: 'checking', error: undefined });
    const controller = (this.#controller = new AbortController());
    const timeout = setTimeout(() => controller.abort(), this.#timeout);
    timeout.unref();
    try {
      const response = await this.#fetch(registry, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`Registry returned HTTP ${response.status}`);
      const data = (await response.json()) as { name?: unknown; version?: unknown };
      if (data.name !== '@chardesk/cli' || typeof data.version !== 'string' || !valid(data.version))
        throw new Error('Invalid package version response');
      if (controller.signal.aborted || this.#disposed) {
        this.#publish(previous);
        return;
      }
      this.#accept(data.version);
      const cache: Cache = { checkedAt: this.#now(), latest: data.version };
      await mkdir(this.cacheDirectory, { recursive: true, mode: 0o700 })
        .then(() => atomicWrite(this.#cachePath, JSON.stringify(cache)))
        .catch(() => {});
    } catch (error) {
      if (!this.#disposed)
        this.#publish(
          this.#forced
            ? {
                ...previous,
                phase: 'error',
                error: controller.signal.aborted ? 'timeout' : String(error),
              }
            : previous
        );
    } finally {
      clearTimeout(timeout);
      if (this.#controller === controller) this.#controller = undefined;
    }
  }
  dispose() {
    this.#disposed = true;
    this.#automatic = false;
    clearTimeout(this.#timer);
    this.#controller?.abort();
    this.#listeners.clear();
  }
}
