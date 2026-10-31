import { expect, test } from 'vitest';
import { FreeformEditorSession } from '@chardesk/editor-core/runtime';
import { parseCanvasDocument, serializeCanvasDocument } from '@chardesk/editor-core/documentText';
import { parseDocumentSessionSource } from '@/domains/document/public';
import { createSelectionCommandFactory } from '@/domains/actions/public';
import { prepareTextExport } from '@/domains/export/public';
import { createCanvasRuntime } from '../runtime';

test('native metadata survives Terminal → Web import/duplicate/export → Terminal', async () => {
  const terminal = new FreeformEditorSession();
  const web = createCanvasRuntime({
    persistence: false,
    parseSessionSource: parseDocumentSessionSource,
    selectionCommands: createSelectionCommandFactory({
      renderClipboardText: async () => ({
        kind: 'spans',
        renderer: 'raw',
        pipeline: [],
        rows: [],
        width: 0,
        height: 0,
        diagnostics: [],
      }),
    }),
    initialSessions: [{ id: 'blank', name: 'Blank', mode: 'freeform', grid: [] }],
  });
  try {
    terminal.commands.pointAt({ x: -10, y: -20 });
    terminal.commands.insert('界 heading');
    terminal.apply({
      rows: [
        {
          y: 1_000_000,
          erase: [],
          spans: [{ x: 1_000_000, text: 'Far', color: '#ff0000' }],
        },
      ],
    });
    const address = terminal.documents.getActiveAddress();
    terminal.documents.addAnchorAt(
      address,
      terminal.selection?.anchor ?? { x: -10, y: -20 },
      'Title'
    );
    terminal.documents.ensurePage(address.documentId, {
      id: 'extra',
      kind: 'cell-plane',
      name: 'Extra',
      grid: [['5,6', { char: 'Z', color: '#ff0000' }]],
    });
    const source = serializeCanvasDocument(terminal.documents.getDocumentDraft()!, 'Native');
    const imported = await web.commands.sessions.import(source);
    const duplicate = web.commands.sessions.duplicate(imported.id)!;
    for (const id of [imported.id, duplicate.id]) {
      const materialized = await web.materializeSession(id);
      expect(materialized?.surface.getCell({ x: -10, y: -20 })?.char).toBe('界');
      expect(materialized?.document?.pages).toHaveLength(2);
      const exported = prepareTextExport(
        {
          canvasMode: 'freeform',
          surface: materialized!.surface,
          document: materialized!.document,
          documentName: materialized!.name,
          includeColor: true,
          showGrid: false,
        },
        'chardesk'
      );
      expect(exported.ok).toBe(true);
      if (!exported.ok) throw new Error('Export failed');
      const parsed = parseCanvasDocument(exported.value.content);
      expect(parsed.document.pages[0]?.anchors?.[0]?.label).toBe('Title');
      expect(parsed.document.pages[1]?.grid?.[0]?.[0]).toBe('5,6');
      const restored = new FreeformEditorSession('', { document: parsed.document });
      try {
        expect(restored.plane.get({ x: -10, y: -20 })?.char).toBe('界');
        expect(restored.plane.get({ x: 1_000_000, y: 1_000_000 })?.char).toBe('F');
      } finally {
        restored.dispose();
      }
    }
    web.commands.sessions.openSource({
      kind: 'document',
      provider: 'browser-workspace',
      id: 'source',
    });
    const sourceId = web.getState().activeCanvasId;
    const snapshot = await parseDocumentSessionSource(source);
    web.commands.sessions.applySourceProjection(sourceId, snapshot);
    const derived = await web.materializeSession(sourceId);
    expect(derived?.document?.pages).toHaveLength(2);
    expect(derived?.document?.pages[0]?.anchors?.[0]?.label).toBe('Title');
  } finally {
    terminal.dispose();
    web.dispose();
  }
});
