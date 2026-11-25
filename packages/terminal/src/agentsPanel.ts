import type { KeyEvent } from '@opentui/core';
import type { CanvasAgents, CanvasAgentActivity } from '@chardesk/local-runtime/agents';
import type { CanvasSurface, TerminalPanel } from './surface.ts';
import type { TerminalClipboardAccess } from './clipboard.ts';
import {
  activityAction,
  activityTime,
  formatAgentCommand,
  wrapAgentDetail,
} from './agentActivityFormat.ts';
import { agentSetupText } from './agentSetup.ts';

const PAGE_SIZE = 50;
type CallDetail = {
  entry: CanvasAgentActivity;
  command: string | null;
  input: string | null;
  selected: number;
};

export class TerminalAgentsPanel {
  #panel: TerminalPanel | null = null;
  #canvasId?: string;
  #tab = 0;
  #page = 0;
  #finishReading = () => {};
  #entries: CanvasAgentActivity[] = [];
  #detail?: CallDetail;
  #detailAction = -1;
  #timer?: ReturnType<typeof setInterval>;
  #disposers: Array<() => void>;
  constructor(
    private surface: CanvasSurface,
    private agents: CanvasAgents,
    private currentCanvas: () => string | undefined,
    private prepareOpen: () => void,
    private clipboard?: TerminalClipboardAccess
  ) {
    this.#canvasId = currentCanvas();
    this.#disposers = [
      agents.subscribe(() => this.#refresh()),
      surface.settings.subscribe(() => this.#refresh()),
      surface.model.subscribe(() => {
        const id = this.currentCanvas();
        if (id !== this.#canvasId) {
          this.close();
          this.#canvasId = id;
        }
        this.surface.requestRender();
      }),
      surface.viewStatus.set({
        id: 'agents',
        row: 1,
        align: 'right',
        tone: 'normal',
        text: () => (this.currentCanvas() ? this.surface.t('Agents') : ''),
        badge: () => {
          const id = this.currentCanvas();
          if (!id) return '';
          const count = this.agents.count(id);
          return count ? String(count) : '';
        },
        onPick: () => this.open(),
      }),
    ];
    const resize = () => this.#refresh();
    surface.on('resize', resize);
    this.#disposers.push(() => surface.off('resize', resize));
  }
  get isOpen() {
    return this.#panel !== null && this.surface.panel === this.#panel;
  }
  open() {
    const canvasId = this.currentCanvas();
    if (!canvasId) return;
    this.close();
    this.prepareOpen();
    this.surface.cancelGesture();
    this.surface.clearDockFocus();
    this.surface.model.cancelPendingPaste();
    this.surface.help = false;
    this.#tab = this.agents.count(canvasId) ? 0 : 2;
    this.#page = 0;
    const seen = new Map<number, number>();
    let acknowledged = false;
    this.#finishReading = () => {
      if (acknowledged) return;
      acknowledged = true;
      clearInterval(this.#timer);
      if (
        !this.agents.markRead(
          canvasId,
          [...seen].map(([id, revision]) => ({ id, revision }))
        )
      )
        this.surface.feedback.show(
          () => this.surface.t('Could not mark activity as read'),
          'error'
        );
    };
    this.#panel = {
      title: this.surface.t('Agents'),
      dialog: true,
      hint: '',
      items: [],
      selected: 0,
      onPick: (index) => this.#openDetails(index),
      onClose: () => this.close(),
      onTab: (index) => {
        if (index !== this.#tab) this.#panel!.scrollArea = undefined;
        this.#tab = index;
        this.#page = 0;
        this.#panel!.selected = 0;
        this.#refresh();
      },
    };
    this.surface.input.openPanel(this.#panel, this, new Set());
    this.surface.input
      .lease(this.#panel)!
      .signal.addEventListener('abort', this.#finishReading, { once: true });
    this.#recordRendered = (entries) => {
      for (const entry of entries)
        seen.set(entry.id, Math.max(seen.get(entry.id) ?? 0, entry.revision));
    };
    this.#timer = setInterval(() => this.#refresh(), 30_000);
    this.#timer.unref();
    this.#refresh();
  }
  #recordRendered: (entries: readonly { id: number; revision: number }[]) => void = () => {};
  #refresh() {
    if (this.isOpen) {
      if (this.#detail) {
        this.#refreshDetails();
        this.surface.requestRender();
        return;
      }
      const panel = this.#panel!,
        { t } = this.surface;
      panel.title = t('Agents');
      panel.tabs = [t('Unread'), t('Read'), t('Agent')];
      panel.trailingTab = 2;
      panel.selectedTab = this.#tab;
      if (this.#tab === 2) {
        this.#refreshAgent();
        this.surface.requestRender();
        return;
      }
      const read = this.#tab === 1,
        canvasId = this.currentCanvas() ?? '';
      const total = this.agents.count(canvasId, read);
      this.#page = Math.min(this.#page, Math.max(0, Math.ceil(total / PAGE_SIZE) - 1));
      const entries = this.agents.list(canvasId, read, PAGE_SIZE, this.#page * PAGE_SIZE);
      this.#entries = entries;
      panel.actionPlacement = 'dialog-footer';
      panel.scrollArea = undefined;
      panel.items = entries.map((entry) => `${entry.name} · ${activityAction(entry, t)}`);
      panel.itemHints = entries.map((entry) => activityTime(entry.updatedAt, t));
      panel.onPick = (index) => this.#openDetails(index);
      panel.onItemsRendered = read
        ? undefined
        : (start, end) => this.#recordRendered(entries.slice(start, end));
      panel.selected = Math.max(0, Math.min(panel.selected, panel.items.length - 1));
      panel.emptyMessage = read ? t('No read activity') : t('No unread activity');
      panel.error = this.agents.error
        ? t('Activity history unavailable. Restart CharDesk to retry.')
        : undefined;
      panel.status = undefined;
      panel.footerStatus =
        total > PAGE_SIZE
          ? t`${this.#page * PAGE_SIZE + 1}–${this.#page * PAGE_SIZE + entries.length} of ${total} activities`
          : undefined;
      panel.actions = [
        ...(!read && total > 0
          ? [
              {
                id: 'agent-read-all',
                label: t('Read all'),
                onPick: () => this.#markAllRead(),
              },
            ]
          : []),
      ];
      panel.hint = t('Tab view · Enter details · ↑↓ browse · ←→ page · Esc close');
    }
    this.surface.requestRender();
  }
  #refreshAgent() {
    const panel = this.#panel!,
      { t } = this.surface;
    const text = agentSetupText(t);
    panel.actionPlacement = 'dialog-footer';
    panel.scrollArea = {
      lines: wrapAgentDetail(text, this.surface.panelLayout.width - 4),
      scrollTop: panel.scrollArea?.scrollTop ?? 0,
    };
    panel.items = [];
    panel.itemHints = undefined;
    panel.onPick = undefined;
    panel.onItemsRendered = undefined;
    panel.emptyMessage = undefined;
    panel.error = undefined;
    panel.status = undefined;
    panel.footerStatus = undefined;
    panel.actions = [
      {
        id: 'agent-copy-setup',
        label: t('Copy'),
        onPick: () => this.#copy(text, () => !this.#detail && this.#tab === 2),
      },
    ];
    panel.hint = t('Enter copy · Tab view · ↑↓ scroll · Esc close');
    this.surface.scrollPanelContent(0);
  }
  #openDetails(index: number) {
    const entry = this.#entries[index];
    if (!entry) return;
    const details = this.agents.details(this.currentCanvas()!, entry.id);
    this.#detail = {
      entry,
      selected: index,
      command: details?.argv ? formatAgentCommand(details.argv, this.surface.platform) : null,
      input: details?.input ? JSON.stringify(JSON.parse(details.input), null, 2) : null,
    };
    this.#detailAction = -1;
    this.#panel!.selected = 0;
    this.#refresh();
  }
  #refreshDetails() {
    const detail = this.#detail!,
      panel = this.#panel!,
      { t } = this.surface;
    panel.actionPlacement = undefined;
    panel.footerStatus = undefined;
    panel.title = t('Call details');
    panel.tabs = undefined;
    panel.trailingTab = undefined;
    panel.selectedTab = undefined;
    panel.itemHints = undefined;
    const body =
      detail.command || detail.input
        ? `${t('Command')}\n${detail.command ?? t('Command arguments were not recorded')}\n\n${t('Input JSON')}\n${detail.input ?? t('Input was not recorded')}`
        : t('No call details recorded for this activity');
    panel.scrollArea = {
      lines: wrapAgentDetail(body, this.surface.panelLayout.width - 4),
      scrollTop: panel.scrollArea?.scrollTop ?? 0,
      onRendered: (start, end) => {
        if (end > start) this.#recordRendered([detail.entry]);
      },
    };
    panel.items = [];
    panel.onPick = undefined;
    panel.onItemsRendered = undefined;
    panel.status = undefined;
    panel.actions = [
      ...(detail.command
        ? [
            {
              id: 'agent-copy-command',
              label: t('Copy command'),
              onPick: () => this.#copy(detail.command!, () => this.#detail === detail),
            },
          ]
        : []),
      ...(detail.input
        ? [
            {
              id: 'agent-copy-input',
              label: t('Copy input'),
              onPick: () => this.#copy(detail.input!, () => this.#detail === detail),
            },
          ]
        : []),
      { id: 'agent-back', label: t('Back'), onPick: () => this.#back() },
    ].map((action, index) => ({
      ...action,
      label: index === this.#detailAction ? `› ${action.label}` : action.label,
    }));
    const focused = panel.actions[this.#detailAction];
    panel.status =
      focused && !this.surface.panelFooterControls.some((control) => control.id === focused.id)
        ? focused.label
        : undefined;
    panel.hint = t('Tab actions · Enter choose · ↑↓ scroll · Esc back');
    this.surface.scrollPanelContent(0);
  }
  #copy(text: string, isCurrent: () => boolean) {
    if (!this.clipboard) return;
    const panel = this.#panel;
    const current = () => this.isOpen && this.#panel === panel && isCurrent();
    void this.clipboard
      .write({ plain: text, rich: null }, { rich: false, ansi: false })
      .then((result) => {
        if (!current()) return;
        if (result.status === 'written')
          this.surface.feedback.show(() => this.surface.messages.copied);
        else if (result.status === 'dispatched')
          this.surface.feedback.show(() => this.surface.messages.copyDispatched, 'warning');
        else this.surface.feedback.show(() => this.surface.messages.clipboardFailed, 'error');
      })
      .catch(() => {
        if (current())
          this.surface.feedback.show(() => this.surface.messages.clipboardFailed, 'error');
      });
  }
  #markAllRead() {
    const canvasId = this.currentCanvas();
    if (!this.isOpen || this.#detail || this.#tab !== 0 || !canvasId) return;
    if (!this.agents.markAllRead(canvasId))
      this.surface.feedback.show(() => this.surface.t('Could not mark activity as read'), 'error');
  }
  #back() {
    const detail = this.#detail!;
    this.#detail = undefined;
    this.#panel!.selected = detail.selected;
    this.#refresh();
    const index = this.#entries.findIndex((entry) => entry.id === detail.entry.id);
    if (index >= 0) this.#panel!.selected = index;
    this.surface.requestRender();
  }
  #turnPage(delta: number) {
    const total = this.agents.count(this.currentCanvas() ?? '', this.#tab === 1);
    this.#page = Math.max(0, Math.min(Math.ceil(total / PAGE_SIZE) - 1, this.#page + delta));
    this.#panel!.selected = 0;
    this.#refresh();
  }
  close() {
    this.#finishReading();
    this.surface.input.closePanel(this);
    this.#panel = null;
    this.#detail = undefined;
    this.surface.requestRender();
  }
  key(key: KeyEvent) {
    if (!this.isOpen) return false;
    if (key.name === 'escape') {
      if (this.#detail) this.#back();
      else this.close();
    } else if (!this.#detail && key.name === 'tab')
      this.#panel!.onTab!((this.#tab + (key.shift ? -1 : 1) + 3) % 3);
    else if (this.#detail || this.#tab === 2) {
      if (!this.#detail && (key.name === 'return' || key.name === 'enter')) {
        this.#panel!.actions?.[0]?.onPick();
        return true;
      }
      if (key.name === 'tab') {
        const count = this.#panel!.actions!.length;
        this.#detailAction =
          this.#detailAction < 0
            ? key.shift
              ? count - 1
              : 0
            : (this.#detailAction + (key.shift ? -1 : 1) + count) % count;
        this.#refresh();
      } else if (key.name === 'return' || key.name === 'enter')
        this.#panel!.actions?.[this.#detailAction]?.onPick();
      else if (['up', 'down', 'pageup', 'pagedown', 'home', 'end'].includes(key.name)) {
        const delta = key.name === 'up' || key.name === 'pageup' ? -1 : 1;
        const movement =
          key.name === 'home'
            ? -Infinity
            : key.name === 'end'
              ? Infinity
              : delta *
                (key.name.startsWith('page') ? Math.max(1, this.surface.panelLayout.rows) : 1);
        this.surface.scrollPanelContent(movement);
        this.#detailAction = -1;
        this.#refresh();
      }
    } else if (key.name === 'return' || key.name === 'enter')
      this.#openDetails(this.#panel!.selected);
    else if (key.name === 'left' || key.name === 'right')
      this.#turnPage(key.name === 'left' ? -1 : 1);
    else if (key.name === 'up' || key.name === 'down') {
      const panel = this.#panel!;
      panel.selected = Math.max(
        0,
        Math.min(panel.items.length - 1, panel.selected + (key.name === 'up' ? -1 : 1))
      );
      this.#refresh();
    }
    return true;
  }
  dispose() {
    this.close();
    for (const dispose of this.#disposers) dispose();
  }
}
