import { expect, test } from 'vitest';
import { createApplicationEditorHost } from '@/app/compositionRoot';
import { FreeformEditorSession } from '@chardesk/editor-core/runtime';
import { getStaticGridSelection } from '@chardesk/editor-core/selection/static-grid';

test('Web and TUI row, column, edge, content-boundary and page intents share selection state', async () => {
  const host = createApplicationEditorHost(),
    terminal = new FreeformEditorSession('界AB\nC  界\n  DEF');
  try {
    const canvas = host.canvas,
      original = terminal.plane.materialize();
    canvas.commands.grid.replace([...original]);
    const compare = () => {
      expect(getStaticGridSelection(terminal.getSnapshot().interaction)).toEqual(
        getStaticGridSelection(canvas.getState().interaction.staticGrid)
      );
      expect(terminal.plane.materialize()).toEqual(original);
      expect(canvas.getState().contentSurface.reader.materialize()).toEqual(original);
    };
    const reset = () => {
      terminal.commands.pointAt({ x: 2, y: 1 });
      canvas.commands.staticGrid.setActiveCell({ x: 2, y: 1 });
    };
    reset();
    terminal.commands.selectRow();
    canvas.commands.staticGrid.selectRow();
    compare();
    reset();
    terminal.commands.selectColumn();
    canvas.commands.staticGrid.selectColumn();
    compare();
    for (const extend of [false, true]) {
      for (const edge of ['left', 'right', 'top', 'bottom', 'top-left', 'bottom-right'] as const) {
        reset();
        terminal.commands.navigateToEdge(edge, extend);
        canvas.commands.staticGrid.moveFocusToEdge(edge, { extend });
        compare();
      }
      for (const edge of ['left', 'right', 'top', 'bottom'] as const) {
        reset();
        terminal.commands.navigateToContentBoundary(edge, extend);
        canvas.commands.staticGrid.moveFocusToContentBoundary(edge, { extend });
        compare();
      }
      reset();
      terminal.commands.navigate(0, 24, extend);
      canvas.commands.staticGrid.moveFocus(0, 24, { extend });
      compare();
    }
    expect(terminal.canUndo).toBe(false);
  } finally {
    terminal.dispose();
    await host.dispose();
  }
});
