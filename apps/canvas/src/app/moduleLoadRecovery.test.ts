import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  installModuleLoadRecovery,
  isModuleReloadPending,
  isRecoverableModuleLoadError,
  requireLoadedModule,
} from '@/shared/lib/moduleLoadRecovery';

const createStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
};

const disposers: Array<() => void> = [];

afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
});

describe('moduleLoadRecovery', () => {
  it('prevents a preload error and automatically reloads once', () => {
    const target = new EventTarget();
    const reload = vi.fn();
    const dispose = installModuleLoadRecovery({
      eventTarget: target as unknown as Window,
      storage: createStorage(),
      reload,
      now: () => 100_000,
    });
    disposers.push(dispose);

    const event = new Event('vite:preloadError', { cancelable: true });
    target.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(reload).toHaveBeenCalledOnce();
    expect(isModuleReloadPending()).toBe(true);
    expect(() => requireLoadedModule(undefined)).toThrow('did not load');
    try {
      requireLoadedModule(undefined);
    } catch (error) {
      expect(isRecoverableModuleLoadError(error)).toBe(true);
    }
  });

  it('suppresses a second preload failure without entering a reload loop', () => {
    const target = new EventTarget();
    const storage = createStorage();
    const reload = vi.fn();
    let now = 100_000;
    const dispose = installModuleLoadRecovery({
      eventTarget: target as unknown as Window,
      storage,
      reload,
      now: () => now,
    });
    disposers.push(dispose);

    target.dispatchEvent(new Event('vite:preloadError', { cancelable: true }));
    now += 10_000;
    const repeated = new Event('vite:preloadError', { cancelable: true });
    target.dispatchEvent(repeated);

    expect(repeated.defaultPrevented).toBe(true);
    expect(reload).toHaveBeenCalledOnce();
    expect(isModuleReloadPending()).toBe(false);
  });

  it('recognizes module failures without classifying ordinary render errors', () => {
    expect(
      isRecoverableModuleLoadError(
        new TypeError('Failed to fetch dynamically imported module: /settings.js')
      )
    ).toBe(true);
    expect(isRecoverableModuleLoadError(new Error('Invalid settings state'))).toBe(false);
  });
});
