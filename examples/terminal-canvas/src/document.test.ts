import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CanvasFile } from './document.ts';
import { TerminalCanvas } from './model.ts';

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});
const target = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chardesk-terminal-test-'));
  directories.push(directory);
  return join(directory, 'canvas.chardesk');
};

test('native text save/open preserves graphemes, styles and links', async () => {
  const path = await target();
  const { file, model } = await CanvasFile.open(
    path,
    '[1;38;2;100;210;200m界👩🏽‍💻[0m ]8;;https://example.com\\link]8;;\\'
  );
  try {
    await file.save(model);
    const reopened = await CanvasFile.open(path);
    try {
      // The canonical exporter may carry styles through visually empty spaces.
      const visible = (canvas: TerminalCanvas) =>
        [...canvas.plane.materialize()].filter(
          ([, cell]) => cell.char !== ' ' || cell.bgColor || cell.href
        );
      expect(visible(reopened.model)).toEqual(visible(model));
      expect(await readFile(path, 'utf8')).not.toContain('\u001b');
      expect(model.dirty).toBe(false);
    } finally {
      reopened.model.dispose();
    }
  } finally {
    model.dispose();
  }
});

test('external file changes cancel save and retain in-memory edits', async () => {
  const path = await target();
  const { file, model } = await CanvasFile.open(path);
  try {
    model.insert('my edit');
    await writeFile(path, 'external edit');
    await expect(file.save(model)).rejects.toThrow('changed on disk');
    expect(await readFile(path, 'utf8')).toBe('external edit');
    expect(model.dirty).toBe(true);
  } finally {
    model.dispose();
  }
});

test('sparse far-apart content saves without allocating its empty bounding box', async () => {
  const path = await target();
  const { file, model } = await CanvasFile.open(path);
  try {
    model.insert('A');
    model.pointAt({ x: 1_000_000, y: 1_000_000 });
    model.insert('B');
    await file.save(model);
    expect(model.dirty).toBe(false);
    expect((await readFile(path, 'utf8')).length).toBeLessThan(2000);
    const reopened = await CanvasFile.open(path);
    try {
      expect(reopened.model.plane.get({ x: 0, y: 0 })?.char).toBe('A');
      expect(reopened.model.plane.get({ x: 1_000_000, y: 1_000_000 })?.char).toBe('B');
    } finally {
      reopened.model.dispose();
    }
  } finally {
    model.dispose();
  }
});

test('native save preserves negative content origin', async () => {
  const path = await target();
  const { file, model } = await CanvasFile.open(path);
  try {
    model.pointAt({ x: -5, y: -10 });
    model.insert('界');
    await file.save(model);
    const reopened = await CanvasFile.open(path);
    try {
      expect(reopened.model.plane.get({ x: -5, y: -10 })?.char).toBe('界');
    } finally {
      reopened.model.dispose();
    }
  } finally {
    model.dispose();
  }
});

test('Slide documents are rejected before creating an editable surface', async () => {
  const path = await target();
  await writeFile(path, '---\nchardesk: document/v1\nmode: slide\n---\n');
  await expect(CanvasFile.open(path)).rejects.toThrow('Freeform');
});

test('edits made while a save is pending remain dirty', async () => {
  const path = await target();
  const model = new TerminalCanvas();
  const file = new CanvasFile(path, 'canvas', null);
  try {
    model.insert('A');
    const saving = file.save(model);
    model.insert('B');
    await saving;
    expect(model.dirty).toBe(true);
    expect(await readFile(path, 'utf8')).not.toContain('AB');
  } finally {
    model.dispose();
  }
});
