import type { CliRenderer, KeyEvent } from '@opentui/core';
import { createKeyInput } from '@chardesk/keyboard';
import { createOpenTuiKeymapHost } from '@opentui/keymap/opentui';
import { registerBaseLayoutFallback } from '@opentui/keymap/addons/opentui';
import { createInputSession } from './session.js';

/** One OpenTUI modifier vocabulary for binding dispatch, recording and pointer fallback. */
export function terminalKeyModifiers(
  event: Pick<KeyEvent, 'ctrl' | 'shift' | 'meta' | 'option' | 'super'>
) {
  return {
    ctrl: event.ctrl,
    shift: event.shift,
    alt: event.meta || event.option,
    meta: event.super ?? false,
  };
}

/** OpenTUI meta is Option/Alt; super is Command. Recording uses the same catalog vocabulary. */
export function terminalKeyInput(event: KeyEvent) {
  return createKeyInput({
    key:
      (
        {
          return: 'Enter',
          space: ' ',
          left: 'ArrowLeft',
          right: 'ArrowRight',
          up: 'ArrowUp',
          down: 'ArrowDown',
          escape: 'Escape',
        } as Record<string, string>
      )[event.name] ?? event.name,
    phase: event.eventType === 'release' ? 'up' : 'down',
    repeat: event.eventType === 'repeat',
    modifiers: terminalKeyModifiers(event),
  });
}

/** OpenTUI owns terminal negotiation and parsing; this adapter owns its subscriptions. */
export function createTerminalInput(renderer: CliRenderer) {
  const session = createInputSession(createOpenTuiKeymapHost(renderer));
  const { keymap } = session;
  registerBaseLayoutFallback(keymap);
  const capabilities = () => keymap.setData('terminal.capabilities', renderer.capabilities);
  const reset = () => keymap.clearPendingSequence();
  renderer.on('capabilities', capabilities);
  renderer.on('blur', reset);
  renderer.on('focus', reset);
  renderer.on('resize', reset);
  capabilities();
  return {
    keymap,
    dispose() {
      reset();
      renderer.off('capabilities', capabilities);
      renderer.off('blur', reset);
      renderer.off('focus', reset);
      renderer.off('resize', reset);
      session.dispose();
    },
  };
}
