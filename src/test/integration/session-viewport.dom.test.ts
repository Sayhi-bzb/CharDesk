import { createEditorCommandsExtension } from '@/domains/actions/public';
import { TestCanvasContentSurface } from '@/domains/canvas/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyFreeformSnapshotToYMaps,
  canvasCommands,
  redoCanvas,
  testingCanvasRuntime,
  undoCanvas,
  setCanvasTestState,
  useEditorStore,
} from '@/domains/canvas/testing';
import {
  createCanvasEditorExtension,
  createCanvasEditorRuntime,
} from '@/domains/editor/public';
import {
  getStructuredSplitBoxGuides,
  getStructuredSplitBoxHandleAtPoint,
} from '@/domains/structured-content/public';
import { DEFAULT_SESSION_ID } from '@/domains/canvas/state/helpers/storeUtils';
import { clipboard, feedback } from '@/shared/services/effects';

const initialState = useEditorStore.getState();
const editorRuntime = createCanvasEditorRuntime({
  state: {
    get: testingCanvasRuntime.getState,
    subscribe: testingCanvasRuntime.subscribe,
  },
  history: testingCanvasRuntime.commands.history,
  transactions: { run: testingCanvasRuntime.commands.history.transact },
  onToolChange: testingCanvasRuntime.commands.tools.set,
});
editorRuntime
  .registerExtension(createCanvasEditorExtension(editorRuntime.interactionPort))
  .registerExtension(createEditorCommandsExtension(testingCanvasRuntime as never))
  .start(editorRuntime.getState().tool);

const createClipboardEventCapture = () => {
  const data = new Map<string, string>();
  return {
    data,
    event: {
      preventDefault: () => {},
      clipboardData: {
        setData: (type: string, value: string) => data.set(type, value),
      },
    } as unknown as ClipboardEvent,
  };
};

const dataTransferFromCapture = (data: Map<string, string>) =>
  ({
    getData: (type: string) => data.get(type) ?? '',
  }) as unknown as DataTransfer;

