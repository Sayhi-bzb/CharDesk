import { act, fireEvent, render, screen } from '@testing-library/react';
import { TestCanvasContentSurface } from '@/domains/canvas/testing';
import { afterEach, describe, expect, it } from 'vitest';
import {
  canvasCommands,
  defaultCanvasDocuments,
  setCanvasTestState,
  useEditorStore,
} from '@/domains/canvas/testing';
import {
  CanvasViewProvider,
  CanvasWorkspaceProvider,
  useCanvasViewOptional,
  type CanvasViewId,
} from '../engine/CanvasWorkspace';
import { useCanvasEditorModels } from './useCanvasEditorModels';

function ModelHarness({ viewId }: { viewId: CanvasViewId }) {
  const view = useCanvasViewOptional();
  const models = useCanvasEditorModels();
  if (!view) return null;
  const chars = Array.from(models.renderer.contentReader.materialize().values()).map((cell) => cell.char).join('');
  return (
    <div>
      <output data-testid={`${viewId}-model`}>
        {models.renderer.activeCanvasId}:{models.renderer.canvasMode}:{chars}:
        {models.renderer.structuredScene.length}:{models.renderer.selectedStructuredNodeIds.length}
      </output>
      <button type="button" onClick={() => view.selectSession('canvas-b')}>
        {`select-${viewId}-b`}
      </button>
      <button type="button" onClick={() => view.selectSession('canvas-c')}>
        {`select-${viewId}-c`}
      </button>
      <button type="button" onClick={view.activate}>{`activate-${viewId}`}</button>
    </div>
  );
}

function RevisionHarness() {
  const { renderer } = useCanvasEditorModels();
  return (
    <output data-testid="active-content">
      {renderer.contentRevision}:{renderer.contentReader.get({ x: 0, y: 0 })?.char ?? ""}
    </output>
  );
}

describe('useCanvasEditorModels session binding', () => {
  const initialState = useEditorStore.getState();

  afterEach(() => {
    localStorage.clear();
    useEditorStore.setState(initialState, true);
  });

  it('publishes a new model revision when a stable Reader changes', () => {
    canvasCommands.grid.replace([]);
    const initialRevision = useEditorStore.getState().contentSurface.revision;
    render(<RevisionHarness />);

    act(() => {
      canvasCommands.interaction.setTextCursor({ x: 0, y: 0 });
      canvasCommands.text.write('A');
    });

    expect(screen.getByTestId('active-content')).toHaveTextContent(':A');
    expect(useEditorStore.getState().contentSurface.revision).toBeGreaterThan(
      initialRevision
    );
  });

  it('renders inactive structured and slide sessions from the document registry', () => {
    act(() => {
      defaultCanvasDocuments.activateDocument('canvas-a', {
        mode: 'freeform',
        grid: [['0,0', { char: 'A', color: '#000000' }]],
        scene: [],
        components: [],
      });
      defaultCanvasDocuments.activateDocument('canvas-b', {
        grid: [],
        scene: [{
          id: 'text-b',
          type: 'text',
          order: 0,
          position: { x: 0, y: 0 },
          text: 'B',
          style: { color: '#000000' },
        }],
        components: [],
      });
      defaultCanvasDocuments.activateDocument(
        'canvas-c',
        {
          mode: 'slide',
          activePageId: 'slide-c',
          pages: [{
            id: 'slide-c',
            kind: 'cell-plane',
            grid: [['0,0', { char: 'C', color: '#000000' }]],
          }],
          grid: [],
          scene: [],
          components: [],
        }
      );
      setCanvasTestState({
        activeCanvasId: 'canvas-a',
        canvasMode: 'freeform',
        contentSurface: new TestCanvasContentSurface([['0,0', { char: 'A', color: '#000000' }]]),
        selectedStructuredNodeIds: ['global-selection'],
        canvasSessions: [
          {
            id: 'canvas-a',
            name: 'Alpha',
            mode: 'freeform',
          },
          {
            id: 'canvas-b',
            name: 'Beta',
            mode: 'structured',
          },
          {
            id: 'canvas-c',
            name: 'Slides',
            mode: 'slide',
          },
        ],
      });
    });

    render(
      <CanvasWorkspaceProvider>
        <CanvasViewProvider viewId="primary">
          <ModelHarness viewId="primary" />
        </CanvasViewProvider>
        <CanvasViewProvider viewId="secondary">
          <ModelHarness viewId="secondary" />
        </CanvasViewProvider>
      </CanvasWorkspaceProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'select-secondary-b' }));
    fireEvent.click(screen.getByRole('button', { name: 'activate-primary' }));
    expect(screen.getByTestId('secondary-model')).toHaveTextContent(
      'canvas-b:structured:B:1:0'
    );

    fireEvent.click(screen.getByRole('button', { name: 'select-secondary-c' }));
    fireEvent.click(screen.getByRole('button', { name: 'activate-primary' }));
    expect(screen.getByTestId('secondary-model')).toHaveTextContent(
      'canvas-c:slide:C:0:0'
    );
  });
});
