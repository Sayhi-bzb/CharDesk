export type TerminalViewStatusItem = {
  id: string;
  text: string | (() => string);
  align?: 'left' | 'right';
  onPick?: () => void;
};

export type TerminalViewStatusControl = {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
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
    fit: (text: string, width: number) => string
  ) {
    let left = 1,
      right = width - 1;
    const items = [...this.#items.values()];
    const controls: TerminalViewStatusControl[] = [];
    const append = (item: TerminalViewStatusItem, align: 'left' | 'right') => {
      if (right <= left) return;
      const text = fit(typeof item.text === 'function' ? item.text() : item.text, right - left);
      if (!text) return;
      const size = measure(text);
      controls.push({
        id: item.id,
        text,
        x: align === 'left' ? left : right - size,
        y,
        width: size,
        height: 1,
        onPick: item.onPick,
      });
      if (align === 'left') left += size + 3;
      else right -= size + 3;
    };
    for (const item of items.filter((item) => item.align !== 'right')) append(item, 'left');
    for (const item of items.filter((item) => item.align === 'right').reverse())
      append(item, 'right');
    return controls;
  }
}
