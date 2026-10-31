import { expect, test } from 'vitest';
import { parseCanvasDocument, serializeCanvasDocument } from './documentText.js';
import { FreeformEditorSession } from './runtime.js';
import { parseCharDeskDocumentEnvelope } from '@chardesk/document';

test('versioned text keeps page identities, offsets, styles, links and anchor hierarchy', () => {
  const session = new FreeformEditorSession();
  try {
    session.commands.pointAt({ x: -5, y: -10 });
    session.commands.insert('界A');
    const address = session.documents.getActiveAddress();
    const root = session.documents.addAnchorAt(address, { x: -5, y: -10 }, 'root')!;
    session.documents.addAnchorAt(address, { x: -3, y: -10 }, 'child');
    session.documents.ensurePage(address.documentId, {
      id: 'other',
      kind: 'cell-plane',
      name: 'Second',
      size: { columns: 80, rows: 24 },
      grid: [
        [
          '10,20',
          {
            char: 'Z',
            color: '#ff0000',
            bgColor: '#0000ff',
            attrs: { bold: true },
            href: 'https://example.com',
          },
        ],
      ],
    });
    const draft = session.documents.getDocumentDraft()!;
    draft.pages[0]!.anchors![1] = { ...draft.pages[0]!.anchors![1]!, parentId: root.id };
    const source = serializeCanvasDocument(draft, 'Example');
    expect(source).toContain('chardesk: document/v2');
    expect(source.split('---\n').at(-1)).toContain('界A');
    expect(() => parseCharDeskDocumentEnvelope(source)).toThrow(
      'Unsupported CharDesk document version'
    );
    const parsed = parseCanvasDocument(source);
    expect(parsed.title).toBe('Example');
    expect(parsed.document.pages[0]!.grid?.find(([key]) => key === '-5,-10')?.[1].char).toBe('界');
    expect(parsed.document.pages[0]!.anchors).toEqual(draft.pages[0]!.anchors);
    expect(parsed.document.pages[1]).toMatchObject({
      id: 'other',
      name: 'Second',
      size: { columns: 80, rows: 24 },
    });
    expect(parsed.document.pages[1]!.grid).toEqual(draft.pages[1]!.grid);
    const restored = new FreeformEditorSession('', { document: parsed.document });
    try {
      expect(restored.plane.get({ x: -5, y: -10 })?.char).toBe('界');
      expect(restored.documents.getAnchorsAt(restored.documents.getActiveAddress())).toHaveLength(
        2
      );
    } finally {
      restored.dispose();
    }
  } finally {
    session.dispose();
  }
});

test('legacy documents remain readable with their original origin and no required metadata', () => {
  const parsed = parseCanvasDocument(
    '---\nchardesk: document/v1\nmode: freeform\ntitle: Old\n---\nA',
    'new-id'
  );
  expect(parsed.document).toMatchObject({ id: 'new-id', activePageId: 'new-id:page:main' });
  expect(parsed.document.pages[0]!.grid).toEqual([['0,0', { char: 'A', color: '#000000' }]]);
});

test('a sparse page containing only insignificant spaces still produces a valid empty document', () => {
  const source = serializeCanvasDocument({
    id: 'spaces',
    mode: 'freeform',
    activePageId: 'p',
    pages: [
      {
        id: 'p',
        kind: 'cell-plane',
        grid: [
          ['0,0', { char: ' ', color: '#000000' }],
          ['1000000,1000000', { char: ' ', color: '#000000' }],
        ],
      },
    ],
  });
  expect(parseCanvasDocument(source).document.pages[0]!.grid).toEqual([]);
});

test.each([
  { version: 2 },
  { version: 1, documentId: 'x', activePageId: 'absent', pages: [] },
  {
    version: 1,
    documentId: 'x',
    activePageId: 'p',
    pages: [{ id: 'p', origin: { x: 0.1, y: 0 } }],
  },
  {
    version: 1,
    documentId: 'x',
    activePageId: 'p',
    pages: [{ id: 'p', origin: { x: 0, y: 0 } }],
    future: true,
  },
  {
    version: 1,
    documentId: 'x',
    activePageId: 'p',
    pages: [
      {
        id: 'p',
        origin: { x: 0, y: 0 },
        fragments: [{ origin: { x: 0, y: 0 }, text: 'overwrite' }],
      },
    ],
  },
])('invalid metadata is rejected instead of partially imported: %j', (canvas) => {
  const source = `---\nchardesk: document/v2\nmode: freeform\ncanvas: ${JSON.stringify(canvas)}\n---\nA`;
  expect(() => parseCanvasDocument(source)).toThrow('Invalid or unsupported Canvas metadata');
});
