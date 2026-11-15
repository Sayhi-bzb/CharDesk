import { expect, test } from 'bun:test';
import {
  formatAgentCommand,
  activityTime,
  activityAction,
  wrapAgentDetail,
} from '../../../packages/terminal/src/agentActivityFormat.ts';
import { english } from '../../../packages/terminal/src/i18n.ts';
import { getTextCellWidth } from '@chardesk/protocol';
import type { CanvasAgentActivity } from '../../../packages/local-runtime/src/agents.ts';

test('commands preserve shell argument boundaries, quotes and literal substitution characters', () => {
  expect(formatAgentCommand(['chardesk', 'canvas', 'write', '--file', "a b'c"], 'darwin')).toBe(
    "chardesk canvas write --file 'a b'\\''c'"
  );
  expect(formatAgentCommand(['chardesk', '--file', '$(literal).chardesk', ''], 'linux')).toBe(
    "chardesk --file '$(literal).chardesk' ''"
  );
  expect(formatAgentCommand(['chardesk', '--file', "C:\\a b'c"], 'win32')).toBe(
    "chardesk --file 'C:\\a b''c'"
  );
});

test('activity copy folds execution state into the action and uses relative time', () => {
  const base = { operation: 'canvas_write', status: 'completed' } as CanvasAgentActivity;
  expect(activityAction(base, english)).toBe('Write');
  expect(activityAction({ ...base, status: 'working' }, english)).toBe('Writing');
  expect(activityAction({ ...base, status: 'failed' }, english)).toBe('Write failed');
  expect(activityAction({ ...base, status: 'interrupted' }, english)).toBe('Write interrupted');
  expect(activityTime(0, english, 0)).toBe('Just now');
  expect(activityTime(0, english, 180_000)).toBe('3m ago');
  expect(activityTime(0, english, 7_200_000)).toBe('2h ago');
  expect(activityTime(0, english, 86_400_000)).toBe('1d ago');
  expect(activityTime(1000, english, 0)).toBe('Just now');
});

test('detail wrapping respects wide graphemes and keeps JSON indentation and blank lines', () => {
  const lines = wrapAgentDetail('  🦀界abc\n\n  "key": "value"', 8);
  expect(lines.every((line) => getTextCellWidth(line) <= 8)).toBe(true);
  expect(lines.join('')).toBe('  🦀界abc  "key": "value"');
  expect(lines).toContain('');
});
