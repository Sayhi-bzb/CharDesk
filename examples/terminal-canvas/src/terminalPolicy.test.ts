import { expect, test } from 'bun:test';
import { createTestRenderer, setRendererCapabilities } from '@opentui/core/testing';
import {
  attachTerminalPolicy,
  resolveTerminalPolicy,
  terminalRendererEnvironment,
  type TerminalInputPolicy,
} from './terminalPolicy.ts';
import { createTerminalShortcuts } from './shortcuts.ts';
import { helpLines } from './copy.ts';

test('Warp renderer policy matches its code-point grid and documented OSC 8 support', () => {
  expect(terminalRendererEnvironment({ TERM_PROGRAM: 'WarpTerminal' })).toEqual({
    FORCE_HYPERLINK: '1',
    OPENTUI_FORCE_WCWIDTH: '1',
  });
  expect(terminalRendererEnvironment({ TERM_PROGRAM: 'ghostty' })).toEqual({});
  expect(terminalRendererEnvironment({})).toEqual({});
  for (const value of ['0', 'false', 'off', '1', ''])
    expect(
      terminalRendererEnvironment({ TERM_PROGRAM: 'WarpTerminal', FORCE_HYPERLINK: value })
    ).toEqual({ FORCE_HYPERLINK: value, OPENTUI_FORCE_WCWIDTH: '1' });
  for (const multiplexer of [{ TMUX: '/tmp/tmux' }, { STY: 'session' }, { ZELLIJ: '1' }])
    expect(terminalRendererEnvironment({ TERM_PROGRAM: 'WarpTerminal', ...multiplexer })).toEqual(
      {}
    );
});

test('Warp width policy preserves explicit user overrides and leaves other terminal paths to native detection', () => {
  for (const key of ['OPENTUI_FORCE_WCWIDTH', 'OPENTUI_FORCE_UNICODE', 'OPENTUI_FORCE_NOZWJ']) {
    for (const value of ['', '0', '1']) {
      expect(terminalRendererEnvironment({ TERM_PROGRAM: 'WarpTerminal', [key]: value })).toEqual({
        FORCE_HYPERLINK: '1',
      });
    }
  }
  for (const value of ['true', '1']) {
    expect(
      terminalRendererEnvironment({
        TERM_PROGRAM: 'WarpTerminal',
        OPENTUI_FORCE_EXPLICIT_WIDTH: value,
      })
    ).toEqual({ FORCE_HYPERLINK: '1' });
  }
  for (const TERM_PROGRAM of ['ghostty', 'kitty', 'Apple_Terminal', 'unknown'])
    expect(terminalRendererEnvironment({ TERM_PROGRAM })).toEqual({});
});

test('link help distinguishes native output being enabled from a disabled or pending path', () => {
  const policy = resolveTerminalPolicy({ TERM_PROGRAM: 'WarpTerminal' });
  const shortcuts = createTerminalShortcuts('darwin', policy);
  expect(helpLines(shortcuts, policy, false).join('\n')).toContain(
    'Link opening is not enabled in this terminal'
  );
  expect(helpLines(shortcuts, policy, true).join('\n')).toContain('Warp macOS: ⌘+click');
});

