import type { KeyEvent, KittyKeyboardOptions } from '@opentui/core';
import { terminalKeyModifiers } from '@chardesk/editor-input/terminal';
import { mouseModifierSource, type TerminalInputPolicy } from './terminalPolicy.ts';

type MouseModifiers = { shift: boolean; alt: boolean; ctrl: boolean };
type ModifierKeyEvent = Pick<
  KeyEvent,
  'name' | 'source' | 'eventType' | 'ctrl' | 'shift' | 'meta' | 'option' | 'super'
>;

export function terminalKeyboardOptions(terminalProgram: string | undefined): KittyKeyboardOptions {
  return {
    disambiguate: true,
    alternateKeys: true,
    events: true,
    // Warp's SGR mouse encoder omits modifiers. Obtain their lifetimes from
    // independent key events; associated text preserves ordinary typing.
    ...(terminalProgram === 'WarpTerminal' ? { allKeysAsEscapes: true, reportText: true } : {}),
  };
}

/** Current input evidence. Explicit snapshots repair missing edges; only Warp needs edge fallback. */
export class TerminalInputModifiers {
  #pressed = new Set<string>();
  #held: MouseModifiers = { shift: false, alt: false, ctrl: false };

  /** Returns whether the event is a standalone modifier, which must not reach text input. */
  observeKey(key: ModifierKeyEvent, policy: TerminalInputPolicy) {
    const snapshot = terminalKeyModifiers(key);
    if (key.source !== 'kitty') {
      // A user cancel remains an escape hatch when a legacy Escape has no full snapshot.
      if (key.name === 'escape' && !Object.values(snapshot).some(Boolean)) this.clear();
      return false;
    }
    const physical = /^(left|right)(shift|alt|ctrl|super|hyper|meta)$/.exec(key.name);
    const own = physical?.[2];
    if (own === 'shift' || own === 'alt' || own === 'ctrl') {
      if (key.eventType === 'release') this.#pressed.delete(key.name);
      else this.#pressed.add(key.name);
      if (mouseModifierSource(policy) === 'keyboard-fallback') {
        // Warp can retain the releasing key's own modifier bit. Known opposite-side
        // presses still count; other groups always use this event's snapshot.
        snapshot[own] =
          key.eventType !== 'release' ||
          this.#pressed.has(`left${own}`) ||
          this.#pressed.has(`right${own}`);
      }
    }
    this.#accept(snapshot);
    return !!physical;
  }

  #accept(snapshot: MouseModifiers) {
    this.#held = { shift: snapshot.shift, alt: snapshot.alt, ctrl: snapshot.ctrl };
    for (const group of ['shift', 'alt', 'ctrl'] as const) {
      if (!snapshot[group]) {
        this.#pressed.delete(`left${group}`);
        this.#pressed.delete(`right${group}`);
      }
    }
  }

  clear() {
    this.#pressed.clear();
    this.#held = { shift: false, alt: false, ctrl: false };
  }

  get held(): MouseModifiers {
    return { ...this.#held };
  }

  resolveMouse(mouse: MouseModifiers, policy: TerminalInputPolicy): MouseModifiers {
    if (mouseModifierSource(policy) === 'mouse') {
      this.#accept(mouse);
      return { ...mouse };
    }
    // Warp reserves Shift+mouse. Explicitly forwarded Shift still works, but a
    // cached Shift must not turn its next ordinary click into range extension.
    return {
      shift: mouse.shift,
      alt: mouse.alt || this.#held.alt,
      ctrl: mouse.ctrl || this.#held.ctrl,
    };
  }
}
