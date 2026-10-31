import { afterEach, expect, test } from 'vitest';
import { FreeformEditorSession } from '@chardesk/editor-core/runtime';
import {
  applyFreeformSnapshotToYMaps,
  canvasCommands,
  defaultCanvasDocuments,
  setCanvasTestState,
  useEditorStore,
} from '@/domains/canvas/testing';
import { createStaticGridInputSession, getStaticGridCursor } from '@/domains/selection/public';
const initialState = useEditorStore.getState();
afterEach(() => {
  useEditorStore.setState(initialState, true);
  applyFreeformSnapshotToYMaps([]);
});
test('Web and Terminal share Unicode input, overlapping moves and history semantics', () => {
  applyFreeformSnapshotToYMaps([]);
  setCanvasTestState({
    canvasMode: 'freeform',
    staticGrid: {
      mode: 'text-edit',
      session: createStaticGridInputSession({ origin: { x: 0, y: 0 } }),
    },
  });
  defaultCanvasDocuments.clearHistory();
  const terminal = new FreeformEditorSession();
  try {
    const text = 'A界👩🏽‍💻\nCafé';
    canvasCommands.text.write(text);
    terminal.commands.beginInsert();
    terminal.commands.insert(text);
    const compare = () =>
      expect(terminal.plane.materialize()).toEqual(
        defaultCanvasDocuments.getContentReader().materialize()
      );
    compare();
    expect(terminal.cursor).toEqual(
      getStaticGridCursor(useEditorStore.getState().interaction.staticGrid)
    );
    canvasCommands.staticGrid.exitTextEdit();
    terminal.commands.escape();
    const start = { x: 0, y: 0 },
      end = { x: 4, y: 1 };
    canvasCommands.staticGrid.setSelectionRange({ start, end });
    terminal.selection = { anchor: start, focus: end };
    canvasCommands.selection.moveStaticRange({ x: 1, y: 1 });
    terminal.commands.moveSelection(1, 1);
    compare();
    canvasCommands.history.undo();
    terminal.commands.undo();
    compare();
    canvasCommands.history.redo();
    terminal.commands.redo();
    compare();
  } finally {
    terminal.dispose();
  }
});

test('Web and Terminal share selection fill, clipboard payloads, paste selection, cut and undo', async () => {
  const { readClipboardPayload } = await import('@/domains/actions/public');
  const data = new Map<string, string>();
  const transfer = {
    getData: (type: string) => data.get(type) ?? '',
    setData: (type: string, value: string) => {
      data.set(type, value);
    },
  } as unknown as DataTransfer;
  const event = { clipboardData: transfer, preventDefault: () => {} } as ClipboardEvent;
  applyFreeformSnapshotToYMaps([]);
  setCanvasTestState({ canvasMode: 'freeform', brushColor: '#000000' });
  canvasCommands.staticGrid.setActiveCell({ x: 0, y: 0 });
  const terminal = new FreeformEditorSession();
  terminal.configureClipboard({
    write: async (payload) => {
      data.set('text/plain', payload.plain);
      data.set('web application/x-ascii-metropolis', payload.rich ?? '');
      return { status: 'written' };
    },
    read: (state) => readClipboardPayload(transfer, state.foreground),
  });
  const finish = async (result: ReturnType<typeof terminal.commands.paste>) => {
    expect(result.status).toBe('pending');
    if (result.status !== 'pending') throw new Error('Expected clipboard continuation');
    expect((await result.completion).succeeded).toBe(true);
  };
  const compareContent = () =>
    expect(terminal.plane.materialize()).toEqual(
      defaultCanvasDocuments.getContentReader().materialize()
    );
  const compareSelection = () => {
    const web = useEditorStore.getState().interaction.staticGrid;
    expect(terminal.getSnapshot().interaction).toEqual(web);
  };
  try {
    canvasCommands.text.write('A界B');
    terminal.commands.beginInsert();
    terminal.commands.insert('A界B');
    terminal.commands.escape();
    canvasCommands.staticGrid.exitTextEdit();
    canvasCommands.staticGrid.setSelectionRange({ start: { x: 0, y: 0 }, end: { x: 2, y: 0 } });
    terminal.commands.pointAt({ x: 0, y: 0 });
    terminal.commands.navigate(1, 0, true);
    canvasCommands.selection.fillWithChar('X');
    terminal.commands.insert('X');
    compareContent();
    await canvasCommands.selection.copy({ event, rich: true });
    const webPayload = [...data];
    await finish(terminal.commands.copy());
    expect([...data]).toEqual(webPayload);
    canvasCommands.staticGrid.setActiveCell({ x: 6, y: 2 });
    terminal.commands.pointAt({ x: 6, y: 2 });
    await canvasCommands.selection.paste({ eventDataTransfer: transfer });
    await finish(terminal.commands.paste());
    compareContent();
    compareSelection();
    await canvasCommands.selection.cut({ event });
    await finish(terminal.commands.cut());
    compareContent();
    compareSelection();
    canvasCommands.history.undo();
    terminal.commands.undo();
    compareContent();
    compareSelection();
    canvasCommands.history.undo();
    terminal.commands.undo();
    compareContent();
    compareSelection();
  } finally {
    terminal.dispose();
  }
});
