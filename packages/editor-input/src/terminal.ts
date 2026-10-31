import type { CliRenderer } from '@opentui/core';
import { createOpenTuiKeymapHost } from '@opentui/keymap/opentui';
import { registerBaseLayoutFallback } from '@opentui/keymap/addons/opentui';
import { createInputSession } from './session.js';

/** OpenTUI owns terminal negotiation and parsing; this adapter owns its subscriptions. */
export function createTerminalInput(renderer: CliRenderer) {
  const session = createInputSession(createOpenTuiKeymapHost(renderer));
  const { keymap } = session;
  registerBaseLayoutFallback(keymap);
  const capabilities = () => keymap.setData('terminal.capabilities', renderer.capabilities);
  const reset = () => keymap.clearPendingSequence();
  renderer.on('capabilities', capabilities);
  renderer.on('blur', reset);
  renderer.on('resize', reset);
  capabilities();
  return {
    keymap,
    dispose() {
      reset();
      renderer.off('capabilities', capabilities);
      renderer.off('blur', reset);
      renderer.off('resize', reset);
      session.dispose();
    },
  };
}
