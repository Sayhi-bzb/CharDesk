import { expect, test } from 'vitest';
import { createApplicationEditorHost } from '@/app/compositionRoot';
import { FreeformEditorSession } from '@chardesk/editor-core/runtime';
import {
  readSelectionStyle,
  type SelectionStyleChange,
} from '@chardesk/editor-core/selection/style';
import { getGridSelectionRanges, getStaticGridSelection } from '@/domains/selection/public';

test('Web and TUI apply the same multi-range styles to wide glyphs, undo and redo through real document commands', async () => {
  const host = createApplicationEditorHost(),
    terminal = new FreeformEditorSession();
  try {
    terminal.apply({
      rows: [
        {
          y: 0,
          erase: [],
          spans: [
            {
              x: -3,
              text: '界',
              color: '#ff0000',
              attrs: { bold: true },
              bgColor: '#112233',
              href: 'https://example.com',
            },
            { x: -1, text: 'A', color: '#0000ff', attrs: { italic: true } },
            { x: 3, text: '🦀', color: '#ff0000', attrs: { inverse: true } },
          ],
        },
      ],
    });
    terminal.documents.clearHistory();
    const initial = terminal.plane.materialize(),
      canvas = host.canvas;
    canvas.commands.grid.replace([...initial]);
    canvas.commands.preferences.setBrushColor('#000000');
    terminal.selection = { anchor: { x: -2, y: 0 }, focus: { x: -1, y: 0 } };
    canvas.commands.staticGrid.setSelectionRange({ start: { x: -2, y: 0 }, end: { x: -1, y: 0 } });
    const cell = { x: 4, y: 0 };
    terminal.pointer({ phase: 'down', cell, screen: cell, append: true });
    terminal.pointer({ phase: 'up', cell, screen: cell, append: true });
    canvas.commands.staticGrid.appendSelectionRange({ start: cell, end: cell });
    const compare = () => {
      const state = canvas.getState();
      expect(terminal.plane.materialize()).toEqual(state.contentSurface.reader.materialize());
      expect(terminal.selectionStyle).toEqual(
        readSelectionStyle(
          state.contentSurface.reader,
          getGridSelectionRanges(getStaticGridSelection(state.interaction.staticGrid))
        )
      );
    };
    compare();
    expect(terminal.selectionStyle.count).toBe(3);
    const changes: SelectionStyleChange[] = [
      { kind: 'attributes', attributes: { bold: true, underline: true } },
      { kind: 'foreground', color: '#aabbcc' },
      { kind: 'background', color: '#334455' },
      { kind: 'background', color: null },
      { kind: 'attributes', attributes: { bold: false, underline: false } },
    ];
    for (const change of changes) {
      terminal.commands.style(change);
      if (change.kind === 'attributes')
        canvas.commands.selection.setTextAttributes(change.attributes);
      else if (change.kind === 'foreground')
        canvas.commands.selection.setForegroundColor(change.color);
      else canvas.commands.selection.setBackgroundColor(change.color);
      compare();
      expect(terminal.plane.get({ x: 0, y: 0 })).toBeUndefined();
      expect(terminal.plane.get({ x: -3, y: 0 })?.href).toBe('https://example.com');
    }
    for (let i = 0; i < changes.length; i++) {
      terminal.commands.undo();
      canvas.commands.history.undo();
      compare();
    }
    expect(terminal.plane.materialize()).toEqual(initial);
    expect(terminal.canUndo).toBe(false);
    for (let i = 0; i < changes.length; i++) {
      terminal.commands.redo();
      canvas.commands.history.redo();
      compare();
    }
  } finally {
    terminal.dispose();
    await host.dispose();
  }
});
