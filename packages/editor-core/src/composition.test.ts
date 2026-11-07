import { expect, test } from 'vitest';
import * as Y from 'yjs';
import { CanvasDocumentRegistry } from './CanvasDocumentRegistry.js';
import { FreeformEditorSession } from './runtime.js';
import { EditorStateNode } from './editor/stateNode.js';

const patch = (text: string) => ({
  rows: [{ y: 0, erase: [], spans: [{ x: 0, text, color: '#000000' }] }],
});

test('extensions start against seeded content and their startup edits remain unsaved', () => {
  let seeded = '';
  const session = new FreeformEditorSession('A', {
    extensions: [
      {
        id: 'startup',
        setup: (editor) => {
          seeded = editor.getState().reader.getCell({ x: 0, y: 0 })?.char ?? '';
        },
      },
    ],
  });
  try {
    expect(seeded).toBe('A');
    expect(session.dirty).toBe(false);
  } finally {
    session.dispose();
  }
  const documents = new CanvasDocumentRegistry('shared');
  const edited = new FreeformEditorSession('', {
    documents,
    extensions: [
      {
        id: 'startup-write',
        setup: () => {
          documents.applyCellPlanePatchAt(documents.getActiveAddress(), patch('B'), 'save');
        },
      },
    ],
  });
  try {
    expect(edited.dirty).toBe(true);
    expect(edited.plane.getCell({ x: 0, y: 0 })?.char).toBe('B');
  } finally {
    edited.dispose();
    documents.dispose();
  }
});

test('injected documents retain their content, history and caller-owned lifetime', () => {
  const documents = new CanvasDocumentRegistry('shared');
  documents.applyCellPlanePatchAt(documents.getActiveAddress(), patch('界'), 'save');
  let starts = 0,
    stops = 0;
  const session = new FreeformEditorSession('', {
    documents,
    extensions: [
      {
        id: 'host-feature',
        setup: () => {
          starts++;
          return () => {
            stops++;
          };
        },
        commands: [
          {
            id: 'host.inspect',
            execute: (_, { state }) => ({
              handled: true,
              status: 'succeeded',
              data: state.address,
            }),
          },
        ],
      },
    ],
  });
  try {
    expect(session.plane.getCell({ x: 0, y: 0 })?.char).toBe('界');
    expect(session.canUndo).toBe(true);
    expect(session.dirty).toBe(false);
    expect(session.editor.commands.execute('host.inspect', undefined, 'test')).toMatchObject({
      status: 'succeeded',
      data: documents.getActiveAddress(),
    });
    expect(starts).toBe(1);
    session.dispose();
    session.dispose();
    expect(stops).toBe(1);
    expect(documents.undo()).toBe(true);
    expect(documents.getContentReader().materialize().size).toBe(0);
  } finally {
    session.dispose();
    documents.dispose();
  }
});

test('initial addresses are validated without clearing an injected registry', () => {
  const documents = new CanvasDocumentRegistry('first');
  const first = documents.getActiveAddress();
  documents.activateDocument('second', { grid: [] });
  const session = new FreeformEditorSession('', { documents, address: first });
  try {
    expect(session.getSnapshot().address).toEqual(first);
    expect(
      () =>
        new FreeformEditorSession('', {
          documents,
          address: { documentId: 'missing', pageId: 'missing' },
        })
    ).toThrow('does not exist');
    expect(() => new FreeformEditorSession('seed', { documents })).toThrow('cannot be combined');
    expect(documents.getActiveAddress()).toEqual(first);
  } finally {
    session.dispose();
    documents.dispose();
  }
});

test('contributed tools activate through the Session and failed setup releases earlier features', () => {
  const documents = new CanvasDocumentRegistry('shared');
  let stopped = 0;
  expect(
    () =>
      new FreeformEditorSession('', {
        documents,
        extensions: [
          {
            id: 'first',
            setup: () => () => {
              stopped++;
            },
          },
          {
            id: 'failed',
            setup: () => {
              throw new Error('setup failed');
            },
          },
        ],
      })
  ).toThrow('setup failed');
  expect(stopped).toBe(1);
  let moves = 0;
  const session = new FreeformEditorSession('', {
    documents,
    extensions: [
      {
        id: 'tool',
        tools: [
          {
            id: 'inspect',
            create: (editor, parent) =>
              new (class extends EditorStateNode<ReturnType<FreeformEditorSession['getSnapshot']>> {
                onEvent() {
                  moves++;
                  return true;
                }
              })(editor, 'inspect', parent),
          },
        ],
      },
    ],
  });
  try {
    expect(session.setTool('inspect')).toBe(true);
    expect(session.setTool('missing')).toBe(false);
    expect(session.currentTool).toBe('inspect');
    session.pointer({ phase: 'move', cell: { x: 1, y: 1 }, screen: { x: 1, y: 1 } });
    expect(moves).toBe(1);
    expect(session.plane.materialize().size).toBe(0);
    expect(session.setTool('pan')).toBe(true);
  } finally {
    session.dispose();
    documents.dispose();
  }
});

test('registry changes publish snapshots and external address changes cancel gestures', () => {
  const documents = new CanvasDocumentRegistry('first');
  const session = new FreeformEditorSession('', { documents });
  const seen: string[] = [];
  const detach = session.subscribe(() => seen.push(session.getSnapshot().address.documentId));
  try {
    documents.applyCellPlanePatchAt(documents.getActiveAddress(), patch('AB'), 'save');
    expect(seen.length).toBeGreaterThan(0);
    expect(session.dirty).toBe(true);
    session.pointer({ phase: 'down', cell: { x: 0, y: 0 }, screen: { x: 0, y: 0 } });
    documents.activateDocument('second', { grid: [] });
    expect(session.gestureState.type).toBe('idle');
    expect(session.selection).toBeNull();
    expect(session.cursor).toEqual({ x: 0, y: 0 });
    expect(seen.at(-1)).toBe('second');
    session.commands.insert('B');
    documents.activateDocument('first', { grid: [] });
    expect(session.plane.getCell({ x: 0, y: 0 })?.char).toBe('A');
    session.commands.undo();
    expect(session.dirty).toBe(false);
  } finally {
    detach();
    session.dispose();
    documents.dispose();
  }
});

test('remote Yjs changes refresh the session and dirty state without requiring a local command', () => {
  const documents = new CanvasDocumentRegistry('shared');
  const session = new FreeformEditorSession('', { documents });
  const remoteDoc = new Y.Doc();
  const remote = new CanvasDocumentRegistry('shared');
  const localDoc = documents.getCollaborationDocument('shared')!;
  Y.applyUpdate(remoteDoc, Y.encodeStateAsUpdate(localDoc));
  remote.adoptDocument('shared', remoteDoc);
  let notifications = 0;
  const detach = session.subscribe(() => {
    notifications++;
  });
  try {
    remote.applyCellPlanePatchAt(remote.getActiveAddress(), patch('界'), 'save');
    Y.applyUpdate(localDoc, Y.encodeStateAsUpdate(remoteDoc));
    expect(notifications).toBeGreaterThan(0);
    expect(session.plane.getCell({ x: 0, y: 0 })?.char).toBe('界');
    expect(session.dirty).toBe(true);
    session.markSaved();
    expect(session.dirty).toBe(false);
    session.dispose();
    const before = notifications;
    documents.applyCellPlanePatchAt(documents.getActiveAddress(), patch('X'), 'save');
    expect(notifications).toBe(before);
  } finally {
    detach();
    session.dispose();
    documents.dispose();
    remote.dispose();
  }
});
