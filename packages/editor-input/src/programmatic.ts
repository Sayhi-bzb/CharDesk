import type { HostMetadata, KeymapEvent, KeymapHost } from '@opentui/keymap';
import { createKeyInput, type KeyInput } from '@chardesk/keyboard';
import { createInputSession } from './session.js';
import { inputStroke } from './engine.js';

/** A non-IO Host for explicit normalized input and catalog queries. */
export function createProgrammaticInput(metadata: () => HostMetadata, sequenceTimeoutMs = 1500) {
  const target = {};
  const presses = new Set<(event: KeymapEvent) => void>();
  const releases = new Set<(event: KeymapEvent) => void>();
  const subscribe = (
    set: Set<(event: KeymapEvent) => void>,
    listener: (event: KeymapEvent) => void
  ) => {
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  };
  const eventFor = (input: KeyInput): KeymapEvent => {
    let stopped = false;
    return {
      ...inputStroke(input),
      ctrl: input.modifiers.ctrl,
      shift: input.modifiers.shift,
      meta: input.modifiers.alt,
      get propagationStopped() {
        return stopped;
      },
      preventDefault() {},
      stopPropagation() {
        stopped = true;
      },
    };
  };
  const host: KeymapHost<object> = {
    get metadata() {
      return metadata();
    },
    rootTarget: target,
    isDestroyed: false,
    getFocusedTarget: () => target,
    getParentTarget: () => null,
    isTargetDestroyed: () => false,
    onKeyPress: (listener) => subscribe(presses, listener),
    onKeyRelease: (listener) => subscribe(releases, listener),
    onFocusChange: () => () => {},
    onTargetDestroy: () => () => {},
    createCommandEvent: () => eventFor(createKeyInput({ key: 'command' })),
  };
  const session = createInputSession(host, { sequenceTimeoutMs });
  return {
    ...session,
    dispatch(input: KeyInput) {
      if (input.composing || input.modifiers.altGraph) {
        session.keymap.clearPendingSequence();
        return false;
      }
      const event = eventFor(input);
      session.keymap.setData('input', input);
      for (const listener of input.phase === 'up' ? releases : presses) {
        listener(event);
        if (event.propagationStopped) break;
      }
      return event.propagationStopped;
    },
  };
}
