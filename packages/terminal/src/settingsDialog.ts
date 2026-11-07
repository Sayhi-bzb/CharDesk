import { getTextCellWidth } from '@chardesk/protocol';
import { TerminalTextSettings } from './textSettings.ts';
import { TerminalKeymapSettings } from './keymapSettings.ts';
import type { KeyEvent } from '@opentui/core';
import type { CanvasSurface, TerminalPanel } from './surface.ts';
import { TERMINAL_SETTING_DEFINITIONS, type SettingsSection } from './settings.ts';

const sections: readonly { id: SettingsSection; label: string }[] = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'navigation', label: 'Navigation' },
  { id: 'paste', label: 'Paste' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'rendering', label: 'Rendering' },
];

/** One modal settings carrier over the shared panel shell and preference definitions. */
export class TerminalSettingsDialog {
  #panel: TerminalPanel | null = null;
  #section = 0;
  #closingKey: string | null = null;
  #detach: () => void;
  #detachAppearance: () => void;
  #detachKeymap: () => void;
  readonly #shortcuts: TerminalKeymapSettings;
  readonly #text: TerminalTextSettings;
  #cancelRecording = () => {
    if (this.isOpen) this.#shortcuts.cancelRecording(this.#panel!);
  };
  constructor(private surface: CanvasSurface) {
    this.#shortcuts = new TerminalKeymapSettings(surface);
    this.#text = new TerminalTextSettings(surface);
    this.#detachKeymap = surface.model.editor.keymap.subscribe(() => this.#refresh());
    this.#detach = surface.settings.subscribe(() => this.#refresh());
    this.#detachAppearance = surface.appearance.subscribe(() => this.#refresh());
    surface.renderer.on('blur', this.#cancelRecording);
    surface.renderer.on('resize', this.#cancelRecording);
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
    this.surface.clearDockFocus();
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
        this.#shortcuts.leave();
        this.#text.leave();
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
    this.#shortcuts.leave();
    this.#text.leave();
    this.surface.requestRender();
  }
  #refresh() {
    if (!this.isOpen) return;
    const panel = this.#panel!;
    panel.title = this.surface.t('Settings');
    panel.hint = this.surface.t('Tab section · Enter change');
    panel.tabs = sections.map((section) => this.surface.t(section.label));
    panel.selectedTab = this.#section;
    if (sections[this.#section]!.id === 'rendering') {
      this.#text.refresh(panel);
      return;
    }
    if (sections[this.#section]!.id === 'shortcuts') {
      this.#shortcuts.refresh(panel);
      return;
    }
    panel.input = undefined;
    panel.onInput = undefined;
    panel.onPick = (index) => {
      panel.selected = index;
      this.#change(1);
    };
    const definitions = this.#definitions();
    const labelWidth = Math.max(
      ...definitions.map((def) => getTextCellWidth(this.surface.t(def.label)))
    );
    panel.items = definitions.map((def) => {
      const choice = def.choices.find(
        (option) => option.value === this.surface.settings.values[def.id]
      )!;
      const label = this.surface.t(def.label);
      return `${label}${' '.repeat(labelWidth - getTextCellWidth(label))}    ‹ ${this.surface.t(choice.label)} ›`;
    });
    if (sections[this.#section]!.id === 'appearance')
      panel.items.push(this.surface.t('Refresh terminal colors'));
    panel.items.push(this.surface.t('Reset this section'));
    const store = this.surface.settings;
    const appearance = this.surface.appearance.getSnapshot();
    panel.status =
      sections[this.#section]!.id === 'appearance'
        ? appearance.status === 'refreshing'
          ? this.surface.t('Refreshing colors…')
          : appearance.status === 'unavailable'
            ? this.surface.t('Terminal colors unavailable')
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
    if (
      key.name !== 'escape' &&
      (this.surface.panelLayout.height < 8 || this.surface.panelLayout.width < 20)
    )
      return true;
    if (
      sections[this.#section]!.id === 'rendering' &&
      key.name !== 'tab' &&
      this.#text.key(this.#panel!, key)
    )
      return true;
    if (
      sections[this.#section]!.id === 'shortcuts' &&
      (this.#shortcuts.recording || (key.name !== 'escape' && key.name !== 'tab'))
    ) {
      this.#shortcuts.key(this.#panel!, key);
      return true;
    }
    if (
      key.name === 'escape' &&
      sections[this.#section]!.id === 'shortcuts' &&
      this.#shortcuts.editing
    ) {
      this.#shortcuts.key(this.#panel!, key);
      return true;
    }
    if (key.name === 'escape') {
      this.close();
      this.#closingKey = key.name;
    } else if (this.surface.panelLayout.height < 8 || this.surface.panelLayout.width < 20)
      return true;
    else if (key.name === 'tab') {
      this.#shortcuts.leave();
      this.#text.leave();
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
  paste(text: string) {
    if (this.isOpen && sections[this.#section]!.id === 'rendering')
      this.#text.paste(this.#panel!, text);
    if (this.isOpen && sections[this.#section]!.id === 'shortcuts')
      this.#shortcuts.paste(this.#panel!, text);
  }
  dispose() {
    this.close();
    this.#detach();
    this.#detachAppearance();
    this.#detachKeymap();
    this.surface.renderer.off('blur', this.#cancelRecording);
    this.surface.renderer.off('resize', this.#cancelRecording);
  }
}
