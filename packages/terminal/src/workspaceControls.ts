import {
  captureCanvasExport,
  prepareCanvasTextExport,
  type CanvasExportScope,
} from '@chardesk/editor-core/exportPlan';
import { captureExportSnapshot, renderSelectionSnapshot } from './snapshot.ts';
import { deliverExportFile } from './exportFile.ts';
import { prepareCanvasRowsWrite } from '@chardesk/editor-core/writeText';
import { CharacterPicker } from './characters.ts';
import { CANVAS_TEMPLATES } from '@chardesk/canvas-templates';
import { drawingLabel, drawingTools } from './drawing.ts';
import type { KeyEvent } from '@opentui/core';
import { segmentGraphemes, getTextCellWidth } from '@chardesk/protocol';
import { searchCanvasSurface, type CanvasSearchResult } from '@chardesk/editor-core/search';
import type { ClipboardPort } from '@chardesk/editor-core/clipboard/commands';
import type { CanvasSurface, TerminalPanel } from './surface.ts';
import type { TerminalWorkspace } from '@chardesk/local-runtime/workspace';
import type { TerminalAction } from './shortcuts.ts';
import type { LocalSessions } from '@chardesk/local-runtime/sessions';
import type { LocalSession } from '@chardesk/local-runtime/sessionCatalog';
import { navigationActions } from './navigation.ts';
import { watchWorkspaceSources } from './sourceMonitor.ts';
import { noticeText, noticeDetail, type TerminalNotice } from './feedback.ts';

