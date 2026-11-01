import type { KeyEvent } from '@opentui/core';
import { segmentGraphemes } from '@chardesk/protocol';
import { terminalKeyInput } from '@chardesk/editor-input/terminal';
import {
  findShortcutConflicts,
  type KeymapBindingSnapshot,
} from '@chardesk/editor-core/editor/keymap';
import {
  normalizeShortcut,
  shortcutFromKeyInput,
  type ShortcutSequence,
} from '@chardesk/editor-core/editor/shortcut';
import type { CanvasSurface, TerminalPanel } from './surface.ts';

/** Settings edits the shared catalog; defaults, dispatch and conflict rules stay in EditorKeymap. */
export class TerminalKeymapSettings {
  #query = '';
  #editing: string | null = null;
  #recording: string[] | null = null;
  #beforeRecording = '';
  #selectedAll = false;
  #entries: readonly KeymapBindingSnapshot[] = [];
  constructor(readonly surface: CanvasSurface) {}
  get editing() {
    return this.#editing !== null;
  }
  get recording() {
    return this.#recording !== null;
  }
  #name(entry: KeymapBindingSnapshot) {
    return entry.label ?? entry.id.replace(/^terminal\./, '').replaceAll('-', ' ');
  }
  #bindings(entry: KeymapBindingSnapshot) {
    return entry.shortcuts.map((sequence) => sequence.join(' ')).join(' / ');
  }
  leave() {
    this.#editing = null;
    this.#recording = null;
    this.#selectedAll = false;
  }
  cancelRecording(panel: TerminalPanel) {
    if (!this.recording) return;
    this.#recording = null;
    panel.input = this.#beforeRecording;
    this.refresh(panel);
  }
  refresh(panel: TerminalPanel): void {
    const catalog = this.surface.model.editor.keymap.getSnapshot().entries;
    panel.title = 'Settings';
    panel.error = this.surface.settings.error || undefined;
    if (this.#editing) {
      const entry = catalog.find((candidate) => candidate.id === this.#editing);
      if (!entry) {
        this.leave();
        return this.refresh(panel);
      }
      panel.status = `${this.#name(entry)} · ${entry.id}`;
      panel.hint = this.recording
        ? 'Press up to 2 strokes · Enter save · Esc cancel recording'
        : 'Type binding(s), separated by / · F5 record · ↑↓ action · Enter · Esc back';
      panel.items = [
        'Record replacement',
        'Save binding',
        'Disable action shortcut',
        'Restore action defaults',
        'Back to shortcuts',
      ];
      panel.onPick = (index) => this.pick(panel, index);
      panel.onInput = undefined;
    } else {
      this.#entries = catalog.filter(
        (entry) =>
          entry.configurable &&
          `${this.#name(entry)} ${entry.id} ${this.#bindings(entry)}`
            .toLowerCase()
            .includes(this.#query.toLowerCase())
      );
      panel.input = this.#query;
      panel.status = 'Search actions; shortcuts work only when forwarded by the terminal.';
      panel.hint = 'Type to search · ↑↓ select · Enter edit · Esc close';
      panel.items = [
        ...this.#entries.map(
          (entry) =>
            `${this.#name(entry)}    ${this.#bindings(entry) || 'Unbound'}${entry.userDefined ? ' *' : ''}`
        ),
        'Restore all default shortcuts',
      ];
      panel.onPick = (index) => this.pick(panel, index);
      panel.onInput = (value) => {
        this.#query = value;
        panel.selected = 0;
        this.refresh(panel);
      };
    }
    panel.selected = Math.max(0, Math.min(panel.selected, panel.items.length - 1));
    this.surface.requestRender();
  }
  pick(panel: TerminalPanel, index = panel.selected) {
    if (this.#editing) {
      if (index === 0) {
        this.#beforeRecording = panel.input ?? '';
        this.#recording = [];
        panel.input = '';
        this.#selectedAll = false;
      } else if (index === 1) {
        this.#save(panel);
        return;
      } else if (index === 2) this.surface.model.editor.keymap.setUserBindings(this.#editing, []);
      else if (index === 3) {
        if (!this.#apply(panel, null)) return;
      } else {
        this.leave();
        panel.selected = 0;
      }
      if (index === 2 || index === 3) {
        const entry = this.surface.model.editor.keymap
          .getSnapshot()
          .entries.find((entry) => entry.id === this.#editing)!;
        panel.input = this.#bindings(entry);
        this.#selectedAll = true;
      }
    } else {
      const entry = this.#entries[index];
      if (entry) {
        this.#editing = entry.id;
        panel.input = this.#bindings(entry);
        panel.selected = 1;
        this.#selectedAll = true;
      } else this.surface.model.editor.keymap.resetUserBindings();
    }
    this.refresh(panel);
  }
  #save(panel: TerminalPanel) {
    const values = (panel.input ?? '').trim();
    const parsed = values
      ? values.split(/\s+\/\s+/).map((binding) => normalizeShortcut(binding))
      : [];
    if (parsed.some((sequence) => !sequence)) {
      panel.error = 'Use a valid shortcut, for example F12 or Control+K Control+C.';
      this.surface.requestRender();
      return;
    }
    const sequences = parsed as ShortcutSequence[];
    if (!this.#apply(panel, sequences)) return;
    this.leave();
    panel.selected = 0;
    this.refresh(panel);
  }
  #apply(panel: TerminalPanel, bindings: readonly ShortcutSequence[] | null) {
    const catalog = this.surface.model.editor.keymap
      .getSnapshot()
      .entries.map((entry) =>
        entry.id === this.#editing
          ? { ...entry, shortcuts: bindings ?? entry.defaultShortcuts }
          : entry
      );
    const sequences = catalog.find((entry) => entry.id === this.#editing)!.shortcuts;
    const conflicts = sequences.flatMap((sequence) =>
      findShortcutConflicts(catalog, this.#editing!, sequence)
    );
    if (conflicts.length) {
      panel.error = `Conflict: ${[...new Set(conflicts.map((conflict) => conflict.conflictingEntryId))].join(', ')}. Change or reset that binding first.`;
      this.surface.requestRender();
      return false;
    }
    this.surface.model.editor.keymap.setUserBindings(this.#editing!, bindings);
    return true;
  }
  paste(panel: TerminalPanel, text: string) {
    if (this.recording) return;
    panel.input =
      (this.#selectedAll ? '' : (panel.input ?? '')) + text.replace(/[\p{Cc}\u2028\u2029]/gu, ' ');
    this.#selectedAll = false;
    if (!this.#editing) this.#query = panel.input;
    this.refresh(panel);
  }
  key(panel: TerminalPanel, key: KeyEvent) {
    if (key.eventType === 'release' || key.eventType === 'repeat') return true;
    if (this.recording) {
      if (key.name === 'escape') {
        this.#recording = null;
        panel.input = this.#beforeRecording;
        this.refresh(panel);
      } else if (key.name === 'return' || key.name === 'enter') {
        this.#recording = null;
        this.#save(panel);
      } else {
        const platform =
          this.surface.platform === 'darwin'
            ? 'mac'
            : this.surface.platform === 'win32'
              ? 'windows'
              : 'linux';
        // Recording preserves the delivered physical modifier, not a portable Mod alias.
        const stroke = shortcutFromKeyInput(terminalKeyInput(key), platform)?.replace(
          /(^|\+)Mod(?=\+)/g,
          `$1${platform === 'mac' ? 'Meta' : 'Control'}`
        );
        if (stroke && this.#recording!.length < 2) this.#recording!.push(stroke);
        panel.input = this.#recording!.join(' ');
        if (this.#recording!.length === 2) {
          this.#recording = null;
          panel.selected = 1;
        }
        this.refresh(panel);
      }
      return true;
    }
    if (key.name === 'escape' && this.#editing) {
      this.leave();
      panel.selected = 0;
      this.refresh(panel);
      return true;
    }
    if (key.name === 'f5' && this.#editing) {
      this.pick(panel, 0);
      return true;
    }
    if (key.name === 'return' || key.name === 'enter') {
      this.pick(panel);
      return true;
    }
    if (key.name === 'up' || key.name === 'down') {
      panel.selected =
        (panel.selected + (key.name === 'up' ? -1 : 1) + panel.items.length) % panel.items.length;
      this.surface.requestRender();
      return true;
    }
    if ((key.ctrl && key.name === 'a') || (key.super && key.name === 'a')) {
      this.#selectedAll = true;
      return true;
    }
    if (key.name === 'backspace') {
      panel.input = this.#selectedAll
        ? ''
        : segmentGraphemes(panel.input ?? '')
            .slice(0, -1)
            .join('');
      this.#selectedAll = false;
      if (!this.#editing) this.#query = panel.input;
      this.refresh(panel);
      return true;
    }
    if (!key.ctrl && !key.meta && !key.super && key.sequence && !/\p{Cc}/u.test(key.sequence))
      this.paste(panel, key.sequence);
    return false;
  }
}
