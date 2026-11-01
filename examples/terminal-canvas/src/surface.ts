import { isDefaultArtifactForeground } from '@chardesk/cell-plane/artifact-style';
import { TerminalInputModifiers } from './inputModifiers.ts';
import { resolveTerminalPolicy, type TerminalInputPolicy } from './terminalPolicy.ts';
import type { GridCellSource, Point } from '@chardesk/cell-plane/types';
import {
  createTerminalShortcuts,
  effectiveTerminalShortcuts,
  type TerminalShortcuts,
} from './shortcuts.ts';
import {
  Renderable,
  RGBA,
  TextBuffer,
  TextBufferView,
  createTextAttributes,
  type CliRenderer,
  type OptimizedBuffer,
  type MouseEvent,
} from '@opentui/core';
import { cellRectContainsPoint, intersectCellRects, type CellRect } from '@chardesk/cell-core';
import { getGraphemeCellWidth, iterateGraphemes } from '@chardesk/protocol';
import { messages, helpLines, rangeClickHint } from './copy.ts';
import type { TerminalCanvas } from './model.ts';
import { TerminalMinimap, minimapPanel, type MinimapFrame } from './minimap.ts';
import { TerminalLinkText, type LinkedGlyph } from './linkText.ts';
import type { TerminalContextMenu } from './contextMenu.ts';
import { TerminalSettingsStore } from './settings.ts';
import { TerminalAppearanceRuntime } from './appearance.ts';
import { attachTerminalAppearance } from './appearanceHost.ts';

export const CANVAS_TOP = 0;
const FOOTER_ROWS = 2;
export type TerminalPanel = {
  dialog?: boolean;
  tabs?: string[];
  selectedTab?: number;
  onTab?: (index: number) => void;
  onClose?: () => void;
  status?: string;
  title: string;
  input?: string;
  hint: string;
  items: string[];
  selected: number;
  error?: string;
  onPick?: (index: number) => void;
  busy?: boolean;
  onInput?: (value: string) => void;
};

export class CanvasSurface extends Renderable {
  contextMenu: TerminalContextMenu | null = null;
  help = false;
  helpScroll = 0;
  panel: TerminalPanel | null = null;
  placement: {
    at: Point;
    source: GridCellSource;
    width: number;
    height: number;
    label: string;
  } | null = null;
  backgroundStatus = '';
  closing = false;
  searchHighlights: CellRect[] = [];
  documentLabels: { label: string; active: boolean }[] = [];
  minimapOpen = false;
  #minimap = new TerminalMinimap();
  #minimapDrag: { grab: { x: number; y: number }; x: number; y: number } | null = null;
  #inputPolicy: TerminalInputPolicy;
  get inputPolicy(): TerminalInputPolicy {
    return this.#inputPolicy;
  }
  #shortcutCache: { revision: number; value: TerminalShortcuts } | undefined;
  get shortcuts(): TerminalShortcuts {
    const snapshot = this.model.editor.keymap.getSnapshot();
    if (this.#shortcutCache?.revision !== snapshot.revision)
      this.#shortcutCache = {
        revision: snapshot.revision,
        value: effectiveTerminalShortcuts(
          createTerminalShortcuts(this.platform, this.inputPolicy),
          snapshot,
          this.platform
        ),
      };
    return this.#shortcutCache.value;
  }
  get tool(): 'edit' | 'hand' {
    return this.model.currentTool === 'pan' ? 'hand' : 'edit';
  }
  status = '';
  widthFallbacks = 0;
  #measurer: TextBuffer;
  #measureView: TextBufferView;
  #links: TerminalLinkText;
  #widths = new Map<string, number>();
  readonly appearance: TerminalAppearanceRuntime;
  #ownsAppearance: boolean;
  #detachAppearance: () => void;
  #detachAppearanceHost: () => void;
  get colors() {
    return this.appearance.getSnapshot().colors;
  }
  #pointer: { x: number; y: number } | null = null;
  readonly inputModifiers = new TerminalInputModifiers();
  setInputPolicy(policy: TerminalInputPolicy) {
    this.#inputPolicy = policy;
    this.#shortcutCache = undefined;
    this.requestRender();
  }
  cancelGesture() {
    this.#minimapDrag = null;
    this.#pointer = null;
    this.model.cancelInteraction();
    this.requestRender();
  }

