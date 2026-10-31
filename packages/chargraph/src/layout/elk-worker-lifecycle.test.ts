import { afterEach, expect, test, vi } from 'vitest';
import type { LayoutGraph } from './model.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

test('runtime layout workers stay referenced during requests and release the idle Host', async () => {
  const messages: Array<{ id: number; cmd: string }> = [];
  const listeners = new Map<string, (event: { data?: unknown; message?: string }) => void>();
  const ref = vi.fn(),
    unref = vi.fn();
  class Worker {
    ref = ref;
    unref = unref;
    addEventListener(
      type: string,
      listener: (event: { data?: unknown; message?: string }) => void
    ) {
      listeners.set(type, listener);
    }
    postMessage(message: { id: number; cmd: string }) {
      messages.push(message);
    }
    terminate() {}
  }
  vi.stubGlobal('Worker', Worker);
  const { getDefaultGraphLayoutEngine } = await import('./elk.js');
  const engine = getDefaultGraphLayoutEngine();
  expect(messages[0]?.cmd).toBe('register');
  expect(ref).toHaveBeenCalledTimes(1);
  expect(unref).not.toHaveBeenCalled();
  listeners.get('message')!({ data: { id: messages[0]!.id, data: {} } });
  expect(unref).toHaveBeenCalledTimes(1);
  const graph: LayoutGraph = {
    direction: 'LR',
    spacing: { nodeNode: 2, nodeNodeBetweenLayers: 2 },
    groups: [],
    nodes: [],
    edges: [],
  };
  const pending = engine.layout(graph);
  const rejected = expect(pending).rejects.toThrow('worker stopped');
  await Promise.resolve();
  expect(messages[1]?.cmd).toBe('layout');
  expect(ref).toHaveBeenCalledTimes(2);
  listeners.get('error')!({ message: 'worker stopped' });
  await rejected;
  expect(unref).toHaveBeenCalledTimes(2);
});