test('Ghostty shift capture is requested once, restored across path changes and released before renderer close', async () => {
  const setup = await createTestRenderer({ width: 30, height: 8, useMouse: true });
  setRendererCapabilities(setup.renderer, { multiplexer: 'none' });
  const output: string[] = [];
  let policy = resolveTerminalPolicy();
  const listeners = setup.renderer.listenerCount('capabilities');
  const detach = attachTerminalPolicy(
    setup.renderer,
    (bytes) => {
      output.push(new TextDecoder().decode(bytes));
      return true;
    },
    (next) => {
      policy = next;
    },
    { TERM_PROGRAM: 'ghostty' }
  );
  const capabilities = (multiplexer: 'none' | 'tmux') => {
    const next = setRendererCapabilities(setup.renderer, { multiplexer });
    setup.renderer.emit('capabilities', next);
  };
  try {
    expect(output).toEqual(['\x1b[>1s']);
    expect(policy.shiftClick).toBe('requested');
    capabilities('none');
    expect(output).toHaveLength(1);
    capabilities('tmux');
    expect(output).toEqual(['\x1b[>1s', '\x1b[>0s']);
    expect(policy.shiftClick).toBe('unknown');
    capabilities('none');
    expect(output.at(-1)).toBe('\x1b[>1s');
    await setup.dispose();
    expect(output.at(-1)).toBe('\x1b[>0s');
    expect(setup.renderer.listenerCount('capabilities')).toBe(listeners);
    const count = output.length;
    detach();
    expect(output).toHaveLength(count);
  } finally {
    detach();
    await setup.dispose();
  }
});

test('late terminal identity activates the documented protocol; rejected output is not advertised as requested', async () => {
  const setup = await createTestRenderer({ width: 30, height: 8, useMouse: true });
  let acceptsOutput = false;
  const policies: TerminalInputPolicy[] = [];
  const output: string[] = [];
  const detach = attachTerminalPolicy(
    setup.renderer,
    (bytes) => {
      output.push(new TextDecoder().decode(bytes));
      return acceptsOutput;
    },
    (policy) => {
      policies.push(policy);
    },
    {}
  );
  try {
    expect(output).toEqual([]);
    const next = setRendererCapabilities(setup.renderer, {
      terminal: { name: 'Ghostty', version: '1.3.0', from_xtversion: true },
    });
    setup.renderer.emit('capabilities', next);
    expect(policies.at(-1)?.shiftClick).toBe('unknown');
    acceptsOutput = true;
    setup.renderer.emit('capabilities', next);
    expect(policies.at(-1)?.shiftClick).toBe('requested');
    detach();
    expect(output.at(-1)).toBe('\x1b[>0s');
  } finally {
    detach();
    await setup.dispose();
  }
});

test.each([
  { TERM_PROGRAM: 'WarpTerminal' },
  { TERM: 'xterm-kitty' },
  { TERM_PROGRAM: 'ghostty', TMUX: '/tmp/tmux/socket' },
  { TERM_PROGRAM: 'ghostty', STY: 'screen-session' },
  { TERM_PROGRAM: 'ghostty', ZELLIJ: '1' },
  {},
])('Kitty support does not imply Shift forwarding for %j', async (environment) => {
  const setup = await createTestRenderer({ width: 30, height: 8, kittyKeyboard: true });
  setRendererCapabilities(setup.renderer, { kitty_keyboard: true, multiplexer: 'none' });
  const output: Uint8Array[] = [];
  const detach = attachTerminalPolicy(
    setup.renderer,
    (bytes) => {
      output.push(bytes);
      return true;
    },
    () => {},
    environment
  );
  try {
    expect(output).toEqual([]);
  } finally {
    detach();
    await setup.dispose();
  }
});

test('Warp guidance advertises its copy fallback and Option range; unknown hosts do not promise Shift capture', () => {
  const warp = resolveTerminalPolicy({ TERM_PROGRAM: 'WarpTerminal' });
  const shortcuts = createTerminalShortcuts('darwin', warp);
  expect(shortcuts.copy.keys).toEqual(['Meta+C', 'Ctrl+Y']);
  expect(shortcuts.copy.label).toBe('Ctrl+Y');
  {
    const help = helpLines(shortcuts, warp);
    expect(help.some((line) => line.startsWith('Option(Alt)+') && line.includes('Ctrl+'))).toBe(
      true
    );
    expect(help.join('\n')).toContain('Ctrl+Y');
    expect(help.join('\n')).toContain('Warp');
  }
  expect(
    helpLines(createTerminalShortcuts('darwin'), resolveTerminalPolicy()).join('\n')
  ).toContain('if forwarded');
});
