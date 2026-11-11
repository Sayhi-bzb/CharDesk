import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasActivityMarker } from '@/shared/canvas-activity';
import { DEFAULT_CANVAS_CELL_METRICS } from '@/shared/fonts/canvas-profile';
import { setUiLanguage } from '@/shared/i18n';
import { CanvasActivityOverlay } from './CanvasActivityOverlay';

const mocks = vi.hoisted(() => ({
  markers: [] as CanvasActivityMarker[],
  acknowledge: vi.fn(), animateTo: vi.fn(),
  viewport: { offset: { x: 0, y: 0 }, zoom: 1 },
}));
vi.mock('@/shared/canvas-activity', () => ({
  useCanvasActivity: () => mocks.markers, acknowledgeCanvasActivity: mocks.acknowledge,
}));
vi.mock('@/domains/canvas/public', () => ({
  useCanvasRuntime: () => ({ documents: { getDocumentAddress: () => ({ pageId: 'page-a' }) } }),
  useCanvasState: (select: (state: unknown) => unknown) => select({ activeCanvasId: 'canvas-a' }),
  useCanvasViewport: () => mocks.viewport,
}));
vi.mock('@/widgets/canvas-editor/engine/CanvasWorkspace', () => ({
  useCanvasLiveViewportOptional: () => mocks.viewport,
  useCanvasViewOptional: () => ({
    sessionId: 'canvas-a', isActive: true, loadState: 'idle', containerSize: { width: 500, height: 300 },
    runtime: { camera: { animateTo: mocks.animateTo } },
  }),
}));
const marker = (from = 0, to = 4): CanvasActivityMarker => ({
  id: 'region', canvasId: 'canvas-a', pageId: 'page-a', changes: ['write-a'], ranges: [{ y: 0, from, to }],
});

beforeEach(() => {
  vi.useFakeTimers();
  setUiLanguage('en');
  mocks.markers = [marker()];
  mocks.viewport = { offset: { x: 0, y: 0 }, zoom: 1 };
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});
afterEach(() => {
  cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.clearAllMocks();
});

describe('Canvas update presentation', () => {
  it('uses a transient highlight for visible updates, with no persistent dot', () => {
    const { container } = render(<CanvasActivityOverlay />);
    expect(container.querySelector('[data-canvas-activity="highlight"]')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1199));
    expect(mocks.acknowledge).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(mocks.acknowledge).toHaveBeenCalledWith(mocks.markers[0], [{ y: 0, from: 0, to: 4 }]);
  });

  it('presents a single navigation entry for sparse offscreen updates and waits for observation after clicking', () => {
    mocks.markers = [{ ...marker(1000, 1002), ranges: [{ y: 0, from: 1000, to: 1002 }, { y: 1000, from: -1000, to: -998 }] }];
    render(<CanvasActivityOverlay />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    const update = screen.getByRole('button', { name: 'View next update' });
    expect(update).toHaveTextContent('');
    fireEvent.mouseEnter(update);
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(update).not.toHaveAttribute('title');
    fireEvent.click(update);
    expect(mocks.animateTo).toHaveBeenCalledOnce();
    expect(mocks.acknowledge).not.toHaveBeenCalled();
  });

  it('pauses observation while unfocused and requires a fresh stable interval after focus', () => {
    render(<CanvasActivityOverlay />);
    act(() => vi.advanceTimersByTime(1000));
    fireEvent.blur(window);
    act(() => vi.advanceTimersByTime(3000));
    expect(mocks.acknowledge).not.toHaveBeenCalled();
    fireEvent.focus(window);
    act(() => vi.advanceTimersByTime(1200));
    expect(mocks.acknowledge).toHaveBeenCalledOnce();
  });

  it('restarts observation when panning and acknowledges only fully visible Cells', () => {
    mocks.markers = [marker(0, 1000)];
    const { rerender } = render(<CanvasActivityOverlay />);
    act(() => vi.advanceTimersByTime(1000));
    mocks.viewport = { ...mocks.viewport, offset: { x: -2.2 * DEFAULT_CANVAS_CELL_METRICS.cellWidth, y: 0 } };
    rerender(<CanvasActivityOverlay />);
    act(() => vi.advanceTimersByTime(200));
    expect(mocks.acknowledge).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1000));
    const observed = mocks.acknowledge.mock.calls[0][1];
    expect(observed[0].from).toBe(3);
    expect(observed[0].to).toBeLessThan(1000);
  });

  it('does not observe hidden tabs and renders localized update navigation', () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    setUiLanguage('zh');
    mocks.markers = [{ ...marker(), ranges: [...marker().ranges, { y: 0, from: 1000, to: 1002 }] }];
    render(<CanvasActivityOverlay />);
    expect(screen.getByRole('button', { name: '查看下一处更新' })).toHaveTextContent('');
    act(() => vi.advanceTimersByTime(3000));
    expect(mocks.acknowledge).not.toHaveBeenCalled();
  });
});
