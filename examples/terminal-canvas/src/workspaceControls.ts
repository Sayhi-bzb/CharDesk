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
import { segmentGraphemes } from '@chardesk/protocol';
import { searchCanvasSurface, type CanvasSearchResult } from '@chardesk/editor-core/search';
import type { ClipboardPort } from '@chardesk/editor-core/clipboard/commands';
import type { CanvasSurface, TerminalPanel } from './surface.ts';
import type { TerminalWorkspace } from './workspace.ts';
import type { TerminalAction } from './shortcuts.ts';
import { messages } from './copy.ts';
import type { LocalSessions } from './sessions.ts';
import type { LocalSession } from './sessionCatalog.ts';
import { textAttributeNames, type SelectedColor } from '@chardesk/editor-core/selection/style';
import { navigationActions } from './navigation.ts';
import { watchWorkspaceSources } from './sourceMonitor.ts';

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
            'inspector',
            'selection-color',
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
    this.#detachSources = watchWorkspaceSources(workspace, surface.renderer, () => this.refresh());
    this.refresh();
  }

  refresh() {
    if (this.#kind === 'inspector') this.#refreshInspector();
    this.surface.sourceStatus = this.#sourceNotice();
    if (this.#kind === 'file-source' && this.surface.panel)
      this.surface.panel.status = this.#sourceDescription();
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
          ? 'Duplicate document'
          : kind === 'new'
            ? 'New document — choose a new path'
            : 'Open document',
      input: '',
      hint: 'Enter confirm · Esc cancel',
      items: [],
      selected: 0,
    };
    this.#show(kind, panel, () => {
      if (!panel.input?.trim()) return;
      this.#async(panel, async () => {
        if (kind === 'save-copy') {
          await this.workspace.saveCopy(panel.input!.trim());
          this.surface.status = 'Document duplicated';
          this.surface.backgroundStatus = '';
        } else {
          if (kind === 'new') {
            const { readOptional, resolveCanvasFilePath } = await import('./document.ts');
            if ((await readOptional(await resolveCanvasFilePath(panel.input!.trim()))) !== null)
              throw new Error('The file already exists. Use Open.');
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
      title: 'New canvas',
      hint: 'Esc cancel',
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
      title: 'Rename session',
      input: record.name,
      hint: 'Enter confirm · Esc cancel',
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
      title: 'Sessions',
      tabs: ['Canvases', 'Archived'],
      selectedTab: Number(this.#includeArchived),
      onTab: (index) => {
        this.#includeArchived = index === 1;
        this.documents();
      },
      hint: 'Tab list · ↑↓ select · Enter open · N new · O file · Esc close',
      status: `R rename · D copy · A ${this.#includeArchived ? 'restore' : 'archive'} · S source · X remove · Del close · F5 refresh`,
      items: [
        ...records.map(
          (record) =>
            `${record.path === activePath ? '▸ ' : ''}${record.name}${record.removing ? ' (removal pending)' : record.status === 'creating' ? ' (incomplete)' : ''}`
        ),
        '+ New canvas',
        '+ Open file',
      ],
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
      else if (panel.selected === records.length) this.newSession();
      else this.filePrompt('open');
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
      title: 'Remove session',
      status: record.path,
      hint: 'Esc cancel',
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
        title: `Remove ${record.name}`,
        status: record.path,
        hint: '↑↓ select · Enter confirm · Esc cancel',
        selected: 0,
        items: record.removing
          ? ['Cancel', 'Recover interrupted removal']
          : [
              'Cancel',
              'Remove session record — keep file',
              ...(plan?.file ? ['Delete managed file and session record'] : []),
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
        panel.hint = 'Removing… · Esc dismiss';
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
      title: 'Documents',
      hint: '↑↓ / Enter · Delete close · Esc return',
      items: [
        ...files.map(
          (file) =>
            `${file === this.workspace.active ? '▸ ' : ''}${file.title}${this.surface.model.isDirtyAt(file.address!) ? ' *' : ''}  ${file.path}${this.workspace.errorFor(file) ? `  ! ${this.workspace.errorFor(file)}` : ''}`
        ),
        '+ Open',
        '+ New',
        'Duplicate…',
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
        title: 'Closing canvas',
        hint: 'Saving automatically · Esc cancel',
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
      if (!closed) throw new Error('Document changed while closing. Try closing it again.');
      this.refresh();
    };
    if (!this.workspace.needsSave(file)) {
      this.dismiss();
      close();
      return;
    }
    const panel: TerminalPanel = {
      title: `Closing document · ${file.title}`,
      hint: 'Saving automatically · Esc cancel',
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
      title: 'Find on current page',
      input: this.#query,
      hint: '',
      items: [],
      selected: 0,
    };
    this.#searchPages = [undefined];
    this.#searchPage = 0;
    const updateHint = () => {
      panel.hint = `Enter find / jump · F10 ${this.#regex ? 'RE2' : 'literal'} · F11 ${this.#ignoreCase ? 'Aa=aa' : 'Aa≠aa'} · Esc`;
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
        panel.error = this.#result.matches.length ? undefined : 'No matches';
        panel.items = this.#result.matches.map(
          (match) => `(${match.origin[0]}, ${match.origin[1]})  ${match.content}`
        );
        if (this.#result.next) panel.items.push('Next results →');
        if (this.#searchPage > 0) panel.items.push('← Previous results');
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
      title: 'Anchors',
      hint: 'Enter jump · N add · R rename · T reattach · Delete remove · Esc',
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
        `${'  '.repeat(depth(anchor.parentId))}${anchor.label} (${anchor.point.x}, ${anchor.point.y})${anchor.detached ? ' [detached]' : ''}`
    );
    panel.selected = Math.max(0, Math.min(panel.selected, panel.items.length - 1));
    panel.error = anchors.length
      ? undefined
      : 'No anchors. N adds an anchor at the editing cursor.';
    this.surface.requestRender();
  }
  anchorName(id?: string) {
    const panel: TerminalPanel = {
      title: id ? 'Rename anchor' : 'Add anchor at cursor',
      input: id ? (this.surface.model.anchors.find((anchor) => anchor.id === id)?.label ?? '') : '',
      hint: 'Enter confirm · Esc cancel',
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
        panel.error = 'Place the editing cursor on text first.';
        return;
      }
      this.anchors();
    });
  }
  templates() {
    let group: 'all' | 'component' | 'template' = 'all';
    let candidates = [...CANVAS_TEMPLATES];
    const panel: TerminalPanel = {
      title: 'Templates and components',
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
        : ['No templates found'];
      panel.selected = 0;
      panel.hint = `F10 group: ${group} · Enter preview · Esc`;
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
          this.surface.status = 'Cannot place the template here. Choose a smaller coordinate.';
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
      title: 'Drawing tools',
      hint: 'Enter choose · C glyph · L library · F foreground · B background · Esc return',
      items: drawingTools.map(
        (tool) =>
          `${drawingLabel(tool.id)}${tool.id === 'brush' ? `  ${settings.char}` : ''}${tool.id === model.currentTool ? ' ✓' : ''}`
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
      this.surface.status = `${drawingLabel(tool.id)} · F2 text editing · ${this.surface.shortcuts.tools.label} tools`;
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
      char: 'Brush glyph',
      foreground: 'Foreground color',
      background: 'Background color',
    };
    const panel: TerminalPanel = {
      title: names[key],
      input: '',
      items: [],
      selected: 0,
      hint: `Current: ${model.drawingSettings[key] ?? 'follows foreground'} · ${key === 'char' ? 'one grapheme' : '#RRGGBB'} · Enter / Esc`,
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
            ? 'Enter one printable grapheme.'
            : 'Use #RRGGBB; empty background follows foreground.';
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
      title: 'Export',
      hint: '↑↓ select · Enter choose path · Esc close',
      items: choices.map(
        ({ scope, format }) =>
          `${scope === 'canvas' ? 'Canvas' : 'Selection'}    ${format.toUpperCase()}`
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
        const raster = choice.format === 'png' ? captureExportSnapshot(snapshot) : null;
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
          title: `Export ${choice.scope} as ${choice.format.toUpperCase()}`,
          input: '',
          hint: 'New file path · Enter export · Esc cancel',
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
            if (raster) {
              const appearance = await this.surface.appearance.ensurePalette();
              if (!this.#alive || this.surface.panel !== target) return;
              if (!appearance.palette || appearance.status !== 'ready')
                throw new Error('Terminal RGB colors are unavailable. Refresh colors in Settings.');
              content = renderSelectionSnapshot(
                raster,
                { color: appearance.palette.foreground, background: appearance.palette.background },
                'png'
              ).png!;
            }
            if (!this.#alive || this.surface.panel !== target) return;
            await deliverExportFile(path, content, current);
            if (current()) this.surface.status = 'Exported';
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
    const source = this.workspace.sourceState();
    const label =
      source.state === 'conflict'
        ? 'External update and local edits; both kept'
        : source.state === 'changed'
          ? 'File changed on disk'
          : source.state === 'missing'
            ? 'Source file is missing; canvas kept'
            : source.state === 'unreadable'
              ? 'Source file cannot be read; canvas kept'
              : '';
    return label ? `${label} · ${this.surface.shortcuts.sources.label} Source` : '';
  }
  #sourceDescription() {
    const state = this.workspace.sourceState();
    return `${this.workspace.active.path} · ${state.state}${state.error ? ` · ${state.error}` : ''}`;
  }
  sources() {
    if (!this.workspace.files.length) return;
    const file = this.workspace.active;
    const panel: TerminalPanel = {
      dialog: true,
      title: 'Source',
      status: this.#sourceDescription(),
      hint: '↑↓ select · Enter run · Esc close',
      items: ['Check for external changes', 'Reload native document from disk'],
      selected: 0,
      onClose: () => this.dismiss(),
    };
    if (this.sessions && this.surface.model.isDirtyAt(file.address!))
      panel.items.push('Preserve local copy and reload');
    if (this.workspace.errorFor(file)) panel.items.push('Retry saving local changes');
    const retryIndex = panel.items.indexOf('Retry saving local changes');
    const pick = () => {
      const selected = panel.selected;
      this.#async(panel, async () => {
        if (selected === 0) await file.source.inspect();
        else if (selected === retryIndex) await this.workspace.saveFile(file);
        else if (selected === 2 && this.sessions) {
          const copy = await this.sessions.preserveLocalAndReload(file);
          this.surface.status = `Local copy saved: ${copy.name}`;
        } else await this.workspace.reloadFile(file);
        if (!this.#alive || this.surface.panel !== panel) return;
        this.sources();
      });
    };
    panel.onPick = pick;
    this.#show('file-source', panel, pick);
  }
  #refreshInspector() {
    const panel = this.surface.panel;
    if (!panel || this.#kind !== 'inspector') return;
    const model = this.surface.model,
      style = model.selectionStyle;
    const describe = (color: SelectedColor) => {
      if (color.kind === 'color') return color.value;
      return color.kind === 'mixed' ? 'Mixed' : 'None';
    };
    panel.items = [
      ...textAttributeNames.map(
        (name) =>
          `${name[0]!.toUpperCase()}${name.slice(1)}    ${style.attributes?.[name] ?? 'Unavailable'}`
      ),
      `Foreground    ${describe(style.foreground)}`,
      `Background    ${describe(style.background)}`,
      'Clear background',
    ];
    if (style.limited) panel.status = 'Selection is too large to edit its styles.';
    else if (!model.selection) panel.status = 'Select a range to edit its styles.';
    else if (!style.count) panel.status = 'No text in range; background can fill empty cells.';
    else panel.status = `${style.count} selected text cells`;
  }
  inspector() {
    const panel: TerminalPanel = {
      dialog: true,
      title: 'Inspector',
      hint: '↑↓ select · Enter change · Esc close',
      items: [],
      selected: 0,
      onClose: () => this.dismiss(),
    };
    const pick = () => {
      panel.error = undefined;
      const model = this.surface.model,
        style = model.selectionStyle;
      const attribute = textAttributeNames[panel.selected];
      try {
        if (!model.selection || style.limited) return;
        if (attribute) {
          if (style.attributes)
            model.commands.style({
              kind: 'attributes',
              attributes: { [attribute]: style.attributes[attribute] !== 'on' },
            });
        } else if (panel.selected < textAttributeNames.length + 2)
          this.#selectionColor(
            panel.selected === textAttributeNames.length ? 'foreground' : 'background'
          );
        else model.commands.style({ kind: 'background', color: null });
      } catch (error) {
        panel.error = error instanceof Error ? error.message : String(error);
      }
      this.refresh();
    };
    panel.onPick = pick;
    this.#show('inspector', panel, pick);
    this.refresh();
  }
  navigation() {
    const actions = navigationActions(this.surface.model);
    const panel: TerminalPanel = {
      dialog: true,
      title: 'Selection and navigation',
      hint: '↑↓ select · Enter run · Esc close',
      status: 'Rows and columns span content, current cell and selection bounds.',
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
        this.surface.status = error instanceof Error ? error.message : String(error);
      }
      this.surface.requestRender();
    };
    panel.onPick = pick;
    this.#show('navigation', panel, pick);
  }
  #selectionColor(kind: 'foreground' | 'background') {
    const style = this.surface.model.selectionStyle[kind];
    const panel: TerminalPanel = {
      dialog: true,
      title: kind === 'foreground' ? 'Selection foreground' : 'Selection background',
      input: style.kind === 'color' ? style.value : '',
      hint: '#RRGGBB · Empty resets color · Enter apply · Esc close',
      items: [],
      selected: 0,
      onClose: () => this.dismiss(),
    };
    this.#show('selection-color', panel, () => {
      if (this.#target() !== target) {
        panel.error = 'Selection changed. Reopen Inspector to edit the current range.';
        this.surface.requestRender();
        return;
      }
      const input = panel.input!.trim();
      if (input && !/^#[\da-f]{6}$/i.test(input)) {
        panel.error = 'Use #RRGGBB or leave empty to reset.';
        this.surface.requestRender();
        return;
      }
      try {
        if (kind === 'foreground')
          this.surface.model.commands.style({ kind, color: input || '#000000' });
        else this.surface.model.commands.style({ kind, color: input || null });
        this.inspector();
      } catch (error) {
        panel.error = error instanceof Error ? error.message : String(error);
        this.surface.requestRender();
      }
    });
    const target = this.#target();
    this.#selectedAll = true;
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
          title: 'Copying canvas',
          hint: 'Esc cancel',
          items: [],
          selected: 0,
        };
        this.#show('session-copy', panel, () => {});
        this.#async(panel, () => this.sessions!.duplicate(record.id));
      }
    } else if (id === 'open' || id === 'new' || id === 'save-copy') this.filePrompt(id);
    else if (id === 'export') this.export();
    else if (id === 'sources') this.sources();
    else if (id === 'inspector') this.inspector();
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
          const copy = messages;
          if (written.status === 'written') {
            if (kind === 'cut') {
              panel.input = '';
              this.#selectedAll = false;
              this.#inputVersion++;
              panel.onInput?.(panel.input);
            }
            this.surface.status = kind === 'cut' ? copy.cut : copy.copied;
          } else if (written.status === 'dispatched')
            this.surface.status = kind === 'cut' ? copy.cutDispatched : copy.copyDispatched;
          else this.surface.status = copy.clipboardFailed;
          this.surface.requestRender();
        })
        .catch(() => {
          if (!current()) return;
          this.surface.status = messages.clipboardFailed;
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
    this.#detachSources();
  }
}
