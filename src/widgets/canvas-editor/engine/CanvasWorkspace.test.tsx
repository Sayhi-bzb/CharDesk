import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TestCanvasContentSurface } from '@/domains/canvas/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canvasCommands,
  defaultCanvasDocuments,
  setCanvasTestState,
  testingCanvasRuntime,
  useEditorStore,
} from '@/domains/canvas/testing';
import {
  CanvasViewProvider,
  CanvasWorkspaceProvider,
  useCanvasLiveViewportOptional,
  useCanvasViewOptional,
  useCanvasWorkspace,
  type CanvasViewId,
} from './CanvasWorkspace';

function ViewHarness({ viewId }: { viewId: CanvasViewId }) {
  const view = useCanvasViewOptional();
  const liveViewport = useCanvasLiveViewportOptional();
  if (!view) return null;
  return (
    <div>
      <output data-testid={`${viewId}-viewport`}>
        {view.viewport.offset.x},{view.viewport.offset.y},{view.viewport.zoom}
      </output>
      <output data-testid={`${viewId}-live-viewport`}>
        {liveViewport?.offset.x},{liveViewport?.offset.y},{liveViewport?.zoom}
      </output>
      <output data-testid={`${viewId}-active`}>{String(view.isActive)}</output>
      <output data-testid={`${viewId}-session`}>{view.sessionId}</output>
      <button type="button" onClick={view.activate}>{`activate-${viewId}`}</button>
      <button type="button" onClick={() => view.selectSession('canvas-a')}>
        {`select-${viewId}-a`}
      </button>
      <button type="button" onClick={() => view.selectSession('canvas-b')}>
        {`select-${viewId}-b`}
      </button>
      <button type="button" onClick={() => view.runtime.camera.panBy(40, 20)}>
        {`pan-${viewId}`}
      </button>
      <button type="button" onClick={() => view.runtime.camera.queuePan(40, 20)}>
        {`queue-pan-${viewId}`}
      </button>
      {[400, 500, 600, 1000].map((width) => (
        <button
          key={width}
          type="button"
          onClick={() => view.setContainerSize({ width, height: 600 })}
        >
          {`size-${viewId}-${width}`}
        </button>
      ))}
    </div>
  );
}

function WorkspaceHarness() {
  const workspace = useCanvasWorkspace();
  return (
    <>
      <button type="button" onClick={() => workspace.setSplitEnabled(true)}>open-split</button>
      <button type="button" onClick={() => workspace.setSplitEnabled(false)}>close-split</button>
      <CanvasViewProvider viewId="primary">
        <ViewHarness viewId="primary" />
      </CanvasViewProvider>
      <CanvasViewProvider viewId="secondary">
        <ViewHarness viewId="secondary" />
      </CanvasViewProvider>
    </>
  );
}

