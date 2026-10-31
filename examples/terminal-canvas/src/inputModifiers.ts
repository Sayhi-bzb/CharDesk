import type { KeyEvent, KittyKeyboardOptions } from '@opentui/core';

type MouseModifiers = { shift: boolean; alt: boolean; ctrl: boolean };

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

/** Physical modifier lifetimes, separate from document/selection state. */
export class TerminalInputModifiers {
  #pressed = new Set<string>();

  update(key: Pick<KeyEvent, 'name' | 'source' | 'eventType'>) {
    if (key.source !== 'kitty' || !/^(left|right)(shift|alt|ctrl|super|hyper|meta)$/.test(key.name))
      return false;
    if (key.eventType === 'release') this.#pressed.delete(key.name);
    else this.#pressed.add(key.name);
    return true;
  }

  clear() {
    this.#pressed.clear();
  }

  get held(): MouseModifiers {
    const has = (name: string) =>
      this.#pressed.has(`left${name}`) || this.#pressed.has(`right${name}`);
    return { shift: has('shift'), alt: has('alt'), ctrl: has('ctrl') };
  }

  merge(mouse: MouseModifiers): MouseModifiers {
    const held = this.held;
    return {
      shift: mouse.shift || held.shift,
      alt: mouse.alt || held.alt,
      ctrl: mouse.ctrl || held.ctrl,
    };
  }
}
