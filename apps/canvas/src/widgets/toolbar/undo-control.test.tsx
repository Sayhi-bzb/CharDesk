import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { setCanvasTestState, useEditorStore } from '@/domains/canvas/testing';
import { UndoControl } from './undo-control';

describe('UndoControl', () => {
  const initialState = useEditorStore.getState();

  afterEach(() => {
    cleanup();
    useEditorStore.setState(initialState, true);
  });

  it('follows history availability and invokes the shared undo handler', () => {
    setCanvasTestState({ canUndo: false });
    const onUndo = vi.fn();
    render(<UndoControl enabled onUndo={onUndo} />);
    const button = screen.getByRole('button', { name: 'Undo' });
    expect(button).toBeDisabled();
    act(() => setCanvasTestState({ canUndo: true }));
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onUndo).toHaveBeenCalledTimes(1);
    act(() => setCanvasTestState({ canUndo: false }));
    expect(button).toBeDisabled();
    expect(button).not.toHaveAttribute('title');
  });

  it('does not allow undo when content mutation is unavailable', () => {
    setCanvasTestState({ canUndo: true });
    const onUndo = vi.fn();
    render(<UndoControl enabled={false} onUndo={onUndo} />);
    const button = screen.getByRole('button', { name: 'Undo' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onUndo).not.toHaveBeenCalled();
  });
});
