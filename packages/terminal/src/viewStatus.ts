export type TerminalViewStatusItem = {
  id: string;
  text: string | (() => string);
  compactText?: string | (() => string);
  badge?: string | (() => string);
  align?: 'left' | 'right';
  row?: 1 | 2;
  tone?: 'normal' | 'muted';
  onPick?: () => void;
};

export type TerminalViewStatusControl = {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  badge?: { text: string; offset: number };
  tone?: 'normal' | 'muted';
  onPick?: () => void;
};

/** View-owned entries, independent of document selection and editing commands. */
export class TerminalViewStatus {
  #items = new Map<string, TerminalViewStatusItem>();
  constructor(private invalidate: () => void) {}

  set(item: TerminalViewStatusItem) {
    this.#items.set(item.id, item);
    this.invalidate();
    return () => {
      if (this.#items.get(item.id) !== item) return;
      this.#items.delete(item.id);
      this.invalidate();
    };
  }

  layout(
    width: number,
    y: number,
    measure: (text: string) => number,
    fit: (text: string, width: number) => string,
    row: 1 | 2 = 2
  ) {
    let left = 1,
      right = width - 1;
    const items = [...this.#items.values()].filter((item) => (item.row ?? 2) === row);
    const resolveText = (value: string | (() => string)) =>
      typeof value === 'function' ? value() : value;
    const value = (item: TerminalViewStatusItem, compact = false) => {
      const label = resolveText(compact && item.compactText ? item.compactText : item.text);
      const badge = item.badge ? resolveText(item.badge) : '';
      return { label, badge, text: badge ? `${label} ${badge}` : label };
    };
    const fullWidth = items.reduce((size, item) => size + measure(value(item).text) + 3, -3);
    const compact = fullWidth > width - 2;
    const controls: TerminalViewStatusControl[] = [];
    const append = (item: TerminalViewStatusItem, align: 'left' | 'right') => {
      if (right <= left) return;
      const content = value(item, compact);
      const text = fit(content.text, right - left);
      if (!text) return;
      const size = measure(text);
      controls.push({
        id: item.id,
        text,
        x: align === 'left' ? left : right - size,
        y,
        width: size,
        height: 1,
        ...(item.tone ? { tone: item.tone } : {}),
        ...(content.badge && text === content.text
          ? { badge: { text: content.badge, offset: measure(content.label) + 1 } }
          : {}),
        onPick: item.onPick,
      });
      if (align === 'left') left += size + 3;
      else right -= size + 3;
    };
    for (const item of items.filter((item) => item.align === 'right').reverse())
      append(item, 'right');
    for (const item of items.filter((item) => item.align !== 'right')) append(item, 'left');
    return controls;
  }
}
