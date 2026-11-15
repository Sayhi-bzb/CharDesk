import { expect, test, vi } from 'vitest';
import {
  CanvasAgents,
  parseAgentIdentity,
  parseAgentInvocation,
  type AgentInboxStorage,
} from './agents.ts';

test('agent identity is optional, explicit and safe to render', () => {
  expect(parseAgentIdentity(undefined)).toBeUndefined();
  expect(parseAgentIdentity({ id: 'agent:1' })).toEqual({ id: 'agent:1', name: 'agent:1' });
  expect(parseAgentIdentity({ id: 'one', name: '  🦀 布局  ' })).toEqual({
    id: 'one',
    name: '🦀 布局',
  });
  for (const invalid of [
    null,
    [],
    'one',
    {},
    { id: 'has space' },
    { id: 'x', name: '\n' },
    { id: 'x', name: '\x1b[31m' },
    { id: 'x', name: '\u202eabc' },
    { id: 'x', name: 'a'.repeat(81) },
  ])
    expect(() => parseAgentIdentity(invalid)).toThrow();
});

test('an unavailable activity store remains advisory and cannot fail a Canvas call', () => {
  const agents = new CanvasAgents('test', () => {
    throw new Error('unavailable');
  });
  expect(() => agents.begin('canvas', { id: 'one', name: 'One' }, 'canvas_write')()).not.toThrow();
  expect(agents.count('canvas')).toBe(0);
  expect(agents.list('canvas')).toEqual([]);
  expect(agents.markRead('canvas', [{ id: 1, revision: 1 }])).toBe(false);
  expect(agents.error).toContain('unavailable');
  agents.dispose();
});

test('storage failures remain visible after successful reads; disposed inboxes ignore late calls', () => {
  const failed = () => {
    throw new Error('locked');
  };
  const store: AgentInboxStorage = {
    create: failed,
    finish: failed,
    markRead: failed,
    details: () => undefined,
    list: () => [],
    count: () => 0,
    close: vi.fn(),
  };
  const agents = new CanvasAgents('test', () => store);
  const changed = vi.fn();
  agents.subscribe(changed);
  const finish = agents.begin('canvas', { id: 'one', name: 'One' }, 'canvas_write');
  expect(changed).toHaveBeenCalledTimes(1);
  agents.count('canvas');
  agents.list('canvas');
  expect(agents.error).toContain('locked');
  agents.dispose();
  changed.mockClear();
  finish();
  agents.begin('canvas', { id: 'two', name: 'Two' }, 'canvas_read')();
  expect(store.close).toHaveBeenCalledTimes(1);
  expect(changed).not.toHaveBeenCalled();
});

test('invocation metadata keeps argument boundaries and rejects malformed payloads', () => {
  expect(parseAgentInvocation(undefined)).toBeUndefined();
  const argv = ['chardesk', 'canvas', 'write', '--file', 'file with spaces.chardesk'];
  const input = { at: [0, 0], content: '🦀\ntext' };
  expect(parseAgentInvocation({ argv, input })).toEqual({ argv, input });
  for (const invalid of [
    null,
    [],
    { argv: 'shell command' },
    { argv: [42] },
    { input: [] },
    { argv: ['x'.repeat(65537)] },
  ])
    expect(() => parseAgentInvocation(invalid)).toThrow();
});
