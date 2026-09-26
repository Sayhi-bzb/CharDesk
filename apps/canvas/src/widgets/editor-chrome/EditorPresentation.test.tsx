import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  EditorPresentationProvider,
  EditorWidget,
} from './EditorPresentation';
import { useEditorPresentation } from './EditorPresentationContext';

function ModeControl() {
  const { mode, setMode } = useEditorPresentation();
  return (
    <button type="button" onClick={() => setMode(mode === 'zen' ? 'standard' : 'zen')}>
      {mode}
    </button>
  );
}

describe('EditorPresentation', () => {
  it('keeps essential widgets and hides every chrome role in Zen Mode', () => {
    render(
      <EditorPresentationProvider>
        <ModeControl />
        <EditorWidget role="essential"><span>essential</span></EditorWidget>
        <EditorWidget role="host"><span>host</span></EditorWidget>
        <EditorWidget role="pane"><span>pane</span></EditorWidget>
        <EditorWidget role="contextual"><span>contextual</span></EditorWidget>
      </EditorPresentationProvider>
    );

    expect(screen.getByText('essential')).toBeInTheDocument();
    expect(screen.getByText('host')).toBeInTheDocument();
    expect(screen.getByText('pane')).toBeInTheDocument();
    expect(screen.getByText('contextual')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'standard' }));

    expect(screen.getByRole('button', { name: 'zen' })).toBeInTheDocument();
    expect(screen.getByText('essential')).toBeInTheDocument();
    expect(screen.queryByText('host')).not.toBeInTheDocument();
    expect(screen.queryByText('pane')).not.toBeInTheDocument();
    expect(screen.queryByText('contextual')).not.toBeInTheDocument();
  });

  it('defaults isolated widgets to standard presentation', () => {
    render(<EditorWidget role="contextual"><span>visible</span></EditorWidget>);
    expect(screen.getByText('visible')).toBeInTheDocument();
  });
});