  setTool(tool: 'edit' | 'hand') {
    this.model.editor.transact(() => {
      this.cancelGesture();
      if (tool === 'hand' && this.model.inserting) this.model.commands.escape();
      this.model.setTool(tool === 'hand' ? 'pan' : 'select');
    });
    this.requestRender();
  }

  get canvasBounds(): CellRect {
    return {
      x: 0,
      y: CANVAS_TOP,
      width: this.width,
      height: Math.max(0, this.height - CANVAS_TOP - FOOTER_ROWS),
    };
  }

  get footerBounds(): CellRect {
    return {
      x: 0,
      y: this.canvasBounds.y + this.canvasBounds.height,
      width: this.width,
      height: Math.min(FOOTER_ROWS, this.height),
    };
  }

  get dockControls() {
    if (this.panel || this.help || this.contextMenu?.isOpen || this.closing) return [];
    const copy = messages;
    let x = 0;
    const ids = this.placement
      ? (['confirm-placement', 'cancel-placement'] as const)
      : this.model.selection
        ? (['settings', 'edit', 'hand', 'minimap', 'copy'] as const)
        : (['settings', 'edit', 'hand', 'minimap'] as const);
    return ids.flatMap((id) => {
      const name =
        id === 'confirm-placement' ? 'Place' : id === 'cancel-placement' ? 'Cancel' : copy[id];
      const label = `[${this.shortcuts[id].label} ${name}]`;
      const width = this.#width(label);
      if (x + width > this.width) return [];
      const control = { id, label, x, y: this.footerBounds.y, width, height: 1 };
      x += width + 1;
      return [control];
    });
  }

  constructor(
    readonly renderer: CliRenderer,
    readonly model: TerminalCanvas,
    public filename: string,
    readonly platform: NodeJS.Platform = process.platform,
    initializeTool = true,
    inputPolicy: TerminalInputPolicy = resolveTerminalPolicy(),
    readonly settings = new TerminalSettingsStore(),
    appearance?: TerminalAppearanceRuntime
  ) {
    super(renderer, {
      id: 'terminal-canvas',
      width: '100%',
      height: '100%',
      buffered: true,
      onMouse: (event) => this.mouse(event),
    });
    this.#inputPolicy = inputPolicy;
    this.#measurer = TextBuffer.create(renderer.widthMethod, renderer.nativeScene);
    this.#measureView = TextBufferView.create(this.#measurer);
    this.#links = new TerminalLinkText(renderer);
    this.#measureView.setWrapMode('none');
    this.appearance = appearance ?? new TerminalAppearanceRuntime(settings);
    this.#ownsAppearance = !appearance;
    this.#detachAppearanceHost = attachTerminalAppearance(renderer, this.appearance);
    const applyAppearance = () => {
      renderer.setCursorStyle(this.appearance.getSnapshot().cursor);
      this.requestRender();
    };
    this.#detachAppearance = this.appearance.subscribe(applyAppearance);
    applyAppearance();
    this.selectable = false;
    if (initializeTool) this.setTool('hand');
  }

  #width(text: string) {
    if (/^[\x20-\x7e]*$/.test(text)) return text.length;
    const cached = this.#widths.get(text);
    if (cached !== undefined) return cached;
    this.#measurer.setText(text);
    const width = this.#measureView.measureForDimensions(256, 1)?.widthColsMax ?? 0;
    if (this.#widths.size >= 2048) this.#widths.clear();
    this.#widths.set(text, width);
    return width;
  }

