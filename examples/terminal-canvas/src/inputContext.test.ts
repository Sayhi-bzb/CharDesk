import { expect, test } from 'bun:test';
import { TerminalInputContext, type InputChannel } from '../../../packages/terminal/src/inputContext.ts';
import type { TerminalPanel } from './surface.ts';

const panel = (input?: string): TerminalPanel => ({ title: 'Form', hint: '', input, items: [], selected: 0 });
const channels: InputChannel[] = ['key', 'paste', 'pointer', 'command'];

test('input phase policy is shared by every channel, including direct Host commands', () => {
  const input = new TerminalInputContext(() => {}), owner = {}, form = panel('');
  input.openPanel(form, owner);
  for (const channel of channels) expect(input.admit(channel, 'paste')).toBe(true);
  const task = input.lease(form)!.beginTask()!;
  for (const channel of channels) expect(input.admit(channel, 'paste')).toBe(false);
  expect(input.admit('command', 'quit')).toBe(true);
  expect(input.admit('key', 'escape')).toBe(true);
  expect(input.admit('pointer', 'dismiss')).toBe(true);
  task.finish();
  expect(form.busy).toBe(false);
  const next = input.lease(form)!.beginTask()!;
  task.finish();
  expect(form.busy).toBe(true);
  input.setClosing(true);
  expect(next.context.signal.aborted).toBe(true);
  for (const channel of channels) {
    expect(input.admit(channel, 'paste')).toBe(false);
    expect(input.admit(channel, 'quit')).toBe(false);
  }
  input.setClosing(false);
  expect(input.admit('paste')).toBe(true);
  input.dispose();
  input.setClosing(false);
  for (const channel of channels) expect(input.admit(channel, 'paste')).toBe(false);
});

test('modal restoration renews ownership; hidden task results cannot claim the restored surface', () => {
  const input = new TerminalInputContext(() => {}), parentOwner = {}, childOwner = {};
  const parent = panel(''), child = { ...panel(), underlay: parent };
  input.openPanel(parent, parentOwner);
  const old = input.lease(parent)!, task = old.beginTask()!;
  input.openPanel(child, childOwner);
  expect(task.context.signal.aborted).toBe(true);
  expect(old.current).toBe(false);
  expect(input.admit('paste')).toBe(false);
  input.closePanel(childOwner);
  expect(input.panel).toBe(parent);
  expect(input.lease(parent)!.current).toBe(true);
  expect(input.lease(parent)).not.toBe(old);
  const restored = input.lease(parent)!.beginTask()!;
  task.finish();
  expect(parent.busy).toBe(true);
  input.closePanel(parentOwner);
  expect(restored.context.signal.aborted).toBe(true);
  expect(input.panel).toBe(null);
  input.dispose();
});

test('focus and modal owners declare paste and command targets without canvas fallthrough', () => {
  const input = new TerminalInputContext(() => {}), focus = {};
  let editable = false;
  input.registerFocusOwner(focus, () => editable);
  input.focusOwner = focus;
  expect(input.admit('paste')).toBe(false);
  editable = true;
  expect(input.admit('paste')).toBe(true);
  input.dockFocus = 'settings';
  expect(input.admit('paste')).toBe(false);
  input.openPanel(panel(''), {}, new Set());
  expect(input.focusOwner).toBeNull();
  expect(input.dockFocus).toBeNull();
  expect(input.admit('command', 'copy')).toBe(false);
  expect(input.admit('command', 'undo')).toBe(false);
  expect(input.admit('command', 'quit')).toBe(true);
  input.dispose();
});
