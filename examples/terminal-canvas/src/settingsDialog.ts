import type { KeyEvent } from '@opentui/core';
import type { CanvasSurface, TerminalPanel } from './surface.ts';
import { TERMINAL_SETTING_DEFINITIONS, type SettingsSection } from './settings.ts';

const sections: readonly { id: SettingsSection; label: string }[] = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'navigation', label: 'Navigation' },
  { id: 'paste', label: 'Paste' },
];

/** One modal settings carrier over the shared panel shell and preference definitions. */
export class TerminalSettingsDialog {
  #panel: TerminalPanel | null = null;
  #section = 0;
  #closingKey: string | null = null;
  #detach: () => void;
  #detachAppearance: () => void;
  constructor(private surface: CanvasSurface) {
    this.#detach = surface.settings.subscribe(() => this.#refresh());
    this.#detachAppearance = surface.appearance.subscribe(() => this.#refresh());
  }
  get isOpen() {
    return this.#panel !== null && this.surface.panel === this.#panel;
  }
  #definitions() {
    return TERMINAL_SETTING_DEFINITIONS.filter(
      (def) => def.section === sections[this.#section]!.id
    );
  }
  open() {
    this.surface.cancelGesture();
    this.surface.model.cancelPendingPaste();
    this.surface.help = false;
    this.#panel = {
      dialog: true,
      title: '',
      hint: '',
      items: [],
      selected: 0,
      tabs: [],
      selectedTab: this.#section,
      onTab: (index) => {
        this.#section = index;
        if (this.#panel) this.#panel.selected = 0;
        this.#refresh();
      },
      onPick: (index) => {
        if (this.#panel) this.#panel.selected = index;
        this.#change(1);
      },
      onClose: () => this.close(),
    };
    this.surface.panel = this.#panel;
    this.#refresh();
  }
  close() {
    if (this.isOpen) this.surface.panel = null;
    this.#panel = null;
    this.surface.requestRender();
  }
  #refresh() {
    if (!this.isOpen) return;
    const panel = this.#panel!;
    panel.title = 'Settings';
    panel.hint = 'Tab section · ↑↓ select · ←→ / Enter change · Esc close';
    panel.tabs = sections.map((section) => section.label);
    panel.selectedTab = this.#section;
    const definitions = this.#definitions();
    const labelWidth = Math.max(...definitions.map((def) => def.label.length));
    panel.items = definitions.map((def) => {
      const choice = def.choices.find(
        (option) => option.value === this.surface.settings.values[def.id]
      )!;
      return `${def.label.padEnd(labelWidth)}    ‹ ${choice.label} ›`;
    });
    if (sections[this.#section]!.id === 'appearance') panel.items.push('Refresh terminal colors');
    panel.items.push('Reset this section');
    const store = this.surface.settings;
    const appearance = this.surface.appearance.getSnapshot();
    panel.status =
      sections[this.#section]!.id === 'appearance'
        ? appearance.status === 'refreshing'
          ? 'Refreshing colors…'
          : appearance.status === 'unavailable'
            ? 'Terminal RGB unavailable'
            : undefined
        : undefined;
    panel.error = store.error || undefined;
    this.surface.requestRender();
  }
  #change(direction: number) {
    const panel = this.#panel;
    if (!panel || !this.isOpen) return;
    const definitions = this.#definitions(),
      definition = definitions[panel.selected];
    if (
      !definition &&
      sections[this.#section]!.id === 'appearance' &&
      panel.selected === definitions.length
    )
      void this.surface.appearance.refresh();
    else if (!definition) this.surface.settings.reset(sections[this.#section]!.id);
    else {
      const index = definition.choices.findIndex(
        (choice) => choice.value === this.surface.settings.values[definition.id]
      );
      const next =
        definition.choices[
          (index + direction + definition.choices.length) % definition.choices.length
        ]!;
      this.surface.settings.set(definition.id, next.value);
    }
    this.#refresh();
  }
  key(key: KeyEvent) {
    if (!this.isOpen) {
      if (key.eventType === 'repeat' && key.name === this.#closingKey) return true;
      this.#closingKey = null;
      return false;
    }
    if (key.name === 'escape') {
      this.close();
      this.#closingKey = key.name;
    } else if (this.surface.panelLayout.height < 8 || this.surface.panelLayout.width < 20)
      return true;
    else if (key.name === 'tab') {
      this.#section = (this.#section + (key.shift ? -1 : 1) + sections.length) % sections.length;
      this.#panel!.selected = 0;
      this.#refresh();
    } else if (key.name === 'up' || key.name === 'down') {
      const panel = this.#panel!;
      panel.selected =
        (panel.selected + (key.name === 'up' ? -1 : 1) + panel.items.length) % panel.items.length;
      this.#refresh();
    } else if (['left', 'right', 'return', 'enter', 'space'].includes(key.name))
      this.#change(key.name === 'left' ? -1 : 1);
    return true;
  }
  dispose() {
    this.close();
    this.#detach();
    this.#detachAppearance();
  }
}
