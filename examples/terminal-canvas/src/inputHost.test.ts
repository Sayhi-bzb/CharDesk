import { expect, test } from 'bun:test';
import { createTestRenderer, setRendererCapabilities } from '@opentui/core/testing';
import { createTerminalInput } from '@chardesk/editor-input/terminal';

test('terminal Host observes later capability replies and releases every attachment subscription', async () => {
  const setup = await createTestRenderer({ width: 20, height: 5 });
  try {
    const keys = setup.renderer.keyInput.listenerCount('keypress');
    const capabilities = setup.renderer.listenerCount('capabilities');
    for (let i = 0; i < 2; i++) {
      const input = createTerminalInput(setup.renderer);
      let calls = 0;
      input.keymap.registerLayer({
        bindings: [
          {
            key: 'f2',
            cmd: () => {
              calls++;
            },
          },
        ],
      });
      setup.mockInput.pressKey('F2');
      expect(calls).toBe(1);
      const next = setRendererCapabilities(setup.renderer, {
        kitty_keyboard: true,
        osc52_support: 'supported',
      });
      setup.renderer.emit('capabilities', next);
      expect(input.keymap.getData('terminal.capabilities')).toMatchObject({
        kitty_keyboard: true,
        osc52_support: 'supported',
      });
      input.dispose();
      setup.mockInput.pressKey('F2');
      expect(calls).toBe(1);
      expect(setup.renderer.keyInput.listenerCount('keypress')).toBe(keys);
      expect(setup.renderer.listenerCount('capabilities')).toBe(capabilities);
    }
  } finally {
    await setup.dispose();
  }
});
