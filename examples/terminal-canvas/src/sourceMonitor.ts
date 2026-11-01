import type { CliRenderer } from '@opentui/core';
import type { TerminalWorkspace } from './workspace.ts';

/** Advisory reads only. Saves/reloads still verify content at their commit boundary. */
export function watchWorkspaceSources(
  workspace: TerminalWorkspace,
  renderer: CliRenderer,
  changed: () => void
) {
  let active = true,
    pending = false,
    forcePending = false;
  const check = (force = false) => {
    if (!active) return;
    if (pending) {
      forcePending ||= force;
      return;
    }
    pending = true;
    void workspace.inspectSources(!force).finally(() => {
      pending = false;
      if (active) {
        changed();
        if (forcePending) {
          forcePending = false;
          check(true);
        }
      }
    });
  };
  const focus = () => check(true);
  const timer = renderer.clock.setInterval(check, 2000);
  renderer.on('focus', focus);
  check(true);
  return () => {
    active = false;
    renderer.clock.clearInterval(timer);
    renderer.off('focus', focus);
  };
}
