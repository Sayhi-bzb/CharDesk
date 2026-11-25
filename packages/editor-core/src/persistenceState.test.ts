import { afterEach, expect, test, vi } from 'vitest';
import { DocumentSaveState, semanticDocumentSource, type ContentProof, type ContentVersion,
  type HistoryPosition, type SemanticContentId } from './persistenceState.js';
import type { CanvasDocumentDraft } from './canvasDocumentModel.js';
import { FreeformEditorSession } from './runtime.js';
import * as Y from 'yjs';
import { getCanvasDocumentRoot, readCanvasYPage } from './canvasDocumentModel.js';

afterEach(() => vi.useRealTimers());
const proof = (version: string, position = 'history', lineage = 'generation'): ContentProof => ({
  version: version as ContentVersion, position: position as HistoryPosition, lineage,
});
const semantic = (value: string) => value as SemanticContentId;
const patch = (text: string) => ({ rows: [{ y: 0, erase: [], spans: [{ x: 0, text, color: '#000000' }] }] });

test('semantic identity ignores view focus and insertion order, preserves authored document meaning', () => {
  const draft: CanvasDocumentDraft = { id: 'd', mode: 'freeform', activePageId: 'a', pages: [
    { id: 'a', kind: 'cell-plane', name: 'Main', size: { columns: 80, rows: 24 },
      anchors: [{ id: 'root', point: { x: 0, y: 0 }, label: 'Root', order: 0, parentId: null, detached: false }],
      grid: [['9,2', { char: 'Z', color: '#000000' }], ['0,0', { char: '界', color: '#ff0000', href: 'https://example.com' }]] },
    { id: 'b', kind: 'cell-plane', grid: [] },
  ] };
  const original = semanticDocumentSource(draft), view = structuredClone(draft);
  view.activePageId = 'b';
  view.id = 'different-runtime-id';
  view.pages[0]!.grid!.reverse();
  view.pages[0]!.size = { rows: 24, columns: 80 };
  view.pages[0]!.anchors = [{ detached: false, parentId: null, order: 0, label: 'Root',
    point: { y: 0, x: 0 }, id: 'root' }];
  expect(semanticDocumentSource(view)).toBe(original);
  for (const mutate of [
    (d: CanvasDocumentDraft) => { d.pages[0]!.grid![1]![1].color = '#00ff00'; },
    (d: CanvasDocumentDraft) => { d.pages[0]!.grid![1]![1].href = 'https://other.example'; },
    (d: CanvasDocumentDraft) => { d.pages[0]!.name = 'Renamed'; },
    (d: CanvasDocumentDraft) => { d.pages[0]!.size!.columns++; },
    (d: CanvasDocumentDraft) => { d.pages[0]!.anchors = [{ ...d.pages[0]!.anchors![0]!, label: 'Renamed anchor' }]; },
    (d: CanvasDocumentDraft) => { d.pages.reverse(); },
  ]) {
    const changed = structuredClone(draft);
    mutate(changed);
    expect(semanticDocumentSource(changed)).not.toBe(original);
  }
});

test('history clearing cannot make unrecorded content clean; semantic Undo equivalence survives history reset', () => {
  const model = new FreeformEditorSession();
  try {
    model.documents.applyCellPlanePatch(patch('A'));
    model.markSaved();
    model.documents.applyCellPlanePatch(patch('B'), 'none');
    model.documents.clearHistory();
    expect(model.dirty).toBe(true);
    model.documents.applyCellPlanePatch(patch('A'), 'none');
    expect(model.dirty).toBe(false);
    model.commands.insert('X');
    expect(model.dirty).toBe(true);
    model.commands.undo();
    expect(model.dirty).toBe(false);
  } finally { model.dispose(); }
});

test('document replacement and remote writes cannot reuse a saved history proof', () => {
  const model = new FreeformEditorSession();
  try {
    const address = model.documents.getActiveAddress();
    model.markSaved();
    const replacement = model.documents.getDocumentDraft()!;
    replacement.pages[0]!.grid = [['0,0', { char: 'B', color: '#000000' }]];
    model.documents.resetDocument(address.documentId, { ...replacement, grid: [] });
    expect(model.dirty).toBe(true);
    model.markSaved();
    const doc = model.documents.getCollaborationDocument(address.documentId)!;
    const peer = new Y.Doc();
    try {
      Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc));
      const page = readCanvasYPage(getCanvasDocumentRoot(peer), address.pageId)!;
      page.operations.delete(0, page.operations.length);
      Y.applyUpdate(doc, Y.encodeStateAsUpdate(peer));
      expect(model.dirty).toBe(true);
    } finally { peer.destroy(); }
  } finally { model.dispose(); }
});

test('stale semantic completions cannot acknowledge newer content or a replaced baseline', async () => {
  vi.useFakeTimers();
  let current = proof('saved'), value = semantic('A'), resolve!: (value: SemanticContentId) => void;
  let blocked = false;
  const changed = vi.fn();
  const state = new DocumentSaveState({ proof: () => current, changed, capture: () => {
    const captured = value;
    return { ...current,
      semantic: blocked ? () => new Promise<SemanticContentId>((done) => { resolve = done; }) : () => captured,
    };
  } });
  state.acknowledge(state.capture());
  current = proof('captured', 'different'); blocked = true;
  expect(state.isDirty()).toBe(true);
  await vi.advanceTimersByTimeAsync(100);
  current = proof('latest', 'latest'); value = semantic('B'); blocked = false;
  resolve(semantic('A'));
  await vi.advanceTimersByTimeAsync(0);
  expect(changed).not.toHaveBeenCalled();
  expect(state.isDirty()).toBe(true);
  await vi.advanceTimersByTimeAsync(100);
  expect(changed).toHaveBeenCalledTimes(1);
  expect(state.isDirty()).toBe(true);
  state.acknowledge(state.capture());
  expect(state.isDirty()).toBe(false);
  state.dispose();
});

test('unknown and failed comparisons stay dirty; disposed bindings cannot publish completion', async () => {
  vi.useFakeTimers();
  let current = proof('saved');
  const changed = vi.fn(), dispose = vi.fn();
  const state = new DocumentSaveState({ proof: () => current, changed, dispose,
    capture: () => ({ ...current, semantic: () => { throw new Error('worker failed'); } }) });
  state.acknowledge({ ...current, semantic: () => semantic('A') });
  current = proof('changed', 'different');
  expect(state.isDirty()).toBe(true);
  await vi.advanceTimersByTimeAsync(100);
  expect(state.isDirty()).toBe(true);
  state.dispose(); state.dispose();
  await vi.advanceTimersByTimeAsync(200);
  expect(changed).not.toHaveBeenCalled();
  expect(dispose).toHaveBeenCalledTimes(1);
});
