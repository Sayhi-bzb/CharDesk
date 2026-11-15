import { expect, test } from 'bun:test';
import { serializeCanvasDocument, parseCanvasDocument } from '@chardesk/editor-core/documentText';
import { DocumentSerializer } from '../../../packages/local-runtime/src/documentSerialization.ts';
import { TerminalCanvas } from './model.ts';

test('worker captures immutable native documents, shares unchanged versions and retains page metadata', async () => {
  const model = new TerminalCanvas('界🦀');
  const serializer = new DocumentSerializer();
  try {
    const address = model.documents.getActiveAddress();
    model.documents.addAnchorAt(address, { x: 0, y: 0 }, 'Root');
    model.documents.ensurePage(address.documentId, {
      id: 'other',
      kind: 'cell-plane',
      name: 'Second',
      size: { columns: 80, rows: 24 },
      grid: [
        [
          '-5,-10',
          {
            char: 'Z',
            color: '#ff0000',
            bgColor: '#00ff00',
            attrs: { bold: true },
            href: 'https://example.com',
          },
        ],
      ],
    });
    const expected = serializeCanvasDocument(model.documents.getDocumentDraft()!, 'Example');
    const before = serializer.capture(model, address, 'Example');
    expect(serializer.capture(model, address, 'Example')).toBe(before);
    model.pan(10, 10);
    expect(serializer.capture(model, address, 'Example')).toBe(before);
    model.commands.pointAt({ x: 20, y: 0 });
    model.commands.insert('later');
    const after = serializer.capture(model, address, 'Example');
    expect(after).not.toBe(before);
    expect((await before).source).toBe(expected);
    const updated = await after;
    expect(updated.source).toBe(
      serializeCanvasDocument(model.documents.getDocumentDraft()!, 'Example')
    );
    expect(parseCanvasDocument(updated.source).document.pages[1]!.grid).toEqual(
      model.documents.getDocumentDraft()!.pages[1]!.grid
    );
    // UI-only page activation must invalidate the encoded body even if content is unchanged.
    model.documents.activatePage(address.documentId, 'other');
    const switched = await serializer.capture(model, address, 'Example');
    expect(parseCanvasDocument(switched.source).document.activePageId).toBe('other');
    expect(switched.semanticId).toBe(updated.semanticId);
    const renamed = await serializer.capture(model, address, 'Renamed catalog label');
    expect(renamed.semanticId).toBe(updated.semanticId);
    expect(await serializer.identityForSource(renamed.source)).toBe(updated.semanticId);
  } finally {
    serializer.dispose();
    model.dispose();
  }
});

test('worker-backed persistence recovers clean semantic equivalence after unrecorded writes', async () => {
  const { CanvasFile } = await import('./document.ts');
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const root = await mkdtemp(join(tmpdir(), 'chardesk-semantic-'));
  const { file, model } = await CanvasFile.open(join(root, 'canvas.chardesk'), 'A');
  try {
    await file.save(model);
    const patch = (text: string) => ({ rows: [{ y: 0, erase: [], spans: [{ x: 0, text, color: '#000000' }] }] });
    model.documents.applyCellPlanePatch(patch('B'), 'none');
    expect(model.dirty).toBe(true);
    model.documents.applyCellPlanePatch(patch('A'), 'none');
    expect(model.dirty).toBe(true); // Unknown equivalence stays dirty until the worker replies.
    let observedClean = false;
    const detach = model.subscribe(() => { if (!model.dirty) observedClean = true; });
    const deadline = performance.now() + 3000;
    while (model.dirty && performance.now() < deadline) await Bun.sleep(10);
    detach();
    expect(model.dirty).toBe(false);
    expect(observedClean).toBe(true);
  } finally { model.dispose(); await rm(root, { recursive: true, force: true }); }
});

test('disposing a serializer rejects pending captures without poisoning another workspace', async () => {
  const model = new TerminalCanvas('A');
  const serializer = new DocumentSerializer();
  const pending = serializer.capture(model, model.documents.getActiveAddress(), 'Example');
  const rejected = pending.then(
    () => {
      throw new Error('Expected disposal to reject the capture');
    },
    (error: Error) => error.message
  );
  serializer.dispose();
  expect(await rejected).toContain('closed');
  await expect(
    serializer.capture(model, model.documents.getActiveAddress(), 'Example')
  ).rejects.toThrow('closed');
  const other = new DocumentSerializer();
  try {
    expect(
      (await other.capture(model, model.documents.getActiveAddress(), 'Example')).source
    ).toContain('A');
  } finally {
    other.dispose();
    model.dispose();
  }
});
