import { describe, expect, it } from 'vitest';
import { CanvasActivityStore } from './model';
import { nextActivityTarget, visibleActivityRanges } from './viewport';

const range = (from = 0, to = 10, y = 0) => ({ y, from, to });
const host = () => {
  let now = 1000, sequence = 0;
  const store = new CanvasActivityStore({ now: () => now, id: () => `event-${sequence++}` });
  const write = (ranges = [range()], agent = true, pageId = 'page-a', canvasId = 'canvas-a', deletion = false) =>
    store.record({ kind: 'mutation', ranges, agent, pageId, canvasId, deletion });
  return { store, write, advance: (ms: number) => { now += ms; store.refresh(); } };
};

describe('Canvas activity regions', () => {
  it('aggregates hundreds of writes, retaining sparse footprints rather than a giant bounding rectangle', () => {
    const { store, write } = host();
    for (let i = 0; i < 600; i++) write([range(i % 2 ? 1000 : 0, i % 2 ? 1002 : 2)]);
    expect(store.getSnapshot()).toMatchObject([{ ranges: [range(0, 2), range(1000, 1002)] }]);
    expect(store.getJournal().events.length).toBeLessThanOrEqual(512);
  });

  it('subtracts partial deletion and removes all hints after bulk deletion', () => {
    const { store, write } = host();
    write();
    write([range(3, 7)], false);
    expect(store.getSnapshot()[0].ranges).toEqual([range(0, 3), range(7, 10)]);
    write([range(-10, 100)], false);
    expect(store.getSnapshot()).toEqual([]);
  });

  it('keeps separate Canvas/page addresses isolated', () => {
    const { store, write } = host();
    write(); write([range()], true, 'page-b'); write([range()], true, 'page-a', 'canvas-b');
    store.record({ kind: 'clear', canvasId: 'canvas-a', pageId: 'page-a' });
    expect(store.getSnapshot().map((m) => [m.canvasId, m.pageId])).toEqual([
      ['canvas-a', 'page-b'], ['canvas-b', 'page-a'],
    ]);
    store.record({ kind: 'clear', canvasId: 'canvas-a' });
    expect(store.getSnapshot()).toHaveLength(1);
  });

  it('acknowledges only the observed footprint and revision, preserving subsequent writes', () => {
    const { store, write } = host();
    write();
    const changes = store.getSnapshot()[0].changes;
    write([range(8, 10)]);
    store.record({ kind: 'seen', changes, ranges: [range()] });
    expect(store.getSnapshot()[0].ranges).toEqual([range(8, 10)]);
  });

  it('replays delayed cross-tab publications before their deletion or acknowledgement', () => {
    const { store, write } = host();
    const publication = write();
    const seen = store.record({ kind: 'seen', changes: [publication.id], ranges: [range()] });
    const tab = new CanvasActivityStore({ now: () => 1000 });
    tab.merge({ events: [seen] });
    tab.merge({ events: [publication] });
    expect(tab.getSnapshot()).toEqual([]);
    const deletion = write([range()], false);
    const otherTab = new CanvasActivityStore({ now: () => 1000 });
    otherTab.merge({ events: [deletion] });
    otherTab.merge({ events: [publication] });
    expect(otherTab.getSnapshot()).toEqual([]);
  });

  it('does not resurrect deleted updates after storage restore or duplicate messages', () => {
    const { store, write } = host();
    const old = write();
    write([range()], false);
    const restored = new CanvasActivityStore({ now: () => 1000 });
    restored.merge(JSON.parse(JSON.stringify(store.getJournal())));
    restored.merge({ events: [old, old] });
    expect(restored.getSnapshot()).toEqual([]);
  });

  it('rejects delayed events below the retained journal floor', () => {
    const { store, write } = host();
    const old = write([range(100, 102)]);
    for (let i = 0; i < 520; i++) write();
    store.merge({ events: [old] });
    expect(store.getSnapshot()[0].ranges).toEqual([range()]);
  });

  it('expires deletion feedback without waiting for reload', () => {
    const { store, write, advance } = host();
    write();
    write([range()], true, 'page-a', 'canvas-a', true);
    expect(store.getSnapshot()).toHaveLength(1);
    advance(15_001);
    expect(store.getSnapshot()).toEqual([]);
  });

  it('expires ordinary updates and ignores malformed storage/messages', () => {
    const { store, write, advance } = host();
    write();
    store.merge({ events: [{ kind: 'mutation', ranges: 'bad' }] });
    store.merge({ events: [{ ...store.getJournal().events[0], ranges: [range(4, 2)] }] });
    expect(store.getSnapshot()).toHaveLength(1);
    advance(8 * 24 * 60 * 60 * 1000);
    expect(store.getSnapshot()).toEqual([]);
  });
});

describe('observing updates', () => {
  it('acknowledges only fully visible Cells, not an entire partially visible region', () => {
    expect(visibleActivityRanges([range(0, 100), range(0, 100, 1)], {
      left: 0.2, right: 10.8, top: -0.1, bottom: 1.2,
    })).toEqual([range(1, 10)]);
  });

  it('navigates to a real offscreen Cell in a sparse update', () => {
    const target = nextActivityTarget([range(0, 2), range(1000, 1002)], { left: -1, right: 10, top: -1, bottom: 10 });
    expect(target).toEqual({ x: 1000.5, y: 0.5 });
    expect(nextActivityTarget([range(0, 2)], { left: -1, right: 10, top: -1, bottom: 10 })).toBeUndefined();
  });
});
