import { RGBA } from '@opentui/core';
import type { TerminalColors } from '@opentui/core';
import { COLOR_PRIMARY_TEXT } from '@chardesk/cell-plane/constants';
import {
  CHARDESK_CONTENT_THEME_TOKENS,
  type CharDeskContentTheme,
} from '@chardesk/rendering/theme';
import { materializeCanvasTemplate, type CanvasTemplateId } from '@chardesk/canvas-templates';
import type { TerminalSettingsStore } from './settings.ts';

export type TerminalPaletteSnapshot = Readonly<{
  foreground: string;
  background: string;
  slots: readonly (string | null)[];
}>;
export type TerminalAppearanceSnapshot = Readonly<{
  revision: number;
  mode: 'light' | 'dark' | 'unknown';
  status: 'unavailable' | 'refreshing' | 'ready';
  error: string;
  palette: TerminalPaletteSnapshot | null;
  contentTheme: CharDeskContentTheme;
  cursor: Readonly<{ style: 'block' | 'line'; blinking: boolean }>;
  colors: Readonly<{
    foreground: RGBA;
    background: RGBA;
    chrome: RGBA;
    muted: RGBA;
    accent: RGBA;
    minimapViewport: RGBA;
    selection: RGBA;
    selectionForeground: RGBA;
  }>;
}>;
type AppearanceSource = {
  read: () => Promise<TerminalColors>;
  mode: () => 'light' | 'dark' | null;
};
const hex = (value: string | null | undefined) =>
  value && /^#[\da-f]{6}$/i.test(value) ? value.toLowerCase() : null;
