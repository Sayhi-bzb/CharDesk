import { type RGBA, type KeyEvent, type MouseEvent, type OptimizedBuffer } from '@opentui/core';
import { getTextCellWidth } from '@chardesk/protocol';
import { resolveGridSlot } from '@chardesk/cell-plane/grid-occupancy';
import type { Point } from '@chardesk/cell-plane/types';
import type { CanvasSurface } from './surface.ts';
import type { TerminalAction } from './shortcuts.ts';

type Entry = { id: string; label: string; shortcut: string; enabled: boolean; separator?: boolean };
type State = {
  screen: Point;
  stamp: string;
  selected: number;
  scroll: number;
};
type Line = (text: string, x: number, y: number, fg: RGBA, bg: RGBA, width: number) => void;
/** Ephemeral Host overlay; every action is rechecked and executed by the command registry. */
export class TerminalContextMenu {
  #state: State | null = null;
  #closingKey: string | null = null;
  constructor(private surface: CanvasSurface) {}
  get isOpen() {
    return this.#state !== null;
  }
  #stamp() {
    const { model } = this.surface;
    return JSON.stringify([
      model.documents.getActiveAddress(),
      model.currentTool,
      model.plane.getRevision(),
      model.getSnapshot().interaction,
      model.viewport,
    ]);
  }
  validate() {
    if (
      this.#state &&
      (this.#state.stamp !== this.#stamp() ||
        this.surface.help ||
        this.surface.panel ||
        this.surface.placement ||
        this.surface.closing)
    )
      this.close();
  }
  open(at?: Point, screen?: Point) {
    const s = this.surface,
      model = s.model;
    if (s.help || s.panel || s.placement || s.closing) return;
    if (s.width < 8 || s.height < 6) {
      s.status = 'Enlarge terminal to use the menu.';
      s.requestRender();
      return;
    }
    s.cancelGesture();
    model.cancelPendingPaste();
    const point = at ?? model.selectionPresentation.coverage.bounds?.start ?? model.cursor;
    const slot = resolveGridSlot(model.plane, point);
    const anchor = slot?.anchor ?? point;
    if (at && !model.selectionPresentation.coverage.contains(at)) model.commands.pointAt(anchor);
    this.#state = {
      stamp: this.#stamp(),
      selected: -1,
      scroll: 0,
      screen: screen ?? {
        x: anchor.x - model.viewport.x,
        y: s.canvasBounds.y + anchor.y - model.viewport.y,
      },
    };
    this.#state.selected = this.items.findIndex((item) => item.enabled);
    s.requestRender();
  }
  close() {
    if (!this.#state) return;
    this.#state = null;
    this.surface.requestRender();
  }
  get items(): Entry[] {
    const s = this.surface;
    const entries: Array<{
      id: string;
      label: string;
      shortcut?: TerminalAction;
      separator?: boolean;
    }> = [
      { id: 'copy', label: 'Copy as Text', shortcut: 'copy' },
      { id: 'copy-ansi', label: 'Copy as ANSI' },
      { id: 'snapshot-png', label: 'Snapshot (PNG)' },
      { id: 'paste', label: 'Paste', shortcut: 'paste' },
      { id: 'separator', label: '', separator: true },
      { id: 'delete-selection', label: 'Delete' },
    ];
    return entries.map((item) => {
      const enabled =
        !item.separator &&
        s.model.editor.commands.canExecute(`terminal.${item.id}`, undefined, 'context-menu');
      let label = item.label;
      if (item.id === 'paste' && !enabled) label = 'Paste (use terminal paste)';
      if (item.id === 'snapshot-png' && !enabled && s.model.selection)
        label = 'Snapshot (PNG, local clipboard only)';
      return {
        ...item,
        enabled,
        label,
        shortcut: item.shortcut ? s.shortcuts[item.shortcut].label : '',
      };
    });
  }
  get layout() {
    const items = this.items,
      s = this.surface;
    const width = Math.min(
      s.width,
      Math.max(
        8,
        ...items.map((item) => getTextCellWidth(item.label) + getTextCellWidth(item.shortcut) + 5)
      )
    );
    const area = s.canvasBounds;
    const height = Math.min(items.length + 2, area.height);
    const x = Math.max(0, Math.min(this.#state?.screen.x ?? 0, s.width - width));
    const y = Math.max(
      area.y,
      Math.min(this.#state?.screen.y ?? area.y, area.y + area.height - height)
    );
    const rows = Math.max(0, height - 2);
    if (this.#state && this.#state.selected >= 0)
      this.#state.scroll = Math.max(
        0,
        Math.min(this.#state.scroll, this.#state.selected, items.length - rows)
      );
    if (this.#state && this.#state.selected >= this.#state.scroll + rows)
      this.#state.scroll = this.#state.selected - rows + 1;
    return { x, y, width, height, rows, scroll: this.#state?.scroll ?? 0 };
  }
  #move(delta: number) {
    const state = this.#state;
    if (!state) return;
    const items = this.items;
    for (let offset = 1; offset <= items.length; offset++) {
      const start = state.selected < 0 && delta < 0 ? 0 : state.selected;
      const next = (start + delta * offset + items.length * 2) % items.length;
      if (items[next]?.enabled) {
        state.selected = next;
        break;
      }
    }
    this.surface.requestRender();
  }
  #execute(index: number) {
    this.validate();
    if (!this.#state) return;
    const item = this.items[index];
    if (!item?.enabled) return;
    this.close();
    this.surface.model.editor.commands.execute(`terminal.${item.id}`, undefined, 'context-menu');
    this.surface.requestRender();
  }
  key(key: KeyEvent) {
    this.validate();
    if (!this.#state) {
      if (key.eventType === 'repeat' && key.name === this.#closingKey) return true;
      this.#closingKey = null;
      return false;
    }
    if (key.name === 'up') this.#move(-1);
    else if (key.name === 'down' || key.name === 'tab') this.#move(key.shift ? -1 : 1);
    else if (key.eventType !== 'repeat') {
      if (key.name === 'escape') {
        this.close();
        this.#closingKey = key.name;
      } else if (key.name === 'return' || key.name === 'enter') {
        this.#execute(this.#state.selected);
        if (!this.isOpen) this.#closingKey = key.name;
      }
    }
    return true;
  }
  mouse(event: MouseEvent) {
    if (!this.#state) return;
    const p = { x: event.x - this.surface.screenX, y: event.y - this.surface.screenY };
    const l = this.layout;
    const inside = p.x >= l.x && p.x < l.x + l.width && p.y >= l.y && p.y < l.y + l.height;
    if (event.type === 'down' && !inside) {
      this.close();
      return;
    }
    if (!inside) return;
    const index = p.y - l.y - 1 + l.scroll;
    const item = this.items[index];
    if (p.y <= l.y || p.y >= l.y + l.height - 1 || !item) return;
    if (event.type === 'move' && item.enabled) this.#state.selected = index;
    if (event.type === 'down' && event.button === 0) this.#execute(index);
    this.surface.requestRender();
  }
  render(buffer: OptimizedBuffer, line: Line) {
    if (!this.#state) return;
    const {
      foreground,
      background,
      muted,
      selection: selectedBackground,
      selectionForeground,
    } = this.surface.colors;
    const l = this.layout,
      items = this.items;
    buffer.fillRect(l.x, l.y, l.width, l.height, background);
    line('┌' + '─'.repeat(l.width - 2) + '┐', l.x, l.y, muted, background, l.width);
    line('└' + '─'.repeat(l.width - 2) + '┘', l.x, l.y + l.height - 1, muted, background, l.width);
    for (let row = 0; row < l.rows; row++) {
      const index = row + l.scroll,
        item = items[index];
      if (!item) break;
      const bg = index === this.#state.selected && item.enabled ? selectedBackground : background;
      buffer.fillRect(l.x + 1, l.y + row + 1, l.width - 2, 1, bg);
      line('│', l.x, l.y + row + 1, muted, background, 1);
      line('│', l.x + l.width - 1, l.y + row + 1, muted, background, 1);
      if (item.separator) {
        line('─'.repeat(l.width - 2), l.x + 1, l.y + row + 1, muted, background, l.width - 2);
        continue;
      }
      const shortcutWidth = Math.min(getTextCellWidth(item.shortcut), Math.max(0, l.width - 10));
      const fg = item.enabled
        ? index === this.#state.selected
          ? selectionForeground
          : foreground
        : muted;
      line(
        item.label,
        l.x + 2,
        l.y + row + 1,
        fg,
        bg,
        l.width - 4 - (shortcutWidth ? shortcutWidth + 1 : 0)
      );
      if (shortcutWidth)
        line(
          item.shortcut,
          l.x + l.width - 2 - shortcutWidth,
          l.y + row + 1,
          fg,
          bg,
          shortcutWidth
        );
    }
  }
}