describe('CanvasWorkspace', () => {
  const initialState = useEditorStore.getState();

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    localStorage.clear();
    useEditorStore.setState(initialState, true);
    testingCanvasRuntime.viewport.resetFallback({ offset: { x: 0, y: 0 }, zoom: 1 });
  });

  const setTwoSessions = () => {
    defaultCanvasDocuments.activateDocument('canvas-b', {
      mode: 'freeform',
      grid: [],
    });
    defaultCanvasDocuments.activateDocument('canvas-a', {
      mode: 'freeform',
      grid: [],
    });
    setCanvasTestState({
      activeCanvasId: 'canvas-a',
      canvasMode: 'freeform',
      contentSurface: new TestCanvasContentSurface(),
      offset: { x: 0, y: 0 },
      zoom: 1,
      canvasSessions: [
        { id: 'canvas-a', name: 'Alpha', mode: 'freeform' },
        { id: 'canvas-b', name: 'Beta', mode: 'freeform' },
      ],
    });
  };

  it('keeps pane cameras independent and mirrors only the active pane to the session', () => {
    setCanvasTestState({ offset: { x: 10, y: 15 }, zoom: 1 });
    render(
      <CanvasWorkspaceProvider>
        <WorkspaceHarness />
      </CanvasWorkspaceProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'open-split' }));
    fireEvent.click(screen.getByRole('button', { name: 'activate-secondary' }));
    fireEvent.click(screen.getByRole('button', { name: 'pan-secondary' }));

    expect(screen.getByTestId('primary-viewport')).toHaveTextContent('10,15,1');
    expect(screen.getByTestId('secondary-viewport')).toHaveTextContent('50,35,1');
    expect(screen.getByTestId('secondary-active')).toHaveTextContent('true');
    expect(testingCanvasRuntime.viewport.getSnapshot().offset).toEqual({ x: 50, y: 35 });
  });

  it('publishes transient camera movement live and commits it once settled', async () => {
    vi.useFakeTimers();
    render(
      <CanvasWorkspaceProvider>
        <WorkspaceHarness />
      </CanvasWorkspaceProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'queue-pan-primary' }));
    await act(() => vi.advanceTimersByTimeAsync(20));

    expect(screen.getByTestId('primary-live-viewport')).toHaveTextContent('40,20,1');
    expect(screen.getByTestId('primary-viewport')).toHaveTextContent('0,0,1');
    expect(testingCanvasRuntime.viewport.getSnapshot().offset).toEqual({ x: 0, y: 0 });

    await act(() => vi.advanceTimersByTimeAsync(120));

    expect(screen.getByTestId('primary-viewport')).toHaveTextContent('40,20,1');
    expect(testingCanvasRuntime.viewport.getSnapshot().offset).toEqual({ x: 40, y: 20 });
  });

  it('binds each pane to a session and switches the global editor with the active pane', () => {
    setTwoSessions();
    render(
      <CanvasWorkspaceProvider>
        <WorkspaceHarness />
      </CanvasWorkspaceProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'select-secondary-b' }));
    fireEvent.click(screen.getByRole('button', { name: 'pan-secondary' }));

    expect(screen.getByTestId('primary-session')).toHaveTextContent('canvas-a');
    expect(screen.getByTestId('secondary-session')).toHaveTextContent('canvas-b');
    expect(screen.getByTestId('secondary-active')).toHaveTextContent('true');
    expect(useEditorStore.getState().activeCanvasId).toBe('canvas-b');
    expect(testingCanvasRuntime.viewport.getSnapshot().offset).toEqual({ x: 40, y: 20 });

    fireEvent.click(screen.getByRole('button', { name: 'activate-primary' }));
    expect(useEditorStore.getState().activeCanvasId).toBe('canvas-a');
    expect(screen.getByTestId('secondary-viewport')).toHaveTextContent('40,20,1');
  });

  it('restores each canvas camera after an async session switch settles', async () => {
    defaultCanvasDocuments.activateDocument('canvas-b', {
      mode: 'freeform',
      grid: [],
    });
    defaultCanvasDocuments.activateDocument('canvas-a', {
      mode: 'freeform',
      grid: [],
    });
    setCanvasTestState({
      activeCanvasId: 'canvas-a',
      canvasMode: 'freeform',
      contentSurface: new TestCanvasContentSurface(),
      offset: { x: 10, y: 15 },
      zoom: 1,
      canvasSessions: [
        {
          id: 'canvas-a',
          name: 'Alpha',
          mode: 'freeform',
          viewport: { offset: { x: 10, y: 15 }, zoom: 1 },
        },
        {
          id: 'canvas-b',
          name: 'Beta',
          mode: 'freeform',
          viewport: { offset: { x: 100, y: 200 }, zoom: 2 },
        },
      ],
    });
    render(
      <CanvasWorkspaceProvider>
        <WorkspaceHarness />
      </CanvasWorkspaceProvider>
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'select-primary-b' }));
      await Promise.resolve();
    });
    expect(screen.getByTestId('primary-viewport')).toHaveTextContent('100,200,2');

    fireEvent.click(screen.getByRole('button', { name: 'pan-primary' }));
    expect(screen.getByTestId('primary-viewport')).toHaveTextContent('140,220,2');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'select-primary-a' }));
      await Promise.resolve();
    });
    expect(screen.getByTestId('primary-viewport')).toHaveTextContent('10,15,1');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'select-primary-b' }));
      await Promise.resolve();
    });
    expect(screen.getByTestId('primary-viewport')).toHaveTextContent('140,220,2');
  });

  it('preserves the same world center while split panes resize independently', () => {
    setCanvasTestState({ offset: { x: 10, y: 15 }, zoom: 2 });
    render(
      <CanvasWorkspaceProvider>
        <WorkspaceHarness />
      </CanvasWorkspaceProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'size-primary-1000' }));
    expect(screen.getByTestId('primary-viewport')).toHaveTextContent('10,15,2');

    fireEvent.click(screen.getByRole('button', { name: 'open-split' }));
    fireEvent.click(screen.getByRole('button', { name: 'size-primary-500' }));
    fireEvent.click(screen.getByRole('button', { name: 'size-secondary-500' }));
    expect(screen.getByTestId('primary-viewport')).toHaveTextContent('-240,15,2');
    expect(screen.getByTestId('secondary-viewport')).toHaveTextContent('-240,15,2');

    fireEvent.click(screen.getByRole('button', { name: 'activate-secondary' }));
    fireEvent.click(screen.getByRole('button', { name: 'size-primary-600' }));
    expect(screen.getByTestId('primary-viewport')).toHaveTextContent('-190,15,2');
    expect(testingCanvasRuntime.viewport.getSnapshot().offset).toEqual({ x: -240, y: 15 });

    fireEvent.click(screen.getByRole('button', { name: 'size-secondary-400' }));
    expect(screen.getByTestId('secondary-viewport')).toHaveTextContent('-290,15,2');
    expect(testingCanvasRuntime.viewport.getSnapshot().offset).toEqual({ x: -290, y: 15 });
  });

  it('keeps session bindings and cameras when split view closes and reopens', () => {
    setTwoSessions();
    render(
      <CanvasWorkspaceProvider>
        <WorkspaceHarness />
      </CanvasWorkspaceProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'open-split' }));
    fireEvent.click(screen.getByRole('button', { name: 'select-secondary-b' }));
    fireEvent.click(screen.getByRole('button', { name: 'pan-secondary' }));
    fireEvent.click(screen.getByRole('button', { name: 'close-split' }));
    fireEvent.click(screen.getByRole('button', { name: 'open-split' }));

    expect(screen.getByTestId('primary-session')).toHaveTextContent('canvas-a');
    expect(screen.getByTestId('secondary-session')).toHaveTextContent('canvas-b');
    expect(screen.getByTestId('secondary-viewport')).toHaveTextContent('40,20,1');
    expect(screen.getByTestId('secondary-active')).toHaveTextContent('true');
    expect(testingCanvasRuntime.viewport.getSnapshot().offset).toEqual({ x: 40, y: 20 });
  });

  it('rebinds only the active pane for external switches and repairs deleted bindings', async () => {
    setTwoSessions();
    render(
      <CanvasWorkspaceProvider>
        <WorkspaceHarness />
      </CanvasWorkspaceProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'select-secondary-b' }));
    fireEvent.click(screen.getByRole('button', { name: 'activate-primary' }));
    await act(() => canvasCommands.sessions.switch('canvas-b'));

    expect(screen.getByTestId('primary-session')).toHaveTextContent('canvas-b');
    expect(screen.getByTestId('secondary-session')).toHaveTextContent('canvas-b');

    await act(() => canvasCommands.sessions.remove('canvas-b'));
    expect(screen.getByTestId('primary-session')).toHaveTextContent('canvas-a');
    expect(screen.getByTestId('secondary-session')).toHaveTextContent('canvas-a');
  });

});
