import { getTextCellWidth } from '@chardesk/protocol';
import { cellRectContainsPoint, type CellRect } from '@chardesk/cell-core';
import { textAttributeNames } from '@chardesk/editor-core/selection/style';
import type { ClipboardPort } from '@chardesk/editor-core/clipboard/commands';
import {
  createTextAttributes,
  type KeyEvent,
  type MouseEvent,
  type OptimizedBuffer,
  RGBA,
} from '@opentui/core';
import type { CanvasSurface } from './surface.ts';
import { resolveColorPickerPalettes } from '@chardesk/ui/color-presets';

type Line = (
  text: string,
  x: number,
  y: number,
  fg: RGBA,
  bg: RGBA,
  width: number,
  attributes?: number
) => void;
type ColorInput = {
  kind: 'foreground' | 'background';
  input: string;
  all: boolean;
  target: string;
  error?: string;
  mode: 'palette' | 'hex';
  selected: number;
};
const clipboardActions = new Set(['copy', 'cut', 'paste', 'select-all']);

/** Nonmodal presentation and explicit input ownership; document rules stay in shared commands. */
export class TerminalInspector {
  #open = true;
  #focused = false;
  #selected = 0;
  #color: ColorInput | null = null;
  #paletteTab: 'ansi16' | 'presets' = 'presets';
  #inputVersion = 0;
  #closingKey: string | null = null;
  #address: string;
  #tool: string;
  readonly #detach: () => void;
  constructor(
    readonly surface: CanvasSurface,
    readonly clipboard: ClipboardPort
  ) {
    this.#address = JSON.stringify(surface.model.documents.getActiveAddress());
    this.#tool = surface.model.currentTool;
    this.#detach = surface.model.subscribe(() => {
      const address = JSON.stringify(surface.model.documents.getActiveAddress());
      if (address !== this.#address || surface.model.currentTool !== this.#tool) {
        this.#address = address;
        this.#tool = surface.model.currentTool;
        this.blur();
      }
      this.validate();
      surface.requestRender();
    });
  }
  get isOpen() {
    return this.#open;
  }
  get isVisible() {
    const s = this.surface;
    return (
      this.#open &&
      s.hasDocument &&
      !s.panel &&
      !s.help &&
      !s.contextMenu?.isOpen &&
      !s.placement &&
      !s.closing
    );
  }
  get focused() {
    return this.isVisible && this.#focused;
  }
  get colorInput() {
    return this.isVisible && this.#color?.mode === 'hex' ? this.#color : null;
  }
  get layout(): CellRect & { compact: boolean } {
    const area = this.surface.canvasBounds;
    const compact = area.width < 25 || area.height < 6;
    const width = Math.min(area.width, compact ? 16 : 23),
      height = compact ? 1 : 4;
    return {
      x: Math.max(0, area.width - width - (compact ? 0 : 1)),
      y: area.y + (compact ? 0 : 1),
      width,
      height,
      compact,
    };
  }
  get colorLayout(): CellRect {
    const l = this.layout,
      area = this.surface.canvasBounds;
    const width = Math.min(this.#color?.mode === 'palette' ? 18 : 32, area.width);
    const columns = this.#paletteColumns(width);
    const height =
      this.#color?.mode === 'palette'
        ? Math.min(area.height, Math.ceil(this.#paletteColors().length / columns) + 4)
        : 4;
    return {
      x: Math.max(0, l.x + l.width - width),
      y: Math.max(area.y, Math.min(l.y + l.height, area.y + area.height - height)),
      width,
      height,
    };
  }
  #paletteColors() {
    const mode = this.surface.appearance.getSnapshot().mode;
    return resolveColorPickerPalettes(mode === 'dark' ? 'dark' : 'light')[this.#paletteTab];
  }
  #paletteColumns(width: number) {
    return Math.max(
      1,
      Math.min(this.#paletteTab === 'presets' ? 5 : 4, Math.floor((width - 3) / 3))
    );
  }
  get paletteControls() {
    const l = this.colorLayout;
    let x = l.x + 1;
    return (['ansi16', 'presets', 'hex', 'reset'] as const).map((id, index) => {
      if (index === 2) x = l.x + 1;
      const name =
        id === 'ansi16'
          ? '16'
          : id === 'presets'
            ? this.surface.t('Presets')
            : id === 'hex'
              ? 'Hex'
              : this.surface.t('Reset');
      const label = `[${name}]`;
      const control = {
        id,
        label,
        x,
        y: l.y + (index < 2 ? 1 : 2),
        width: getTextCellWidth(label),
        height: 1,
      };
      x += control.width + 1;
      return control;
    });
  }
  get paletteSwatches() {
    if (!this.isVisible || this.#color?.mode !== 'palette') return [];
    const l = this.colorLayout,
      colors = this.#paletteColors(),
      columns = this.#paletteColumns(l.width);
    const visibleRows = Math.max(1, l.height - 4);
    const scrollRow = Math.max(
      0,
      Math.min(
        Math.floor(this.#color.selected / columns) - visibleRows + 1,
        Math.ceil(colors.length / columns) - visibleRows
      )
    );
    const left = l.x + 1 + Math.floor((l.width - 2 - (columns * 3 - 1)) / 2);
    return colors.flatMap((color, index) => {
      const row = Math.floor(index / columns) - scrollRow;
      return row < 0 || row >= visibleRows
        ? []
        : [
            {
              index,
              color,
              x: left + (index % columns) * 3,
              y: l.y + 3 + row,
              width: 2,
              height: 1,
            },
          ];
    });
  }
  #customColor() {
    if (!this.#color) return;
    this.#color.mode = 'hex';
    this.#color.error = undefined;
    this.#inputVersion++;
    this.surface.requestRender();
  }
  #switchPalette(tab: 'ansi16' | 'presets') {
    this.#paletteTab = tab;
    if (this.#color) {
      this.#color.selected = Math.max(
        0,
        this.#paletteColors().findIndex((color) => color === this.#color!.input)
      );
      this.#color.error = undefined;
    }
    this.surface.requestRender();
  }
  get controls() {
    const l = this.layout,
      style = this.surface.model.selectionStyle;
    const labels = [
      'B',
      'I',
      'U',
      'S',
      'Inv',
      this.surface.t('Text'),
      this.surface.t('Fill'),
      this.surface.t('Clear'),
    ];
    const widths = labels.map((label) => getTextCellWidth(label) + 2);
    let x = l.x + 1;
    return labels.map((label, index) => {
      if (index === 5) x = l.x + 1;
      const attribute = textAttributeNames[index];
      const control = {
        index,
        label,
        name: attribute
          ? this.surface.t(attribute[0]!.toUpperCase() + attribute.slice(1))
          : [
              this.surface.t('Foreground'),
              this.surface.t('Background'),
              this.surface.t('Clear background'),
            ][index - 5]!,
        x,
        y: l.y + (index < 5 ? 1 : 2),
        width: widths[index]!,
        height: 1,
        enabled: attribute ? !!style.attributes : !!this.surface.model.selection && !style.limited,
        pressed: !!attribute && style.attributes?.[attribute] === 'on',
      };
      x += control.width + 1;
      return control;
    });
  }
  get hint() {
    if (this.#color)
      return (
        this.#color.error ??
        (this.#color.mode === 'palette'
          ? this.surface.t('Tab palette · Enter apply · Esc cancel')
          : this.surface.t('Enter apply · Esc cancel'))
      );
    if (this.layout.compact)
      return this.surface
        .t`Enlarge terminal for ${this.surface.messages.inspector} controls · Esc canvas`;
    return this.surface.t('Enter change · Esc back');
  }
  #target() {
    const model = this.surface.model;
    return JSON.stringify([
      model.documents.getActiveAddress(),
      model.getSnapshot().interaction,
      model.currentTool,
      model.version,
    ]);
  }
  show() {
    this.surface.clearDockFocus();
    this.surface.cancelGesture();

    this.#open = true;
    this.#focused = true;
    this.surface.requestRender();
  }
  toggle() {
    if (this.#open) this.close();
    else this.show();
  }
  blur() {
    this.#focused = false;
    this.#color = null;
    this.#inputVersion++;
    this.surface.requestRender();
  }
  close() {
    this.#open = false;
    this.blur();
  }
  validate() {
    if (!this.isVisible && (this.#focused || this.#color)) this.blur();
  }
  #pick(index: number, keyboard: boolean) {
    this.#selected = index;
    this.#focused = keyboard;
    const model = this.surface.model,
      style = model.selectionStyle;
    if (!model.selection || style.limited) return;
    const attribute = textAttributeNames[index];
    try {
      if (attribute) {
        if (style.attributes)
          model.commands.style({
            kind: 'attributes',
            attributes: { [attribute]: style.attributes[attribute] !== 'on' },
          });
      } else if (index < textAttributeNames.length + 2) {
        const kind = index === textAttributeNames.length ? 'foreground' : 'background',
          value = style[kind];
        this.surface.cancelGesture();
        this.#color = {
          kind,
          input: value.kind === 'color' ? value.value : '',
          all: true,
          target: this.#target(),
          mode: 'palette',
          selected: 0,
        };
        this.#switchPalette(this.#paletteTab);
        this.#focused = true;
        this.#inputVersion++;
      } else model.commands.style({ kind: 'background', color: null });
    } catch (error) {
      this.surface.feedback.show(
        () => this.surface.t('Style not applied'),
        'error',
        error instanceof Error ? error.message : String(error)
      );
    }
    this.surface.requestRender();
  }
  #applyColor(picked?: string) {
    const field = this.#color;
    if (!field) return;
    const value = picked ?? field.input.trim();
    if (this.#target() !== field.target)
      field.error = this.surface.t('Selection changed. Choose its color again.');
    else if (value && !/^#[\da-f]{6}$/i.test(value))
      field.error = this.surface.t('Use #RRGGBB or leave empty to reset.');
    else {
      try {
        this.surface.model.commands.style(
          field.kind === 'foreground'
            ? { kind: 'foreground', color: value || '#000000' }
            : { kind: 'background', color: value || null }
        );
        this.blur();
      } catch (error) {
        field.error = error instanceof Error ? error.message : String(error);
      }
    }
    this.surface.requestRender();
  }
  paste(text: string) {
    const field = this.isVisible ? this.#color : null;
    if (!field) {
      if (this.focused) this.blur();
      return false;
    }
    if (field.mode === 'palette') this.#customColor();
    field.input = (
      (field.all ? '' : field.input) + text.replace(/[\p{Cc}\u2028\u2029]/gu, ' ')
    ).slice(0, 64);
    field.all = false;
    field.error = undefined;
    this.#inputVersion++;
    this.surface.requestRender();
    return true;
  }
  clipboardAction(kind: 'copy' | 'cut' | 'paste' | 'select-all') {
    const field = this.colorInput;
    if (!field) return false;
    const version = ++this.#inputVersion;
    const current = () => this.colorInput === field && this.#inputVersion === version;
    if (kind === 'select-all') {
      field.all = true;
      this.surface.requestRender();
    } else if (kind === 'paste') {
      void this.clipboard
        .read({
          target: 'terminal-inspector-color',
          reader: this.surface.model.plane,
          selections: [],
          cursor: null,
          foreground: '#000000',
          selectResult: false,
        })
        .then((value) => {
          if (!current()) return;
          if (!('error' in value)) this.paste(value.plainText ?? '');
          else {
            field.error = this.surface.t('Clipboard unavailable. Use terminal paste.');
            this.surface.requestRender();
          }
        })
        .catch(() => {
          if (current()) {
            field.error = this.surface.t('Clipboard unavailable. Use terminal paste.');
            this.surface.requestRender();
          }
        });
    } else {
      void this.clipboard
        .write({ plain: field.input, rich: null }, { rich: false, ansi: false })
        .then((result) => {
          if (!current()) return;
          if (kind === 'cut' && result.status === 'written') {
            field.input = '';
            field.all = false;
            this.#inputVersion++;
          }
          field.error =
            result.status === 'written'
              ? undefined
              : this.surface.t('Clipboard write unconfirmed; input kept.');
          this.surface.requestRender();
        })
        .catch(() => {
          if (current()) {
            field.error = this.surface.t('Clipboard unavailable; input kept.');
            this.surface.requestRender();
          }
        });
    }
    return true;
  }
  key(key: KeyEvent, action?: string) {
    if (key.eventType === 'repeat' && key.name === this.#closingKey) return true;
    this.#closingKey = null;
    this.validate();
    if (!this.isVisible || this.surface.focusedDockControl) return false;
    const field = this.#color;
    if (field) {
      if (action && clipboardActions.has(action)) {
        if (field.mode === 'palette') this.#customColor();
        return false;
      }
      if (key.name === 'escape') {
        this.blur();
        this.#closingKey = key.name;
      } else if (field.mode === 'palette') {
        const colors = this.#paletteColors(),
          columns = this.#paletteColumns(this.colorLayout.width);
        if (key.name === 'tab')
          this.#switchPalette(this.#paletteTab === 'presets' ? 'ansi16' : 'presets');
        else if (key.name === 'h' && !key.ctrl && !key.meta && !key.super && !key.option)
          this.#customColor();
        else if (
          key.name === 'r' &&
          !key.ctrl &&
          !key.meta &&
          !key.super &&
          !key.option &&
          key.eventType !== 'repeat'
        ) {
          this.#applyColor('');
          this.#closingKey = key.name;
        } else if ((key.name === 'enter' || key.name === 'return') && key.eventType !== 'repeat') {
          this.#applyColor(colors[field.selected]);
          this.#closingKey = key.name;
        } else {
          const delta = { left: -1, right: 1, up: -columns, down: columns }[
            key.name as 'left' | 'right' | 'up' | 'down'
          ];
          if (delta)
            field.selected = Math.max(0, Math.min(colors.length - 1, field.selected + delta));
        }
      } else if (key.name === 'enter' || key.name === 'return') {
        if (key.eventType !== 'repeat') this.#applyColor();
        this.#closingKey = key.name;
      } else if (key.name === 'backspace') {
        field.input = field.all ? '' : Array.from(field.input).slice(0, -1).join('');
        field.all = false;
        field.error = undefined;
        this.#inputVersion++;
      } else if (
        !key.ctrl &&
        !key.meta &&
        !key.super &&
        key.sequence &&
        !/\p{Cc}/u.test(key.sequence)
      )
        this.paste(key.sequence);
      this.surface.requestRender();
      return true;
    }
    if (key.name === 'escape') {
      if (!this.#focused || this.surface.model.gestureState.type !== 'idle') return false;
      this.blur();
      this.#closingKey = key.name;
      return true;
    }
    if (!this.#focused) return false;
    if (!key.ctrl && !key.meta && !key.super && !key.option) {
      if (['left', 'right', 'up', 'down', 'tab'].includes(key.name)) {
        if (!this.layout.compact) {
          const controls = this.controls;
          if (key.name === 'up' || key.name === 'down') {
            const current = controls[this.#selected]!;
            const otherRow = controls.filter((control) => control.y !== current.y);
            const center = current.x + current.width / 2;
            this.#selected = otherRow.reduce((closest, control) =>
              Math.abs(control.x + control.width / 2 - center) <
              Math.abs(closest.x + closest.width / 2 - center)
                ? control
                : closest
            ).index;
          } else {
            this.#selected =
              (this.#selected +
                (key.name === 'left' || (key.name === 'tab' && key.shift) ? -1 : 1) +
                controls.length) %
              controls.length;
          }
        }
        this.surface.requestRender();
        return true;
      }
      if (['enter', 'return', 'space'].includes(key.name)) {
        if (!this.layout.compact && key.eventType !== 'repeat') this.#pick(this.#selected, true);
        return true;
      }
    }
    this.blur();
    return false;
  }
  contains(point: { x: number; y: number }) {
    return (
      this.isVisible &&
      (cellRectContainsPoint(this.layout, point) ||
        Boolean(this.#color && cellRectContainsPoint(this.colorLayout, point)))
    );
  }
  mouse(event: MouseEvent) {
    this.validate();
    if (!this.isVisible) return false;
    const point = { x: event.x - this.surface.screenX, y: event.y - this.surface.screenY };
    if (!this.contains(point)) {
      if (event.type === 'down') this.blur();
      return false;
    }
    if (event.type === 'down' && event.button === 0) {
      this.surface.clearDockFocus();
      if (this.#color) {
        if (!cellRectContainsPoint(this.colorLayout, point)) this.blur();
        else if (this.#color.mode === 'palette') {
          const control = this.paletteControls.find((entry) => cellRectContainsPoint(entry, point));
          if (control?.id === 'hex') this.#customColor();
          else if (control?.id === 'reset') this.#applyColor('');
          else if (control) this.#switchPalette(control.id);
          else {
            const swatch = this.paletteSwatches.find((entry) =>
              cellRectContainsPoint(entry, point)
            );
            if (swatch) this.#applyColor(swatch.color);
          }
        }
      } else if (this.layout.compact || point.y === this.layout.y) {
        this.#focused = true;
      } else {
        const control = this.controls.find((entry) => cellRectContainsPoint(entry, point));
        if (control?.enabled) this.#pick(control.index, false);
      }
      this.surface.requestRender();
    }
    return true;
  }
  get cursor() {
    if (!this.isVisible || !this.#color || this.layout.compact) return null;
    if (this.#color.mode === 'palette') return null;
    const l = this.colorLayout;
    return { x: l.x + Math.min(l.width - 3, this.#color!.input.length + 2), y: l.y + 1 };
  }
  render(buffer: OptimizedBuffer, line: Line) {
    this.validate();
    if (!this.isVisible) return;
    const { foreground, background, muted, selection, selectionForeground } = this.surface.colors;
    const l = this.layout;
    if (l.compact) {
      buffer.fillRect(l.x, l.y, l.width, l.height, background);
      line(`[${this.surface.messages.inspector}]`, l.x, l.y, muted, background, l.width);
      return;
    }
    const box = (rect: CellRect, title: string) => {
      buffer.fillRect(rect.x, rect.y, rect.width, rect.height, background);
      line('┌' + '─'.repeat(rect.width - 2) + '┐', rect.x, rect.y, muted, background, rect.width);
      if (title)
        line(
          ` ${title} `,
          rect.x + 1,
          rect.y,
          foreground,
          background,
          rect.width - 2,
          createTextAttributes({ bold: true })
        );
      line(
        '└' + '─'.repeat(rect.width - 2) + '┘',
        rect.x,
        rect.y + rect.height - 1,
        muted,
        background,
        rect.width
      );
      for (let y = rect.y + 1; y < rect.y + rect.height - 1; y++) {
        line('│', rect.x, y, muted, background, 1);
        line('│', rect.x + rect.width - 1, y, muted, background, 1);
      }
    };
    box(l, this.surface.messages.inspector);
    for (const control of this.controls) {
      const focused = this.#focused && control.index === this.#selected;
      const bg = focused ? selection : control.pressed ? this.surface.colors.chrome : background;
      const fg = !control.enabled
        ? muted
        : focused
          ? selectionForeground
          : control.pressed
            ? this.surface.colors.accent
            : foreground;
      buffer.fillRect(control.x, control.y, control.width, 1, bg);
      line(
        `[${control.label}]`,
        control.x,
        control.y,
        fg,
        bg,
        control.width,
        createTextAttributes({ bold: control.pressed })
      );
    }
    if (this.#color) {
      const p = this.colorLayout;
      box(p, this.#color.kind === 'foreground' ? this.surface.t('Text') : this.surface.t('Fill'));
      if (this.#color.mode === 'palette') {
        for (const control of this.paletteControls) {
          const selected = control.id === this.#paletteTab;
          line(
            control.label,
            control.x,
            control.y,
            selected ? selectionForeground : foreground,
            selected ? selection : background,
            control.width
          );
        }
        const swatches = this.paletteSwatches;
        for (const swatch of swatches) {
          buffer.fillRect(
            swatch.x,
            swatch.y,
            swatch.width,
            swatch.height,
            RGBA.fromHex(swatch.color)
          );
        }
        const active = swatches.find((swatch) => swatch.index === this.#color!.selected);
        if (active) {
          line('[', active.x - 1, active.y, this.surface.colors.accent, background, 1);
          line(']', active.x + active.width, active.y, this.surface.colors.accent, background, 1);
        }
      } else {
        line(
          `> ${this.#color.input}`,
          p.x + 1,
          p.y + 1,
          this.#color.all ? selectionForeground : foreground,
          this.#color.all ? selection : background,
          p.width - 2
        );
        line(
          this.surface.t('Enter apply · Esc cancel'),
          p.x + 1,
          p.y + 2,
          muted,
          background,
          p.width - 2
        );
      }
    }
  }
  dispose() {
    this.#detach();
    this.close();
  }
}
