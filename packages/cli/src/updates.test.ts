import { afterEach, describe, expect, test, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CliUpdates } from './updates.js';

const disposers: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  for (const dispose of disposers.splice(0).reverse()) await dispose();
});
async function fixture(current = '0.6.11', version = '0.6.12', timeout = 3000) {
  const cache = await mkdtemp(join(tmpdir(), 'chardesk-updates-'));
  disposers.push(() => rm(cache, { recursive: true, force: true }));
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(JSON.stringify({ name: '@chardesk/cli', version })));
  const service = new CliUpdates(current, cache, { fetch: fetcher, timeout });
  disposers.push(() => service.dispose());
  return { cache, fetcher, service };
}

describe('interactive distribution updates', () => {
  test.each([
    ['0.9.0', '0.10.0', true],
    ['1.0.0-beta.1', '1.0.0', true],
    ['1.0.0', '1.0.0', false],
    ['2.0.0', '1.0.0', false],
    ['1.0.0+local', '1.0.0+registry', false],
  ])('compares %s with %s using SemVer', async (current, latest, available) => {
    const { service } = await fixture(current, latest);
    await service.check();
    expect(service.state).toMatchObject({
      current,
      latest,
      available,
      phase: available ? 'available' : 'current',
    });
  });

  test('a fresh shared cache prevents background network; manual checks bypass it', async () => {
    const { service, cache, fetcher } = await fixture();
    await writeFile(
      join(cache, 'updates.json'),
      JSON.stringify({ checkedAt: Date.now(), latest: '0.6.11' })
    );
    service.setAutomatic(true);
    await vi.waitFor(() => expect(service.state.phase).toBe('current'));
    expect(fetcher).not.toHaveBeenCalled();
    await service.check();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(service.state.phase).toBe('available');
    const saved = JSON.parse(await readFile(join(cache, 'updates.json'), 'utf8'));
    expect(saved.latest).toBe('0.6.12');
  });

  test('manual request during cache lookup still forces one network check', async () => {
    const { service, cache, fetcher } = await fixture();
    await writeFile(
      join(cache, 'updates.json'),
      JSON.stringify({ checkedAt: Date.now(), latest: '0.6.11' })
    );
    service.setAutomatic(true);
    await service.check();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(service.state.phase).toBe('available');
  });

  test.each([
    'garbage',
    JSON.stringify({ checkedAt: 0, latest: '0.6.11' }),
    JSON.stringify({ checkedAt: Date.now() + 100000, latest: '0.6.11' }),
  ])('invalid, expired or future cache is replaced', async (content) => {
    const { service, cache, fetcher } = await fixture();
    await writeFile(join(cache, 'updates.json'), content);
    service.setAutomatic(true);
    await vi.waitFor(() => expect(service.state.phase).toBe('available'));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  test('offline background checks are silent; manual failure is explicit and can retry', async () => {
    const { service, fetcher } = await fixture();
    fetcher.mockRejectedValue(new Error('offline'));
    service.setAutomatic(true);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(service.state.phase).toBe('idle'));
    await service.check();
    expect(service.state).toMatchObject({ phase: 'error', error: 'Error: offline' });
    fetcher.mockResolvedValue(
      new Response(JSON.stringify({ name: '@chardesk/cli', version: '0.6.12' }))
    );
    await service.check();
    expect(service.state.phase).toBe('available');
  });

  test.each([
    { name: '@other/package', version: '9.0.0' },
    { name: '@chardesk/cli', version: 'not-a-version' },
  ])('rejects malformed registry payload', async (data) => {
    const { service, fetcher } = await fixture();
    fetcher.mockResolvedValue(new Response(JSON.stringify(data)));
    await service.check();
    expect(service.state.phase).toBe('error');
    expect(service.state.available).not.toBe(true);
  });

  test('cache write failures do not hide a successful version lookup', async () => {
    const { cache, fetcher } = await fixture();
    const file = join(cache, 'not-a-directory');
    await writeFile(file, 'occupied');
    const service = new CliUpdates('0.6.11', file, { fetch: fetcher });
    disposers.push(() => service.dispose());
    await service.check();
    expect(service.state.phase).toBe('available');
  });

  test('requests join in flight, timeout is bounded, and disposal aborts without publishing', async () => {
    const { service, fetcher } = await fixture('0.6.11', '0.6.12', 20);
    fetcher.mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          });
        })
    );
    const first = service.check(),
      second = service.check();
    expect(first).toBe(second);
    await first;
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(service.state).toMatchObject({ phase: 'error', error: 'timeout' });
    const listener = vi.fn();
    service.subscribe(listener);
    const pending = service.check();
    listener.mockClear();
    service.dispose();
    await pending;
    expect(listener).not.toHaveBeenCalled();
  });

  test('manual checks join a background network request already in progress', async () => {
    const { service, fetcher } = await fixture();
    let complete!: (response: Response) => void;
    fetcher.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        })
    );
    service.setAutomatic(true);
    await vi.waitFor(() => expect(service.state.phase).toBe('checking'));
    const manual = service.check();
    complete(new Response(JSON.stringify({ name: '@chardesk/cli', version: '0.6.12' })));
    await manual;
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(service.state.phase).toBe('available');
  });

  test('disabling automatic checks aborts background work and still permits a manual check', async () => {
    const { service, fetcher } = await fixture();
    let signal: AbortSignal | null | undefined;
    fetcher.mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          signal = options?.signal;
          signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        })
    );
    service.setAutomatic(true);
    await vi.waitFor(() => expect(service.state.phase).toBe('checking'));
    service.setAutomatic(false);
    expect(signal?.aborted).toBe(true);
    await vi.waitFor(() => expect(service.state.phase).toBe('idle'));
    fetcher.mockResolvedValue(
      new Response(JSON.stringify({ name: '@chardesk/cli', version: '0.6.12' }))
    );
    await service.check();
    expect(service.state.phase).toBe('available');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  test.each(['development', '0.6.11-dev'])(
    'development build %s never contacts the registry',
    async (version) => {
      const { service, fetcher } = await fixture(version);
      service.setAutomatic(true);
      await service.check();
      expect(service.state.phase).toBe('development');
      expect(fetcher).not.toHaveBeenCalled();
    }
  );
});
