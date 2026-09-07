import { describe, expect, it } from 'vitest';
import {
  ManagedInputBatchScheduler,
  resolveManagedInputBatchLimit,
  resolveManagedInputCommitCadence,
  type ManagedInputBatchSample,
} from './ManagedInputBatchScheduler';

const createHarness = (cadenceMs: number, maxPendingTextLength?: number) => {
  let now = 0;
  let nextHandle = 1;
  const frames = new Map<number, () => void>();
  const timers = new Map<number, { callback: () => void; at: number }>();
  const commits: { value: string; sample: ManagedInputBatchSample }[] = [];
  const scheduler = new ManagedInputBatchScheduler({
    now: () => now,
    requestFrame: (callback) => {
      const handle = nextHandle++;
      frames.set(handle, callback);
      return handle;
    },
    cancelFrame: (handle) => { frames.delete(handle); },
    setTimer: (callback, delayMs) => {
      const handle = nextHandle++;
      timers.set(handle, { callback, at: now + delayMs });
      return handle;
    },
    clearTimer: (handle) => { timers.delete(handle); },
    commit: (value, sample) => { commits.push({ value, sample }); },
  }, cadenceMs, maxPendingTextLength);
  return {
    scheduler,
    commits,
    advance(ms: number) {
      now += ms;
      for (const [handle, timer] of [...timers]) {
        if (timer.at <= now) {
          timers.delete(handle);
          timer.callback();
        }
      }
    },
    frame() {
      for (const [handle, callback] of [...frames]) {
        frames.delete(handle);
        callback();
      }
    },
    pending: () => ({ frames: frames.size, timers: timers.size }),
  };
};

describe('ManagedInputBatchScheduler', () => {
  it('commits the first burst on the next frame, then limits later commits', () => {
    const harness = createHarness(50);
    harness.scheduler.enqueue('a');
    harness.advance(10);
    harness.scheduler.enqueue('b');
    harness.frame();
    expect(harness.commits).toEqual([{
      value: 'ab',
      sample: { kind: 'first', textLength: 2, latencyMs: 10 },
    }]);

    harness.scheduler.enqueue('c');
    harness.advance(49);
    expect(harness.commits).toHaveLength(1);
    harness.advance(1);
    expect(harness.commits[1]).toEqual({
      value: 'c',
      sample: { kind: 'burst', textLength: 1, latencyMs: 50 },
    });
  });

  it('preserves synchronous ordering boundaries and cancels scheduled work', () => {
    const harness = createHarness(50);
    harness.scheduler.enqueue('x');
    harness.scheduler.flush();
    expect(harness.commits[0]).toEqual({
      value: 'x',
      sample: { kind: 'boundary', textLength: 1, latencyMs: 0 },
    });
    expect(harness.pending()).toEqual({ frames: 0, timers: 0 });
    harness.frame();
    expect(harness.commits).toHaveLength(1);
  });

  it('keeps the frame baseline behavior when cadence is zero', () => {
    const harness = createHarness(0);
    harness.scheduler.enqueue('a');
    harness.frame();
    harness.scheduler.enqueue('b');
    expect(harness.pending()).toEqual({ frames: 1, timers: 0 });
  });

  it('discards pending text and resets burst state', () => {
    const harness = createHarness(50);
    harness.scheduler.enqueue('old');
    harness.scheduler.discard();
    harness.advance(100);
    harness.frame();
    expect(harness.commits).toEqual([]);
    harness.scheduler.enqueue('new');
    expect(harness.pending()).toEqual({ frames: 1, timers: 0 });
  });

  it('commits at the capacity boundary and cancels scheduled work', () => {
    const harness = createHarness(50, 4);
    harness.scheduler.enqueue('ab');
    harness.scheduler.enqueue('cd');

    expect(harness.commits).toEqual([{
      value: 'abcd',
      sample: { kind: 'capacity', textLength: 4, latencyMs: 0 },
    }]);
    expect(harness.pending()).toEqual({ frames: 0, timers: 0 });
  });

  it('keeps one browser input event atomic when it exceeds the threshold', () => {
    const harness = createHarness(50, 4);
    harness.scheduler.enqueue('👩🏽‍💻');

    expect(harness.commits).toEqual([{
      value: '👩🏽‍💻',
      sample: { kind: 'capacity', textLength: '👩🏽‍💻'.length, latencyMs: 0 },
    }]);
  });
});

describe('resolveManagedInputCommitCadence', () => {
  it('only accepts experiment overrides on stress routes', () => {
    expect(resolveManagedInputCommitCadence('', 50)).toBe(50);
    expect(resolveManagedInputCommitCadence('?canvas-stress=1', 50)).toBe(50);
    expect(resolveManagedInputCommitCadence(
      '?canvas-stress=1&canvas-stress-input-commit-ms=frame', 50
    )).toBe(0);
    expect(resolveManagedInputCommitCadence(
      '?canvas-stress=1&canvas-stress-input-commit-ms=32'
    )).toBe(32);
    expect(resolveManagedInputCommitCadence(
      '?canvas-stress-input-commit-ms=80', 50
    )).toBe(50);
  });
});

describe('resolveManagedInputBatchLimit', () => {
  it('only accepts experiment overrides on stress routes', () => {
    expect(resolveManagedInputBatchLimit('')).toBe(Number.POSITIVE_INFINITY);
    expect(resolveManagedInputBatchLimit('', 256)).toBe(256);
    expect(resolveManagedInputBatchLimit('?canvas-stress=1', 256)).toBe(256);
    expect(resolveManagedInputBatchLimit(
      '?canvas-stress=1&canvas-stress-input-buffer-limit=unbounded'
    )).toBe(Number.POSITIVE_INFINITY);
    expect(resolveManagedInputBatchLimit(
      '?canvas-stress=1&canvas-stress-input-buffer-limit=512', 256
    )).toBe(512);
    expect(resolveManagedInputBatchLimit(
      '?canvas-stress-input-buffer-limit=unbounded', 256
    )).toBe(256);
  });
});