  #line(
    buffer: OptimizedBuffer,
    text: string,
    x: number,
    y: number,
    color = this.colors.muted,
    background = this.colors.chrome,
    limit = this.width - x,
    attributes = 0
  ) {
    let column = x;
    for (const { segment } of iterateGraphemes(text.replace(/\p{Cc}/gu, ' '))) {
      const width = this.#width(segment);
      if (column + width > x + limit) break;
      buffer.drawText(segment, column, y, color, background, attributes);
      column += width;
    }
  }

  #highlight(buffer: OptimizedBuffer, rect: CellRect) {
    buffer.fillRect(rect.x, rect.y, rect.width, rect.height, this.colors.selection);
  }

  get minimapFrame(): MinimapFrame | null {
    const panel = this.minimapOpen && !this.help ? minimapPanel(this.width, this.height) : null;
    return panel
      ? this.#minimap.frame(
          this.model.plane,
          this.model.plane.getRevision(),
          this.model.viewport,
          panel
        )
      : null;
  }

  #drawMinimap(buffer: OptimizedBuffer, frame: MinimapFrame) {
    const p = frame.panel;
    buffer.fillRect(p.x, p.y, p.width, p.height, this.colors.chrome);
    const box = (x: number, y: number, width: number, height: number, color: RGBA) => {
      buffer.drawText('┌' + '─'.repeat(width - 2) + '┐', x, y, color, this.colors.chrome);
      buffer.drawText(
        '└' + '─'.repeat(width - 2) + '┘',
        x,
        y + height - 1,
        color,
        this.colors.chrome
      );
      for (let row = y + 1; row < y + height - 1; row++) {
        buffer.drawText('│', x, row, color, this.colors.chrome);
        buffer.drawText('│', x + width - 1, row, color, this.colors.chrome);
      }
    };
    box(p.x, p.y, p.width, p.height, this.colors.muted);
    const view = frame.viewport;
    const width = p.width - 2;
    for (let y = 0; y < p.height - 2; y++)
      for (let x = 0; x < width; x++) {
        const left = x === view.x,
          right = x === view.x + view.width - 1;
        const top = y === view.y,
          bottom = y === view.y + view.height - 1;
        const inside = cellRectContainsPoint(view, { x, y });
        let glyph = ' ';
        if (inside && (top || bottom)) {
          const corners = top ? ['┌', '┐'] : ['└', '┘'];
          glyph = '─';
          if (left) glyph = corners[0]!;
          else if (right) glyph = corners[1]!;
        } else if (inside && (left || right)) glyph = '│';
        // Compose both channels per cell: the viewport never erases content beneath its border.
        buffer.drawText(
          glyph,
          p.x + 1 + x,
          p.y + 1 + y,
          this.colors.accent,
          frame.pixels[y * width + x] ? this.colors.minimapContent : this.colors.chrome
        );
      }
    if (!frame.hasContent)
      this.#line(
        buffer,
        messages.minimapEmpty,
        p.x + 3,
        p.y + 4,
        this.colors.muted,
        this.colors.chrome,
        p.width - 6
      );
  }

  #moveMinimap(frame: MinimapFrame, x: number, y: number) {
    const drag = this.#minimapDrag;
    if (!drag || (drag.x === x && drag.y === y)) return;
    const target = this.#minimap.cameraOrigin(frame, x, y, drag.grab);
    this.model.pan(target.x - this.model.viewport.x, target.y - this.model.viewport.y);
    drag.x = x;
    drag.y = y;
  }

  #minimapMouse(event: MouseEvent) {
    if (this.#pointer) return false;
    const frame = this.minimapFrame;
    if (!frame) {
      this.#minimapDrag = null;
      return false;
    }
    const x = event.x - this.screenX,
      y = event.y - this.screenY;
    if (this.#minimapDrag) {
      if (event.type === 'drag') this.#moveMinimap(frame, x, y);
      else if ((event.type === 'up' || event.type === 'drag-end') && event.button === 0) {
        this.#moveMinimap(frame, x, y);
        this.#minimapDrag = null;
      }
      return true;
    }
    if (!cellRectContainsPoint(frame.panel, { x, y })) return false;
    if (
      event.type === 'down' &&
      event.button === 0 &&
      frame.hasContent &&
      x > frame.panel.x &&
      x < frame.panel.x + frame.panel.width - 1 &&
      y > frame.panel.y &&
      y < frame.panel.y + frame.panel.height - 1
    ) {
      this.model.cancelInteraction();
      const point = this.#minimap.worldPoint(frame, x, y);
      const inside = cellRectContainsPoint(frame.viewport, {
        x: x - frame.panel.x - 1,
        y: y - frame.panel.y - 1,
      });
      const v = frame.transform.viewportBounds;
      const grab = inside
        ? { x: point.x - v.x - v.width / 2, y: point.y - v.y - v.height / 2 }
        : { x: 0, y: 0 };
      this.#minimapDrag = { grab, x, y };
      if (!inside) {
        const target = this.#minimap.cameraOrigin(frame, x, y, grab);
        this.model.pan(target.x - this.model.viewport.x, target.y - this.model.viewport.y);
      }
    }
    return true;
  }

  protected override renderSelf(buffer: OptimizedBuffer) {
    const { model } = this;
    this.contextMenu?.validate();
    buffer.clear(this.colors.background);
    if (this.width < 4 || this.height < 5) {
      this.#line(buffer, 'Resize terminal', 0, 0, this.colors.foreground, this.colors.background);
      this.renderer.setCursorPosition(0, 0, false);
      return;
    }
    model.resize(this.canvasBounds.width, this.canvasBounds.height);
    const { viewport } = model;
    const coverage = model.selectionPresentation.coverage;
    const ranges = coverage.areas.map((area) => ({
      x: area.start.x,
      y: area.start.y,
      width: area.end.x - area.start.x + 1,
      height: area.end.y - area.start.y + 1,
    }));
    ranges.push(...this.searchHighlights);
    for (const range of ranges) {
      const clipped = intersectCellRects(range, viewport);
      if (clipped)
        this.#highlight(buffer, {
          x: clipped.x - viewport.x,
          y: CANVAS_TOP + clipped.y - viewport.y,
          width: clipped.width,
          height: clipped.height,
        });
    }
    const cursorVisible =
      this.tool === 'edit' &&
      !this.placement &&
      !model.selection &&
      !this.contextMenu?.isOpen &&
      cellRectContainsPoint(viewport, model.cursor);
    this.widthFallbacks = 0;
    const frame = model.frame();
    const linkedGlyphs: LinkedGlyph[] = [];
    this.#links.beginFrame();
    // Include a leading halo so a wide glyph's clipped tail retains its background.
    const paintCell = (
      x: number,
      y: number,
      cell: import('@chardesk/cell-plane/types').GridCell
    ) => {
      const width = getGraphemeCellWidth(cell.char);
      const left = x - viewport.x,
        top = CANVAS_TOP + y - viewport.y;
      const fg = isDefaultArtifactForeground(cell)
        ? this.colors.foreground
        : RGBA.fromHex(cell.color);
      const sourceBg = cell.bgColor ? RGBA.fromHex(cell.bgColor) : this.colors.background;
      const highlighted =
        coverage.contains({ x, y }) ||
        this.searchHighlights.some((range) => cellRectContainsPoint(range, { x, y }));
      // Selection owns one background across text, spaces and wide followers;
      // inverse would swap that background with each character's own color.
      const bg = highlighted ? this.colors.selection : sourceBg;
      const attributes = createTextAttributes({
        ...cell.attrs,
        inverse: highlighted ? false : cell.attrs?.inverse,
        underline: cell.attrs?.underline || Boolean(cell.href),
        strikethrough: cell.attrs?.strike,
      });
      const start = Math.max(0, left),
        end = Math.min(this.width, left + width);
      if (end > start) buffer.drawText(' '.repeat(end - start), start, top, fg, bg, attributes);
      if (left < 0 || left + width > this.width) {
        if (cell.href && end > start)
          linkedGlyphs.push({
            x: start,
            y: top,
            width: end - start,
            chunk: {
              __isChunk: true,
              text: ' '.repeat(end - start),
              fg,
              bg,
              attributes,
              link: { url: cell.href },
            },
          });
        return;
      }
      const actualWidth = this.#width(cell.char);
      const text = actualWidth === width ? cell.char : '?'.repeat(width);
      if (actualWidth !== width) this.widthFallbacks += 1;
      if (cell.href)
        linkedGlyphs.push({
          x: left,
          y: top,
          width,
          chunk: { __isChunk: true, text, fg, bg, attributes, link: { url: cell.href } },
        });
      else buffer.drawText(text, left, top, fg, bg, attributes);
    };
    frame.source.visit({ ...viewport, x: viewport.x - 1, width: viewport.width + 1 }, paintCell);
    this.#links.draw(buffer, linkedGlyphs, 'document');
    if (this.placement) {
      linkedGlyphs.length = 0;
      const placement = this.placement;
      placement.source.visit(
        {
          x: viewport.x - placement.at.x - 1,
          y: viewport.y - placement.at.y,
          width: viewport.width + 1,
          height: viewport.height,
        },
        (x, y, cell) => paintCell(x + placement.at.x, y + placement.at.y, cell)
      );
      this.#links.draw(buffer, linkedGlyphs, 'placement');
    }
    this.#links.endFrame();
    const minimap = this.minimapFrame;
    if (minimap) this.#drawMinimap(buffer, minimap);
    const footer = this.footerBounds.y;
    buffer.fillRect(0, footer, this.width, FOOTER_ROWS, this.colors.chrome);
    const controls = this.dockControls;
    for (const control of controls) {
      const active = control.id === 'minimap' ? this.minimapOpen : control.id === this.tool;
      this.#line(
        buffer,
        control.label,
        control.x,
        control.y,
        this.colors.foreground,
        this.colors.chrome,
        control.width,
        createTextAttributes({ inverse: active })
      );
    }
    const statusBar = this.statusBar;
    const titleX = controls.length ? controls.at(-1)!.x + controls.at(-1)!.width + 1 : 0;
    if (statusBar.context)
      this.#line(buffer, ` ${statusBar.context}`, titleX, footer, this.colors.accent);
    this.#line(buffer, ` ${statusBar.hint}`, 0, footer + 1);
    if (this.help) {
      buffer.fillRect(
        0,
        CANVAS_TOP,
        this.width,
        Math.max(0, footer - CANVAS_TOP),
        this.colors.background
      );
      for (const [i, line] of this.helpLines.slice(this.helpScroll).entries()) {
        if (i + CANVAS_TOP >= footer) break;
        this.#line(buffer, line, 2, i + CANVAS_TOP, this.colors.foreground, this.colors.background);
      }
    }
    if (this.panel) {
      const layout = this.panelLayout;
      if (layout.height < (this.panel.dialog ? 8 : 4) || layout.width < 20) {
        buffer.fillRect(
          0,
          CANVAS_TOP,
          this.width,
          Math.max(0, footer - CANVAS_TOP),
          this.colors.background
        );
        this.#line(
          buffer,
          'Enlarge terminal to use panel · Esc returns',
          0,
          CANVAS_TOP,
          this.colors.foreground,
          this.colors.background
        );
      } else {
        buffer.fillRect(layout.x, layout.y, layout.width, layout.height, this.colors.background);
        if (this.panel.dialog) {
          this.#line(
            buffer,
            '┌' + '─'.repeat(layout.width - 2) + '┐',
            layout.x,
            layout.y,
            this.colors.muted
          );
          this.#line(
            buffer,
            '└' + '─'.repeat(layout.width - 2) + '┘',
            layout.x,
            layout.y + layout.height - 1,
            this.colors.muted
          );
          for (let y = layout.y + 1; y < layout.y + layout.height - 1; y++) {
            this.#line(buffer, '│', layout.x, y, this.colors.muted);
            this.#line(buffer, '│', layout.x + layout.width - 1, y, this.colors.muted);
          }
          for (const tab of this.panelTabControls)
            this.#line(
              buffer,
              tab.label,
              tab.x,
              tab.y,
              tab.index === this.panel.selectedTab
                ? this.colors.selectionForeground
                : this.colors.foreground,
              tab.index === this.panel.selectedTab ? this.colors.selection : this.colors.background,
              tab.width,
              createTextAttributes({ bold: tab.index === this.panel.selectedTab })
            );
        }
        this.#line(
          buffer,
          this.panel.dialog ? ` ${this.panel.title} ` : this.panel.title,
          layout.x + 1,
          layout.y,
          this.colors.foreground,
          this.colors.background,
          layout.width - 5,
          createTextAttributes({ bold: true })
        );
        if (this.panel.input !== undefined)
          this.#line(
            buffer,
            `> ${this.panel.input}▏`,
            layout.x + 1,
            layout.y + 1,
            this.colors.foreground,
            this.colors.background,
            layout.width - 2
          );
        const start = Math.max(0, this.panel.selected - layout.rows + 1);
        for (let row = 0; row < layout.rows; row++) {
          const index = start + row,
            item = this.panel.items[index];
          if (item === undefined) break;
          if (this.panel.dialog && index === this.panel.selected)
            buffer.fillRect(
              layout.x + 1,
              layout.itemsY + row,
              layout.width - 2,
              1,
              this.colors.selection
            );
          this.#line(
            buffer,
            `${index === this.panel.selected ? '›' : ' '} ${item}`,
            layout.x + 1,
            layout.itemsY + row,
            this.panel.dialog && index === this.panel.selected
              ? this.colors.selectionForeground
              : this.colors.foreground,
            this.panel.dialog && index === this.panel.selected
              ? this.colors.selection
              : this.colors.background,
            layout.width - 2,
            createTextAttributes({ inverse: !this.panel.dialog && index === this.panel.selected })
          );
        }
      }
    }
    // OpenTUI's terminal cursor API uses 1-based coordinates.
    this.contextMenu?.render(buffer, (text, x, y, fg, bg, width) =>
      this.#line(buffer, text, x, y, fg, bg, width)
    );
    this.renderer.setCursorPosition(
      model.cursor.x - viewport.x + 1,
      CANVAS_TOP + model.cursor.y - viewport.y + 1,
      cursorVisible &&
        !this.help &&
        !this.panel &&
        !this.contextMenu?.isOpen &&
        !(
          minimap &&
          cellRectContainsPoint(minimap.panel, {
            x: model.cursor.x - viewport.x,
            y: CANVAS_TOP + model.cursor.y - viewport.y,
          })
        )
    );
  }

  get statusBar() {
    const copy = messages;
    if (this.closing) return { context: copy.closing, hint: '' };
    if (this.panel) {
      const section = this.panel.tabs?.[this.panel.selectedTab ?? 0];
      const context = [
        this.panel.title,
        section,
        this.panel.error || this.status || this.panel.status,
      ]
        .filter(Boolean)
        .join(' · ');
      return { context, hint: this.panel.hint };
    }
    if (this.contextMenu?.isOpen)
      return { context: 'Context menu', hint: '↑↓ / Tab select · Enter run · Esc close' };
    if (this.help) return { context: copy.help, hint: `${copy.closeHelp} · ↑↓ scroll` };
    const editHint = rangeClickHint(this.inputPolicy) ?? copy.editHint;
    const actionHint = `${this.tool === 'hand' ? copy.handHint : editHint} · ${this.shortcuts.copy.label} ${copy.copy} · ${this.shortcuts.paste.label} ${copy.paste}`;
    const hint =
      (this.model.getSnapshot().drawingError ? 'Drawing is too large. Try a smaller area.' : '') ||
      (this.placement
        ? `${this.placement.label} · Enter place · Shift+arrows 10 cells · Option pan · Esc cancel`
        : '') ||
      this.status ||
      this.backgroundStatus ||
      (this.minimapOpen && !this.minimapFrame
        ? copy.minimapSmall
        : this.widthFallbacks
          ? copy.width
          : actionHint);
    return { context: '', hint };
  }

  get helpLines() {
    return helpLines(
      this.shortcuts,
      this.inputPolicy,
      this.renderer.capabilities?.hyperlinks,
      this.settings.values.panStep
    );
  }

  get panelTabControls() {
    const layout = this.panelLayout;
    let x = layout.x + 2;
    return (this.panel?.tabs ?? []).flatMap((name, index) => {
      const label = ` ${name} `,
        width = this.#width(label);
      const control = { index, label, x, y: layout.y + 1, width, height: 1 };
      x += width + 1;
      return x <= layout.x + layout.width ? [control] : [];
    });
  }

  get panelLayout() {
    if (this.panel?.dialog) {
      const width = Math.min(76, Math.max(0, this.width - 4));
      const height = Math.min(16, Math.max(0, this.height - 4));
      const x = Math.floor((this.width - width) / 2);
      const y = CANVAS_TOP + Math.floor((this.canvasBounds.height - height) / 2);
      const itemsY = y + 3;
      return { x, y, width, height, itemsY, rows: Math.max(0, height - 4) };
    }
    const y = CANVAS_TOP + 1,
      height = Math.max(0, this.footerBounds.y - y);
    const itemsY = y + (this.panel?.input === undefined ? 1 : 2);
    return {
      x: 1,
      y,
      width: Math.max(0, this.width - 2),
      height,
      itemsY,
      rows: Math.max(0, y + height - itemsY),
    };
  }

  mouse(event: MouseEvent) {
    if (this.closing) return;
    this.contextMenu?.validate();
    if (this.contextMenu?.isOpen) {
      this.contextMenu.mouse(event);
      return;
    }
    if (this.help) return;
    if (this.panel) {
      if (event.type === 'down' && event.button === 0) {
        const layout = this.panelLayout,
          localY = event.y - this.screenY;
        if (this.panel.dialog) {
          const point = { x: event.x - this.screenX, y: localY };
          if (!cellRectContainsPoint(layout, point)) {
            this.panel.onClose?.();
            return;
          }
          if (layout.width < 20 || layout.height < 8) return;
          const tab = this.panelTabControls.find((control) =>
            cellRectContainsPoint(control, point)
          );
          if (tab) {
            this.panel.onTab?.(tab.index);
            return;
          }
          if (point.x <= layout.x || point.x >= layout.x + layout.width - 1) return;
        }
        const start = Math.max(0, this.panel.selected - layout.rows + 1);
        const index = start + localY - layout.itemsY;
        if (
          localY >= layout.itemsY &&
          localY < layout.itemsY + layout.rows &&
          index < this.panel.items.length
        ) {
          this.panel.selected = index;
          this.panel.onPick?.(index);
          this.requestRender();
        }
      }
      return;
    }
    if (event.type === 'down' && event.button === 0 && !this.#pointer && !this.#minimapDrag) {
      const point = { x: event.x - this.screenX, y: event.y - this.screenY };
      const control = this.dockControls.find((control) => cellRectContainsPoint(control, point));
      if (control) {
        this.model.editor.commands.execute(`terminal.${control.id}`, undefined, 'terminal-dock');
        this.requestRender();
        return;
      }
    }
    if (this.placement) {
      const local = { x: event.x - this.screenX, y: event.y - this.screenY - CANVAS_TOP };
      if (
        local.x >= 0 &&
        local.y >= 0 &&
        local.x < this.model.viewport.width &&
        local.y < this.model.viewport.height &&
        ['down', 'move', 'drag'].includes(event.type)
      ) {
        this.placement.at = {
          x: this.model.viewport.x + local.x,
          y: this.model.viewport.y + local.y,
        };
        this.requestRender();
      }
      return;
    }
    if (this.#minimapMouse(event)) {
      this.requestRender();
      return;
    }
    const screen = { x: event.x, y: event.y };
    const local = { x: event.x - this.screenX, y: event.y - this.screenY - CANVAS_TOP };
    const cell = { x: this.model.viewport.x + local.x, y: this.model.viewport.y + local.y };
    const inside =
      local.x >= 0 &&
      local.y >= 0 &&
      local.x < this.model.viewport.width &&
      local.y < this.model.viewport.height;
    if (event.type === 'down' && event.button === 2 && inside) {
      this.contextMenu?.open(cell, { x: local.x, y: local.y + CANVAS_TOP });
      return;
    }
    if (event.type === 'down' && event.button === 0 && inside) {
      const modifiers = this.inputModifiers.merge(event.modifiers);
      this.#pointer = screen;
      this.model.pointer({
        phase: 'down',
        screen,
        cell,
        shift: modifiers.shift || (this.model.currentTool === 'select' && modifiers.alt),
        append: modifiers.ctrl,
        button: 0,
      });
    } else if (event.type === 'drag' && this.#pointer) {
      const delta = { x: screen.x - this.#pointer.x, y: screen.y - this.#pointer.y };
      this.#pointer = screen;
      this.model.pointer({ phase: 'move', screen, cell, delta });
    } else if (
      (event.type === 'up' || event.type === 'drag-end') &&
      event.button === 0 &&
      this.#pointer
    ) {
      this.model.pointer({ phase: 'up', screen, cell });
      this.#pointer = null;
    }
    this.requestRender();
  }

  protected override destroySelf() {
    this.#detachAppearanceHost();
    this.#detachAppearance();
    if (this.#ownsAppearance) this.appearance.dispose();
    this.#links.destroy();
    this.#measureView.destroy();
    this.#measurer.destroy();
  }
}
