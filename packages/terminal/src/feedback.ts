import type { CliRenderer } from '@opentui/core';

type Text = string | (() => string);
export type TerminalNotice = Readonly<{
  key?: string;
  text: Text;
  kind: 'success' | 'progress' | 'warning' | 'error';
  detail?: Text;
  action?: { label: Text; run: () => void };
}>;
const text = (value: Text) => (typeof value === 'function' ? value() : value);
export const noticeText = (notice: TerminalNotice) => text(notice.text);
export const noticeDetail = (notice: TerminalNotice) => (notice.detail ? text(notice.detail) : '');
export const noticeAction = (notice: TerminalNotice) =>
  notice.action ? text(notice.action.label) : '';

/** Transient acknowledgements and unresolved issues have separate lifetimes. */
export class TerminalFeedback {
  #message: TerminalNotice | undefined;
  #visible = false;
  #issues = new Map<string, TerminalNotice>();
  #timer: ReturnType<CliRenderer['clock']['setTimeout']> | undefined;
  constructor(
    private clock: CliRenderer['clock'],
    private changed: () => void
  ) {}
  get message() {
    return this.#message;
  }
  get current() {
    const issues = [...this.#issues.values()];
    return (
      issues.find((notice) => notice.kind === 'error') ??
      (this.#message?.kind === 'error' && this.#visible ? this.#message : undefined) ??
      (this.#visible ? this.#message : undefined) ??
      issues[0]
    );
  }
  show(text: Text, kind: TerminalNotice['kind'] = 'success', detail?: Text) {
    this.clear();
    this.#message = { text, kind, detail };
    this.#visible = kind !== 'progress';
    this.#timer = this.clock.setTimeout(
      () => {
        this.#timer = undefined;
        if (kind === 'progress') this.#visible = true;
        else {
          this.#message = undefined;
          this.#visible = false;
        }
        this.changed();
      },
      kind === 'progress' ? 400 : kind === 'success' ? 2200 : 6000
    );
    this.changed();
  }
  issue(key: string, notice?: TerminalNotice & { kind: 'warning' | 'error' }) {
    if (notice) this.#issues.set(key, { ...notice, key });
    else if (!this.#issues.delete(key)) return;
    this.changed();
  }
  clear() {
    if (this.#timer !== undefined) this.clock.clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#message = undefined;
    this.#visible = false;
    this.changed();
  }
  dispose() {
    if (this.#timer !== undefined) this.clock.clearTimeout(this.#timer);
    this.#issues.clear();
    this.#message = undefined;
  }
}
