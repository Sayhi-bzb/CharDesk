// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { EditorKeymap } from '@chardesk/editor-core/editor/keymap';
import { createBrowserInput } from './browser.js';
import { connectBindings } from './engine.js';

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const dispose of cleanups.splice(0).reverse()) dispose();
  document.body.replaceChildren();
});
function fixture(shortcuts: string[]) {
  const root = document.createElement('main');
  document.body.append(root);
  const input = createBrowserInput(root);
  cleanups.push(() => input.dispose());
  const catalog = new EditorKeymap();
  catalog.register('test', { id: 'action', shortcuts, target: { type: 'command', id: 'action' } });
  let calls = 0;
  const bindings = connectBindings(input.keymap, catalog, {
    context: () => undefined,
    execute: () => {
      calls++;
    },
  });
  cleanups.push(() => bindings.dispose());
  const emit = (key: string, init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    root.dispatchEvent(event);
    return event;
  };
  return {
    input,
    emit,
    get calls() {
      return calls;
    },
  };
}

test('Command is distinct from Option; dead keys and alternate layouts use physical fallbacks', () => {
  const f = fixture(['Meta+R', 'Alt+E', 'Alt+1']);
  f.emit('r', { metaKey: true, code: 'KeyR' });
  f.emit('Dead', { altKey: true, code: 'KeyE' });
  f.emit('¡', { altKey: true, code: 'Digit1' });
  expect(f.calls).toBe(3);
  f.emit('r', { altKey: true, code: 'KeyR' });
  expect(f.calls).toBe(3);
});

test('IME and AltGraph input keep native behavior and cannot execute shortcuts', () => {
  const f = fixture(['Enter', 'Control+Alt+E']);
  const ime = f.emit('Enter', { isComposing: true });
  const altGraph = f.emit('e', { ctrlKey: true, altKey: true, modifierAltGraph: true });
  expect(altGraph.getModifierState('AltGraph')).toBe(true);
  expect(f.calls).toBe(0);
  expect(ime.defaultPrevented).toBe(false);
  expect(altGraph.defaultPrevented).toBe(false);
});

test('browser input releases its capture subscription without closing the DOM root', () => {
  const f = fixture(['F2']);
  f.emit('F2');
  expect(f.calls).toBe(1);
  f.input.dispose();
  f.emit('F2');
  expect(f.calls).toBe(1);
});

test('an explicitly scoped browser Host leaves sibling inputs untouched', () => {
  const f = fixture(['F2']);
  const sibling = document.createElement('input');
  document.body.append(sibling);
  const event = new KeyboardEvent('keydown', { key: 'F2', bubbles: true, cancelable: true });
  sibling.dispatchEvent(event);
  expect(f.calls).toBe(0);
  expect(event.defaultPrevented).toBe(false);
  f.emit('F2');
  expect(f.calls).toBe(1);
});
