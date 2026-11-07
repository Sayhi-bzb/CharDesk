import type { KeymapEvent, KeymapHost } from '@opentui/keymap';
import { createInputKeymap } from './engine.js';

/** Gives a Host attachment its own lifetime without closing the renderer or DOM root. */
export function createInputSession<T extends object, E extends KeymapEvent>(
  host: KeymapHost<T, E>,
  options: { sequenceTimeoutMs?: number } = {}
) {
  const closing = new Set<() => void>();
  let disposed = false;
  const scoped: KeymapHost<T, E> = {
    get metadata() {
      return host.metadata;
    },
    rootTarget: host.rootTarget,
    get isDestroyed() {
      return disposed || host.isDestroyed;
    },
    getFocusedTarget: () => host.getFocusedTarget(),
    getParentTarget: (target) => host.getParentTarget(target),
    isTargetDestroyed: (target) => host.isTargetDestroyed(target),
    onKeyPress: (listener) => host.onKeyPress(listener),
    onKeyRelease: (listener) => host.onKeyRelease(listener),
    onFocusChange: (listener) => host.onFocusChange(listener),
    onTargetDestroy: (target, listener) => host.onTargetDestroy(target, listener),
    createCommandEvent: () => host.createCommandEvent(),
    onRawInput: host.onRawInput ? (listener) => host.onRawInput!(listener) : undefined,
    onDestroy(listener) {
      closing.add(listener);
      const detach = host.onDestroy?.(listener);
      return () => {
        closing.delete(listener);
        detach?.();
      };
    },
  };
  const keymap = createInputKeymap(scoped, options);
  return {
    keymap,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const listener of [...closing]) listener();
      closing.clear();
    },
  };
}