const luminance = (color: string) => {
  const rgb = [1, 3, 5].map((at) => {
    const value = Number.parseInt(color.slice(at, at + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
};
const contrast = (a: string, b: string) => {
  const left = luminance(a),
    right = luminance(b);
  return (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05);
};
function readPalette(colors: TerminalColors): TerminalPaletteSnapshot | null {
  const foreground = hex(colors.defaultForeground),
    background = hex(colors.defaultBackground);
  if (!foreground || !background) return null;
  return Object.freeze({
    foreground,
    background,
    slots: Object.freeze(colors.palette.slice(0, 16).map(hex)),
  });
}
function contentTheme(palette: TerminalPaletteSnapshot | null): CharDeskContentTheme {
  // The shared canonical foreground is an inheritance sentinel, not a Host RGB fallback.
  if (!palette)
    return Object.freeze(
      Object.fromEntries(
        CHARDESK_CONTENT_THEME_TOKENS.map((token) => [token, COLOR_PRIMARY_TEXT])
      ) as CharDeskContentTheme
    );
  const { foreground, background, slots } = palette;
  const slot = (index: number) => slots[index] ?? foreground;
  const muted = contrast(slot(8), background) >= 3 ? slot(8) : foreground;
  const accent = slot(4);
  return Object.freeze({
    foreground,
    background,
    accent,
    'accent-foreground':
      contrast(foreground, accent) >= contrast(background, accent) ? foreground : background,
    info: slot(6),
    done: slot(5),
    success: slot(2),
    warning: slot(3),
    danger: slot(1),
    'muted-foreground': muted,
    'border-subtle': muted,
    'grid-subtle': muted,
    surface: background,
    'surface-foreground': foreground,
  });
}

/** Host state only. Native references and RGB consumers share one versioned snapshot. */
export class TerminalAppearanceRuntime {
  #snapshot!: TerminalAppearanceSnapshot;
  #signature = '';
  #listeners = new Set<() => void>();
  #source: AppearanceSource | null = null;
  #pending: Promise<void> | null = null;
  #generation = 0;
  #disposed = false;
  #detachSettings: () => void;
  constructor(private settings: TerminalSettingsStore) {
    this.#publish(null, 'unknown', 'unavailable', 'Terminal colors have not been queried.');
    this.#detachSettings = settings.subscribe(() => {
      const current = this.#snapshot;
      this.#publish(current.palette, current.mode, current.status, current.error);
    });
  }
  getSnapshot = () => this.#snapshot;
  subscribe(listener: () => void) {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
  connect(source: AppearanceSource) {
    ++this.#generation;
    this.#pending = null;
    this.#source = source;
    return () => {
      if (this.#source !== source) return;
      ++this.#generation;
      this.#source = null;
      this.#pending = null;
    };
  }
  #publish(
    palette: TerminalPaletteSnapshot | null,
    mode: TerminalAppearanceSnapshot['mode'],
    status: TerminalAppearanceSnapshot['status'],
    error = ''
  ) {
    if (this.#disposed) return;
    const { cursorStyle, cursorBlink, selectionColor } = this.settings.values;
    const signature = JSON.stringify([
      palette,
      mode,
      status,
      error,
      cursorStyle,
      cursorBlink,
      selectionColor,
    ]);
    if (signature === this.#signature) return;
    this.#signature = signature;
    const foreground = RGBA.defaultForeground(palette?.foreground);
    const background = RGBA.defaultBackground(palette?.background);
    const indexed = (index: number) => RGBA.fromIndex(index, palette?.slots[index] ?? undefined);
    const readable = (index: number) =>
      !palette || (palette.slots[index] && contrast(palette.slots[index]!, palette.background) >= 3)
        ? indexed(index)
        : foreground;
    let selectionIndex = selectionColor === 'auto' ? 8 : selectionColor;
    if (selectionColor === 'auto' && palette) {
      const score = (index: number) => {
        const color = palette.slots[index];
        return color
          ? Math.min(contrast(color, palette.foreground), contrast(color, palette.background))
          : 0;
      };
      selectionIndex = [8, 4, 6].reduce(
        (best, index) => (score(index) > score(best) ? index : best),
        8
      ) as 8 | 4 | 6;
    }
    const selected = palette?.slots[selectionIndex];
    const mostVisibleSlot = (against: string, initial: number) =>
      palette!.slots.reduce(
        (best, color, index) =>
          color && contrast(color, against) > contrast(palette!.slots[best] ?? against, against)
            ? index
            : best,
        initial
      );
    let selectionForeground = foreground;
    if (palette && selected) {
      const index = mostVisibleSlot(selected, 0),
        color = palette.slots[index];
      if (color && contrast(color, selected) > contrast(palette.foreground, selected))
        selectionForeground = indexed(index);
    }
    this.#snapshot = Object.freeze({
      revision: (this.#snapshot?.revision ?? -1) + 1,
      mode,
      status,
      error,
      palette,
      contentTheme: contentTheme(palette),
      cursor: Object.freeze({ style: cursorStyle, blinking: cursorBlink }),
      colors: Object.freeze({
        foreground,
        background,
        chrome: background,
        muted: readable(8),
        accent: readable(6),
        minimapViewport: palette
          ? RGBA.fromValues(
              background.r + (foreground.r - background.r) * 0.18,
              background.g + (foreground.g - background.g) * 0.18,
              background.b + (foreground.b - background.b) * 0.18
            )
          : indexed(8),
        selection: indexed(selectionIndex),
        selectionForeground,
      }),
    });
    for (const listener of this.#listeners) listener();
  }
  /** Palette events outside our own query also include same-mode theme changes. */
  acceptPalette(colors: TerminalColors, mode: 'light' | 'dark' | null) {
    if (this.#pending || this.#disposed) return;
    ++this.#generation;
    const palette = readPalette(colors);
    this.#publish(
      palette,
      mode ?? this.#snapshot.mode,
      palette ? 'ready' : 'unavailable',
      palette ? '' : 'Terminal foreground/background are unavailable.'
    );
  }
  async refresh() {
    const source = this.#source;
    if (!source || this.#disposed) return this.#snapshot;
    const generation = ++this.#generation;
    this.#publish(this.#snapshot.palette, source.mode() ?? 'unknown', 'refreshing');
    const pending = Promise.resolve()
      .then(source.read)
      .then((colors) => {
        if (this.#disposed || generation !== this.#generation) return;
        const palette = readPalette(colors);
        this.#publish(
          palette,
          source.mode() ?? 'unknown',
          palette ? 'ready' : 'unavailable',
          palette ? '' : 'Terminal foreground/background are unavailable.'
        );
      })
      .catch((error: unknown) => {
        if (!this.#disposed && generation === this.#generation)
          this.#publish(
            null,
            source.mode() ?? 'unknown',
            'unavailable',
            error instanceof Error ? error.message : String(error)
          );
      })
      .finally(() => {
        if (this.#pending === pending) this.#pending = null;
      });
    this.#pending = pending;
    return this.capture();
  }
  /** An operation captures once; later theme changes never recolor committed content. */
  async capture(): Promise<TerminalAppearanceSnapshot> {
    while (this.#pending) await this.#pending;
    return this.#snapshot;
  }
  async ensurePalette() {
    if (!this.#pending && this.#snapshot.status !== 'ready') return this.refresh();
    return this.capture();
  }
  materializeTemplate(id: CanvasTemplateId) {
    const { palette, contentTheme: theme } = this.#snapshot;
    return materializeCanvasTemplate(id, (color) =>
      typeof color === 'string' ? color : palette ? theme[color.token] : undefined
    );
  }
  dispose() {
    this.#disposed = true;
    ++this.#generation;
    this.#source = null;
    this.#pending = null;
    this.#detachSettings();
    this.#listeners.clear();
  }
}
