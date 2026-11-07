import { expect, test } from 'vitest';
import { createApplicationEditorHost } from '@/app/compositionRoot';
import { FreeformEditorSession } from '@chardesk/editor-core/runtime';
import { DrawingLimitError } from '@chardesk/editor-core/drawing/limits';

const point = (x: number, y: number) => ({ x, y });
test.each(['box', 'splitBox', 'line', 'stepline', 'circle', 'bg'] as const)(
  '%s Web and TUI share final cells and undo through real document commands',
  async (tool) => {
    const host = createApplicationEditorHost(),
      terminal = new FreeformEditorSession('界 styled');
    try {
      const canvas = host.canvas,
        initial = terminal.plane.materialize();
      canvas.commands.grid.replace([...initial]);
      canvas.commands.preferences.setBrushColor('#ff0000');
      canvas.commands.preferences.setBrushBackgroundColor('#0000ff');
      terminal.setDrawingSettings({ foreground: '#ff0000', background: '#0000ff' });
      terminal.setTool(tool);
      const start = point(-2, -3),
        end = point(5, 2);
      terminal.pointer({ phase: 'down', cell: start, screen: start });
      terminal.pointer({ phase: 'up', cell: end, screen: end });
      canvas.commands.grid.updateScratchForShape(tool, start, end, { axis: 'horizontal' });
      expect(canvas.getState().contentSurface.reader.materialize()).toEqual(initial);
      canvas.commands.grid.commitScratch();
      const compare = () =>
        expect(terminal.plane.materialize()).toEqual(
          canvas.getState().contentSurface.reader.materialize()
        );
      compare();
      canvas.commands.history.undo();
      terminal.commands.undo();
      compare();
      expect(terminal.plane.materialize()).toEqual(initial);
      canvas.commands.history.redo();
      terminal.commands.redo();
      compare();
    } finally {
      terminal.dispose();
      await host.dispose();
    }
  }
);

test('Fill recolors a wide glyph tail and styled blank identically without creating other cells', async () => {
  const host = createApplicationEditorHost(),
    terminal = new FreeformEditorSession('界A');
  try {
    terminal.apply({
      rows: [
        {
          y: 0,
          erase: [],
          spans: [
            { x: 3, text: ' ', color: '#000000', bgColor: '#0000ff', href: 'https://example.com' },
          ],
        },
      ],
    });
    terminal.documents.clearHistory();
    const initial = terminal.plane.materialize();
    host.canvas.commands.grid.replace([...initial]);
    host.canvas.commands.preferences.setBrushColor('#ff0000');
    terminal.setDrawingSettings({ foreground: '#ff0000' });
    terminal.setTool('fill');
    const start = point(1, 0),
      end = point(6, 0);
    terminal.pointer({ phase: 'down', cell: start, screen: start });
    terminal.pointer({ phase: 'up', cell: end, screen: end });
    host.canvas.commands.grid.fillArea({ start, end });
    expect(terminal.plane.materialize()).toEqual(
      host.canvas.getState().contentSurface.reader.materialize()
    );
    expect(terminal.plane.get(point(3, 0))).toEqual({
      char: ' ',
      color: '#ff0000',
      bgColor: '#0000ff',
      href: 'https://example.com',
    });
    host.canvas.commands.history.undo();
    terminal.commands.undo();
    expect(host.canvas.getState().contentSurface.reader.materialize()).toEqual(initial);
    expect(terminal.plane.materialize()).toEqual(initial);
  } finally {
    terminal.dispose();
    await host.dispose();
  }
});

test('oversized Web shape and fill commands reject before writing content or preview', async () => {
  const host = createApplicationEditorHost();
  try {
    host.canvas.commands.grid.replace([['0,0', { char: 'A', color: '#000000' }]]);
    const before = host.canvas.getState().contentSurface.reader.materialize();
    for (const tool of ['box', 'splitBox', 'circle', 'bg'] as const)
      expect(() =>
        host.canvas.commands.grid.updateScratchForShape(
          tool,
          point(0, 0),
          point(1_000_000, 1_000_000)
        )
      ).toThrow(DrawingLimitError);
    expect(() =>
      host.canvas.commands.grid.fillArea({ start: point(0, 0), end: point(1_000_000, 1_000_000) })
    ).toThrow(DrawingLimitError);
    expect(host.canvas.getState().contentSurface.reader.materialize()).toEqual(before);
    expect(host.canvas.getState().interaction.scratchLayer).toBeNull();
    expect(host.canvas.getState().canUndo).toBe(false);
  } finally {
    await host.dispose();
  }
});
