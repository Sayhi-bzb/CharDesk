import { describe, expect, it, vi } from 'vitest';
import { CanvasEdgeScroll, canEdgeScroll, type EdgeScrollSession } from './edgeScroll.js';

function fixture() {
  let callback: ((timestamp: number) => void) | undefined;
  const scheduler = {
    request: vi.fn((tick: (timestamp: number) => void) => {
      callback = tick;
    }),
    cancel: vi.fn(() => {
      callback = undefined;
    }),
  };
  const pan = vi.fn();
  const scroll = new CanvasEdgeScroll(scheduler, pan);
  const session: EdgeScrollSession = {
    clientPoint: { x: 100, y: 50 },
    getBounds: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    isEnabled: () => true,
    onCameraMove: vi.fn(),
  };
  const run = (time: number) => {
    const next = callback;
    callback = undefined;
    next?.(time);
  };
  return { scroll, pan, scheduler, session, run, pending: () => callback };
}

describe('shared canvas edge scrolling', () => {
  it('delays, accelerates and clamps elapsed time after a suspended frame', () => {
    const f = fixture();
    f.scroll.update(f.session);
    f.run(0);
    f.run(250);
    expect(f.pan).not.toHaveBeenCalled();
    f.run(400);
    expect(f.pan).toHaveBeenLastCalledWith(11.52, 0);
    f.run(100_000);
    expect(f.pan).toHaveBeenLastCalledWith(23.04, 0);
    expect(f.session.onCameraMove).toHaveBeenCalledTimes(2);
  });
  it('has no directional bias in a small viewport and supports corners', () => {
    const f = fixture();
    f.session.getBounds = () => ({ left: 10, top: 20, width: 20, height: 10 });
    f.session.clientPoint = { x: 20, y: 25 };
    expect(f.scroll.update(f.session)).toBe(false);
    expect(f.pending()).toBeUndefined();
    f.session.clientPoint = { x: 10, y: 20 };
    f.scroll.update(f.session);
    f.run(0);
    f.run(600);
    expect(f.pan).toHaveBeenLastCalledWith(-23.04, -23.04);
  });
  it('resets dwell time when the pointer leaves and reenters the edge', () => {
    const f = fixture();
    f.scroll.update(f.session);
    f.run(0);
    f.run(600);
    f.scroll.update({ ...f.session, clientPoint: { x: 50, y: 50 } });
    expect(f.pending()).toBeUndefined();
    f.scroll.update(f.session);
    f.run(1000);
    f.run(1250);
    expect(f.pan).toHaveBeenCalledTimes(1);
    f.run(1400);
    expect(f.pan).toHaveBeenCalledTimes(2);
  });
  it('rejects stale scheduled callbacks after stop/restart and disposal', () => {
    const f = fixture();
    f.scroll.update(f.session);
    const old = f.pending()!;
    f.scroll.stop();
    f.scroll.update(f.session);
    old(1000);
    expect(f.scheduler.request).toHaveBeenCalledTimes(2);
    f.run(0);
    f.run(600);
    const pending = f.pending()!;
    f.scroll.dispose();
    pending(900);
    f.scroll.update(f.session);
    expect(f.pan).toHaveBeenCalledTimes(1);
    expect(f.pending()).toBeUndefined();
  });
  it('does not replay or reschedule if pan cancels the session', () => {
    const f = fixture();
    f.pan.mockImplementation(() => f.scroll.stop());
    f.scroll.update(f.session);
    f.run(0);
    f.run(600);
    expect(f.pan).toHaveBeenCalledOnce();
    expect(f.session.onCameraMove).not.toHaveBeenCalled();
    expect(f.pending()).toBeUndefined();
  });
  it('stops when a live eligibility predicate changes', () => {
    const f = fixture();
    f.scroll.update(f.session);
    f.run(0);
    f.session.isEnabled = () => false;
    f.run(600);
    expect(f.pan).not.toHaveBeenCalled();
    expect(f.pending()).toBeUndefined();
  });
  it('ignores missing, empty or nonfinite bounds and points', () => {
    const f = fixture();
    for (const bounds of [
      null,
      { left: 0, top: 0, width: 0, height: 10 },
      { left: NaN, top: 0, width: 10, height: 10 },
    ]) {
      expect(f.scroll.update({ ...f.session, getBounds: () => bounds })).toBe(false);
    }
    expect(f.scroll.update({ ...f.session, clientPoint: { x: Infinity, y: 0 } })).toBe(false);
    expect(f.pending()).toBeUndefined();
  });
  it('supports host-specific units and axis speeds without changing delay policy', () => {
    const f = fixture();
    const scroll = new CanvasEdgeScroll(f.scheduler, f.pan, {
      distance: { x: 2, y: 2 },
      maxSpeed: { x: 24, y: 12 },
    });
    scroll.update({ ...f.session, clientPoint: { x: 100, y: 100 } });
    f.run(0);
    f.run(250);
    expect(f.pan).not.toHaveBeenCalled();
    f.run(600);
    expect(f.pan).toHaveBeenLastCalledWith(0.768, 0.384);
  });
  it('only allows selecting and moving an established range', () => {
    expect(canEdgeScroll({ type: 'idle' })).toBe(false);
    expect(canEdgeScroll({ type: 'selecting' } as never)).toBe(true);
    expect(canEdgeScroll({ type: 'movingRange' } as never)).toBe(true);
    for (const type of ['panning', 'rangeMovePending', 'drawing', 'shapePreview'])
      expect(canEdgeScroll({ type } as never)).toBe(false);
  });
});
