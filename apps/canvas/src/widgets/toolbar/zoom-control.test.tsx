import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  setCanvasTestState,
  testingCanvasRuntime,
  useEditorStore,
} from '@/domains/canvas/testing';
import { ZoomControl } from './zoom-control';
import { CanvasWorkspaceProvider } from '@/widgets/canvas-editor/engine/CanvasWorkspace';

let isMobile = false;
let reduceMotion = true;

vi.mock('@/shared/hooks/use-mobile', () => ({
  useIsMobile: () => isMobile,
}));

vi.mock('@/widgets/canvas-editor/Minimap', () => ({
  Minimap: ({ containerSize }: { containerSize?: { width: number; height: number } }) => (
    <div data-testid="mock-minimap">
      {containerSize ? `${containerSize.width}x${containerSize.height}` : 'no-size'}
    </div>
  ),
}));

beforeEach(() => {
  reduceMotion = true;
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: reduceMotion }))
  );
});

describe('ZoomControl', () => {
  const initialState = useEditorStore.getState();

  afterEach(() => {
    isMobile = false;
    cleanup();
    useEditorStore.setState(initialState, true);
    testingCanvasRuntime.viewport.resetFallback({ offset: { x: 0, y: 0 }, zoom: 1 });
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders a position-neutral compound control for the chrome slot', async () => {
    setCanvasTestState({ zoom: 1.256 });

    render(<ZoomControl containerSize={{ width: 1000, height: 700 }} />);

    const host = screen.getByTestId('zoom-control');
    const out = screen.getByTestId('zoom-out');
    const reset = screen.getByTestId('zoom-reset');
    const zoomIn = screen.getByTestId('zoom-in');
    const grid = screen.getByTestId('zoom-grid');
    const minimap = screen.getByTestId('zoom-minimap-toggle');

    expect(host).toHaveClass(
      'flex',
      'bg-host-surface',
      'border-0',
      'shadow-host'
    );
    expect(host).not.toHaveClass('fixed', 'absolute');
    expect(Array.from(host.children)).toEqual([out, reset, zoomIn, grid, minimap]);
    expect(out).toHaveClass('size-8', 'rounded-r-none');
    expect(reset).toHaveClass('h-8', 'w-12', 'rounded-none', 'tabular-nums');
    expect(reset).not.toHaveClass('min-w-14');
    expect(zoomIn).toHaveClass('size-8', 'rounded-none');
    expect(grid).toHaveClass('size-8', 'rounded-none');
    expect(minimap).toHaveClass('size-8', 'rounded-l-none');
    expect(reset).toHaveTextContent('126%');
    expect(reset).toHaveAttribute('aria-label', 'Reset to 100% — 126%');
    expect(reset).not.toHaveAttribute('title');
    fireEvent.focus(reset);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Reset to 100% — 126%');
    expect(screen.queryByTestId('zoom-menu-trigger')).not.toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('keeps the zoom number width fixed across the supported range', () => {
    setCanvasTestState({ zoom: 0.1 });
    render(<ZoomControl containerSize={{ width: 1000, height: 700 }} />);
    const reset = screen.getByTestId('zoom-reset');

    expect(reset).toHaveClass('w-12');
    expect(reset).toHaveTextContent('25%');

    act(() => setCanvasTestState({ zoom: 1 }));
    expect(reset).toHaveTextContent('100%');

    act(() => setCanvasTestState({ zoom: 5 }));
    expect(reset).toHaveTextContent('500%');
    expect(reset).toHaveClass('w-12');
  });

  it('replaces the minimap with play in slide mode', () => {
    setCanvasTestState({
      canvasMode: 'slide',
      slideDeck: {
        activeSlideId: 'slide-1',
        slides: [{ id: 'slide-1', name: 'First', size: { columns: 3, rows: 2 } }],
      },
    });

    render(<ZoomControl containerSize={{ width: 1000, height: 700 }} />);

    const host = screen.getByTestId('zoom-control');
    const play = screen.getByTestId('zoom-playback');
    expect(screen.queryByTestId('zoom-minimap-toggle')).not.toBeInTheDocument();
    expect(Array.from(host.children)).toEqual([
      screen.getByTestId('zoom-out'),
      screen.getByTestId('zoom-reset'),
      screen.getByTestId('zoom-in'),
      screen.getByTestId('zoom-grid'),
      play,
    ]);
    expect(play).toHaveAccessibleName('Play');
    expect(play).toHaveClass('size-8', 'rounded-l-none');
  });

  it('toggles the workspace grid and minimap from the viewport group', async () => {
    setCanvasTestState({ canvasMode: 'freeform', showGrid: true });
    render(<ZoomControl containerSize={{ width: 1000, height: 700 }} />);

    const grid = screen.getByTestId('zoom-grid');
    const minimap = screen.getByTestId('zoom-minimap-toggle');
    expect(grid).toHaveAttribute('aria-pressed', 'true');
    expect(grid).toHaveClass('bg-control-pressed-surface');
    fireEvent.click(grid);
    expect(useEditorStore.getState().showGrid).toBe(false);
    expect(grid).toHaveAttribute('aria-pressed', 'false');

    expect(minimap).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(minimap);
    expect(minimap).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByTestId('mock-minimap')).toHaveTextContent('1000x700');
    expect(screen.getByTestId('zoom-minimap')).toHaveClass(
      'absolute',
      'bottom-full',
      'left-0',
      'bg-host-surface',
      'border-0',
      'shadow-host'
    );
    fireEvent.click(minimap);
    expect(screen.queryByTestId('zoom-minimap')).not.toBeInTheDocument();
  });

  it('keeps split view out of the viewport group when a workspace is available', () => {
    render(
      <CanvasWorkspaceProvider>
        <ZoomControl containerSize={{ width: 1000, height: 700 }} />
      </CanvasWorkspaceProvider>
    );

    expect(screen.queryByTestId('zoom-split-view')).not.toBeInTheDocument();
    expect(screen.getByTestId('zoom-minimap-toggle')).toHaveClass('rounded-l-none');
  });

  it('zooms around the canvas center and resets directly when motion is reduced', () => {
    setCanvasTestState({
      canvasMode: 'freeform',
      zoom: 1,
      offset: { x: 10, y: 20 },
    });

    render(<ZoomControl containerSize={{ width: 1000, height: 700 }} />);
    fireEvent.click(screen.getByTestId('zoom-in'));

    expect(testingCanvasRuntime.viewport.getSnapshot().zoom).toBeCloseTo(1.2);
    expect(testingCanvasRuntime.viewport.getSnapshot().offset).toEqual({
      x: -88,
      y: -46,
    });
    fireEvent.click(screen.getByTestId('zoom-out'));
    expect(testingCanvasRuntime.viewport.getSnapshot().zoom).toBeCloseTo(1);
    expect(testingCanvasRuntime.viewport.getSnapshot().offset.x).toBeCloseTo(10);
    expect(testingCanvasRuntime.viewport.getSnapshot().offset.y).toBeCloseTo(20);

    fireEvent.click(screen.getByTestId('zoom-in'));
    fireEvent.click(screen.getByTestId('zoom-reset'));
    expect(testingCanvasRuntime.viewport.getSnapshot().zoom).toBeCloseTo(1);
    expect(testingCanvasRuntime.viewport.getSnapshot().offset.x).toBeCloseTo(10);
    expect(testingCanvasRuntime.viewport.getSnapshot().offset.y).toBeCloseTo(20);
  });


  it('disables directional actions at their limits', async () => {
    setCanvasTestState({ zoom: 5 });

    render(<ZoomControl containerSize={{ width: 1000, height: 700 }} />);
    expect(screen.getByTestId('zoom-in')).toBeDisabled();

    expect(screen.getByTestId('zoom-reset')).toBeEnabled();

    act(() => {
      setCanvasTestState({ zoom: 0.1 });
    });
    await waitFor(() => expect(screen.getByTestId('zoom-out')).toBeDisabled());
  });
  it('disables all actions until the container size is available', () => {
    render(<ZoomControl containerSize={undefined} />);

    expect(screen.getByTestId('zoom-out')).toBeDisabled();
    expect(screen.getByTestId('zoom-reset')).toBeDisabled();
    expect(screen.getByTestId('zoom-in')).toBeDisabled();
  });

  it('does not render on mobile', () => {
    render(
      <ZoomControl
        containerSize={{ width: 390, height: 844 }}
        formFactor="phone"
      />
    );

    expect(screen.queryByTestId('zoom-control')).not.toBeInTheDocument();
  });
});