/** Transient Host panels. All document mutations still run through shared commands. */
export class WorkspaceControls {
  #kind = '';
  #includeArchived = false;
  readonly #characters: CharacterPicker;
  #selectedAll = false;
  #inputVersion = 0;
  #alive = true;
  #query = '';
  #regex = false;
  #ignoreCase = false;
  #result: CanvasSearchResult | null = null;
  #match = -1;
  #searchPages: Array<readonly [number, number] | undefined> = [undefined];
  #searchPage = 0;
  #document: string;
  #version: string;
  #detach: () => void;
  #detachAppearance: () => void;
  #detachSettings: () => void;
  #detachSources: () => void;
  #refreshPlacement: (() => void) | null = null;
  #enter = () => {};
  #special: (key: KeyEvent) => boolean = () => false;
  #anchorIds: string[] = [];
  #place: (() => void) | null = null;
  #placementTarget = '';
  #target() {
    return JSON.stringify([
      this.surface.model.documents.getActiveAddress(),
      this.surface.model.getSnapshot().interaction,
      this.surface.model.currentTool,
      this.surface.model.version,
    ]);
  }
  constructor(
    readonly surface: CanvasSurface,
    readonly workspace: TerminalWorkspace,
    readonly clipboard: ClipboardPort,
    readonly closeLast: () => void,
    readonly sessions?: LocalSessions
  ) {
    this.#characters = new CharacterPicker({
      surface,
      show: (panel, enter, special) => this.#show('characters', panel, enter, special),
      dismiss: () => this.dismiss(),
      target: () => this.#target(),
    });
    this.#document = JSON.stringify(surface.model.documents.getActiveAddress());
    this.#version = surface.model.version;
    this.#detach = surface.model.subscribe(() => {
      if (this.surface.placement && this.#target() !== this.#placementTarget) this.dismiss();
      const document = JSON.stringify(surface.model.documents.getActiveAddress());
      if (document !== this.#document) {
        this.#document = document;
        this.#result = null;
        this.#match = -1;
        surface.searchHighlights = [];
        if (
          [
            'search',
            'anchors',
            'anchor-name',
            'save-copy',
            'tools',
            'drawing-setting',
            'templates',
            'template-place',
            'characters',
            'navigation',
            'export',
            'export-path',
            'file-source',
          ].includes(this.#kind)
        )
          this.dismiss();
      } else if (this.#version !== surface.model.version) {
        this.#result = null;
        surface.searchHighlights = [];
        if (this.#kind === 'anchors') this.#refreshAnchors();
      }
      this.#version = surface.model.version;
      this.refresh();
    });
    this.#detachAppearance = surface.appearance.subscribe(() => {
      this.#refreshPlacement?.();
      surface.requestRender();
    });
    this.#detachSettings = surface.settings.subscribe(() => this.refresh());
    this.#detachSources = watchWorkspaceSources(workspace, surface.renderer, () => this.refresh());
    this.refresh();
  }

  refresh() {
    const failed = this.workspace.files.filter((file) => this.workspace.errorFor(file));
    this.surface.feedback.issue(
      'document-save',
      failed.length
        ? {
            text: () => this.surface.t('Unsaved'),
            kind: 'error',
            detail: failed
              .map((file) => `${file.path}: ${this.workspace.errorFor(file)}`)
              .join('\n'),
            action: {
              label: () => this.surface.t('Source'),
              run: () => {
                const index = this.workspace.files.indexOf(failed[0]!);
                if (index < 0) return;
                this.workspace.switchTo(index);
                this.sources();
              },
            },
          }
        : undefined
    );
    const sourceNotice = this.#sourceNotice();
    this.surface.feedback.issue(
      'source',
      sourceNotice
        ? {
            text: sourceNotice,
            kind: 'warning',
            detail: this.#sourceDescription(),
            action: { label: () => this.surface.t('Source'), run: () => this.sources() },
          }
        : undefined
    );
    if (this.#kind === 'file-source' && this.surface.panel)
      Object.assign(this.surface.panel, {
        status: this.#sourceDescription(),
        notice: this.#sourceFeedback(),
      });
    this.surface.hasDocument = this.workspace.files.length > 0;
    this.surface.filename = this.workspace.files.length ? this.workspace.active.title : '';
    this.surface.documentLabels = this.workspace.files.map((file) => ({
      label: `${file.title}${this.surface.model.isDirtyAt(file.address!) ? '*' : ''}${this.workspace.errorFor(file) ? ' !' : ''}`,
      active: file === this.workspace.active,
    }));
    this.surface.requestRender();
  }
  dismiss() {
    this.sessions?.cancelPending();
    this.workspace.cancelPendingOpen();
    this.#characters.close();
    this.surface.panel = null;
    this.surface.placement = null;
    this.#place = null;
    this.#kind = '';
    this.#refreshPlacement = null;
    this.#selectedAll = false;
    this.surface.requestRender();
  }
  #show(
    kind: string,
    panel: TerminalPanel,
    enter: () => void,
    special: (key: KeyEvent) => boolean = () => false
  ) {
    this.surface.clearDockFocus();
    this.surface.cancelGesture();
    this.surface.model.cancelPendingPaste();
    this.surface.help = false;
    this.#kind = kind;
    this.#inputVersion++;
    this.#selectedAll = false;
    this.#enter = enter;
    this.#special = special;
    this.surface.panel = panel;
    this.surface.requestRender();
  }
  #async(panel: TerminalPanel, run: () => Promise<unknown>) {
    if (panel.busy) return;
    panel.busy = true;
    void run()
      .then(() => {
        if (this.#alive) {
          if (this.surface.panel === panel) this.dismiss();
          this.refresh();
        }
      })
      .catch((error) => {
        if (this.#alive && this.surface.panel === panel) {
          panel.busy = false;
          panel.error = error instanceof Error ? error.message : String(error);
          this.surface.requestRender();
        }
      });
  }
  filePrompt(kind: 'open' | 'new' | 'save-copy') {
    const panel: TerminalPanel = {
      dialog: Boolean(this.sessions),
      onClose: () => this.dismiss(),
      title:
        kind === 'save-copy'
          ? this.surface.t('Duplicate document')
          : kind === 'new'
            ? this.surface.t('New document — choose a new path')
            : this.surface.t('Open document'),
      input: '',
      hint: this.surface.t('Enter confirm · Esc cancel'),
      items: [],
      selected: 0,
    };
    this.#show(kind, panel, () => {
      if (!panel.input?.trim()) return;
      this.#async(panel, async () => {
        if (kind === 'save-copy') {
          await this.workspace.saveCopy(panel.input!.trim());
          this.surface.feedback.show(() => this.surface.t('Document duplicated'));
        } else {
          if (kind === 'new') {
            const { readOptional, resolveCanvasFilePath } =
              await import('@chardesk/local-runtime/document');
            if ((await readOptional(await resolveCanvasFilePath(panel.input!.trim()))) !== null)
              throw new Error(this.surface.t('The file already exists. Use Open.'));
          }
          if (!this.#alive || this.surface.panel !== panel) return;
          if (this.sessions) await this.sessions.openPath(panel.input!.trim());
          else await this.workspace.openFile(panel.input!.trim());
        }
      });
    });
  }
  newSession() {
    const panel: TerminalPanel = {
      dialog: true,
      onClose: () => this.dismiss(),
      title: this.surface.t('New canvas'),
      hint: this.surface.t('Esc cancel'),
      items: [],
      selected: 0,
    };
    this.#show('session-create', panel, () => {});
    this.#async(panel, () => this.sessions!.create());
  }
  #renameSession(record: LocalSession) {
    const panel: TerminalPanel = {
      dialog: true,
      onClose: () => this.dismiss(),
      title: this.surface.t('Rename session'),
      input: record.name,
      hint: this.surface.t('Enter confirm · Esc cancel'),
      items: [],
      selected: 0,
    };
    this.#show('session-name', panel, () => {
      this.#async(panel, async () => {
        this.sessions!.rename(record.id, panel.input!, record.revision);
        this.documents(record.id);
      });
    });
    this.#selectedAll = true;
  }
  #sessionList(selectedId?: string) {
    const records = this.sessions!.list(this.#includeArchived);
    const activePath = this.workspace.files.length ? this.workspace.active.path : null;
    const panel: TerminalPanel = {
      dialog: true,
      onClose: () => this.dismiss(),
      title: this.surface.t('Sessions'),
      tabs: [this.surface.t('Canvases'), this.surface.t('Archived')],
      selectedTab: Number(this.#includeArchived),
      onTab: (index) => {
        this.#includeArchived = index === 1;
        this.documents();
      },
      hint: this.surface
        .t`R rename · D copy · A ${this.#includeArchived ? this.surface.t('restore') : this.surface.t('archive')} · Del close · F5 refresh`,
      actions: [
        { id: 'new', label: this.surface.t('N new'), onPick: () => this.newSession() },
        { id: 'open', label: this.surface.t('O open'), onPick: () => this.filePrompt('open') },
      ],
      emptyMessage: this.surface.t(this.#includeArchived ? 'No archived sessions' : 'No sessions'),
      items: records.map(
        (record) =>
          `${record.path === activePath ? '▸ ' : ''}${record.name}${record.removing ? this.surface.t(' (removal pending)') : record.status === 'creating' ? this.surface.t(' (incomplete)') : ''}`
      ),
      selected: Math.max(
        0,
        records.findIndex(
          (record) => record.id === selectedId || (!selectedId && record.path === activePath)
        )
      ),
    };
    const pick = () => {
      const record = records[panel.selected];
      if (record) this.#async(panel, () => this.sessions!.open(record.id));
    };
    panel.onPick = pick;
    this.#show('sessions', panel, pick, (key) => {
      if (key.ctrl || key.meta || key.super) return false;
      const record = records[panel.selected];
      if (key.name === 'tab' || key.name === 'f10') panel.onTab!(1 - panel.selectedTab!);
      else if (key.name === 'n') this.newSession();
      else if (key.name === 'o') this.filePrompt('open');
      else if (key.name === 'f5') this.documents(record?.id);
      else if (key.name === 'r' && record) this.#renameSession(record);
      else if (key.name === 'x' && record) this.#sessionRemoval(record);
      else if (key.name === 's' && record)
        this.#async(panel, async () => {
          await this.sessions!.open(record.id);
          this.sources();
        });
      else if (key.name === 'd' && record)
        this.#async(panel, () => this.sessions!.duplicate(record.id));
      else if (key.name === 'a' && record)
        this.#async(panel, async () => {
          await this.sessions!.archive(record.id, !record.archived, record.revision);
          this.documents();
        });
      else if (key.name === 'delete' && record) {
        const file = this.workspace.files.find((file) => file.path === record.path);
        if (file) this.closeDocument(file);
      } else return false;
      return true;
    });
  }
  #sessionRemoval(record: LocalSession) {
    const loading: TerminalPanel = {
      dialog: true,
      title: this.surface.t('Remove session'),
      status: record.path,
      hint: this.surface.t('Esc cancel'),
      items: [],
      selected: 0,
      onClose: () => this.dismiss(),
    };
    this.#show('session-removal', loading, () => {});
    this.#async(loading, async () => {
      const plan = record.removing
        ? null
        : await this.sessions!.planRemoval(record.id, record.revision);
      if (!this.#alive || this.surface.panel !== loading) return;
      const panel: TerminalPanel = {
        dialog: true,
        title: this.surface.t`Remove ${record.name}`,
        status: record.path,
        hint: this.surface.t('Enter confirm · Esc cancel'),
        selected: 0,
        items: record.removing
          ? [this.surface.t('Cancel'), this.surface.t('Recover interrupted removal')]
          : [
              this.surface.t('Cancel'),
              this.surface.t('Remove session record — keep file'),
              ...(plan?.file ? [this.surface.t('Delete managed file and session record')] : []),
            ],
        error: plan?.fileUnavailable,
        onClose: () => this.dismiss(),
      };
      const pick = () => {
        if (panel.selected === 0) {
          this.documents(record.id);
          return;
        }
        const action = panel.selected;
        panel.hint = this.surface.t('Removing… · Esc dismiss');
        this.#async(panel, async () => {
          if (record.removing) await this.sessions!.repairRemoval(record.id);
          else if (action === 1) await this.sessions!.removeRecord(record.id, record.revision);
          else await this.sessions!.deleteManaged(plan!);
          if (this.#alive && this.surface.panel === panel) this.documents();
        });
      };
      panel.onPick = pick;
      this.#show('session-removal', panel, pick);
    });
  }
  documents(selectedId?: string) {
    if (this.sessions) {
      this.#sessionList(selectedId);
      return;
    }
    const files = [...this.workspace.files];
    const panel: TerminalPanel = {
      title: this.surface.t('Documents'),
      hint: this.surface.t('Enter open · Del close'),
      items: [
        ...files.map(
          (file) =>
            `${file === this.workspace.active ? '▸ ' : ''}${file.title}${this.surface.model.isDirtyAt(file.address!) ? ' *' : ''}  ${file.path}${this.workspace.errorFor(file) ? `  ! ${this.workspace.errorFor(file)}` : ''}`
        ),
        this.surface.t('+ Open'),
        this.surface.t('+ New'),
        this.surface.t('Duplicate…'),
      ],
      selected: files.indexOf(this.workspace.active),
    };
    const pick = () => {
      if (panel.selected < files.length) {
        const file = files[panel.selected]!;
        this.dismiss();
        this.workspace.switchTo(this.workspace.files.indexOf(file));
      } else
        this.filePrompt(
          panel.selected === files.length
            ? 'open'
            : panel.selected === files.length + 1
              ? 'new'
              : 'save-copy'
        );
    };
    panel.onPick = pick;
    this.#show('documents', panel, pick, (key) => {
      if (key.name === 'delete' && panel.selected < files.length) {
        this.closeDocument(files[panel.selected]!);
        return true;
      }
      return false;
    });
  }
  closeDocument(file = this.workspace.active) {
    if (!file) return;
    if (this.sessions) {
      const panel: TerminalPanel = {
        dialog: true,
        onClose: () => this.dismiss(),
        title: this.surface.t('Closing canvas'),
        hint: this.surface.t('Saving automatically · Esc cancel'),
        items: [],
        selected: 0,
      };
      this.#show('close', panel, () => {});
      this.#async(panel, async () => {
        await this.sessions!.close(file);
        if (!this.workspace.files.length) this.documents();
      });
      return;
    }
    if (this.workspace.files.length === 1) {
      this.dismiss();
      this.closeLast();
      return;
    }
    const close = () => {
      const closed = this.workspace.close(this.workspace.files.indexOf(file));
      if (!closed)
        throw new Error(this.surface.t('Document changed while closing. Try closing it again.'));
      this.refresh();
    };
    if (!this.workspace.needsSave(file)) {
      this.dismiss();
      close();
      return;
    }
    const panel: TerminalPanel = {
      title: this.surface.t`Closing document · ${file.title}`,
      hint: this.surface.t('Saving automatically · Esc cancel'),
      selected: 0,
      items: [],
    };
    this.#show('close', panel, () => {});
    this.#async(panel, async () => {
      await this.workspace.saveFile(file);
      if (this.surface.panel === panel) close();
    });
  }
  search() {
    this.#result = null;
    const panel: TerminalPanel = {
      dialog: true,
      onClose: () => this.dismiss(),
      title: this.surface.t('Find on current page'),
      input: this.#query,
      hint: '',
      items: [],
      selected: 0,
    };
    this.#searchPages = [undefined];
    this.#searchPage = 0;
    const updateHint = () => {
      panel.hint = this.surface.t('Enter find · Esc close');
    };
    const run = () => {
      try {
        const changed = this.#query !== panel.input;
        if (changed) {
          this.#searchPages = [undefined];
          this.#searchPage = 0;
        }
        this.#query = panel.input ?? '';
        this.#result = searchCanvasSurface(this.surface.model.plane, this.#query, {
          regex: this.#regex,
          ignoreCase: this.#ignoreCase,
          after: this.#searchPages[this.#searchPage],
        });
        panel.error = this.#result.matches.length ? undefined : this.surface.t('No matches');
        panel.items = this.#result.matches.map(
          (match) => `(${match.origin[0]}, ${match.origin[1]})  ${match.content}`
        );
        if (this.#result.next) panel.items.push(this.surface.t('Next results →'));
        if (this.#searchPage > 0) panel.items.push(this.surface.t('← Previous results'));
        panel.selected = 0;
        this.#match = -1;
      } catch (error) {
        this.#result = null;
        panel.items = [];
        panel.error = error instanceof Error ? error.message : String(error);
      }
      this.surface.requestRender();
    };
    const choose = () => {
      if (!this.#result || this.#query !== panel.input) {
        run();
        return;
      }
      if (panel.selected < this.#result.matches.length) {
        this.#match = panel.selected;
        this.#revealMatch();
        this.dismiss();
      } else if (this.#result.next && panel.selected === this.#result.matches.length) {
        this.#searchPages[++this.#searchPage] = this.#result.next;
        run();
      } else if (this.#searchPage > 0) {
        this.#searchPage--;
        run();
      }
    };
    panel.onPick = choose;
    updateHint();
    this.#show('search', panel, choose, (key) => {
      if (key.name === 'f10' || key.name === 'f11') {
        if (key.name === 'f10') this.#regex = !this.#regex;
        else this.#ignoreCase = !this.#ignoreCase;
        this.#result = null;
        this.#searchPages = [undefined];
        this.#searchPage = 0;
        updateHint();
        run();
        return true;
      }
      return false;
    });
  }
  #revealMatch() {
    const match = this.#result?.matches[this.#match];
    if (!match) return;
    const [x, y, width, height] = match.bounds;
    this.surface.searchHighlights = [{ x, y, width, height }];
    this.surface.model.editor.transact(() => this.surface.model.focusPoint({ x, y }));
  }
  nextMatch() {
    if (!this.#result || !this.#query) {
      this.search();
      return;
    }
    this.#match++;
    if (this.#match >= this.#result.matches.length) {
      this.#result = searchCanvasSurface(this.surface.model.plane, this.#query, {
        regex: this.#regex,
        ignoreCase: this.#ignoreCase,
        after: this.#result.next ?? undefined,
      });
      this.#match = 0;
    }
    this.#revealMatch();
  }
  anchors() {
    const panel: TerminalPanel = {
      title: this.surface.t('Anchors'),
      hint: this.surface.t('Enter jump · N add · R rename'),
      items: [],
      selected: 0,
    };
    const jump = () => {
      const id = this.#anchorIds[panel.selected];
      if (id) {
        this.surface.model.commands.anchors.jump(id);
        this.dismiss();
      }
    };
    panel.onPick = jump;
    this.#show('anchors', panel, jump, (key) => {
      const id = this.#anchorIds[panel.selected];
      if (key.name === 'n') {
        this.anchorName();
        return true;
      }
      if (key.name === 'r' && id) {
        this.anchorName(id);
        return true;
      }
      if (key.name === 't' && id) {
        this.surface.model.commands.anchors.reattach(id);
        this.#refreshAnchors();
        return true;
      }
      if (key.name === 'delete' && id) {
        this.surface.model.commands.anchors.remove(id);
        this.#refreshAnchors();
        return true;
      }
      return false;
    });
    this.#refreshAnchors();
  }
  #refreshAnchors() {
    const panel = this.surface.panel;
    if (!panel || this.#kind !== 'anchors') return;
    const anchors = this.surface.model.anchors;
    this.#anchorIds = anchors.map((anchor) => anchor.id);
    const depth = (id: string | null, seen = new Set<string>()): number => {
      if (!id || seen.has(id)) return 0;
      seen.add(id);
      return 1 + depth(anchors.find((anchor) => anchor.id === id)?.parentId ?? null, seen);
    };
    panel.items = anchors.map(
      (anchor) =>
        `${'  '.repeat(depth(anchor.parentId))}${anchor.label} (${anchor.point.x}, ${anchor.point.y})${anchor.detached ? this.surface.t(' [detached]') : ''}`
    );
    panel.selected = Math.max(0, Math.min(panel.selected, panel.items.length - 1));
    panel.error = anchors.length
      ? undefined
      : this.surface.t('No anchors. N adds an anchor at the editing cursor.');
    this.surface.requestRender();
  }
  anchorName(id?: string) {
    const panel: TerminalPanel = {
      title: id ? this.surface.t('Rename anchor') : this.surface.t('Add anchor at cursor'),
      input: id ? (this.surface.model.anchors.find((anchor) => anchor.id === id)?.label ?? '') : '',
      hint: this.surface.t('Enter confirm · Esc cancel'),
      items: [],
      selected: 0,
    };
    this.#show('anchor-name', panel, () => {
      if (!panel.input?.trim()) return;
      const cursor = this.surface.model.cursor;
      const existing =
        id ??
        this.surface.model.anchors.find(
          (anchor) => !anchor.detached && anchor.point.x === cursor.x && anchor.point.y === cursor.y
        )?.id;
      if (existing) this.surface.model.commands.anchors.rename(existing, panel.input.trim());
      else this.surface.model.commands.anchors.add(panel.input.trim());
      if (
        !existing &&
        !this.surface.model.anchors.some(
          (anchor) => anchor.point.x === cursor.x && anchor.point.y === cursor.y && !anchor.detached
        )
      ) {
        panel.error = this.surface.t('Place the editing cursor on text first.');
        return;
      }
      this.anchors();
    });
  }
  templates() {
    let group: 'all' | 'component' | 'template' = 'all';
    let candidates = [...CANVAS_TEMPLATES];
    const panel: TerminalPanel = {
      title: this.surface.t('Templates and components'),
      input: '',
      hint: '',
      items: [],
      selected: 0,
    };
    const refresh = () => {
      const query = (panel.input ?? '').trim().normalize('NFKC').toLowerCase();
      candidates = CANVAS_TEMPLATES.filter(
        (item) =>
          (group === 'all' || item.group === group) &&
          `${item.id} ${item.label}`.normalize('NFKC').toLowerCase().includes(query)
      );
      panel.items = candidates.length
        ? candidates.map((item) => `${item.label}  ${item.width}×${item.height}`)
        : [this.surface.t('No templates found')];
      panel.selected = 0;
      panel.hint = this.surface.t('Enter preview · F10 group');
      this.surface.requestRender();
    };
    panel.onInput = refresh;
    const pick = () => {
      const template = candidates[panel.selected];
      if (!template) return;
      let materialized = this.surface.appearance.materializeTemplate(template.id);
      this.dismiss();
      this.surface.cancelGesture();
      this.surface.model.cancelPendingPaste();
      const at = { ...this.surface.model.cursor };
      this.#kind = 'template-place';
      this.surface.placement = {
        at,
        source: materialized.source,
        width: template.width,
        height: template.height,
        label: template.label,
      };
      this.#placementTarget = this.#target();
      this.#refreshPlacement = () => {
        materialized = this.surface.appearance.materializeTemplate(template.id);
        if (this.surface.placement) this.surface.placement.source = materialized.source;
      };
      this.#place = () => {
        if (!this.surface.placement || this.#target() !== this.#placementTarget) {
          this.dismiss();
          return;
        }
        const point = this.surface.placement.at;
        try {
          prepareCanvasRowsWrite(point, materialized.rows);
          // Clear transient state before the synchronous command publishes its write.
          this.dismiss();
          this.surface.model.commands.insertRows(materialized.rows, point);
        } catch {
          this.surface.feedback.show(
            () => this.surface.t('Canvas limit'),
            'warning',
            () => this.surface.t('Cannot place the template here. Choose a smaller coordinate.')
          );
          this.surface.requestRender();
        }
      };
      this.surface.requestRender();
    };
    panel.onPick = pick;
    this.#show('templates', panel, pick, (key) => {
      if (key.name !== 'f10') return false;
      group = group === 'all' ? 'component' : group === 'component' ? 'template' : 'all';
      refresh();
      return true;
    });
    refresh();
  }
  tools() {
    const model = this.surface.model;
    const settings = model.drawingSettings;
    const panel: TerminalPanel = {
      title: this.surface.t('Drawing tools'),
      hint: this.surface.t('Enter choose · Esc close'),
      items: drawingTools.map(
        (tool) =>
          `${this.surface.t(drawingLabel(tool.id))}${tool.id === 'brush' ? `  ${settings.char}` : ''}${tool.id === model.currentTool ? ' ✓' : ''}`
      ),
      selected: Math.max(
        0,
        drawingTools.findIndex((tool) => tool.id === model.currentTool)
      ),
    };
    const pick = () => {
      const tool = drawingTools[panel.selected];
      if (!tool) return;
      model.setTool(tool.id);
      this.dismiss();
    };
    panel.onPick = pick;
    this.#show('tools', panel, pick, (key) => {
      if (key.name === 'l' && !key.ctrl && !key.meta && !key.super) {
        this.#characters.open('brush');
        return true;
      }
      if (!key.ctrl && !key.meta && !key.super && ['c', 'f', 'b'].includes(key.name)) {
        this.drawingSetting(
          key.name === 'c' ? 'char' : key.name === 'f' ? 'foreground' : 'background'
        );
        return true;
      }
      return false;
    });
  }
  drawingSetting(key: 'char' | 'foreground' | 'background') {
    const model = this.surface.model;
    const names = {
      char: this.surface.t('Brush glyph'),
      foreground: this.surface.t('Foreground color'),
      background: this.surface.t('Background color'),
    };
    const panel: TerminalPanel = {
      title: names[key],
      input: '',
      items: [],
      selected: 0,
      hint: this.surface.t('Enter apply · Esc cancel'),
    };
    this.#show('drawing-setting', panel, () => {
      try {
        model.setDrawingSettings({
          [key]: key === 'background' && !panel.input ? undefined : panel.input,
        });
        this.tools();
      } catch {
        panel.error =
          key === 'char'
            ? this.surface.t('Enter one printable grapheme.')
            : this.surface.t('Use #RRGGBB; empty background follows foreground.');
        this.surface.requestRender();
      }
    });
  }
  export() {
    const scopes: CanvasExportScope[] = [
      'canvas',
      ...(this.surface.model.selection ? ['selection' as const] : []),
    ];
    const formats = ['txt', 'ansi', 'chardesk', 'png'] as const;
    const choices = scopes.flatMap((scope) => formats.map((format) => ({ scope, format })));
    const panel: TerminalPanel = {
      dialog: true,
      title: this.surface.t('Export'),
      hint: this.surface.t('Enter choose · Esc close'),
      items: choices.map(
        ({ scope, format }) =>
          `${scope === 'canvas' ? this.surface.t('Canvas') : this.surface.t('Selection')}    ${format.toUpperCase()}`
      ),
      selected: 0,
      onClose: () => this.dismiss(),
    };
    const pick = () => {
      const choice = choices[panel.selected];
      if (!choice) return;
      try {
        const model = this.surface.model;
        const snapshot = captureCanvasExport(
          model.plane,
          choice.scope === 'selection' ? model.selectionRanges : undefined
        );
        const document = structuredClone(
          model.documents.getDocumentDraft(model.documents.getActiveAddress().documentId)
        );
        const title = this.workspace.active.title;
        const png = choice.format === 'png';
        const projectCell = this.surface.welcomeAppearance.cellProjector(model.plane);
        const text =
          choice.format !== 'png'
            ? prepareCanvasTextExport({
                snapshot,
                format: choice.format,
                document: document ?? undefined,
                title,
              })
            : null;
        const target: TerminalPanel = {
          dialog: true,
          title: this.surface
            .t`Export ${this.surface.t(choice.scope === 'canvas' ? 'Canvas' : 'Selection')} as ${choice.format.toUpperCase()}`,
          input: '',
          hint: this.surface.t('Enter export · Esc cancel'),
          items: [],
          selected: 0,
          onClose: () => this.dismiss(),
        };
        this.#show('export-path', target, () => {
          if (!target.input?.trim()) return;
          const path = target.input.trim();
          const current = () => this.#alive && this.surface.panel === target;
          this.#async(target, async () => {
            let content: string | Uint8Array = text ?? '';
            if (png) {
              const appearance = await this.surface.appearance.ensurePalette();
              if (!this.#alive || this.surface.panel !== target) return;
              if (!appearance.palette || appearance.status !== 'ready')
                throw new Error(
                  this.surface.t('Terminal RGB colors are unavailable. Refresh colors in Settings.')
                );
              content = renderSelectionSnapshot(
                captureExportSnapshot(snapshot, projectCell),
                { color: appearance.palette.foreground, background: appearance.palette.background },
                'png'
              ).png!;
            }
            if (!this.#alive || this.surface.panel !== target) return;
            await deliverExportFile(path, content, current);
            if (current()) this.surface.feedback.show(() => this.surface.t('Exported'));
          });
        });
      } catch (error) {
        panel.error = error instanceof Error ? error.message : String(error);
        this.surface.requestRender();
      }
    };
    panel.onPick = pick;
    this.#show('export', panel, pick);
  }
  #sourceNotice() {
    if (!this.workspace.files.length) return '';
    const labels: Record<string, string> = {
      conflict: 'Conflict',
      changed: 'Changed',
      missing: 'Missing',
      unreadable: 'Unreadable',
    };
    const label = labels[this.workspace.sourceState().state];
    return label ? this.surface.t(label) : '';
  }
  #sourceFeedback() {
    const notice = this.surface.feedback.current;
    return notice?.key === 'source' ||
      (notice?.key === 'document-save' && this.workspace.errorFor(this.workspace.active))
      ? notice
      : undefined;
  }
  #sourceDescription() {
    const state = this.workspace.sourceState();
    return `${state.error || this.#sourceNotice() || this.surface.t('Up to date')}\n${this.workspace.active.path}`;
  }
  showFeedback(notice: TerminalNotice) {
    const width = Math.max(8, Math.min(72, this.surface.width - 8));
    const items: string[] = [];
    for (const paragraph of noticeDetail(notice).split('\n')) {
      let line = '';
      for (const { segment: grapheme } of segmentGraphemes(paragraph)) {
        if (getTextCellWidth(line + grapheme) > width) {
          items.push(line);
          line = '';
        }
        line += grapheme;
      }
      items.push(line);
    }
    const panel: TerminalPanel = {
      notice,
      dialog: true,
      title: noticeText(notice),
      hint: this.surface.t('Esc close'),
      items,
      selected: 0,
      onClose: () => this.dismiss(),
      actions: this.workspace.files.length
        ? [{ id: 'source', label: this.surface.t('S Source'), onPick: () => this.sources() }]
        : [],
    };
    this.#show(
      'feedback',
      panel,
      () => {},
      (key) => {
        if (key.name !== 's' || !this.workspace.files.length) return false;
        this.sources();
        return true;
      }
    );
  }
  sources() {
    if (!this.workspace.files.length) return;
    const file = this.workspace.active;
    const panel: TerminalPanel = {
      notice: this.#sourceFeedback(),
      dialog: true,
      title: this.surface.t('Source'),
      error: this.workspace.errorFor(file),
      status: this.#sourceDescription(),
      hint: this.surface.t('Enter run · Esc close'),
      items: [
        this.surface.t('Check for external changes'),
        this.surface.t('Reload native document from disk'),
      ],
      selected: 0,
      onClose: () => this.dismiss(),
    };
    if (this.sessions && this.surface.model.isDirtyAt(file.address!))
      panel.items.push(this.surface.t('Preserve local copy and reload'));
    if (this.workspace.errorFor(file))
      panel.items.push(this.surface.t('Retry saving local changes'));
    const retryIndex = panel.items.indexOf(this.surface.t('Retry saving local changes'));
    const pick = () => {
      const selected = panel.selected;
      this.#async(panel, async () => {
        if (selected === 0) await file.source.inspect();
        else if (selected === retryIndex) await this.workspace.saveFile(file);
        else if (selected === 2 && this.sessions) {
          const copy = await this.sessions.preserveLocalAndReload(file);
          this.surface.feedback.show(
            () => this.surface.t('Local copy saved'),
            'success',
            copy.name
          );
        } else await this.workspace.reloadFile(file);
        if (!this.#alive || this.surface.panel !== panel) return;
        this.sources();
      });
    };
    panel.onPick = pick;
    this.#show('file-source', panel, pick);
  }
  navigation() {
    const actions = navigationActions(this.surface.model, this.surface.t);
    const panel: TerminalPanel = {
      dialog: true,
      title: this.surface.t('Selection and navigation'),
      hint: this.surface.t('Enter run · Esc close'),
      status: this.surface.t('Rows and columns span content, current cell and selection bounds.'),
      items: actions.map((entry) => `${entry.label}    ${this.surface.shortcuts[entry.id].label}`),
      selected: 0,
      onClose: () => this.dismiss(),
    };
    const pick = () => {
      const action = actions[panel.selected];
      if (!action) return;
      this.dismiss();
      try {
        this.surface.model.editor.commands.execute(
          `terminal.${action.id}`,
          undefined,
          'navigation-dialog'
        );
      } catch (error) {
        this.surface.feedback.show(
          () => this.surface.t('Action failed'),
          'error',
          error instanceof Error ? error.message : String(error)
        );
      }
      this.surface.requestRender();
    };
    panel.onPick = pick;
    this.#show('navigation', panel, pick);
  }
  action(id: TerminalAction) {
    if (id === 'new' && this.sessions) this.newSession();
    else if (id === 'save-copy' && this.sessions) {
      const record = this.workspace.files.length
        ? this.sessions.forFile(this.workspace.active)
        : null;
      if (record) {
        const panel: TerminalPanel = {
          dialog: true,
          onClose: () => this.dismiss(),
          title: this.surface.t('Copying canvas'),
          hint: this.surface.t('Esc cancel'),
          items: [],
          selected: 0,
        };
        this.#show('session-copy', panel, () => {});
        this.#async(panel, () => this.sessions!.duplicate(record.id));
      }
    } else if (id === 'open' || id === 'new' || id === 'save-copy') this.filePrompt(id);
    else if (id === 'export') this.export();
    else if (id === 'sources') this.sources();
    else if (id === 'navigation') this.navigation();
    else if (id === 'tools') this.tools();
    else if (id === 'templates') this.templates();
    else if (id === 'characters') this.#characters.open();
    else if (id === 'confirm-placement') this.#place?.();
    else if (id === 'cancel-placement') this.dismiss();
    else if (id === 'documents') this.documents();
    else if (id === 'search') this.search();
    else if (id === 'next-match') this.nextMatch();
    else if (id === 'anchors') this.anchors();
    else if (id === 'add-anchor') this.anchorName();
    else if (id === 'close-document') this.closeDocument();
    else if (id === 'next-document' || id === 'previous-document') {
      if (!this.workspace.files.length) return;
      this.dismiss();
      const index = this.workspace.files.indexOf(this.workspace.active);
      this.workspace.switchTo(
        (index + (id === 'next-document' ? 1 : this.workspace.files.length - 1)) %
          this.workspace.files.length
      );
    }
  }
  paste(text: string) {
    if (this.surface.placement) return true;
    const panel = this.surface.panel;
    if (!panel) return false;
    if (panel.input !== undefined) {
      this.#inputVersion++;
      panel.input =
        (this.#selectedAll ? '' : panel.input) + text.replace(/[\p{Cc}\u2028\u2029]/gu, ' ');
      this.#selectedAll = false;
      panel.error = undefined;
      panel.onInput?.(panel.input);
      this.surface.requestRender();
    }
    return true;
  }
  clipboardAction(kind: 'copy' | 'cut' | 'paste' | 'select-all') {
    const panel = this.surface.panel;
    if (!panel || panel.busy || panel.input === undefined) return false;
    if (kind === 'select-all') {
      this.#inputVersion++;
      this.#selectedAll = true;
      return true;
    }
    if (kind === 'copy' || kind === 'cut') {
      const version = kind === 'cut' ? ++this.#inputVersion : this.#inputVersion;
      const value = panel.input;
      const current = () =>
        this.#alive &&
        this.surface.panel === panel &&
        panel.input === value &&
        this.#inputVersion === version;
      void this.clipboard
        .write({ plain: value, rich: null }, { rich: false, ansi: false })
        .then((written) => {
          if (!current()) return;
          const copy = this.surface.messages;
          if (written.status === 'written') {
            if (kind === 'cut') {
              panel.input = '';
              this.#selectedAll = false;
              this.#inputVersion++;
              panel.onInput?.(panel.input);
            }
            this.surface.feedback.show(() => (kind === 'cut' ? copy.cut : copy.copied));
          } else if (written.status === 'dispatched')
            this.surface.feedback.show(
              () => (kind === 'cut' ? copy.cutDispatched : copy.copyDispatched),
              'warning',
              kind === 'cut' ? () => this.surface.t('Copy is unconfirmed; input kept.') : undefined
            );
          else this.surface.feedback.show(() => copy.clipboardFailed, 'error');
          this.surface.requestRender();
        })
        .catch(() => {
          if (!current()) return;
          this.surface.feedback.show(() => this.surface.messages.clipboardFailed, 'error');
          this.surface.requestRender();
        });
      return true;
    }
    if (kind === 'paste') {
      const version = ++this.#inputVersion;
      const input = panel.input;
      const selectedAll = this.#selectedAll;
      void this.clipboard
        .read({
          target: 'terminal-panel',
          reader: this.surface.model.plane,
          selections: [],
          cursor: null,
          foreground: '#000000',
          selectResult: false,
        })
        .then((value) => {
          if (
            this.surface.panel === panel &&
            panel.input === input &&
            this.#selectedAll === selectedAll &&
            this.#inputVersion === version &&
            !('error' in value)
          )
            this.paste(value.plainText ?? '');
        })
        .catch(() => {});
      return true;
    }
    return false;
  }
  key(key: KeyEvent) {
    if (this.surface.placement) {
      if (key.name === 'escape') this.dismiss();
      else if (key.name === 'return' || key.name === 'enter') this.#place?.();
      else {
        const step = key.shift ? 10 : 1;
        const delta: Record<string, readonly [number, number]> = {
          left: [-step, 0],
          right: [step, 0],
          up: [0, -step],
          down: [0, step],
        };
        const move = delta[key.name];
        if (move && (key.option || key.meta))
          this.surface.model.editor.commands.execute(
            `terminal.pan-${key.name}`,
            undefined,
            'template-placement'
          );
        else if (move)
          this.surface.placement.at = {
            x: this.surface.placement.at.x + move[0],
            y: this.surface.placement.at.y + move[1],
          };
      }
      this.surface.requestRender();
      return true;
    }
    const panel = this.surface.panel;
    if (!panel) return false;
    if (key.name === 'escape') {
      this.dismiss();
      return true;
    }
    if (
      panel.busy ||
      this.surface.panelLayout.height < (panel.dialog ? 8 : 4) ||
      this.surface.panelLayout.width < 20
    )
      return true;
    if (key.name === 'f1') {
      this.dismiss();
      return false;
    }
    if (this.#special(key)) {
      this.surface.requestRender();
      return true;
    }
    if (key.name === 'return' || key.name === 'enter') {
      this.#enter();
      return true;
    }
    if (key.name === 'up' || key.name === 'down') {
      const next = panel.selected + (key.name === 'up' ? -1 : 1);
      panel.selected = panel.dialog
        ? (next + panel.items.length) % Math.max(1, panel.items.length)
        : Math.max(0, Math.min(panel.items.length - 1, next));
    } else if (panel.input !== undefined && key.name === 'backspace') {
      this.#inputVersion++;
      panel.input = this.#selectedAll ? '' : segmentGraphemes(panel.input).slice(0, -1).join('');
      this.#selectedAll = false;
      panel.onInput?.(panel.input);
    } else if (
      panel.input !== undefined &&
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
  dispose() {
    this.#alive = false;
    this.#characters.dispose();
    this.dismiss();
    this.#detach();
    this.#detachAppearance();
    this.#detachSettings();
    this.#detachSources();
  }
}
