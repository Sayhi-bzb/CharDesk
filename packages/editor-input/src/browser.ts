import {
  createHtmlKeymapEvent,
  createHtmlKeymapHost,
  type HtmlKeymapEvent,
} from '@opentui/keymap/html';
import type { Keymap } from '@opentui/keymap';
import { createInputSession } from './session.js';
import { inputPriority } from './engine.js';
import { keyInputFromKeyboardEvent } from '@chardesk/keyboard/browser';
import type { KeyInput } from '@chardesk/keyboard';

const normalizedEvents = new WeakMap<KeyboardEvent, KeyInput>();
export function browserKeyInput(event: KeyboardEvent) {
  let input = normalizedEvents.get(event);
  if (!input) {
    input = keyInputFromKeyboardEvent(event);
    normalizedEvents.set(event, input);
  }
  return input;
}
export type BrowserKeymap = ReturnType<typeof createBrowserInput>['keymap'];
export const browserMetadata = () => createHtmlKeymapHost(document.documentElement).metadata;

/** One capture entry for application shortcuts, including portals and managed text input. */
export function createBrowserInput(root: HTMLElement = document.documentElement) {
  const view = root.ownerDocument.defaultView!;
  const host = createHtmlKeymapHost(root);
  const subscribe = (type: 'keydown' | 'keyup', listener: (event: HtmlKeymapEvent) => void) => {
    const handler = (event: KeyboardEvent) => {
      if (
        root !== root.ownerDocument.documentElement &&
        (!(event.target instanceof view.Node) || !root.contains(event.target))
      )
        return;
      if (event.defaultPrevented || event.isComposing || event.getModifierState('AltGraph')) {
        session.keymap.clearPendingSequence();
        return;
      }
      const input = createHtmlKeymapEvent(event);
      session.keymap.setData('input', browserKeyInput(event));
      session.keymap.setData('browser.event', input);
      listener(input);
    };
    view.addEventListener(type, handler, true);
    return () => view.removeEventListener(type, handler, true);
  };
  host.onKeyPress = (listener) => subscribe('keydown', listener);
  host.onKeyRelease = (listener) => subscribe('keyup', listener);
  const session = createInputSession(host);
  session.keymap.registerSequencePattern({
    name: 'browser-input',
    min: 1,
    max: 1,
    match: () => ({ value: true }),
  });
  const reset = () => session.keymap.clearPendingSequence();
  view.addEventListener('blur', reset);
  view.addEventListener('compositionstart', reset, true);
  return {
    keymap: session.keymap,
    dispose() {
      view.removeEventListener('blur', reset);
      view.removeEventListener('compositionstart', reset, true);
      session.dispose();
    },
  };
}

/** Component input callbacks participate in the library's ordering and consumption. */
export function registerBrowserHandler(
  keymap: Keymap<HTMLElement, HtmlKeymapEvent>,
  options: {
    priority: number;
    enabled: () => boolean;
    handle: (event: HtmlKeymapEvent, phase: 'keydown' | 'keyup') => boolean;
  }
) {
  const press = keymap.registerLayer({
    priority: inputPriority(options.priority),
    enabled: options.enabled,
    bindings: [
      {
        key: '{browser-input}',
        preventDefault: false,
        cmd: ({ event }) => options.handle(event, 'keydown'),
      },
    ],
  });
  const release = keymap.intercept(
    'key',
    ({ event, consume }) => {
      if (options.enabled() && options.handle(event, 'keyup'))
        consume({ preventDefault: false, stopPropagation: true });
    },
    { priority: inputPriority(options.priority), release: true }
  );
  return () => {
    press();
    release();
  };
}
