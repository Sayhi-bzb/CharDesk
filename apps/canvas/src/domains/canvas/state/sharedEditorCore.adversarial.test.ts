import { afterEach, expect, test } from 'vitest';
import { FreeformEditorSession } from '@chardesk/editor-core/runtime';
import {
  applyFreeformSnapshotToYMaps,
  canvasCommands,
  defaultCanvasDocuments,
  setCanvasTestState,
  useEditorStore,
} from '@/domains/canvas/testing';
import { createStaticGridState } from '@/domains/selection/public';
const initial = useEditorStore.getState();
afterEach(() => {
  useEditorStore.setState(initial, true);
  applyFreeformSnapshotToYMaps([]);
});

// The Web facade is a second Host oracle; each assertion includes a replayable
// seed and command prefix so mismatches can be reduced to a regression case.
test.each(Array.from({ length: 8 }, (_, i) => i + 1))(
  'cross-host command trace seed %i',
  (seed) => {
    applyFreeformSnapshotToYMaps([]);
    setCanvasTestState({
      canvasMode: 'freeform',
      brushColor: '#000000',
      staticGrid: createStaticGridState(),
    });
    defaultCanvasDocuments.clearHistory();
    const terminal = new FreeformEditorSession();
    let state = seed;
    const random = (max: number) => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return (state >>> 8) % max;
    };
    const log: unknown[] = [];
    try {
      for (let step = 0; step < 60; step++) {
        const op = random(12),
          x = random(11) - 5,
          y = random(5) - 2;
        log.push({ op, x, y });
        if (op === 0) {
          canvasCommands.staticGrid.setActiveCell({ x, y });
          terminal.commands.pointAt({ x, y });
        } else if (op === 1) {
          const end = { x: x + random(5) - 2, y: y + random(3) - 1 };
          log.push({ end });
          canvasCommands.staticGrid.setSelectionRange({ start: { x, y }, end });
          terminal.selection = { anchor: { x, y }, focus: end };
        } else if (op === 2) {
          canvasCommands.staticGrid.enterTextEdit();
          terminal.commands.beginInsert();
        } else if (op === 3) {
          if (useEditorStore.getState().interaction.staticGrid.mode === 'text-edit')
            canvasCommands.staticGrid.exitTextEdit();
          else canvasCommands.staticGrid.clearSelection();
          terminal.commands.escape();
        } else if (op === 4) {
          const text = ['AB', '界Z', 'é', '👩🏽‍💻', '\n', 'X'][random(6)]!;
          log.push({ text });
          canvasCommands.text.write(text);
          terminal.commands.insert(text);
        } else if (op === 5) {
          canvasCommands.staticGrid.delete('backward');
          terminal.commands.deleteBackward();
        } else if (op === 6) {
          canvasCommands.staticGrid.delete('forward');
          terminal.commands.erase();
        } else if (op === 7) {
          const dx = x === 0 ? 0 : x > 0 ? 1 : -1,
            dy = dx === 0 ? (y > 0 ? 1 : -1) : 0;
          log.push({ dx, dy });
          if (useEditorStore.getState().interaction.staticGrid.mode === 'text-edit')
            canvasCommands.text.moveCursor(dx, dy);
          else canvasCommands.staticGrid.moveFocus(dx, dy);
          terminal.commands.navigate(dx, dy);
        } else if (op === 8) {
          canvasCommands.selection.moveStaticRange({ x: 1, y: -1 });
          terminal.commands.moveSelection(1, -1);
        } else if (op === 9) {
          canvasCommands.history.undo();
          terminal.commands.undo();
        } else if (op === 10) {
          canvasCommands.history.redo();
          terminal.commands.redo();
        } else if (useEditorStore.getState().interaction.staticGrid.mode === 'text-edit') {
          canvasCommands.text.newline();
          terminal.commands.insert('\n');
        }
        const message = JSON.stringify({ seed, step, log });
        expect(terminal.plane.materialize(), message).toEqual(
          defaultCanvasDocuments.getContentReader().materialize()
        );
        expect(terminal.getSnapshot().interaction, message).toEqual(
          useEditorStore.getState().interaction.staticGrid
        );
        expect(terminal.canUndo, message).toBe(
          defaultCanvasDocuments.getHistoryAvailability().canUndo
        );
        expect(terminal.canRedo, message).toBe(
          defaultCanvasDocuments.getHistoryAvailability().canRedo
        );
      }
    } finally {
      terminal.dispose();
    }
  }
);
