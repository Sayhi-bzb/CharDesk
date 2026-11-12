import type { CliRenderer, TerminalCapabilities } from '@opentui/core';

export type TerminalInputPolicy = {
  terminal: 'ghostty' | 'kitty' | 'warp' | 'unknown';
  multiplexed: boolean;
  shiftClick: 'requested' | 'reserved' | 'unknown';
};

/** Missing mouse modifier bits are a direct-Warp workaround, not a generic Kitty capability. */
export function mouseModifierSource(policy: TerminalInputPolicy): 'mouse' | 'keyboard-fallback' {
  return policy.terminal === 'warp' && !policy.multiplexed ? 'keyboard-fallback' : 'mouse';
}

/** Identity selects documented policy; Kitty support alone does not prove key forwarding. */
export function resolveTerminalPolicy(
  environment: NodeJS.ProcessEnv = {},
  capabilities: TerminalCapabilities | null = null
): TerminalInputPolicy {
  const identify = (name = ''): TerminalInputPolicy['terminal'] | undefined => {
    const normalized = name.toLowerCase();
    if (normalized === 'ghostty') return 'ghostty';
    if (normalized === 'kitty' || normalized === 'xterm-kitty') return 'kitty';
    if (normalized === 'warp' || normalized === 'warpterminal') return 'warp';
  };
  const terminal =
    identify(capabilities?.terminal.name) ??
    identify(environment.TERM_PROGRAM) ??
    (environment.KITTY_WINDOW_ID ? 'kitty' : identify(environment.TERM)) ??
    'unknown';
  const multiplexed = Boolean(
    environment.TMUX ||
    environment.STY ||
    environment.ZELLIJ ||
    (capabilities && capabilities.multiplexer !== 'none')
  );
  return { terminal, multiplexed, shiftClick: terminal === 'warp' ? 'reserved' : 'unknown' };
}

/** Native setup overrides for gaps between OpenTUI detection and Warp's grid/OSC 8 support.
 * Keep explicit user overrides and leave multiplexers to native detection.
 * https://opentui.com/docs/reference/terminal-capabilities/#overrides
 * https://docs.warp.dev/terminal/more-features/files-and-links#osc-8-hyperlinks
 */
export function terminalRendererEnvironment(
  environment: NodeJS.ProcessEnv = process.env
): Record<string, string> {
  const overrides: Record<string, string> = {};
  if (environment.FORCE_HYPERLINK !== undefined)
    overrides.FORCE_HYPERLINK = environment.FORCE_HYPERLINK;
  const policy = resolveTerminalPolicy(environment);
  if (policy.terminal === 'warp' && !policy.multiplexed) {
    overrides.FORCE_HYPERLINK ??= '1';
    // Warp advances its grid per code point (Handler::input), including ZWJ emoji.
    // Let native wcwidth measurement activate the canvas's existing width fallback.
    // https://github.com/warpdotdev/warp/blob/master/app/src/terminal/model/grid/ansi_handler.rs
    if (
      ['OPENTUI_FORCE_WCWIDTH', 'OPENTUI_FORCE_UNICODE', 'OPENTUI_FORCE_NOZWJ'].every(
        (key) => environment[key] === undefined
      ) &&
      !['1', 'true'].includes(environment.OPENTUI_FORCE_EXPLICIT_WIDTH ?? '')
    )
      overrides.OPENTUI_FORCE_WCWIDTH = '1';
  }
  return overrides;
}

/** Uses the renderer's ordered output owner, never intercepted process.stdout writes. */
export function attachTerminalPolicy(
  renderer: CliRenderer,
  write: (bytes: Uint8Array) => boolean,
  update: (policy: TerminalInputPolicy) => void,
  environment: NodeJS.ProcessEnv = process.env
) {
  const encoder = new TextEncoder();
  let requested = false;
  let disposed = false;
  const send = (enabled: boolean) => {
    try {
      // https://ghostty.org/docs/vt/csi/xtshiftescape
      return write(encoder.encode(`\x1b[>${enabled ? 1 : 0}s`));
    } catch {
      return false;
    }
  };
  const refresh = () => {
    const policy = resolveTerminalPolicy(environment, renderer.capabilities);
    const capture = policy.terminal === 'ghostty' && !policy.multiplexed && renderer.useMouse;
    if (requested && !capture && send(false)) requested = false;
    if (capture && !requested) requested = send(true);
    update({ ...policy, shiftClick: capture && requested ? 'requested' : policy.shiftClick });
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    renderer.off('capabilities', refresh);
    renderer.off('destroy', dispose);
    if (requested) send(false);
  };
  renderer.on('capabilities', refresh);
  // OpenTUI emits destroy before closing the NativeSession output queue.
  renderer.on('destroy', dispose);
  refresh();
  return dispose;
}
