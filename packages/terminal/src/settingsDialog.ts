import { getTextCellWidth } from '@chardesk/protocol';
import { TerminalTextSettings } from './textSettings.ts';
import { TerminalKeymapSettings } from './keymapSettings.ts';
import type { KeyEvent } from '@opentui/core';
import type { CanvasSurface, TerminalPanel } from './surface.ts';
import { TERMINAL_SETTING_DEFINITIONS, type SettingsSection } from './settings.ts';
import type { TerminalUpdates } from './updates.ts';
import type { TerminalClipboardAccess } from './clipboard.ts';

const sections: readonly { id: SettingsSection; label: string }[] = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'navigation', label: 'Navigation' },
  { id: 'paste', label: 'Paste' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'rendering', label: 'Rendering' },
  { id: 'updates', label: 'Updates' },
];

export class TerminalSettingsDialog {
  #panel: TerminalPanel | null = null;
  #section = 0;
  #closingKey: string | null = null;
  #detach: () => void;
  #detachAppearance: () => void;
  #detachKeymap: () => void;
  #detachUpdates: () => void;
  #installer = 0;
  readonly #shortcuts: TerminalKeymapSettings;
  readonly #text: TerminalTextSettings;
  #cancelRecording = () => {
    if (this.isOpen) this.#shortcuts.cancelRecording(this.#panel!);
  };
  constructor(
    private surface: CanvasSurface,
    private updates?: TerminalUpdates,
    private clipboard?: TerminalClipboardAccess
  ) {
    this.#shortcuts = new TerminalKeymapSettings(surface);
    this.#text = new TerminalTextSettings(surface);
    this.#detachKeymap = surface.model.editor.keymap.subscribe(() => this.#refresh());
    this.#detachUpdates = updates?.subscribe(() => this.#refresh()) ?? (() => {});
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
    this.surface.input.openPanel(this.#panel, this, new Set());
    this.#refresh();
  }
  openUpdates() {
    this.#section = sections.findIndex((section) => section.id === 'updates');
    this.open();
  }
  close() {
    this.surface.input.closePanel(this);
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
    if (sections[this.#section]!.id === 'updates') {
      this.#refreshUpdates(panel);
      return;
    }
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
  #refreshUpdates(panel: TerminalPanel) {
    const { t } = this.surface;
    const state = this.updates?.state;
    panel.input = undefined;
    panel.onInput = undefined;
    panel.itemHints = undefined;
    panel.error =
      state?.phase === 'error' ? t('Could not check for updates. Try again.') : undefined;
    panel.status =
      !state || state.phase === 'development'
        ? t('Development build · automatic checks disabled')
        : t`Current ${state.current}${state.latest ? ` · ${t('Latest')} ${state.latest}` : ''}`;
    const auto = this.surface.settings.values.autoCheckUpdates ? t('On') : t('Off');
    panel.items = [
      `${t('Automatically check for updates')}    ‹ ${auto} ›`,
      state?.phase === 'checking' ? t('Checking for updates…') : t('Check for updates'),
    ];
    if (state?.phase === 'current') panel.status += ` · ${t('Latest version installed')}`;
    const choice = this.updates?.commands[this.#installer];
    if (choice)
      panel.items.push(
        `${t('Installation method')}    ‹ ${t(choice.label)} ›`,
        `${t('Copy command')}: ${choice.command}`,
        t('Release notes')
      );
    panel.onPick = (index) => {
      panel.selected = index;
      this.#change(1);
    };
    panel.hint = t('Use your installation method · restart after upgrading');
    this.surface.requestRender();
  }
  #changeUpdate(direction: number) {
    const panel = this.#panel!,
      updates = this.updates;
    switch (panel.selected) {
      case 0:
        this.surface.settings.set(
          'autoCheckUpdates',
          !this.surface.settings.values.autoCheckUpdates
        );
        break;
      case 1:
        if (updates) void updates.check();
        break;
      case 2:
        if (updates)
          this.#installer =
            (this.#installer + direction + updates.commands.length) % updates.commands.length;
        break;
      case 3: {
        const command = updates?.commands[this.#installer]?.command;
        if (command && this.clipboard)
          void this.clipboard
            .write({ plain: command, rich: null }, { rich: false, ansi: false })
            .then((result) => {
              if (!this.isOpen || this.#panel !== panel) return;
              if (result.status === 'written')
                this.surface.feedback.show(() => this.surface.messages.copied);
              else if (result.status === 'dispatched')
                this.surface.feedback.show(() => this.surface.messages.copyDispatched, 'warning');
              else this.surface.feedback.show(() => this.surface.messages.clipboardFailed, 'error');
            })
            .catch(() => {
              if (this.isOpen && this.#panel === panel)
                this.surface.feedback.show(() => this.surface.messages.clipboardFailed, 'error');
            });
        break;
      }
      case 4:
        void updates?.openReleaseNotes().catch(() => {
          if (this.isOpen && this.#panel === panel) {
            panel.error = this.surface.t('Could not open release notes');
            this.surface.requestRender();
          }
        });
        break;
    }
  }
  #change(direction: number) {
    const panel = this.#panel;
    if (!panel || !this.isOpen) return;
    if (sections[this.#section]!.id === 'updates') {
      this.#changeUpdate(direction);
      this.#refresh();
      return;
    }
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
    this.#detachUpdates();
    this.surface.renderer.off('blur', this.#cancelRecording);
    this.surface.renderer.off('resize', this.#cancelRecording);
  }
}
