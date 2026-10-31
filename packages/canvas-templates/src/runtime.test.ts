import { expect, test } from 'vitest';
import {
  CANVAS_TEMPLATES,
  getCanvasTemplateMaterialization,
  materializeCanvasTemplate,
} from './index.js';
import { CHARDESK_DARK_CONTENT_THEME } from '@chardesk/rendering/theme';
test.each(CANVAS_TEMPLATES.map((item) => item.id))(
  '%s uses one materialization path for themed and terminal color policies',
  (id) => {
    const themed = getCanvasTemplateMaterialization(id, CHARDESK_DARK_CONTENT_THEME);
    const resolved = materializeCanvasTemplate(id, (color) =>
      typeof color === 'string' ? color : CHARDESK_DARK_CONTENT_THEME[color.token]
    );
    const cells = (source: typeof themed.source) => {
      const result: unknown[] = [];
      source.visit(themed.viewport, (x, y, cell) => result.push([x, y, cell]));
      return result;
    };
    expect(cells(themed.source)).toEqual(cells(resolved.source));
    const terminal = materializeCanvasTemplate(id, (color) =>
      typeof color === 'string' ? color : undefined
    );
    terminal.source.visit(terminal.viewport, (_x, _y, cell) => {
      expect(cell.color).toMatch(/^#[0-9a-f]{6}$/i);
    });
  }
);
