import { expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileSourceBinding } from './fileSource.ts';
import { sourceDigest } from './storage.ts';

test('file bindings compare content to their own baseline and distinguish updates, removal and unreadable sources', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chardesk-source-')),
    path = join(directory, 'native.chardesk');
  const binding = new FileSourceBinding(path, 'before');
  try {
    await writeFile(path, 'before');
    expect((await binding.inspect()).state).toBe('current');
    await writeFile(path, 'after');
    expect((await binding.inspect()).state).toBe('changed');
    expect(binding.baseline.source).toBe('before');
    expect(() =>
      binding.assertBaseline({ source: 'after', digest: sourceDigest('after') })
    ).toThrow('File changed on disk');
    await rm(path);
    expect((await binding.inspect()).state).toBe('missing');
    expect(
      (
        await binding.inspect(async () => {
          throw new Error('permission denied');
        })
      ).state
    ).toBe('unreadable');
    binding.accept('saved');
    await writeFile(path, 'saved');
    expect((await binding.inspect()).state).toBe('current');
    await writeFile(path, new Uint8Array([0xff, 0xfe]));
    expect((await binding.inspect()).state).toBe('unreadable');
    await expect(binding.read()).rejects.toThrow('UTF-8');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('older observations cannot overwrite a newer inspection or a confirmed save/reload baseline', async () => {
  const binding = new FileSourceBinding('/unused', 'before');
  const old = Promise.withResolvers<{ source: string; digest: string | null }>();
  const pending = binding.inspect(() => old.promise);
  await binding.inspect(async () => ({ source: 'new', digest: sourceDigest('new') }));
  old.resolve({ source: 'before', digest: sourceDigest('before') });
  await pending;
  expect(binding.observation.digest).toBe(sourceDigest('new'));
  const saving = Promise.withResolvers<{ source: string; digest: string | null }>();
  const stale = binding.inspect(() => saving.promise);
  binding.accept('saved');
  saving.resolve({ source: 'outdated', digest: sourceDigest('outdated') });
  await stale;
  expect(binding.observation).toEqual({ state: 'current', digest: sourceDigest('saved') });
});

test('periodic probes skip unchanged file contents; explicit verification and confirmed writes invalidate that shortcut', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chardesk-source-poll-')),
    path = join(directory, 'file');
  const binding = new FileSourceBinding(path, 'before');
  const read = binding.read.bind(binding);
  let reads = 0;
  binding.read = () => {
    reads++;
    return read();
  };
  try {
    await writeFile(path, 'before');
    await binding.inspectIfChanged();
    await binding.inspectIfChanged();
    expect(reads).toBe(1);
    await Bun.sleep(5);
    await writeFile(path, 'beforE');
    expect((await binding.inspectIfChanged()).state).toBe('changed');
    expect(reads).toBe(2);
    binding.accept('beforE');
    await binding.inspectIfChanged();
    expect(reads).toBe(3);
    await binding.inspect();
    expect(reads).toBe(4);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
