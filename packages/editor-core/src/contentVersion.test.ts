import { afterEach, expect, test } from 'vitest';
import * as Y from 'yjs';
import { CanvasDocumentRegistry } from './CanvasDocumentRegistry.js';
import { FreeformEditorSession } from './runtime.js';
import { getCanvasDocumentRoot, readCanvasYPage } from './canvasDocumentModel.js';

const disposables: Array<{ dispose(): void }> = [];
afterEach(() =>
  disposables
    .splice(0)
    .reverse()
    .forEach((value) => value.dispose())
);
const session = () => {
  const model = new FreeformEditorSession();
  disposables.push(model);
  return model;
};
const patch = (text: string) => ({
  rows: [{ y: 0, erase: [], spans: [{ x: 0, text, color: '#000000' }] }],
});

test('content versions advance for merged typing, undo and redo, independently of history maintenance', () => {
  const model = session(),
    registry = model.documents;
  const versions = [registry.getContentVersion()];
  model.commands.insert('A');
  versions.push(registry.getContentVersion());
  model.commands.insert('界');
  versions.push(registry.getContentVersion());
  model.commands.undo();
  versions.push(registry.getContentVersion());
  model.commands.redo();
  versions.push(registry.getContentVersion());
  expect(new Set(versions).size).toBe(versions.length);
  registry.finishHistoryCapture();
  model.markSaved();
  registry.clearHistory();
  expect(registry.getContentVersion()).toBe(versions.at(-1));
});

test('views, selection, tools, empty transactions and active page metadata do not change content versions', () => {
  const model = session(),
    registry = model.documents;
  const version = registry.getContentVersion();
  model.pan(10, 20);
  model.commands.pointAt({ x: 3, y: 4 });
  model.setTool('pan');
  const doc = registry.getCollaborationDocument(registry.getActiveDocumentId())!;
  doc.transact(() => {});
  doc.getMap('document-meta').set('activePageId', registry.getActivePageId());
  expect(registry.getContentVersion()).toBe(version);
});

test('inactive documents and pages have independent content clocks and publish addressed changes', () => {
  const model = session(),
    registry = model.documents;
  const first = registry.getActiveAddress();
  registry.ensurePage(first.documentId, { id: 'other-page', kind: 'cell-plane' });
  registry.activateDocument('second', { grid: [] });
  const firstVersion = registry.getContentVersion(first.documentId);
  const secondVersion = registry.getContentVersion('second');
  const changes: unknown[] = [];
  const unsubscribe = registry.subscribeContent((change) => changes.push(change));
  registry.applyCellPlanePatchAt({ ...first, pageId: 'other-page' }, patch('界🦀'));
  expect(registry.getContentVersion(first.documentId)).not.toBe(firstVersion);
  expect(registry.getContentVersion('second')).toBe(secondVersion);
  expect(changes).toEqual([
    { documentId: first.documentId, version: registry.getContentVersion(first.documentId) },
  ]);
  unsubscribe();
  registry.applyCellPlanePatchAt(first, patch('later'));
  expect(changes).toHaveLength(1);
});

test('remote updates and Yjs deletion advance the content version even when the state vector is unchanged', () => {
  const model = session(),
    registry = model.documents;
  const address = registry.getActiveAddress();
  registry.applyCellPlanePatchAt(address, patch('A'));
  const doc = registry.getCollaborationDocument(address.documentId)!;
  const remote = new Y.Doc();
  Y.applyUpdate(remote, Y.encodeStateAsUpdate(doc));
  const page = readCanvasYPage(getCanvasDocumentRoot(remote), address.pageId)!;
  const vector = Y.encodeStateVector(remote);
  page.operations.delete(0, page.operations.length);
  expect(Y.encodeStateVector(remote)).toEqual(vector);
  const before = registry.getContentVersion();
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(remote));
  expect(registry.getContentVersion()).not.toBe(before);
  expect(model.plane.getCell({ x: 0, y: 0 })).toBeUndefined();
  remote.destroy();
});

