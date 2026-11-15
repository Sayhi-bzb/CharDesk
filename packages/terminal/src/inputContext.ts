import type { OperationContext } from '@chardesk/local-runtime/operations';
import type { TerminalPanel } from './surface.ts';
import type { TerminalAction } from './shortcuts.ts';

export type InputChannel = 'key' | 'paste' | 'pointer' | 'command';
const application = new Set(['quit', 'view-shortcuts', 'feedback-details']);
const modalCommands = new Set(['escape', 'help', 'copy', 'cut', 'paste', 'select-all']);

export class SurfaceLease {
  readonly owner = {};
  readonly #abort = new AbortController();
  #task: AbortController | null = null;
  constructor(readonly panel: TerminalPanel, private readonly visible: () => boolean,
    private readonly changed: () => void) {}
  get current() { return !this.#abort.signal.aborted && this.visible(); }
  get signal() { return this.#abort.signal; }
  get busy() { return this.current && this.#task !== null; }
  beginTask() {
    if (!this.current || this.#task) return null;
    const task = new AbortController();
    this.#task = task;
    const abort = () => task.abort();
    this.#abort.signal.addEventListener('abort', abort, { once: true });
    this.changed();
    return {
      context: { owner: this.owner, signal: task.signal } satisfies OperationContext,
      finish: () => {
        this.#abort.signal.removeEventListener('abort', abort);
        task.abort();
        if (this.#task === task) this.#task = null;
        this.changed();
      },
    };
  }
  dispose() { this.#abort.abort(); this.#task = null; }
}

/** One Host authority for input admission and surface/request ownership. */
export class TerminalInputContext {
  #phase: 'ready' | 'closing' | 'disposed' = 'ready';
  #frames: Array<{ panel: TerminalPanel; owner: object; lease: SurfaceLease; commands: ReadonlySet<string> }> = [];
  dockFocus: TerminalAction | null = null;
  focusOwner: object | null = null;
  readonly #focusPaste = new WeakMap<object, () => boolean>();
  constructor(private readonly changed: () => void) {}
  get panel() { return this.#frames.at(-1)?.panel ?? null; }
  get closing() { return this.#phase !== 'ready'; }
  setClosing(closing: boolean) {
    if (this.#phase === 'disposed') return;
    if (closing === (this.#phase === 'closing')) return;
    if (closing) {
      this.#phase = 'closing';
      this.#frames.forEach((frame) => frame.lease.dispose());
      this.dockFocus = null;
      this.focusOwner = null;
    } else {
      this.#phase = 'ready';
      const frame = this.#frames.pop();
      if (frame) this.#install(frame.panel, frame.owner, frame.commands);
    }
    this.changed();
  }
  registerFocusOwner(owner: object, acceptsPaste: () => boolean) { this.#focusPaste.set(owner, acceptsPaste); }
  #install(panel: TerminalPanel, owner: object, commands: ReadonlySet<string>) {
    const lease = new SurfaceLease(panel, () => this.panel === panel && this.#phase === 'ready', this.changed);
    const frame = { panel, owner, lease, commands };
    Object.defineProperty(panel, 'busy', { configurable: true, enumerable: true, get: () => lease.busy });
    this.#frames.push(frame);
    return frame;
  }
  openPanel(panel: TerminalPanel, owner: object, commands: ReadonlySet<string> = modalCommands) {
    const existing = this.#frames.findIndex((frame) => frame.panel === panel);
    if (existing >= 0) this.#frames.splice(existing).forEach((frame) => frame.lease.dispose());
    else if (panel.underlay !== this.panel) this.#frames.splice(0).forEach((frame) => frame.lease.dispose());
    else this.#frames.at(-1)?.lease.dispose();
    this.dockFocus = null;
    this.focusOwner = null;
    this.#install(panel, owner, commands);
    this.changed();
  }
  closePanel(owner: object) {
    const index = this.#frames.findIndex((frame) => frame.owner === owner);
    if (index < 0) return;
    this.#frames.splice(index).forEach((frame) => frame.lease.dispose());
    const parent = this.#frames.pop();
    if (parent) this.#install(parent.panel, parent.owner, parent.commands);
    this.changed();
  }
  ownedPanel(owner: object) {
    const frame = this.#frames.at(-1);
    return frame?.owner === owner ? frame.panel : null;
  }
  lease(panel: TerminalPanel) {
    return this.#frames.find((frame) => frame.panel === panel)?.lease;
  }
  admit(channel: InputChannel, action?: string) {
    if (this.#phase !== 'ready') return false;
    if (this.panel?.busy)
      return !!action && (application.has(action) || action === 'escape' || action === 'dismiss');
    if (channel === 'paste' && this.panel && this.panel.input === undefined) return false;
    if (channel === 'paste' && !this.panel &&
      (this.dockFocus || (this.focusOwner && !this.#focusPaste.get(this.focusOwner)?.()))) return false;
    if (channel === 'command' && this.panel)
      return !!action && (application.has(action) || action === 'escape' || action === 'help' ||
        this.#frames.at(-1)!.commands.has(action));
    return true;
  }
  dispose() {
    this.#phase = 'disposed';
    this.#frames.splice(0).forEach((frame) => frame.lease.dispose());
    this.dockFocus = null;
    this.focusOwner = null;
  }
}
