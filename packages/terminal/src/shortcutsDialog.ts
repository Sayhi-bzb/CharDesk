import type { KeyEvent } from '@opentui/core';
import type { CanvasSurface, TerminalPanel } from './surface.ts';
import { shortcutSections } from './shortcutGuide.ts';

/** Read-only guide over the same panel shell as Settings and Sessions. */
export class TerminalShortcutsDialog {
  #panel: TerminalPanel | null = null;
  #section = 0;
  constructor(private surface: CanvasSurface) {}
  get isOpen() {
    return this.#panel !== null && this.surface.panel === this.#panel;
  }
  open() {
    if (this.isOpen) return;
    this.surface.clearDockFocus();
    this.surface.cancelGesture();
    this.surface.inspector?.blur();
    this.surface.model.cancelPendingPaste();
    this.#section = 0;
    this.#panel = {
      dialog: true,
      title: this.surface.t('Shortcuts'),
      hint: this.surface.t('Tab section · ↑↓ scroll · Esc close'),
      items: [],
      selected: 0,
      onClose: () => this.close(),
      onTab: (index) => this.#tab(index),
    };
    this.surface.panel = this.#panel;
    this.refresh();
    this.surface.requestRender();
  }
  close() {
    if (this.isOpen) this.surface.panel = null;
    this.#panel = null;
    this.surface.requestRender();
  }
  refresh() {
    if (!this.isOpen) return;
    const s = this.surface;
    const sections = shortcutSections(
      s.shortcuts,
      s.inputPolicy,
      s.renderer.capabilities?.hyperlinks,
      s.settings.values.panStep,
      s.t
    );
    const panel = this.#panel!,
      rows = sections[this.#section]!.rows;
    panel.title = s.t('Shortcuts');
    panel.hint = s.t('Tab section · ↑↓ scroll · Esc close');
    panel.tabs = sections.map(({ label }) => label);
    panel.selectedTab = this.#section;
    panel.items = rows.map(({ label }) => label);
    panel.itemHints = rows.map(({ keys }) => keys);
    panel.selected = Math.max(0, Math.min(panel.selected, rows.length - 1));
    panel.status = rows[panel.selected]?.detail;
  }
  #tab(index: number) {
    if (!this.isOpen) return;
    this.#section = (index + this.#panel!.tabs!.length) % this.#panel!.tabs!.length;
    this.#panel!.selected = 0;
    this.refresh();
    this.surface.requestRender();
  }
  key(key: KeyEvent) {
    if (!this.isOpen) return false;
    if (key.name === 'escape') {
      this.close();
      return true;
    }
    const panel = this.#panel!,
      layout = this.surface.panelLayout;
    if (layout.width < 20 || layout.height < 8) return true;
    if (key.name === 'tab') this.#tab(this.#section + (key.shift ? -1 : 1));
    else if (key.name === 'left' || key.name === 'right')
      this.#tab(this.#section + (key.name === 'left' ? -1 : 1));
    else {
      const movement =
        key.name === 'up'
          ? -1
          : key.name === 'down'
            ? 1
            : key.name === 'pageup'
              ? -layout.rows
              : key.name === 'pagedown'
                ? layout.rows
                : 0;
      if (key.name === 'home') panel.selected = 0;
      else if (key.name === 'end') panel.selected = panel.items.length - 1;
      else panel.selected += movement;
      this.refresh();
      this.surface.requestRender();
    }
    return true;
  }
}
