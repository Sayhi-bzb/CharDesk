import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Database } from 'bun:sqlite';
import { CanvasAgents } from '../../../packages/local-runtime/src/agents.ts';
import { LocalAgentInboxStore } from '../../../packages/local-runtime/src/agentInboxStore.ts';

const identity = { id: 'one', name: 'Agent One' };
const open = (path = ':memory:', now = Date.now) =>
  new CanvasAgents(path, () => new LocalAgentInboxStore(path), now);

test('calls create separate unread records and completion updates the same record', () => {
  let now = 1000;
  const inbox = open(':memory:', () => now);
  try {
    const finish = inbox.begin('canvas', identity, 'canvas_code');
    const working = inbox.list('canvas')[0]!;
    expect(working).toMatchObject({ status: 'working', revision: 1, readRevision: 0 });
    expect(inbox.count('canvas')).toBe(1);
    inbox.markRead('canvas', [{ id: working.id, revision: 1 }]);
    expect(inbox.count('canvas')).toBe(0);
    now += 1000;
    finish();
    finish();
    expect(inbox.count('canvas')).toBe(1);
    expect(inbox.list('canvas')[0]).toMatchObject({
      id: working.id,
      status: 'completed',
      revision: 2,
      readRevision: 1,
    });
    inbox.begin('canvas', identity, 'canvas_read')('failed');
    expect(inbox.count('canvas')).toBe(2);
    inbox.begin('other', identity, 'canvas_write')();
    expect(inbox.count('other')).toBe(1);
    const latest = inbox.list('canvas')[0]!;
    expect(latest.status).toBe('failed');
    inbox.markRead('other', [{ id: latest.id, revision: latest.revision }]);
    expect(inbox.count('canvas')).toBe(2);
    inbox.markRead('canvas', [working, latest]);
    expect(inbox.count('canvas')).toBe(1);
    inbox.markRead('canvas', inbox.list('canvas'));
    expect(inbox.count('canvas')).toBe(0);
    expect(inbox.count('canvas', true)).toBe(2);
    now += 365 * 24 * 3600 * 1000;
    expect(inbox.count('other')).toBe(1);
  } finally {
    inbox.dispose();
  }
});

test('unread state and acknowledgments survive restart, while live owners are not interrupted', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chardesk-inbox-store-'));
  const path = join(directory, 'agents.sqlite');
  let first = open(path),
    second: CanvasAgents | undefined;
  try {
    const finish = first.begin('canvas', identity, 'canvas_write');
    second = open(path);
    expect(second.list('canvas')[0]?.status).toBe('working');
    finish();
    first.begin('canvas', identity, 'canvas_read')();
    const seen = first.list('canvas')[0]!;
    first.markRead('canvas', [seen]);
    first.dispose();
    second.dispose();
    first = open(path);
    expect(first.count('canvas')).toBe(1);
    expect(first.count('canvas', true)).toBe(1);
    expect(first.list('canvas', true)[0]?.id).toBe(seen.id);
    const pending = first.begin('canvas', identity, 'canvas_code');
    first.dispose();
    pending();
    first = open(path);
    expect(first.list('canvas')[0]?.status).toBe('interrupted');
  } finally {
    first.dispose();
    second?.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});

test('a dead owner becomes an unread interrupted activity without replaying the call', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chardesk-inbox-crash-'));
  const path = join(directory, 'agents.sqlite');
  let inbox = open(path);
  try {
    inbox.begin('canvas', identity, 'canvas_code');
    inbox.dispose();
    const db = new Database(path);
    db.exec(
      "UPDATE agent_activity SET status='working', revision=1, readRevision=1, pid=2147483647"
    );
    db.close();
    inbox = open(path);
    expect(inbox.count('canvas')).toBe(1);
    expect(inbox.list('canvas')[0]).toMatchObject({
      status: 'interrupted',
      revision: 2,
      readRevision: 1,
    });
  } finally {
    inbox.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});

test('large inboxes have stable pages; read acknowledgments never drop unviewed records', () => {
  const inbox = open();
  try {
    for (let i = 0; i < 105; i++) inbox.begin('canvas', identity, 'canvas_read')();
    const first = inbox.list('canvas'),
      second = inbox.list('canvas', false, 50, 50);
    expect(first).toHaveLength(50);
    expect(second).toHaveLength(50);
    expect(new Set([...first, ...second].map((row) => row.id)).size).toBe(100);
    inbox.markRead('canvas', first.slice(0, 3));
    expect(inbox.count('canvas')).toBe(102);
    expect(inbox.count('canvas', true)).toBe(3);
  } finally {
    inbox.dispose();
  }
});

test('read all acknowledges every existing page only on its canvas; later revisions remain unread', () => {
  const inbox = open();
  try {
    for (let i = 0; i < 105; i++) inbox.begin('canvas', identity, 'canvas_read')();
    const finish = inbox.begin('canvas', identity, 'canvas_code');
    inbox.begin('other', identity, 'canvas_read')();
    expect(inbox.markAllRead('canvas')).toBe(true);
    expect(inbox.count('canvas')).toBe(0);
    expect(inbox.count('canvas', true)).toBe(106);
    expect(inbox.count('other')).toBe(1);
    finish();
    inbox.begin('canvas', identity, 'canvas_read')();
    expect(inbox.count('canvas')).toBe(2);
    expect(inbox.list('canvas').find((row) => row.operation === 'canvas_code')).toMatchObject({
      revision: 2,
      readRevision: 1,
    });
  } finally {
    inbox.dispose();
  }
});

test('invocation details survive restart without loading payloads into activity lists', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chardesk-call-details-'));
  const path = join(directory, 'agents.sqlite');
  let inbox = open(path);
  const argv = ['chardesk', 'canvas', 'code', '--file', "a b'界.chardesk", '--json'];
  const input = {
    mode: 'apply',
    script: 'await canvas.write({at:[0,0],content:"🦀\\n$literal"});',
  };
  try {
    inbox.begin('canvas', identity, 'canvas_code', { argv, input })();
    const entry = inbox.list('canvas')[0]!;
    expect(entry).not.toHaveProperty('input');
    expect(entry).not.toHaveProperty('argv');
    expect(inbox.details('other', entry.id)).toBeUndefined();
    expect(inbox.details('canvas', entry.id)).toEqual({ argv, input: JSON.stringify(input) });
    inbox.dispose();
    inbox = open(path);
    expect(inbox.details('canvas', entry.id)).toEqual({ argv, input: JSON.stringify(input) });
  } finally {
    inbox.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});

test('schema-one activities migrate with read state intact and no invented command details', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chardesk-inbox-migrate-'));
  const path = join(directory, 'agents.sqlite');
  let inbox = open(path);
  try {
    inbox.begin('canvas', identity, 'canvas_read')();
    const entry = inbox.list('canvas')[0]!;
    inbox.markRead('canvas', [entry]);
    inbox.dispose();
    const db = new Database(path);
    db.exec(
      'ALTER TABLE agent_activity DROP COLUMN argvJson; ALTER TABLE agent_activity DROP COLUMN inputJson; PRAGMA user_version = 1;'
    );
    db.close();
    inbox = open(path);
    expect(inbox.error).toBeUndefined();
    expect(inbox.count('canvas')).toBe(0);
    expect(inbox.list('canvas', true)[0]?.id).toBe(entry.id);
    expect(inbox.details('canvas', entry.id)).toEqual({ argv: null, input: null });
  } finally {
    inbox.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});
