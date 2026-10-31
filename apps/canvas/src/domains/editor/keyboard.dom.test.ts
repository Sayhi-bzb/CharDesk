import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import { createElement } from 'react';
import { createKeyInput } from '@chardesk/keyboard';
import { getCanvasState } from '@/domains/canvas/testing';
import { createCanvasEditorRuntime } from './runtime';
import { EditorShortcutEngine, executeEditorKeymapInput, useEditorShortcutLayer } from './keyboard';
import { EditorProvider } from './react';
import { ShortcutProvider } from '@/shared/shortcuts/dispatcher';

describe('editor keymap execution', () => {
  it('clears a pending browser sequence when its document target changes', () => {
    let state = getCanvasState();
    const listeners = new Set<
      Parameters<ReturnType<typeof createCanvasEditorRuntime>['subscribe']>[0]
    >();
    const editor = createCanvasEditorRuntime({
      state: {
        get: () => state,
        subscribe: (listener) => {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
      },
      history: {
        undo: () => false,
        redo: () => false,
        finishCapture() {},
        beginCheckpoint: () => ({ commit() {}, cancel() {} }),
      },
      transactions: { run: (operation) => operation() },
    });
    const execute = vi.fn(() => ({ handled: true as const, status: 'succeeded' as const }));
    editor.registerExtension({
      id: 'target-test',
      commands: [{ id: 'probe', execute }],
      keybindings: [
        { id: 'probe', shortcuts: [['Mod+K', 'Mod+C']], target: { type: 'command', id: 'probe' } },
      ],
    });
    function Owner() {
      useEditorShortcutLayer();
      return null;
    }
    const view = render(
      createElement(ShortcutProvider, {
        children: createElement(EditorProvider, { editor, children: createElement(Owner) }),
      })
    );
    try {
      fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
      const previous = state;
      state = { ...state, activeCanvasId: 'another-document' };
      act(() => {
        for (const listener of listeners) listener(state, previous);
      });
      fireEvent.keyDown(window, { key: 'c', ctrlKey: true });
      expect(execute).not.toHaveBeenCalled();
      fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
      fireEvent.keyDown(window, { key: 'c', ctrlKey: true });
      expect(execute).toHaveBeenCalledOnce();
    } finally {
      view.unmount();
      editor.dispose();
    }
  });
  it('stops executing the old binding and executes the reassigned binding', () => {
    const execute = vi.fn(() => ({
      handled: true as const,
      status: 'succeeded' as const,
    }));
    const editor = createCanvasEditorRuntime({
      state: { get: getCanvasState, subscribe: () => () => undefined },
      history: {
        undo: () => false,
        redo: () => false,
        beginCheckpoint: () => ({ commit: vi.fn(), cancel: vi.fn() }),
        finishCapture: vi.fn(),
      },
      transactions: { run: (operation) => operation() },
    });
    editor.registerExtension({
      id: 'test.shortcuts',
      commands: [{ id: 'test-command', execute }],
      keybindings: [
        {
          id: 'command:test-command',
          shortcuts: ['mod+z'],
          target: { type: 'command', id: 'test-command' },
        },
      ],
    });
    editor.keymap.setUserBindings('command:test-command', [['mod+u']]);

    const oldBinding = createKeyInput({
      key: 'z',
      modifiers: { ctrl: true },
    });
    const newBinding = createKeyInput({
      key: 'u',
      modifiers: { ctrl: true },
    });

    expect(executeEditorKeymapInput(editor, oldBinding, 'canvas-surface')).toEqual({
      type: 'none',
    });
    expect(executeEditorKeymapInput(editor, newBinding, 'canvas-surface')).toMatchObject({
      type: 'executed',
    });
    expect(execute).toHaveBeenCalledOnce();
  });

  it('executes library sequences and clears a mismatched second stroke', () => {
    const chord = vi.fn(() => ({ handled: true as const, status: 'succeeded' as const }));
    const root = vi.fn(() => ({ handled: true as const, status: 'succeeded' as const }));
    const editor = createCanvasEditorRuntime({
      state: { get: getCanvasState, subscribe: () => () => undefined },
      history: {
        undo: () => false,
        redo: () => false,
        beginCheckpoint: () => ({ commit: vi.fn(), cancel: vi.fn() }),
        finishCapture: vi.fn(),
      },
      transactions: { run: (operation) => operation() },
    });
    editor.registerExtension({
      id: 'test.chords',
      commands: [
        { id: 'chord', execute: chord },
        { id: 'root', execute: root },
      ],
      keybindings: [
        { id: 'chord', shortcuts: ['mod+k mod+c'], target: { type: 'command', id: 'chord' } },
        { id: 'root', shortcuts: ['mod+x'], target: { type: 'command', id: 'root' } },
      ],
    });
    const engine = new EditorShortcutEngine(editor);

    expect(
      engine.handleKeyDown(
        createKeyInput({ key: 'k', modifiers: { ctrl: true } }),
        'canvas-surface'
      )
    ).toEqual({ type: 'pending' });
    expect(
      engine.handleKeyDown(
        createKeyInput({ key: 'c', modifiers: { ctrl: true } }),
        'canvas-surface'
      )
    ).toMatchObject({ type: 'executed' });
    expect(chord).toHaveBeenCalledOnce();

    engine.handleKeyDown(createKeyInput({ key: 'k', modifiers: { ctrl: true } }), 'canvas-surface');
    expect(
      engine.handleKeyDown(
        createKeyInput({ key: 'x', modifiers: { ctrl: true } }),
        'canvas-surface'
      )
    ).toEqual({ type: 'none' });
    expect(root).not.toHaveBeenCalled();
    expect(
      engine.handleKeyDown(
        createKeyInput({ key: 'x', modifiers: { ctrl: true } }),
        'canvas-surface'
      )
    ).toMatchObject({ type: 'executed' });
    expect(root).toHaveBeenCalledOnce();
    engine.dispose();
  });

  it('authorizes resolved entries before executing them', () => {
    const copy = vi.fn(() => ({ handled: true as const, status: 'succeeded' as const }));
    const paste = vi.fn(() => ({ handled: true as const, status: 'succeeded' as const }));
    const editor = createCanvasEditorRuntime({
      state: { get: getCanvasState, subscribe: () => () => undefined },
      history: {
        undo: () => false,
        redo: () => false,
        beginCheckpoint: () => ({ commit: vi.fn(), cancel: vi.fn() }),
        finishCapture: vi.fn(),
      },
      transactions: { run: (operation) => operation() },
    });
    editor.registerExtension({
      id: 'test.authorization',
      commands: [
        { id: 'copy', execute: copy },
        { id: 'paste', execute: paste },
      ],
      keybindings: [
        { id: 'copy', shortcuts: ['mod+c'], target: { type: 'command', id: 'copy' } },
        { id: 'paste', shortcuts: ['mod+v'], target: { type: 'command', id: 'paste' } },
      ],
    });
    const engine = new EditorShortcutEngine(editor, 1_500, (entry) => entry.target.id === 'copy');

    expect(
      engine.handleKeyDown(
        createKeyInput({ key: 'c', modifiers: { ctrl: true } }),
        'canvas-surface'
      )
    ).toMatchObject({ type: 'executed' });
    expect(
      engine.handleKeyDown(
        createKeyInput({ key: 'v', modifiers: { ctrl: true } }),
        'canvas-surface'
      )
    ).toEqual({ type: 'none' });
    expect(copy).toHaveBeenCalledOnce();
    expect(paste).not.toHaveBeenCalled();
  });
});
