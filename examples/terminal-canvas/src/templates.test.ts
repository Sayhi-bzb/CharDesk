import { expect, test } from 'bun:test';
import { CANVAS_TEMPLATES, materializeCanvasTemplate } from '@chardesk/canvas-templates';
import { parseCanvasDocument, serializeCanvasDocument } from '@chardesk/editor-core/documentText';
import { TerminalCanvas } from './model.ts';
import type { GridCell } from '@chardesk/cell-plane/types';
const significant = (cell: GridCell) =>
  cell.char !== ' ' ||
  !!cell.bgColor ||
  !!cell.href ||
  !!cell.attrs?.underline ||
  !!cell.attrs?.inverse ||
  !!cell.attrs?.strike;
test.each(CANVAS_TEMPLATES.map((item) => item.id))(
  '%s native round-trip preserves significant cells, colors and coordinates',
  (id) => {
    const model = new TerminalCanvas();
    try {
      const template = materializeCanvasTemplate(id, (color) =>
        typeof color === 'string' ? color : undefined
      );
      model.commands.insertRows(template.rows, { x: -31, y: -17 });
      const expected = new Map(
        [...model.plane.materialize()].filter(([, cell]) => significant(cell))
      );
      const source = serializeCanvasDocument(model.documents.getDocumentDraft()!);
      const document = parseCanvasDocument(source).document;
      const actual = new Map(
        document.pages
          .find((page) => page.id === document.activePageId)!
          .grid!.filter(([, cell]) => significant(cell))
      );
      expect(actual).toEqual(expected);
      model.commands.undo();
      expect(model.plane.materialize().size).toBe(0);
      expect(model.canUndo).toBe(false);
    } finally {
      model.dispose();
    }
  }
);
