import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { CanvasTemplatePlacementProvider, useCanvasTemplatePlacement } from './CanvasTemplatePlacement';

let sessionId = 'first';
vi.mock('@/domains/canvas/public', async (original) => ({
  ...await original<typeof import('@/domains/canvas/public')>(),
  useCanvasState: () => sessionId,
}));

const originalHitTest = document.elementsFromPoint;
const originalHasCapture = document.body.hasPointerCapture;
const originalSetCapture = document.body.setPointerCapture;
const originalReleaseCapture = document.body.releasePointerCapture;

function pointer(type: string, x = 40, y = 80, pointerId = 1) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  return event;
}

describe('CanvasTemplatePlacement', () => {
  beforeEach(() => {
    sessionId = 'first';
    document.body.hasPointerCapture = vi.fn(() => false);
    document.body.setPointerCapture = vi.fn();
    document.body.releasePointerCapture = vi.fn();
  });
  afterEach(() => {
    cleanup();
    document.elementsFromPoint = originalHitTest;
    document.body.hasPointerCapture = originalHasCapture;
    document.body.setPointerCapture = originalSetCapture;
    document.body.releasePointerCapture = originalReleaseCapture;
    vi.useRealTimers();
  });

  function setup(enabled = true) {
    const host = document.createElement('div');
    document.elementsFromPoint = vi.fn(() => [host]);
    const target = { element: () => host, enabled: () => enabled, preview: vi.fn(), clear: vi.fn(), place: vi.fn() };
    const hook = renderHook(useCanvasTemplatePlacement, { wrapper: CanvasTemplatePlacementProvider });
    act(() => { hook.result.current!.registerTarget(target); });
    return { ...hook, target, host };
  }

  it('routes tap placement once and blocks the underlying canvas gesture', () => {
    const { result, target } = setup();
    const close = vi.fn();
    act(() => result.current!.beginTap('button', close));
    expect(close).toHaveBeenCalledOnce();
    expect(result.current!.pending).toBe(true);
    const down = pointer('pointerdown');
    act(() => document.dispatchEvent(down));
    expect(down.defaultPrevented).toBe(true);
    expect(target.preview).toHaveBeenCalledWith('button', { x: 40, y: 80 });
    act(() => document.dispatchEvent(pointer('pointerup')));
    expect(target.place).toHaveBeenCalledExactlyOnceWith('button', { x: 40, y: 80 });
    expect(result.current!.pending).toBe(false);
    act(() => document.dispatchEvent(pointer('pointerup')));
    expect(target.place).toHaveBeenCalledOnce();
  });

  it('does not insert into a read-only target', () => {
    const { result, target } = setup(false);
    act(() => result.current!.beginTap('button', vi.fn()));
    act(() => document.dispatchEvent(pointer('pointerdown')));
    act(() => document.dispatchEvent(pointer('pointerup')));
    expect(target.place).not.toHaveBeenCalled();
    expect(result.current!.pending).toBe(false);
  });

  it('cancels on session changes and Escape without inserting', () => {
    const { result, rerender, target } = setup();
    act(() => result.current!.beginTap('button', vi.fn()));
    sessionId = 'second';
    rerender();
    expect(result.current!.pending).toBe(false);
    act(() => result.current!.beginTap('button', vi.fn()));
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(result.current!.pending).toBe(false);
    expect(target.place).not.toHaveBeenCalled();
  });

  it('long press captures on a persistent owner and cancellation leaves no artifact', () => {
    vi.useFakeTimers();
    const { result, target } = setup();
    const source = document.createElement('button');
    act(() => result.current!.beginPress('button', {
      pointerType: 'touch', pointerId: 1, clientX: 40, clientY: 80, currentTarget: source,
    } as unknown as ReactPointerEvent, () => source.remove()));
    act(() => vi.advanceTimersByTime(400));
    expect(document.body.setPointerCapture).toHaveBeenCalledWith(1);
    expect(result.current!.pending).toBe(true);
    const nativeMove = new Event('touchmove', { cancelable: true });
    source.dispatchEvent(nativeMove);
    expect(nativeMove.defaultPrevented).toBe(true);
    act(() => document.dispatchEvent(pointer('pointermove', 50, 90)));
    expect(target.preview).toHaveBeenCalledWith('button', { x: 50, y: 90 });
    act(() => document.dispatchEvent(pointer('pointercancel')));
    expect(result.current!.pending).toBe(false);
    expect(target.place).not.toHaveBeenCalled();
    const laterMove = new Event('touchmove', { cancelable: true });
    source.dispatchEvent(laterMove);
    expect(laterMove.defaultPrevented).toBe(false);
  });

  it('movement before the hold threshold preserves scrolling instead of starting a drag', () => {
    vi.useFakeTimers();
    const { result } = setup();
    const close = vi.fn();
    act(() => result.current!.beginPress('button', {
      pointerType: 'touch', pointerId: 1, clientX: 40, clientY: 80, currentTarget: document.createElement('button'),
    } as unknown as ReactPointerEvent, close));
    const move = pointer('pointermove', 40, 100);
    act(() => document.dispatchEvent(move));
    act(() => vi.advanceTimersByTime(400));
    act(() => result.current!.beginTap('button', close));
    expect(move.defaultPrevented).toBe(false);
    expect(result.current!.pending).toBe(false);
    expect(close).not.toHaveBeenCalled();
  });

  it('a second finger cancels the hold instead of arming a drag', () => {
    vi.useFakeTimers();
    const { result } = setup();
    const close = vi.fn();
    act(() => result.current!.beginPress('button', {
      pointerType: 'touch', pointerId: 1, clientX: 40, clientY: 80, currentTarget: document.createElement('button'),
    } as unknown as ReactPointerEvent, close));
    act(() => document.dispatchEvent(pointer('pointerdown', 50, 80, 2)));
    act(() => vi.advanceTimersByTime(400));
    expect(result.current!.pending).toBe(false);
    expect(close).not.toHaveBeenCalled();
    expect(document.body.setPointerCapture).not.toHaveBeenCalled();
  });
});