describe('canvas session viewport state', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    useEditorStore.setState({
      ...initialState,
      contentSurface: new TestCanvasContentSurface(),
      canvasSessions: initialState.canvasSessions.map((session) =>
        session.id === DEFAULT_SESSION_ID
          ? { ...session, grid: [], viewport: undefined }
          : session
      ),
    });
    testingCanvasRuntime.viewport.resetFallback({ offset: { x: 0, y: 0 }, zoom: 1 });
    applyFreeformSnapshotToYMaps([]);
  });

  it('commits offset and zoom as one viewport state transition', () => {
    const snapshots: Array<{ offset: { x: number; y: number }; zoom: number }> = [];
    const unsubscribe = testingCanvasRuntime.viewport.subscribe(() => {
      snapshots.push(testingCanvasRuntime.viewport.getSnapshot());
    });

    testingCanvasRuntime.commands.viewport.setViewport(() => ({
      offset: { x: -80, y: -40 },
      zoom: 2,
    }));
    unsubscribe();

    expect(snapshots).toEqual([
      { offset: { x: -80, y: -40 }, zoom: 2 },
    ]);
  });

  it('saves and restores offset and zoom per canvas session', () => {
    const store = useEditorStore.getState();
    testingCanvasRuntime.commands.viewport.setOffset(() => ({ x: 10, y: 20 }));
    testingCanvasRuntime.commands.viewport.setZoom(() => 2);

    store.createCanvasSession('freeform');
    const secondCanvasId = useEditorStore.getState().activeCanvasId;

    expect(testingCanvasRuntime.viewport.getSnapshot().offset).toEqual({ x: 0, y: 0 });
    expect(testingCanvasRuntime.viewport.getSnapshot().zoom).toBe(1);

    testingCanvasRuntime.commands.viewport.setOffset(() => ({ x: 100, y: 200 }));
    testingCanvasRuntime.commands.viewport.setZoom(() => 3);
    useEditorStore.getState().switchCanvasSession(DEFAULT_SESSION_ID);

    expect(testingCanvasRuntime.viewport.getSnapshot().offset).toEqual({ x: 10, y: 20 });
    expect(testingCanvasRuntime.viewport.getSnapshot().zoom).toBe(2);

    testingCanvasRuntime.commands.viewport.setOffset(() => ({ x: 11, y: 22 }));
    testingCanvasRuntime.commands.viewport.setZoom(() => 1.5);
    useEditorStore.getState().switchCanvasSession(secondCanvasId);

    expect(testingCanvasRuntime.viewport.getSnapshot().offset).toEqual({ x: 100, y: 200 });
    expect(testingCanvasRuntime.viewport.getSnapshot().zoom).toBe(3);
  });
  it('creates and activates an empty structured session', () => {
    useEditorStore.getState().createCanvasSession('structured');

    const state = useEditorStore.getState();
    const activeSession = state.canvasSessions.find(
      (session) => session.id === state.activeCanvasId
    );

    expect(activeSession?.mode).toBe('structured');
    expect(state.canvasMode).toBe('structured');
    expect(state.structuredScene).toEqual([]);
    expect(state.contentSurface.reader.materialize().size).toBe(0);
  });
  it('accepts arrow lines only in structured sessions', () => {
    useEditorStore.getState().createCanvasSession('structured');
    canvasCommands.tools.set('arrowLine');

    expect(useEditorStore.getState().tool).toBe('arrowLine');

    useEditorStore.getState().createCanvasSession('freeform');
    const freeformTool = useEditorStore.getState().tool;
    canvasCommands.tools.set('arrowLine');

    expect(useEditorStore.getState().tool).toBe(freeformTool);
    expect(freeformTool).not.toBe('arrowLine');
  });
  it('preserves the arrow line tool between structured sessions', () => {
    useEditorStore.getState().createCanvasSession('structured');
    const firstStructuredId = useEditorStore.getState().activeCanvasId;
    canvasCommands.tools.set('arrowLine');

    useEditorStore.getState().createCanvasSession('structured');
    expect(useEditorStore.getState().tool).toBe('arrowLine');

    useEditorStore.getState().switchCanvasSession(firstStructuredId);
    expect(useEditorStore.getState().tool).toBe('arrowLine');
  });
  it('updates selected structured boxes through the store', () => {
    useEditorStore.getState().createCanvasSession('structured');
    useEditorStore.getState().applyStructuredScene(
      [
        {
          id: 'box-1',
          type: 'box',
          order: 1,
          start: { x: 0, y: 0 },
          end: { x: 2, y: 2 },
          style: { color: '#ffffff' },
        },
      ],
      false
    );

    useEditorStore.getState().updateStructuredBox('box-1', (node) => ({
      ...node,
      start: { x: 3, y: 4 },
      end: { x: 5, y: 6 },
    }));

    const state = useEditorStore.getState();
    expect(state.interaction.selectedStructuredBoxId).toBe('box-1');
    expect(state.structuredScene[0]).toMatchObject({
      start: { x: 3, y: 4 },
      end: { x: 5, y: 6 },
    });
    expect(state.contentSurface.reader.materialize().size).toBeGreaterThan(0);
  });
  it('deletes selected structured nodes', () => {
    useEditorStore.getState().createCanvasSession('structured');
    useEditorStore.getState().applyStructuredScene(
      [
        {
          id: 'box-1',
          type: 'box',
          order: 1,
          start: { x: 0, y: 0 },
          end: { x: 2, y: 2 },
          style: { color: '#ffffff' },
        },
        {
          id: 'line-1',
          type: 'line',
          order: 2,
          start: { x: 4, y: 0 },
          end: { x: 8, y: 0 },
          axis: 'horizontal',
          style: { color: '#ffffff' },
        },
      ],
      false
    );

    canvasCommands.interaction.setSelectedStructuredNodeIds(['box-1', 'line-1']);
    canvasCommands.selection.delete();

    const state = useEditorStore.getState();
    expect(state.structuredScene).toEqual([]);
    expect(state.interaction.selectedStructuredNodeIds).toEqual([]);
    expect(state.interaction.selectedStructuredBoxId).toBeNull();
  });

  it('tracks structured grid focus independently from structured node selection', () => {
    useEditorStore.getState().createCanvasSession('structured');

    canvasCommands.interaction.setStructuredGridFocus({ x: 4, y: 5 });
    expect(useEditorStore.getState().interaction.structuredGridFocus).toEqual({ x: 4, y: 5 });
    expect(useEditorStore.getState().interaction.textCursor).toBeNull();

    canvasCommands.interaction.moveStructuredGridFocus(2, -3);
    expect(useEditorStore.getState().interaction.structuredGridFocus).toEqual({ x: 6, y: 2 });

    canvasCommands.selection.clearInteraction();
    expect(useEditorStore.getState().interaction.structuredGridFocus).toBeNull();
  });

  it('reorders and duplicates selected structured nodes through the store', () => {
    useEditorStore.getState().createCanvasSession('structured');
    useEditorStore.getState().applyStructuredScene(
      [
        {
          id: 'box-1',
          type: 'box',
          order: 1,
          start: { x: 0, y: 0 },
          end: { x: 2, y: 2 },
          style: { color: '#ffffff' },
        },
        {
          id: 'line-1',
          type: 'line',
          order: 2,
          start: { x: 4, y: 0 },
          end: { x: 8, y: 0 },
          axis: 'horizontal',
          style: { color: '#ffffff' },
        },
      ],
      false
    );

    canvasCommands.interaction.setSelectedStructuredNodeIds(['box-1']);
    useEditorStore.getState().reorderStructuredSelection('front');

    expect(
      [...useEditorStore.getState().structuredScene]
        .sort((a, b) => a.order - b.order)
        .map((node) => node.id)
    ).toEqual(['line-1', 'box-1']);

    const duplicatedIds = useEditorStore.getState().duplicateStructuredSelection();
    const state = useEditorStore.getState();
    expect(duplicatedIds).toHaveLength(1);
    expect(state.interaction.selectedStructuredNodeIds).toEqual(duplicatedIds);
    expect(state.structuredScene).toHaveLength(3);
    expect(state.structuredScene.find((node) => node.id === duplicatedIds[0])).toMatchObject({
      type: 'box',
      start: { x: 1, y: 1 },
      end: { x: 3, y: 3 },
    });
  });

  it('clears structured interaction state when observed nodes disappear', () => {
    useEditorStore.getState().createCanvasSession('structured');
    useEditorStore.getState().applyStructuredScene(
      [
        {
          id: 'box-stale',
          type: 'box',
          order: 1,
          start: { x: 0, y: 0 },
          end: { x: 4, y: 4 },
          style: { color: '#ffffff' },
        },
        {
          id: 'split-stale',
          type: 'splitBox',
          order: 2,
          start: { x: 6, y: 0 },
          end: { x: 12, y: 4 },
          verticalSplitRatio: 0.5,
          topSplitRatio: 0.25,
          bottomSplitRatio: 0.75,
          style: { color: '#ffffff' },
        },
        {
          id: 'text-stale',
          type: 'text',
          order: 3,
          position: { x: 1, y: 1 },
          text: 'Text',
          style: { color: '#ffffff' },
        },
      ],
      false
    );
    canvasCommands.interaction.setSelectedStructuredNodeIds([
      'box-stale',
      'split-stale',
      'text-stale',
    ]);
    canvasCommands.interaction.setSelectedStructuredBoxId('box-stale');
    canvasCommands.interaction.setSelectedStructuredSplitHandle({
      nodeId: 'split-stale',
      handle: 'split:split-middle',
    });
    canvasCommands.interaction.setStructuredContextPoint({ x: 8, y: 2 });
    canvasCommands.interaction.setEditingStructuredTextNodeId('text-stale');
    canvasCommands.interaction.setTextCursor({ x: 3, y: 1 });
    canvasCommands.interaction.setStructuredTextSelection({
      nodeId: 'text-stale',
      anchor: 1,
      focus: 3,
    });

    useEditorStore.getState().applyStructuredScene([], false);

    expect(useEditorStore.getState().interaction).toMatchObject({
      selectedStructuredNodeIds: [],
      selectedStructuredBoxId: null,
      selectedStructuredSplitHandle: null,
      structuredContextPoint: null,
      editingStructuredTextNodeId: null,
      structuredTextSelection: null,
      textCursor: null,
    });
  });

  it('reports undo success only when the active canvas history changes', () => {
    setCanvasTestState({ canvasMode: 'freeform' });
    applyFreeformSnapshotToYMaps([]);
    expect(editorRuntime.commands.execute('undo', undefined, 'global-hotkey').status).toBe('rejected');

    canvasCommands.interaction.setTextCursor({ x: 0, y: 0 });
    useEditorStore.getState().writeTextString('A');
    expect(useEditorStore.getState().canUndo).toBe(true);
    expect(editorRuntime.commands.execute('undo', undefined, 'global-hotkey').status).toBe('succeeded');
    expect(useEditorStore.getState().contentSurface.reader.materialize().size).toBe(0);
    expect(editorRuntime.commands.execute('undo', undefined, 'global-hotkey').status).toBe('rejected');
  });

  it('copies structured nodes and pastes them back as structured elements', async () => {
    useEditorStore.getState().createCanvasSession('structured');
    useEditorStore.getState().applyStructuredScene(
      [
        {
          id: 'box-1',
          type: 'box',
          order: 1,
          start: { x: 2, y: 3 },
          end: { x: 6, y: 5 },
          style: { color: '#ffffff' },
        },
        {
          id: 'text-1',
          type: 'text',
          order: 2,
          position: { x: 3, y: 4 },
          text: 'Hi',
          style: { color: '#000000' },
        },
      ],
      false
    );
    canvasCommands.interaction.setSelectedStructuredNodeIds(['box-1', 'text-1']);
    const capture = createClipboardEventCapture();

    await canvasCommands.selection.copy({ event: capture.event });
    canvasCommands.interaction.setTextCursor({ x: 10, y: 10 });
    canvasCommands.interaction.setStructuredGridFocus({ x: 12, y: 8 });
    await canvasCommands.selection.paste({
      eventDataTransfer: dataTransferFromCapture(capture.data),
    });

    const state = useEditorStore.getState();
    expect(state.structuredScene).toHaveLength(4);
    const pasted = state.structuredScene.filter((node) =>
      state.interaction.selectedStructuredNodeIds.includes(node.id)
    );
    expect(pasted.map((node) => node.type)).toEqual(['box', 'text']);
    expect(pasted[0]).toMatchObject({
      type: 'box',
      start: { x: 12, y: 8 },
      end: { x: 16, y: 10 },
    });
    expect(pasted[1]).toMatchObject({
      type: 'text',
      position: { x: 13, y: 9 },
      text: 'Hi',
    });
    expect(state.interaction.structuredGridFocus).toBeNull();
    expect(pasted.map((node) => node.id)).not.toContain('box-1');
    expect(pasted.map((node) => node.id)).not.toContain('text-1');
  });

  it('clears pasted structured selection when undo removes the pasted nodes', async () => {
    useEditorStore.getState().createCanvasSession('structured');
    useEditorStore.getState().applyStructuredScene(
      [
        {
          id: 'text-undo-source',
          type: 'text',
          order: 1,
          position: { x: 2, y: 3 },
          text: 'Undo',
          style: { color: '#ffffff' },
        },
      ],
      false
    );
    canvasCommands.interaction.setSelectedStructuredNodeIds(['text-undo-source']);
    const capture = createClipboardEventCapture();

    await canvasCommands.selection.copy({ event: capture.event });
    canvasCommands.interaction.setStructuredGridFocus({ x: 10, y: 10 });
    await canvasCommands.selection.paste({
      eventDataTransfer: dataTransferFromCapture(capture.data),
    });

    const pastedIds = useEditorStore.getState().interaction.selectedStructuredNodeIds;
    expect(pastedIds).toHaveLength(1);
    expect(pastedIds).not.toContain('text-undo-source');
    expect(undoCanvas()).toBe(true);
    expect(useEditorStore.getState().structuredScene).toHaveLength(1);
    expect(useEditorStore.getState().interaction.selectedStructuredNodeIds).toEqual([]);
  });

  it('does not cut a new target after an asynchronous clipboard write', async () => {
    setCanvasTestState({ canvasMode: 'freeform' });
    applyFreeformSnapshotToYMaps([
      ['0,0', { char: 'A', color: '#ffffff' }],
      ['1,0', { char: 'B', color: '#ffffff' }],
    ]);
    canvasCommands.interaction.setTextCursor({ x: 0, y: 0 });
    let resolveWrite!: (value: boolean) => void;
    vi.spyOn(clipboard, 'writeText').mockImplementation(
      () => new Promise((resolve) => (resolveWrite = resolve))
    );

    const pendingCut = canvasCommands.selection.cut();
    canvasCommands.interaction.setTextCursor({ x: 1, y: 0 });
    resolveWrite(true);

    await expect(pendingCut).resolves.toEqual({
      status: 'failed',
      reason: 'stale-target',
    });
    expect(useEditorStore.getState().contentSurface.reader.materialize().get('0,0')?.char).toBe('A');
    expect(useEditorStore.getState().contentSurface.reader.materialize().get('1,0')?.char).toBe('B');
  });

  it('cuts only cells inside a disjoint grid selection union', async () => {
    setCanvasTestState({
      canvasMode: 'freeform',
      textCursor: null,
      staticGridEditMode: 'navigate',
      staticGridSelection: {
        mode: 'range',
        activeCell: { x: 0, y: 1 },
        anchorCell: { x: 0, y: 1 },
        primaryRange: { start: { x: 0, y: 1 }, end: { x: 0, y: 1 } },
        additionalRanges: [
          { start: { x: 1, y: 0 }, end: { x: 1, y: 0 } },
        ],
      },
    });
    applyFreeformSnapshotToYMaps([
      ['0,0', { char: 'a', color: '#ffffff' }],
      ['1,0', { char: 'b', color: '#ffffff' }],
      ['0,1', { char: 'c', color: '#ffffff' }],
      ['1,1', { char: 'd', color: '#ffffff' }],
    ]);
    const capture = createClipboardEventCapture();

    await expect(
      canvasCommands.selection.cut({ event: capture.event })
    ).resolves.toEqual({ status: 'applied', changed: true });

    expect(capture.data.get('text/plain')).toBe(' b\nc');
    expect(
      JSON.parse(
        capture.data.get('web application/x-ascii-metropolis') ?? '{}'
      ).cells
    ).toEqual([
      { x: 1, y: 0, char: 'b', color: '#ffffff' },
      { x: 0, y: 1, char: 'c', color: '#ffffff' },
    ]);
    expect(useEditorStore.getState().contentSurface.reader.materialize()).toEqual(
      new Map([
        ['0,0', { char: 'a', color: '#ffffff' }],
        ['1,1', { char: 'd', color: '#ffffff' }],
      ])
    );
  });

  it('does not paste into a new target after an asynchronous clipboard read', async () => {
    setCanvasTestState({ canvasMode: 'freeform' });
    applyFreeformSnapshotToYMaps([
      ['0,0', { char: 'A', color: '#ffffff' }],
      ['1,0', { char: 'B', color: '#ffffff' }],
    ]);
    canvasCommands.interaction.setTextCursor({ x: 0, y: 0 });
    let resolveItems!: (value: ClipboardItem[] | null) => void;
    vi.spyOn(clipboard, 'readItems').mockImplementation(
      () => new Promise((resolve) => (resolveItems = resolve))
    );
    vi.spyOn(clipboard, 'readText').mockResolvedValue('Z');

    const pendingPaste = canvasCommands.selection.paste();
    canvasCommands.interaction.setTextCursor({ x: 1, y: 0 });
    resolveItems(null);

    await expect(pendingPaste).resolves.toEqual({
      status: 'failed',
      reason: 'stale-target',
    });
    expect(useEditorStore.getState().contentSurface.reader.materialize().get('0,0')?.char).toBe('A');
    expect(useEditorStore.getState().contentSurface.reader.materialize().get('1,0')?.char).toBe('B');
  });

  it('shows one warning after pasted text falls back from limited rendering', async () => {
    setCanvasTestState({ canvasMode: 'freeform' });
    canvasCommands.interaction.setTextCursor({ x: 0, y: 0 });
    const warning = vi.spyOn(feedback, 'warning').mockImplementation(() => {});

    await canvasCommands.selection.paste({
      eventDataTransfer: {
        getData: (type: string) => type === 'text/plain'
          ? '```not-a-language\nvalue\n```'
          : '',
      } as unknown as DataTransfer,
    });

    expect(warning).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledWith(
      'Pasted with limited rendering',
      expect.objectContaining({
        id: 'paste-render-diagnostics',
        description: expect.stringContaining('Could not highlight'),
      })
    );

    canvasCommands.interaction.setTextCursor({ x: 0, y: 2 });
    await canvasCommands.selection.paste({
      eventDataTransfer: {
        getData: (type: string) => type === 'text/plain' ? 'plain text' : '',
      } as unknown as DataTransfer,
    });
    expect(warning).toHaveBeenCalledTimes(1);
  });

  it('pastes structured clipboard content into freeform as surface cells', async () => {
    useEditorStore.getState().createCanvasSession('structured');
    useEditorStore.getState().applyStructuredScene(
      [
        {
          id: 'box-1',
          type: 'box',
          order: 1,
          start: { x: 2, y: 3 },
          end: { x: 6, y: 5 },
          style: { color: '#111111' },
        },
        {
          id: 'text-1',
          type: 'text',
          order: 2,
          position: { x: 3, y: 4 },
          text: 'Hi',
          style: { color: '#ffffff' },
        },
      ],
      false
    );
    canvasCommands.interaction.setSelectedStructuredNodeIds(['box-1']);
    const capture = createClipboardEventCapture();

    await canvasCommands.selection.copy({ event: capture.event });
    useEditorStore.getState().createCanvasSession('freeform');
    canvasCommands.interaction.setTextCursor({ x: 0, y: 0 });
    await canvasCommands.selection.paste({
      eventDataTransfer: dataTransferFromCapture(capture.data),
    });

    const state = useEditorStore.getState();
    expect(state.canvasMode).toBe('freeform');
    expect(state.structuredScene).toEqual([]);
    expect(state.contentSurface.reader.materialize().get('0,0')).toMatchObject({
      char: '╭',
      color: '#111111',
    });
    expect(state.contentSurface.reader.materialize().get('1,1')).toMatchObject({
      char: 'H',
      color: '#ffffff',
    });
    expect(state.contentSurface.reader.materialize().get('2,1')).toMatchObject({
      char: 'i',
      color: '#ffffff',
    });
  });

  it('pastes wide structured text into freeform without follower cells overwriting it', async () => {
    useEditorStore.getState().createCanvasSession('structured');
    useEditorStore.getState().applyStructuredScene(
      [
        {
          id: 'text-1',
          type: 'text',
          order: 1,
          position: { x: 3, y: 4 },
          text: '你A',
          style: { color: '#ffffff' },
        },
      ],
      false
    );
    canvasCommands.interaction.setSelectedStructuredNodeIds(['text-1']);
    const capture = createClipboardEventCapture();

    await canvasCommands.selection.copy({ event: capture.event });
    useEditorStore.getState().createCanvasSession('freeform');
    canvasCommands.interaction.setTextCursor({ x: 0, y: 0 });
    await canvasCommands.selection.paste({
      eventDataTransfer: dataTransferFromCapture(capture.data),
    });

    const state = useEditorStore.getState();
    expect(state.canvasMode).toBe('freeform');
    expect(state.contentSurface.reader.materialize().get('0,0')).toMatchObject({
      char: '你',
      color: '#ffffff',
    });
    expect(state.contentSurface.reader.materialize().get('1,0')).toBeUndefined();
    expect(state.contentSurface.reader.materialize().get('2,0')).toMatchObject({
      char: 'A',
      color: '#ffffff',
    });
  });

  it('creates structured background blocks with the brush color as fill', () => {
    useEditorStore.getState().createCanvasSession('structured');
    setCanvasTestState({ brushColor: '#334155' });

    useEditorStore.getState().commitStructuredShape('bg', { x: 1, y: 2 }, { x: 3, y: 4 });

    const state = useEditorStore.getState();
    expect(state.structuredScene[0]).toMatchObject({
      type: 'bg',
      start: { x: 1, y: 2 },
      end: { x: 3, y: 4 },
      style: { color: '#000000', bgColor: '#334155' },
    });
    expect(state.interaction.selectedStructuredNodeIds).toEqual([
      state.structuredScene[0].id,
    ]);
    expect(state.contentSurface.reader.materialize().get('1,2')).toEqual({
      char: ' ',
      color: '#000000',
      bgColor: '#334155',
    });
    expect(state.contentSurface.reader.materialize().get('3,4')).toEqual({
      char: ' ',
      color: '#000000',
      bgColor: '#334155',
    });
  });

  it('creates, copies, pastes, and restores structured arrow lines', async () => {
    useEditorStore.getState().createCanvasSession('structured');
    setCanvasTestState({ brushColor: '#334155' });

    useEditorStore
      .getState()
      .commitStructuredShape('arrowLine', { x: 0, y: 0 }, { x: 3, y: 0 }, { axis: 'horizontal' });

    const source = useEditorStore.getState().structuredScene[0];
    expect(source).toMatchObject({
      type: 'line',
      start: { x: 0, y: 0 },
      end: { x: 3, y: 0 },
      axis: 'horizontal',
      endMarker: 'arrow',
      style: { color: '#334155' },
    });
    expect(useEditorStore.getState().contentSurface.reader.materialize().get('3,0')).toMatchObject({
      char: '>',
      color: '#334155',
    });

    const capture = createClipboardEventCapture();
    await canvasCommands.selection.copy({ event: capture.event });
    canvasCommands.interaction.setStructuredGridFocus({ x: 0, y: 2 });
    await canvasCommands.selection.paste({
      eventDataTransfer: dataTransferFromCapture(capture.data),
    });

    const pastedId = useEditorStore.getState().interaction.selectedStructuredNodeIds[0];
    expect(
      useEditorStore.getState().structuredScene.find((node) => node.id === pastedId)
    ).toMatchObject({
      type: 'line',
      start: { x: 0, y: 2 },
      end: { x: 3, y: 2 },
      endMarker: 'arrow',
    });
    expect(useEditorStore.getState().contentSurface.reader.materialize().get('3,2')?.char).toBe('>');

    expect(undoCanvas()).toBe(true);
    expect(useEditorStore.getState().structuredScene).toHaveLength(1);
    expect(redoCanvas()).toBe(true);
    expect(useEditorStore.getState().structuredScene).toHaveLength(2);
    expect(useEditorStore.getState().structuredScene[1]).toMatchObject({
      endMarker: 'arrow',
    });
  });

  it('creates split boxes as structured shape nodes', () => {
    useEditorStore.getState().createCanvasSession('structured');
    setCanvasTestState({ brushColor: '#334155' });

    useEditorStore.getState().commitStructuredShape('splitBox', { x: 0, y: 0 }, { x: 10, y: 4 });

    const state = useEditorStore.getState();
    expect(state.structuredScene[0]).toMatchObject({
      type: 'splitBox',
      start: { x: 0, y: 0 },
      end: { x: 10, y: 4 },
      verticalSplitRatio: 0.36,
      topSplitRatio: 0.25,
      bottomSplitRatio: 0.75,
      style: { color: '#334155' },
    });
    expect(state.interaction.selectedStructuredNodeIds).toEqual([
      state.structuredScene[0].id,
    ]);
    expect(state.contentSurface.reader.materialize().get('0,0')).toMatchObject({ char: '╭', color: '#334155' });
    expect(state.contentSurface.reader.materialize().get('4,1')).toMatchObject({ char: '┬', color: '#334155' });
    expect(state.contentSurface.reader.materialize().get('4,3')).toMatchObject({ char: '┴', color: '#334155' });
  });

  it('deletes a selected structured split box split line without deleting the node', () => {
    useEditorStore.getState().createCanvasSession('structured');
    setCanvasTestState({ brushColor: '#334155' });

    useEditorStore.getState().commitStructuredShape('splitBox', { x: 0, y: 0 }, { x: 10, y: 4 });

    const splitBox = useEditorStore.getState().structuredScene[0];
    expect(splitBox.type).toBe('splitBox');
    if (splitBox.type !== 'splitBox') return;

    canvasCommands.interaction.setSelectedStructuredSplitHandle({
      nodeId: splitBox.id,
      handle: 'split:split-middle',
    });
    canvasCommands.selection.delete();

    const state = useEditorStore.getState();
    expect(state.structuredScene).toHaveLength(1);
    expect(state.structuredScene[0].type).toBe('splitBox');
    expect(state.interaction.selectedStructuredSplitHandle).toBeNull();
    const nextSplitBox = state.structuredScene[0];
    if (nextSplitBox.type !== 'splitBox') return;
    expect(getStructuredSplitBoxHandleAtPoint(nextSplitBox, { x: 4, y: 2 })).toBeNull();
  });

  it('splits a structured split box leaf from the context menu action', () => {
    useEditorStore.getState().createCanvasSession('structured');
    setCanvasTestState({ brushColor: '#334155' });

    useEditorStore.getState().commitStructuredShape('splitBox', { x: 0, y: 0 }, { x: 10, y: 8 });

    const splitBox = useEditorStore.getState().structuredScene[0];
    expect(splitBox.type).toBe('splitBox');
    if (splitBox.type !== 'splitBox') return;

    canvasCommands.interaction.setSelectedStructuredNodeIds([splitBox.id]);
    canvasCommands.interaction.setStructuredContextPoint({ x: 2, y: 4 });
    const result = editorRuntime.commands.execute('structured-split-horizontal', {
      source: 'context-menu',
    }, 'context-menu');

    expect(result.status).toBe('succeeded');
    const nextSplitBox = useEditorStore.getState().structuredScene[0];
    expect(nextSplitBox.type).toBe('splitBox');
    if (nextSplitBox.type !== 'splitBox') return;
    expect(getStructuredSplitBoxGuides(nextSplitBox).handles).toHaveLength(4);
    expect(useEditorStore.getState().interaction.selectedStructuredNodeIds).toEqual([splitBox.id]);
  });

  it('fills freeform background rectangles without erasing existing cells', () => {
    setCanvasTestState({
      canvasMode: 'freeform',
      brushColor: '#ef4444',
      brushBackgroundColor: '#334155',
    });
    applyFreeformSnapshotToYMaps([['1,1', { char: 'A', color: '#ffffff', attrs: { bold: true } }]]);

    canvasCommands.grid.updateScratchForShape('bg', { x: 0, y: 0 }, { x: 1, y: 1 });
    canvasCommands.grid.commitScratch();

    const grid = useEditorStore.getState().contentSurface.reader.materialize();
    expect(grid.get('0,0')).toEqual({
      char: ' ',
      color: '#000000',
      bgColor: '#334155',
    });
    expect(grid.get('1,1')).toEqual({
      char: 'A',
      color: '#ffffff',
      bgColor: '#334155',
      attrs: { bold: true },
    });
  });

  it('preserves target backgrounds and uncovered tail cells on plain paste', async () => {
    setCanvasTestState({
      canvasMode: 'freeform',
      brushColor: '#ffffff',
      textCursor: null,
    });
    applyFreeformSnapshotToYMaps(
      Array.from(' 3:35').map((char, x) => [
        `${x},0`,
        {
          char,
          color: x === 0 ? '#ffffff' : '#808080',
          bgColor: '#000000',
        },
      ])
    );
    canvasCommands.staticGrid.appendSelectionRange({
      start: { x: 0, y: 0 },
      end: { x: 4, y: 0 },
    });

    await canvasCommands.selection.paste({
      eventDataTransfer: {
        getData: (type: string) => (type === 'text/plain' ? 'Spot' : ''),
      } as unknown as DataTransfer,
    });

    expect(
      Array.from({ length: 5 }, (_, x) => useEditorStore.getState().contentSurface.reader.materialize().get(`${x},0`))
    ).toEqual(
      Array.from('Spot5').map((char, x) => ({
        char,
        color: x === 4 ? '#808080' : '#ffffff',
        bgColor: '#000000',
      }))
    );
  });

  it('anchors a one-cell plain paste at the selection top-left', async () => {
    setCanvasTestState({
      canvasMode: 'freeform',
      brushColor: '#ffffff',
      textCursor: null,
    });
    applyFreeformSnapshotToYMaps([
      ['0,0', { char: 'A', color: '#111111', bgColor: '#000000' }],
      ['1,0', { char: 'B', color: '#222222', bgColor: '#0000ff' }],
    ]);
    canvasCommands.staticGrid.appendSelectionRange({
      start: { x: 0, y: 0 },
      end: { x: 1, y: 0 },
    });

    await canvasCommands.selection.paste({
      eventDataTransfer: {
        getData: (type: string) => (type === 'text/plain' ? 'X' : ''),
      } as unknown as DataTransfer,
    });

    expect(useEditorStore.getState().contentSurface.reader.materialize()).toEqual(
      new Map([
        ['0,0', { char: 'X', color: '#ffffff', bgColor: '#000000' }],
        ['1,0', { char: 'B', color: '#222222', bgColor: '#0000ff' }],
      ])
    );
  });

  it('pastes every plain-text row from the same nonzero anchor column', async () => {
    setCanvasTestState({
      canvasMode: 'freeform',
      brushColor: '#ffffff',
      textCursor: { x: 20, y: 4 },
    });
    applyFreeformSnapshotToYMaps(
      Array.from('existing').map((char, x) => [
        `${x},4`,
        { char, color: '#808080' },
      ])
    );
    await canvasCommands.selection.paste({
      eventDataTransfer: {
        getData: (type: string) => (type === 'text/plain' ? 'AB\nCD' : ''),
      } as unknown as DataTransfer,
    });

    const state = useEditorStore.getState();
    expect(state.contentSurface.reader.materialize().get('20,4')).toEqual({ char: 'A', color: '#ffffff' });
    expect(state.contentSurface.reader.materialize().get('21,4')).toEqual({ char: 'B', color: '#ffffff' });
    expect(state.contentSurface.reader.materialize().get('20,5')).toEqual({ char: 'C', color: '#ffffff' });
    expect(state.contentSurface.reader.materialize().get('21,5')).toEqual({ char: 'D', color: '#ffffff' });
    expect(state.contentSurface.reader.materialize().get('0,5')).toBeUndefined();
    expect(state.interaction).toMatchObject({
      textCursor: null,
      staticGridEditMode: 'navigate',
      staticGridInputFlow: null,
      staticGridSelection: {
        mode: 'range',
        activeCell: { x: 20, y: 4 },
        primaryRange: {
          start: { x: 20, y: 4 },
          end: { x: 21, y: 5 },
        },
      },
    });
  });

  it('inherits target backgrounds for ANSI cells without an explicit background', async () => {
    setCanvasTestState({
      canvasMode: 'freeform',
      brushColor: '#ffffff',
      textCursor: { x: 0, y: 0 },
    });
    applyFreeformSnapshotToYMaps([
      ['0,0', { char: 'A', color: '#ffffff', bgColor: '#000000' }],
      ['1,0', { char: 'B', color: '#ffffff', bgColor: '#000000' }],
    ]);

    await canvasCommands.selection.paste({
      eventDataTransfer: {
        getData: (type: string) => (type === 'text/plain' ? '[91mA[44mB[m' : ''),
      } as unknown as DataTransfer,
    });

    expect(useEditorStore.getState().contentSurface.reader.materialize()).toEqual(
      new Map([
        ['0,0', { char: 'A', color: '#ff0000', bgColor: '#000000' }],
        ['1,0', { char: 'B', color: '#ff0000', bgColor: '#000080' }],
      ])
    );
  });

  it('copies the complete ANSI payload immediately after pasting it', async () => {
    setCanvasTestState({
      canvasMode: 'freeform',
      textCursor: { x: 0, y: 0 },
    });

    await canvasCommands.selection.paste({
      eventDataTransfer: {
        getData: (type: string) =>
          type === 'text/plain' ? '[101m CapabilitySearch [m' : '',
      } as unknown as DataTransfer,
    });

    expect(useEditorStore.getState().interaction).toMatchObject({
      textCursor: null,
      staticGridEditMode: 'navigate',
      staticGridSelection: {
        mode: 'range',
        activeCell: { x: 0, y: 0 },
        primaryRange: {
          start: { x: 0, y: 0 },
          end: { x: 17, y: 0 },
        },
      },
    });

    const capture = createClipboardEventCapture();
    await canvasCommands.selection.copy({ event: capture.event });
    const rich = JSON.parse(
      capture.data.get('web application/x-ascii-metropolis') ?? '{}'
    );
    expect(rich.cells).toHaveLength(18);
    expect(rich.cells.map((cell: { char: string }) => cell.char).join('')).toBe(
      ' CapabilitySearch '
    );
    expect(
      rich.cells.every((cell: { bgColor?: string }) => cell.bgColor === '#ff0000')
    ).toBe(true);
  });

  it('formats selected structured text ranges', () => {
    useEditorStore.getState().createCanvasSession('structured');
    useEditorStore.getState().applyStructuredScene(
      [
        {
          id: 'text-1',
          type: 'text',
          order: 1,
          position: { x: 1, y: 2 },
          text: 'Label',
          style: { color: '#ffffff' },
        },
        {
          id: 'text-2',
          type: 'text',
          order: 2,
          position: { x: 1, y: 4 },
          text: 'Value',
          style: { color: '#ffffff', attrs: { italic: true } },
        },
      ],
      false
    );

    canvasCommands.interaction.setSelectedStructuredNodeIds(['text-1']);
    canvasCommands.interaction.setEditingStructuredTextNodeId('text-1');
    canvasCommands.interaction.setStructuredTextSelection({
      nodeId: 'text-1',
      anchor: 1,
      focus: 4,
    });
    useEditorStore.getState().setStructuredTextAttributes({
      bold: true,
      italic: false,
      underline: true,
    });
    useEditorStore.getState().setStructuredTextBackgroundColor('#123456');

    expect(useEditorStore.getState().structuredScene).toMatchObject([
      {
        id: 'text-1',
        styleRanges: [
          {
            start: 1,
            end: 4,
            style: {
              bgColor: '#123456',
              attrs: { bold: true, underline: true },
            },
          },
        ],
      },
      {
        id: 'text-2',
        style: { color: '#ffffff', attrs: { italic: true } },
      },
    ]);

    useEditorStore.getState().setStructuredTextAttributes({
      bold: false,
      underline: false,
    });
    useEditorStore.getState().setStructuredTextBackgroundColor(null);

    expect(useEditorStore.getState().structuredScene[0]).toMatchObject({
      id: 'text-1',
      style: { color: '#ffffff' },
    });
    const formattedNode = useEditorStore.getState().structuredScene[0];
    expect(formattedNode.type).toBe('text');
    if (formattedNode.type === 'text') {
      expect(formattedNode.styleRanges).toBeUndefined();
    }
  });

  it('colors selected structured text ranges without changing text content', () => {
    useEditorStore.getState().createCanvasSession('structured');
    useEditorStore.getState().applyStructuredScene(
      [
        {
          id: 'text-1',
          type: 'text',
          order: 1,
          position: { x: 1, y: 2 },
          text: 'Label',
          style: { color: '#ffffff' },
          styleRanges: [
            {
              start: 1,
              end: 4,
              style: { attrs: { bold: true }, bgColor: '#111111' },
            },
          ],
        },
      ],
      false
    );

    canvasCommands.interaction.setStructuredTextSelection({
      nodeId: 'text-1',
      anchor: 1,
      focus: 4,
    });
    useEditorStore.getState().setStructuredTextColor('#ef4444');
    useEditorStore.getState().setStructuredTextColor('#22c55e');

    expect(useEditorStore.getState().structuredScene[0]).toMatchObject({
      id: 'text-1',
      text: 'Label',
      styleRanges: [
        {
          start: 1,
          end: 4,
          style: {
            color: '#22c55e',
            bgColor: '#111111',
            attrs: { bold: true },
          },
        },
      ],
    });
  });

  it('does not format mixed structured selections', () => {
    useEditorStore.getState().createCanvasSession('structured');
    useEditorStore.getState().applyStructuredScene(
      [
        {
          id: 'text-1',
          type: 'text',
          order: 1,
          position: { x: 1, y: 2 },
          text: 'Label',
          style: { color: '#ffffff' },
        },
        {
          id: 'box-1',
          type: 'box',
          order: 2,
          start: { x: 0, y: 0 },
          end: { x: 4, y: 4 },
          style: { color: '#ffffff' },
        },
      ],
      false
    );

    canvasCommands.interaction.setSelectedStructuredNodeIds(['text-1', 'box-1']);
    useEditorStore.getState().setStructuredTextAttributes({ bold: true });
    useEditorStore.getState().setStructuredTextBackgroundColor('#123456');

    expect(useEditorStore.getState().structuredScene[0]).toMatchObject({
      id: 'text-1',
      style: { color: '#ffffff' },
    });
    expect(useEditorStore.getState().structuredScene[0].style.attrs).toBeUndefined();
    expect(useEditorStore.getState().structuredScene[0].style.bgColor).toBeUndefined();
  });

  it('colors selected structured shape chars without changing text or bg nodes', () => {
    useEditorStore.getState().createCanvasSession('structured');
    useEditorStore.getState().applyStructuredScene(
      [
        {
          id: 'box-1',
          type: 'box',
          order: 1,
          start: { x: 0, y: 0 },
          end: { x: 4, y: 4 },
          style: { color: '#ffffff' },
        },
        {
          id: 'split-1',
          type: 'splitBox',
          order: 2,
          start: { x: 6, y: 0 },
          end: { x: 12, y: 4 },
          verticalSplitRatio: 0.5,
          topSplitRatio: 0.25,
          bottomSplitRatio: 0.75,
          root: { type: 'leaf', id: 'leaf-1' },
          style: { color: '#ffffff' },
        },
        {
          id: 'line-1',
          type: 'line',
          order: 3,
          start: { x: 0, y: 6 },
          end: { x: 8, y: 6 },
          axis: 'horizontal',
          style: { color: '#ffffff' },
        },
        {
          id: 'text-1',
          type: 'text',
          order: 4,
          position: { x: 0, y: 8 },
          text: 'Label',
          style: { color: '#ffffff' },
        },
        {
          id: 'bg-1',
          type: 'bg',
          order: 5,
          start: { x: 0, y: 10 },
          end: { x: 4, y: 10 },
          style: { color: '#000000', bgColor: '#ffffff' },
        },
      ],
      false
    );

    canvasCommands.interaction.setSelectedStructuredNodeIds([
      'box-1',
      'split-1',
      'line-1',
      'text-1',
      'bg-1',
    ]);
    useEditorStore.getState().setStructuredNodeCharColor('#22c55e');

    expect(useEditorStore.getState().structuredScene).toMatchObject([
      { id: 'box-1', style: { color: '#22c55e' } },
      { id: 'split-1', style: { color: '#22c55e' } },
      { id: 'line-1', style: { color: '#22c55e' } },
      { id: 'text-1', style: { color: '#ffffff' } },
      { id: 'bg-1', style: { color: '#000000', bgColor: '#ffffff' } },
    ]);
  });

  it('fills selected structured text ranges with the brush character', () => {
    useEditorStore.getState().createCanvasSession('structured');
    useEditorStore.getState().applyStructuredScene(
      [
        {
          id: 'text-1',
          type: 'text',
          order: 1,
          position: { x: 1, y: 2 },
          text: 'Label',
          style: { color: '#ffffff' },
          styleRanges: [
            {
              start: 1,
              end: 4,
              style: { attrs: { bold: true } },
            },
          ],
        },
      ],
      false
    );

    canvasCommands.interaction.setStructuredTextSelection({
      nodeId: 'text-1',
      anchor: 1,
      focus: 4,
    });
    useEditorStore.getState().fillStructuredTextSelectionWithChar('#');

    expect(useEditorStore.getState().structuredScene[0]).toMatchObject({
      id: 'text-1',
      text: 'L###l',
      styleRanges: [
        {
          start: 1,
          end: 4,
          style: { attrs: { bold: true } },
        },
      ],
    });
  });

  it('copies selected structured text as plain text and rich text fragment', async () => {
    useEditorStore.getState().createCanvasSession('structured');
    useEditorStore.getState().applyStructuredScene(
      [
        {
          id: 'text-1',
          type: 'text',
          order: 1,
          position: { x: 1, y: 2 },
          text: 'Hello',
          style: { color: '#000000' },
          styleRanges: [
            {
              start: 1,
              end: 4,
              style: { color: '#ef4444', attrs: { bold: true } },
            },
          ],
        },
      ],
      false
    );
    canvasCommands.interaction.setEditingStructuredTextNodeId('text-1');
    canvasCommands.interaction.setStructuredTextSelection({
      nodeId: 'text-1',
      anchor: 1,
      focus: 4,
    });

    const capture = createClipboardEventCapture();
    await canvasCommands.selection.copy({ event: capture.event });

    expect(capture.data.get('text/plain')).toBe('ell');
    const rich = JSON.parse(capture.data.get('web application/x-ascii-metropolis') ?? '{}');
    expect(rich.structuredText).toMatchObject({
      text: 'ell',
      style: { color: '#000000' },
      styleRanges: [
        {
          start: 0,
          end: 3,
          style: { color: '#ef4444', attrs: { bold: true } },
        },
      ],
    });
    expect(rich.structuredNodes).toEqual([]);
  });

  it('replaces selected structured text when pasting plain text', async () => {
    useEditorStore.getState().createCanvasSession('structured');
    useEditorStore.getState().applyStructuredScene(
      [
        {
          id: 'text-1',
          type: 'text',
          order: 1,
          position: { x: 1, y: 2 },
          text: 'Hello',
          style: { color: '#000000' },
        },
      ],
      false
    );
    canvasCommands.interaction.setEditingStructuredTextNodeId('text-1');
    canvasCommands.interaction.setTextCursor({ x: 2, y: 2 });
    canvasCommands.interaction.setStructuredTextSelection({
      nodeId: 'text-1',
      anchor: 1,
      focus: 4,
    });

    await canvasCommands.selection.paste({
      eventDataTransfer: {
        getData: (type: string) => (type === 'text/plain' ? 'X' : ''),
      } as unknown as DataTransfer,
    });

    expect(useEditorStore.getState().structuredScene[0]).toMatchObject({
      id: 'text-1',
      text: 'HXo',
    });
    expect(useEditorStore.getState().interaction.textCursor).toEqual({ x: 3, y: 2 });
    expect(useEditorStore.getState().interaction.structuredTextSelection).toBeNull();
  });

  it('creates structured text when pasting external plain text into focused structured canvas', async () => {
    useEditorStore.getState().createCanvasSession('structured');
    canvasCommands.interaction.setStructuredGridFocus({ x: 4, y: 5 });

    await canvasCommands.selection.paste({
      eventDataTransfer: {
        getData: (type: string) => (type === 'text/plain' ? 'A\nB' : ''),
      } as unknown as DataTransfer,
    });

    expect(useEditorStore.getState().structuredScene).toHaveLength(1);
    expect(useEditorStore.getState().structuredScene[0]).toMatchObject({
      type: 'text',
      position: { x: 4, y: 5 },
      text: 'A\nB',
    });
    expect(useEditorStore.getState().contentSurface.reader.materialize().get('4,5')).toMatchObject({
      char: 'A',
    });
    expect(useEditorStore.getState().contentSurface.reader.materialize().get('4,6')).toMatchObject({
      char: 'B',
    });
  });

  it('creates styled structured text when pasting ANSI text into structured canvas', async () => {
    useEditorStore.getState().createCanvasSession('structured');
    canvasCommands.interaction.setStructuredGridFocus({ x: 2, y: 3 });

    await canvasCommands.selection.paste({
      eventDataTransfer: {
        getData: (type: string) => (type === 'text/plain' ? '[38;2;239;68;68mHi[0m' : ''),
      } as unknown as DataTransfer,
    });

    const node = useEditorStore.getState().structuredScene[0];
    expect(node).toMatchObject({
      type: 'text',
      position: { x: 2, y: 3 },
      text: 'Hi',
      styleRanges: [{ start: 0, end: 2, style: { color: '#ef4444' } }],
    });
  });

  it('creates structured text from free canvas rich cells when pasted into structured canvas', async () => {
    useEditorStore.getState().createCanvasSession('structured');
    canvasCommands.interaction.setStructuredGridFocus({ x: 1, y: 1 });

    await canvasCommands.selection.paste({
      eventDataTransfer: {
        getData: (type: string) =>
          type === 'web application/x-ascii-metropolis'
            ? JSON.stringify({
                type: 'ascii-metropolis-zone',
                version: 1,
                cells: [
                  { x: 0, y: 0, char: 'A', color: '#111111' },
                  {
                    x: 2,
                    y: 0,
                    char: 'B',
                    color: '#222222',
                    attrs: { bold: true },
                  },
                ],
              })
            : '',
      } as unknown as DataTransfer,
    });

    expect(useEditorStore.getState().structuredScene).toHaveLength(1);
    expect(useEditorStore.getState().structuredScene[0]).toMatchObject({
      type: 'text',
      position: { x: 1, y: 1 },
      text: 'A B',
      styleRanges: [
        { start: 0, end: 1, style: { color: '#111111' } },
        { start: 2, end: 3, style: { color: '#222222', attrs: { bold: true } } },
      ],
    });
  });

  it('cuts selected structured text instead of cutting structured nodes', async () => {
    useEditorStore.getState().createCanvasSession('structured');
    useEditorStore.getState().applyStructuredScene(
      [
        {
          id: 'text-1',
          type: 'text',
          order: 1,
          position: { x: 1, y: 2 },
          text: 'Hello',
          style: { color: '#000000' },
        },
      ],
      false
    );
    canvasCommands.interaction.setSelectedStructuredNodeIds(['text-1']);
    canvasCommands.interaction.setEditingStructuredTextNodeId('text-1');
    canvasCommands.interaction.setStructuredTextSelection({
      nodeId: 'text-1',
      anchor: 1,
      focus: 4,
    });

    const capture = createClipboardEventCapture();
    await canvasCommands.selection.cut({ event: capture.event });

    expect(capture.data.get('text/plain')).toBe('ell');
    expect(useEditorStore.getState().structuredScene).toHaveLength(1);
    expect(useEditorStore.getState().structuredScene[0]).toMatchObject({
      id: 'text-1',
      text: 'Ho',
    });
  });

  it('cuts a selected structured subtree as one undoable history step', async () => {
    useEditorStore.getState().createCanvasSession('structured');
    useEditorStore.getState().applyStructuredScene(
      [
        {
          id: 'parent-box',
          type: 'box',
          order: 1,
          start: { x: 0, y: 0 },
          end: { x: 10, y: 6 },
          style: { color: '#ffffff' },
        },
        {
          id: 'child-text',
          type: 'text',
          order: 2,
          position: { x: 2, y: 2 },
          text: 'Child',
          style: { color: '#ffffff' },
        },
        {
          id: 'unrelated-box',
          type: 'box',
          order: 3,
          start: { x: 20, y: 0 },
          end: { x: 24, y: 3 },
          style: { color: '#ffffff' },
        },
      ],
      false
    );
    canvasCommands.interaction.setSelectedStructuredNodeIds(['parent-box']);
    canvasCommands.interaction.setSelectedStructuredBoxId('parent-box');
    const capture = createClipboardEventCapture();

    await expect(canvasCommands.selection.cut({ event: capture.event })).resolves.toEqual(
      { status: 'applied', changed: true }
    );

    const rich = JSON.parse(capture.data.get('web application/x-ascii-metropolis') ?? '{}');
    expect(rich.structuredNodes.map((node: { id: string }) => node.id)).toEqual([
      'parent-box',
      'child-text',
    ]);
    expect(useEditorStore.getState().structuredScene.map((node) => node.id)).toEqual([
      'unrelated-box',
    ]);
    expect(useEditorStore.getState().interaction).toMatchObject({
      selectedStructuredNodeIds: [],
      selectedStructuredBoxId: null,
    });

    expect(undoCanvas()).toBe(true);
    expect(useEditorStore.getState().structuredScene.map((node) => node.id)).toEqual([
      'parent-box',
      'child-text',
      'unrelated-box',
    ]);
    expect(redoCanvas()).toBe(true);
    expect(useEditorStore.getState().structuredScene.map((node) => node.id)).toEqual([
      'unrelated-box',
    ]);

    canvasCommands.interaction.setStructuredGridFocus({ x: 30, y: 10 });
    await canvasCommands.selection.paste({
      eventDataTransfer: dataTransferFromCapture(capture.data),
    });
    const pasted = useEditorStore
      .getState()
      .structuredScene.filter((node) => node.id !== 'unrelated-box');
    expect(pasted.map((node) => node.type)).toEqual(['box', 'text']);
    expect(pasted.map((node) => node.id)).not.toContain('parent-box');
    expect(pasted.map((node) => node.id)).not.toContain('child-text');
  });

  it('keeps structured nodes when the clipboard write fails', async () => {
    useEditorStore.getState().createCanvasSession('structured');
    useEditorStore.getState().applyStructuredScene(
      [
        {
          id: 'box-failure',
          type: 'box',
          order: 1,
          start: { x: 0, y: 0 },
          end: { x: 4, y: 3 },
          style: { color: '#ffffff' },
        },
      ],
      false
    );
    canvasCommands.interaction.setSelectedStructuredNodeIds(['box-failure']);
    const canUndoBeforeCut = useEditorStore.getState().canUndo;
    vi.stubGlobal('ClipboardItem', undefined);
    vi.spyOn(clipboard, 'writeText').mockResolvedValue(false);

    await expect(canvasCommands.selection.cut()).resolves.toEqual({
      status: 'failed',
      reason: 'clipboard-failed',
    });
    expect(useEditorStore.getState().structuredScene.map((node) => node.id)).toEqual([
      'box-failure',
    ]);
    expect(useEditorStore.getState().canUndo).toBe(canUndoBeforeCut);
  });

  it('does not delete a new structured target after an asynchronous clipboard write', async () => {
    useEditorStore.getState().createCanvasSession('structured');
    useEditorStore.getState().applyStructuredScene(
      [
        {
          id: 'box-original',
          type: 'box',
          order: 1,
          start: { x: 0, y: 0 },
          end: { x: 4, y: 3 },
          style: { color: '#ffffff' },
        },
        {
          id: 'box-next',
          type: 'box',
          order: 2,
          start: { x: 8, y: 0 },
          end: { x: 12, y: 3 },
          style: { color: '#ffffff' },
        },
      ],
      false
    );
    canvasCommands.interaction.setSelectedStructuredNodeIds(['box-original']);
    const canUndoBeforeCut = useEditorStore.getState().canUndo;
    vi.stubGlobal('ClipboardItem', undefined);
    let resolveWrite!: (value: boolean) => void;
    vi.spyOn(clipboard, 'writeText').mockImplementation(
      () => new Promise((resolve) => (resolveWrite = resolve))
    );

    const pendingCut = canvasCommands.selection.cut();
    canvasCommands.interaction.setSelectedStructuredNodeIds(['box-next']);
    resolveWrite(true);

    await expect(pendingCut).resolves.toEqual({
      status: 'failed',
      reason: 'stale-target',
    });
    expect(useEditorStore.getState().structuredScene.map((node) => node.id)).toEqual([
      'box-original',
      'box-next',
    ]);
    expect(useEditorStore.getState().canUndo).toBe(canUndoBeforeCut);
  });
});
