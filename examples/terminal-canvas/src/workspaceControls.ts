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

/** Transient Host panels. All document mutations still run through shared commands. */
export class WorkspaceControls {
  #kind = '';
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
    readonly closeLast: () => void
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
    this.refresh();
  }

  refresh() {
    this.surface.filename = this.workspace.active.title;
    this.surface.documentLabels = this.workspace.files.map((file) => ({
      label: `${file.title}${this.surface.model.isDirtyAt(file.address!) ? '*' : ''}${this.workspace.errorFor(file) ? ' !' : ''}`,
      active: file === this.workspace.active,
    }));
    this.surface.requestRender();
  }
  dismiss() {
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
          await this.workspace.openFile(panel.input!.trim());
        }
      });
    });
  }
  documents() {
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
  action(id: TerminalAction) {
    if (id === 'open' || id === 'new' || id === 'save-copy') this.filePrompt(id);
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
    if (panel.busy || this.surface.panelLayout.height < 4 || this.surface.panelLayout.width < 20)
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
      panel.selected = Math.max(
        0,
        Math.min(panel.items.length - 1, panel.selected + (key.name === 'up' ? -1 : 1))
      );
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
  }
}
