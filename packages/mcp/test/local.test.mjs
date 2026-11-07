import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { callLocal } from '../src/local.mjs';

test('local backend passes targets and JSON through argv/stdin without a shell', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chardesk-local-adapter-'));
  const cwd = process.cwd(), previous = process.env.CHARDESK_BINARY;
  try {
    await writeFile(join(directory, 'canvas'), `let source='';process.stdin.on('data',data=>source+=data);process.stdin.on('end',()=>console.log(JSON.stringify({args:process.argv.slice(2),input:JSON.parse(source)})));`);
    process.chdir(directory);
    process.env.CHARDESK_BINARY = process.execPath;
    const result = await callLocal('canvas_write', { canvasId: 'session-1', at: [-2, 3], content: '🦀 $HOME' }, new AbortController().signal);
    assert.deepEqual(result.args, ['write', '--session', 'session-1', '--json']);
    assert.deepEqual(result.input, { at: [-2, 3], content: '🦀 $HOME' });
  } finally {
    process.chdir(cwd);
    if (previous === undefined) delete process.env.CHARDESK_BINARY;
    else process.env.CHARDESK_BINARY = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
