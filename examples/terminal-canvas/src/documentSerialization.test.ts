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
  } finally {
    serializer.dispose();
    model.dispose();
  }
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