test('observers see the new version and complete cells, and captured snapshots survive later edits', () => {
  const model = session(),
    registry = model.documents;
  registry.applyCellPlanePatch(patch('A界🦀'));
  const snapshot = registry.captureContentAt(registry.getActiveAddress());
  try {
    const seen: Array<{ version: string; char?: string }> = [];
    const detach = registry.subscribeContent(({ version }) => {
      expect(registry.getContentVersion()).toBe(version);
      seen.push({ version, char: model.plane.getCell({ x: 0, y: 0 })?.char });
    });
    model.apply(patch('B'));
    expect(seen).toEqual([{ version: registry.getContentVersion(), char: 'B' }]);
    expect(snapshot.reader.getCell({ x: 0, y: 0 })?.char).toBe('A');
    expect(snapshot.reader.getCell({ x: 1, y: 0 })?.char).toBe('界');
    expect(snapshot.reader.getCell({ x: 3, y: 0 })?.char).toBe('🦀');
    expect(snapshot.version).not.toBe(registry.getContentVersion());
    detach();
  } finally {
    snapshot.dispose();
  }
});

test('page metadata and anchors invalidate content, and reopening never reuses a prior version', () => {
  const model = session(),
    registry = model.documents;
  registry.applyCellPlanePatch(patch('A'));
  const before = registry.getContentVersion();
  registry.addAnchorAt(registry.getActiveAddress(), { x: 0, y: 0 }, 'Heading');
  expect(registry.getContentVersion()).not.toBe(before);
  const version = registry.getContentVersion();
  const doc = registry.getCollaborationDocument(registry.getActiveDocumentId())!;
  doc.getMap('document-meta').set('mode', 'slide');
  expect(registry.getContentVersion()).not.toBe(version);
  const reopened = new CanvasDocumentRegistry(registry.getActiveDocumentId());
  disposables.push(reopened);
  expect(reopened.getContentVersion()).not.toBe(registry.getContentVersion());
});

test('compound undo and redo publish one final document snapshot and one native Yjs transaction', () => {
  const model = session(),
    registry = model.documents;
  const checkpoint = registry.beginHistoryCheckpoint('compound');
  model.commands.insert('A');
  model.commands.insert('B');
  checkpoint.commit();
  const snapshots: string[] = [];
  let nativeUpdates = 0;
  const doc = registry.getCollaborationDocument(registry.getActiveDocumentId())!;
  doc.on('update', () => {
    nativeUpdates++;
  });
  const detach = registry.subscribeContent(() =>
    snapshots.push([...model.plane.materialize().values()].map((cell) => cell.char).join(''))
  );
  model.commands.undo();
  expect(snapshots).toEqual(['']);
  expect(nativeUpdates).toBe(1);
  model.commands.redo();
  expect(snapshots).toEqual(['', 'AB']);
  expect(nativeUpdates).toBe(2);
  detach();
});

test('a subscriber edit after an agent commit cannot join or be rolled back with the agent history group', () => {
  const model = session(),
    registry = model.documents;
  let entered = false;
  const detach = registry.subscribeContent(() => {
    if (entered) return;
    entered = true;
    model.commands.pointAt({ x: 10, y: 0 });
    model.commands.insert('H');
  });
  registry.commitContentPatchAt(registry.getActiveAddress(), patch('A'), {
    baseVersion: registry.getContentVersion(),
    operationId: 'agent-operation',
  });
  detach();
  expect(model.plane.getCell({ x: 10, y: 0 })?.char).toBe('H');
  model.commands.undo();
  expect(model.plane.getCell({ x: 10, y: 0 })).toBeUndefined();
  expect(model.plane.getCell({ x: 0, y: 0 })?.char).toBe('A');
  expect(registry.undoOperation('agent-operation')).toBe(true);
  expect(model.plane.materialize().size).toBe(0);
});
