import { isDefaultArtifactForeground } from '@chardesk/cell-plane/artifact-style';
import type { CanvasSurfaceReader } from '@chardesk/cell-plane';
import { WelcomeAppearance } from '@chardesk/canvas-templates/welcome-appearance';
import { TerminalInputModifiers } from './inputModifiers.ts';
import { TerminalInputContext } from './inputContext.ts';
import { TerminalViewStatus } from './viewStatus.ts';
import { TerminalShortcutsDialog } from './shortcutsDialog.ts';
import {
  mouseModifierSource,
  resolveTerminalPolicy,
  type TerminalInputPolicy,
} from './terminalPolicy.ts';
import type { GridCellSource, Point } from '@chardesk/cell-plane/types';
import {
  createTerminalShortcuts,
  effectiveTerminalShortcuts,
  type TerminalAction,
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
import { localizedMessages, helpLines } from './copy.ts';
import type { TerminalCanvas } from '@chardesk/local-runtime/model';
import { TerminalMinimap, minimapPanel, type MinimapFrame } from './minimap.ts';
import { TerminalLinkText, type LinkedGlyph } from './linkText.ts';
import type { TerminalContextMenu } from './contextMenu.ts';
import { TerminalSettingsStore } from './settings.ts';
import { TerminalAppearanceRuntime } from './appearance.ts';
import { attachTerminalAppearance } from './appearanceHost.ts';
import { canEdgeScroll } from '@chardesk/editor-core/interaction/edgeScroll';
import { TerminalEdgeScroll } from './edgeScroll.ts';
import type { TerminalInspector } from './inspector.ts';
import {
  TerminalFeedback,
  noticeText,
  noticeDetail,
  noticeAction,
  type TerminalNotice,
} from './feedback.ts';

export const CANVAS_TOP = 1;
const FOOTER_ROWS = 2;
const CHROME_LABELS = {
  settings: 'Settings',
  minimap: 'Minimap',
  documents: 'Sessions',
  edit: 'Edit',
  hand: 'Hand',
  inspector: 'Style',
  new: 'New',
  open: 'Open',
  'confirm-placement': 'Place',
  'cancel-placement': 'Cancel',
} as const;
type ChromeAction = keyof typeof CHROME_LABELS;

export type TerminalPanel = {
  notice?: TerminalNotice;
  dialog?: boolean;
  /** Modal child; render its parent underneath and route input only to this panel. */
  underlay?: TerminalPanel;
  tabs?: string[];
  trailingTab?: number;
  selectedTab?: number;
  onTab?: (index: number) => void;
  onClose?: () => void;
  status?: string;
  title: string;
  input?: string;
  hint: string;
  items: string[];
  /** Read-only document viewport; independent of list selection. */
  scrollArea?: {
    lines: readonly string[];
    scrollTop: number;
    onRendered?: (start: number, end: number) => void;
  };
  itemHints?: readonly string[];
  emptyMessage?: string;
  actions?: readonly { id: string; label: string; onPick: () => void }[];
  /** Keep actions inside the dialog, outside its scrolling body. */
  actionPlacement?: 'dialog-footer';
  selected: number;
  activeItem?: number;
  error?: string;
  onPick?: (index: number) => void;
  /** Indices actually painted in the topmost panel; loading a list does not imply viewing it. */
  onItemsRendered?: (start: number, end: number) => void;
  readonly busy?: boolean;
  onInput?: (value: string) => void;
};

export class CanvasSurface extends Renderable {
  readonly input = new TerminalInputContext(() => this.requestRender());
  readonly t: TerminalSettingsStore['i18n']['t'];
  readonly messages: ReturnType<typeof localizedMessages>;
  #detachSettings: () => void;
  get #dockFocus() {
    return this.input.dockFocus;
  }
  set #dockFocus(value: TerminalAction | null) {
    this.input.dockFocus = value;
  }
  contextMenu: TerminalContextMenu | null = null;
  inspector: TerminalInspector | null = null;
  hasDocument = true;
  readonly shortcutsDialog = new TerminalShortcutsDialog(this);
  get help() {
    return this.shortcutsDialog.isOpen;
  }
  set help(open: boolean) {
    if (open) this.shortcutsDialog.open();
    else this.shortcutsDialog.close();
  }
  get panel() {
    return this.input.panel;
  }
  placement: {
    at: Point;
    source: GridCellSource;
    width: number;
    height: number;
    label: string;
  } | null = null;
  readonly feedback: TerminalFeedback;
  onFeedbackAction?: (notice: TerminalNotice) => void;
  get closing() {
    return this.input.closing;
  }
  set closing(value: boolean) {
    this.input.setClosing(value);
  }
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
  get status() {
    return this.feedback.message ? noticeText(this.feedback.message) : '';
  }
  set status(value: string) {
    if (value) this.feedback.show(value);
    else this.feedback.clear();
  }
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
  readonly #edgeScroll: TerminalEdgeScroll;
  readonly #detachInteraction: () => void;
  readonly inputModifiers = new TerminalInputModifiers();
  readonly viewStatus = new TerminalViewStatus(() => this.requestRender());
  setInputPolicy(policy: TerminalInputPolicy) {
    const changedSource = mouseModifierSource(this.#inputPolicy) !== mouseModifierSource(policy);
    this.#inputPolicy = policy;
    this.#shortcutCache = undefined;
    if (changedSource) {
      this.inputModifiers.clear();
      this.cancelGesture();
    }
    this.requestRender();
  }
  cancelGesture() {
    this.#edgeScroll.stop();
    this.#minimapDrag = null;
    this.#pointer = null;
    this.model.cancelInteraction();
    this.requestRender();
  }

  settleGesture() {
    this.model.settleInteraction();
    this.cancelGesture();
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

  get #controlsHidden() {
    return Boolean(this.panel || this.help || this.contextMenu?.isOpen || this.closing);
  }

  #controlRow(ids: readonly ChromeAction[], y: number, limit = this.width) {
    let x = 0;
    return ids.flatMap((id) => {
      const name = this.t(CHROME_LABELS[id]);
      const shortcut = ['new', 'open', 'confirm-placement', 'cancel-placement'].includes(id)
        ? `${this.shortcuts[id].label} `
        : '';
      const label = `[${shortcut}${name}]`;
      const width = this.#width(label);
      if (x + width > limit) return [];
      const control = { id, label, x, y, width, height: 1 };
      x += width + 1;
      return [control];
    });
  }

  get headerControls() {
    return this.#controlsHidden || this.placement
      ? []
      : this.#controlRow(['settings', 'minimap', 'documents'], 0);
  }

  get dockControls() {
    if (this.#controlsHidden) return [];
    const ids: readonly ChromeAction[] = !this.hasDocument
      ? ['new', 'open']
      : this.placement
        ? ['confirm-placement', 'cancel-placement']
        : ['edit', 'hand', 'inspector'];
    const right = this.#footerContentRight;
    const notice = right < this.width ? this.footerNotice : undefined;
    const action =
      notice && this.onFeedbackAction && (notice.action || noticeDetail(notice))
        ? noticeAction(notice) || this.t('Details')
        : '';
    const reserve = notice
      ? Math.min(8, this.#width(noticeText(notice))) + (action ? this.#width(action) + 1 : 0) + 3
      : 0;
    return this.#controlRow(ids, this.footerBounds.y, Math.max(0, right - reserve));
  }

  get chromeControls() {
    return [...this.headerControls, ...this.dockControls];
  }

  get #primaryStatusControls() {
    return this.viewStatus.layout(
      this.width,
      this.footerBounds.y,
      (text) => this.#width(text),
      (text, width) => this.#fit(text, width),
      1
    );
  }

  get #footerContentRight() {
    return Math.max(
      0,
      Math.min(this.width, ...this.#primaryStatusControls.map((control) => control.x - 1))
    );
  }

  get viewStatusControls() {
    return [
      ...this.#primaryStatusControls,
      ...(this.footerBounds.height < 2
        ? []
        : this.viewStatus.layout(
            this.width,
            this.footerBounds.y + 1,
            (text) => this.#width(text),
            (text, width) => this.#fit(text, width)
          )),
    ];
  }

  get focusableDockControls() {
    return this.dockControls.filter(
      (control) =>
        ['edit', 'hand', 'inspector'].includes(control.id) &&
        this.model.editor.commands.canExecute(`terminal.${control.id}`, undefined)
    );
  }
  get focusedDockControl() {
    if (this.#dockFocus === null) return null;
    const control = this.focusableDockControls.find((control) => control.id === this.#dockFocus);
    if (!control) this.#dockFocus = null;
    return control ?? null;
  }
  clearDockFocus() {
    const focused = this.#dockFocus !== null;
    this.#dockFocus = null;
    if (focused) this.requestRender();
    return focused;
  }
  moveDockFocus(direction: number) {
    const controls = this.focusableDockControls;
    if (!controls.length) return;
    this.settleGesture();
    this.inspector?.blur();
    this.model.cancelPendingPaste();
    const current = controls.findIndex((control) => control.id === this.#dockFocus);
    let next = current + direction;
    if (current < 0) {
      next = controls.findIndex((control) => control.id === (this.hasDocument ? this.tool : 'new'));
      if (next < 0) next = direction > 0 ? 0 : controls.length - 1;
    }
    this.#dockFocus = controls[(next + controls.length) % controls.length]!.id;
    this.requestRender();
  }
  activateDock(id = this.focusedDockControl?.id) {
    const control = this.chromeControls.find((control) => control.id === id);
    this.clearDockFocus();
    if (!control || !this.model.editor.commands.canExecute(`terminal.${control.id}`, undefined))
      return;
    this.model.editor.commands.execute(`terminal.${control.id}`, undefined, 'terminal-dock');
    this.requestRender();
  }

  constructor(
    readonly renderer: CliRenderer,
    readonly model: TerminalCanvas,
    public filename: string,
    readonly platform: NodeJS.Platform = process.platform,
    initializeTool = true,
    inputPolicy: TerminalInputPolicy = resolveTerminalPolicy(),
    readonly settings = new TerminalSettingsStore(),
    appearance?: TerminalAppearanceRuntime,
    readonly welcomeAppearance = new WelcomeAppearance(() => this.appearance.getSnapshot())
  ) {
    super(renderer, {
      id: 'terminal-canvas',
      width: '100%',
      height: '100%',
      buffered: true,
      onMouse: (event) => this.mouse(event),
    });
    this.t = settings.i18n.t;
    this.messages = localizedMessages(this.t);
    this.feedback = new TerminalFeedback(renderer.clock, () => this.requestRender());
    this.#detachSettings = settings.subscribe(() => this.requestRender());
    this.#inputPolicy = inputPolicy;
    this.#edgeScroll = new TerminalEdgeScroll(renderer.clock, (x, y) => this.#panOnEdge(x, y));
    this.#detachInteraction = model.subscribe(() => {
      if (!canEdgeScroll(model.gestureState)) this.#edgeScroll.stop();
      if (model.gestureState.type === 'idle') this.#pointer = null;
    });
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
    const reader = this.contentReader;
    return panel
      ? this.#minimap.frame(
          reader,
          'getRevision' in reader && typeof reader.getRevision === 'function'
            ? reader.getRevision()
            : 0,
          this.model.viewport,
          panel,
          this.appearance.getSnapshot().palette?.foreground ?? null
        )
      : null;
  }
  projectContent = (source: CanvasSurfaceReader) => this.welcomeAppearance.project(source);
  get contentReader() {
    return this.projectContent(this.model.plane);
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
    const colors = frame.colors.map((color) =>
      color.kind === 'literal' ? RGBA.fromHex(color.value) : this.colors.foreground
    );
    const palette = this.appearance.getSnapshot().palette;
    const luma = (c: RGBA) => c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
    const foreground = palette ? RGBA.fromHex(palette.foreground) : null;
    const background = palette ? RGBA.fromHex(palette.background) : null;
    const tint = (color: RGBA) => {
      let target: RGBA | null = null;
      if (foreground && background)
        target =
          Math.abs(luma(color) - luma(foreground)) >= Math.abs(luma(color) - luma(background))
            ? foreground
            : background;
      const pole = luma(color) < 0.5 ? 1 : 0;
      return RGBA.fromValues(
        color.r + ((target?.r ?? pole) - color.r) * 0.18,
        color.g + ((target?.g ?? pole) - color.g) * 0.18,
        color.b + ((target?.b ?? pole) - color.b) * 0.18
      );
    };
    const native = (id: number) =>
      Boolean(id && !palette && frame.colors[id - 1]!.kind === 'foreground');
    const highlighted = colors.map((color, i) => (native(i + 1) ? color : tint(color)));
    for (let y = 0; y < p.height - 2; y++)
      for (let x = 0; x < width; x++) {
        const top = frame.pixels[y * 2 * width + x]!;
        const bottom = frame.pixels[(y * 2 + 1) * width + x]!;
        const inside = cellRectContainsPoint(view, { x, y });
        const inks = inside ? highlighted : colors;
        const backing = inside ? this.colors.minimapViewport : this.colors.chrome;
        // Keep an unresolved native foreground in the FG channel; it cannot be
        // converted to an RGB background without an actual terminal palette.
        const lowerInk = !top || (bottom && top !== bottom && native(bottom));
        const ink = lowerInk ? bottom : top;
        const paper = lowerInk ? top : bottom;
        const full = top && top === bottom;
        let glyph = ' ';
        if (full) glyph = '█';
        else if (ink) glyph = lowerInk ? '▄' : '▀';
        buffer.drawText(
          glyph,
          p.x + 1 + x,
          p.y + 1 + y,
          ink ? inks[ink - 1]! : this.colors.foreground,
          paper && !full ? inks[paper - 1]! : backing,
          createTextAttributes({ dim: inside && native(ink) })
        );
      }
    if (!frame.hasContent)
      this.#line(
        buffer,
        ` ${this.messages.minimapEmpty} `,
        p.x + 2,
        p.y,
        this.colors.muted,
        this.colors.chrome,
        p.width - 4
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
    this.shortcutsDialog.refresh();
    this.contextMenu?.validate();
    this.inspector?.validate();
    buffer.clear(this.colors.background);
    if (this.width < 4 || this.height < 5) {
      this.#line(buffer, 'Resize terminal', 0, 0, this.colors.foreground, this.colors.background);
      this.renderer.setCursorPosition(0, 0, false);
      return;
    }
    model.resize(this.canvasBounds.width, this.canvasBounds.height);
    const { viewport } = model;
    const coverage = model.selectionPresentationFor({
      ...viewport,
      x: viewport.x - 1,
      width: viewport.width + 1,
    }).coverage;
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
      this.hasDocument &&
      !this.focusedDockControl &&
      this.tool === 'edit' &&
      !this.placement &&
      !model.selection &&
      !this.contextMenu?.isOpen &&
      cellRectContainsPoint(viewport, model.cursor);
    this.widthFallbacks = 0;
    const frame = model.frame();
    const projectCell = this.welcomeAppearance.cellProjector(model.plane);
    const linkedGlyphs: LinkedGlyph[] = [];
    this.#links.beginFrame();
    // Include a leading halo so a wide glyph's clipped tail retains its background.
    const paintCell = (
      x: number,
      y: number,
      authoredCell: import('@chardesk/cell-plane/types').GridCell
    ) => {
      const cell = projectCell(authoredCell);
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
    this.inspector?.render(buffer, (text, x, y, fg, bg, width, attributes) =>
      this.#line(buffer, text, x, y, fg, bg, width, attributes)
    );
    const footer = this.footerBounds.y;
    buffer.fillRect(0, footer, this.width, FOOTER_ROWS, this.colors.chrome);
    buffer.fillRect(0, 0, this.width, CANVAS_TOP, this.colors.chrome);
    const dock = this.dockControls;
    const controls = [...this.headerControls, ...dock];
    const focused = this.focusedDockControl;
    for (const control of controls) {
      const active =
        control.id === 'minimap'
          ? this.minimapOpen
          : control.id === 'inspector'
            ? this.inspector?.isOpen
            : control.id === this.tool;
      const hasFocus = control.id === focused?.id;
      const enabled = model.editor.commands.canExecute(`terminal.${control.id}`, undefined);
      this.#line(
        buffer,
        control.label,
        control.x,
        control.y,
        hasFocus
          ? this.colors.selectionForeground
          : enabled
            ? this.colors.foreground
            : this.colors.muted,
        hasFocus ? this.colors.selection : this.colors.chrome,
        control.width,
        createTextAttributes({ inverse: active && !hasFocus })
      );
    }
    const statusBar = this.statusBar;
    const titleX = dock.length ? dock.at(-1)!.x + dock.at(-1)!.width + 1 : 0;
    const feedback = this.feedbackControl;
    const labelWidth = Math.max(0, (feedback?.x ?? this.#footerContentRight) - titleX - 2);
    let footerLabel = this.#fit(statusBar.context, labelWidth);
    for (const command of statusBar.hint.split(' · ').filter(Boolean)) {
      const next = [footerLabel, command].filter(Boolean).join(' · ');
      if (this.#width(next) > labelWidth) break;
      footerLabel = next;
    }
    this.#line(
      buffer,
      ` ${footerLabel}`,
      titleX,
      footer,
      this.colors.accent,
      this.colors.chrome,
      labelWidth + 1
    );
    for (const action of this.panelFooterControls.filter((control) => control.y === footer))
      this.#line(
        buffer,
        action.label,
        action.x,
        action.y,
        this.panel?.busy ? this.colors.muted : this.colors.accent,
        this.colors.chrome,
        action.width
      );
    if (feedback) {
      this.#line(
        buffer,
        feedback.message,
        feedback.x,
        footer,
        this.#noticeColor(feedback.notice.kind)
      );
      if (feedback.action)
        this.#line(buffer, feedback.action.label, feedback.action.x, footer, this.colors.accent);
    }
    for (const control of this.viewStatusControls) {
      this.#line(
        buffer,
        control.text,
        control.x,
        control.y,
        control.tone === 'normal' ? this.colors.foreground : this.colors.muted,
        this.colors.chrome,
        control.width
      );
      if (control.badge)
        this.#line(
          buffer,
          control.badge.text,
          control.x + control.badge.offset,
          control.y,
          RGBA.fromIndex(1, this.appearance.getSnapshot().palette?.slots[1] ?? undefined),
          this.colors.chrome,
          control.width - control.badge.offset,
          createTextAttributes({ bold: true })
        );
    }
    if (this.panel) this.#renderPanel(buffer, this.panel);
    // OpenTUI's terminal cursor API uses 1-based coordinates.
    this.contextMenu?.render(buffer, (text, x, y, fg, bg, width) =>
      this.#line(buffer, text, x, y, fg, bg, width)
    );
    const inspectorCursor = this.inspector?.cursor;
    if (inspectorCursor)
      this.renderer.setCursorPosition(inspectorCursor.x + 1, inspectorCursor.y + 1, true);
    else
      this.renderer.setCursorPosition(
        model.cursor.x - viewport.x + 1,
        CANVAS_TOP + model.cursor.y - viewport.y + 1,
        cursorVisible &&
          !this.help &&
          !this.panel &&
          !this.contextMenu?.isOpen &&
          !this.inspector?.focused &&
          !this.inspector?.contains({
            x: model.cursor.x - viewport.x,
            y: CANVAS_TOP + model.cursor.y - viewport.y,
          }) &&
          !(
            minimap &&
            cellRectContainsPoint(minimap.panel, {
              x: model.cursor.x - viewport.x,
              y: CANVAS_TOP + model.cursor.y - viewport.y,
            })
          )
      );
  }

  get footerNotice(): TerminalNotice | undefined {
    if (this.closing) return undefined;
    const current = this.feedback.current;
    if (current)
      return current === this.panel?.notice ||
        (current.key !== undefined && current.key === this.panel?.notice?.key)
        ? undefined
        : current;
    return this.model.getSnapshot().drawingError
      ? { text: this.t('Area too large'), kind: 'warning' }
      : this.minimapOpen && !this.minimapFrame
        ? {
            text: this.t('No map'),
            kind: 'warning',
            detail: this.messages.minimapSmall,
          }
        : this.widthFallbacks
          ? { text: this.t('Check glyph display'), kind: 'warning', detail: this.messages.width }
          : undefined;
  }

  get statusBar() {
    const notice = this.footerNotice;
    let context = '',
      hint = '';
    if (this.closing) context = this.messages.closing;
    else if (this.panel) {
      context = this.panel.title;
      hint = [
        ...this.panelFooterControls
          .filter((control) => control.y === this.footerBounds.y)
          .map((action) => action.label),
        this.panel.hint,
      ]
        .filter(Boolean)
        .join(' · ');
    } else if (this.contextMenu?.isOpen) {
      context = this.t('Context menu');
      hint = this.t('Enter run · Esc close');
    } else if (this.focusedDockControl) {
      hint = this
        .t`${this.shortcuts['dock-next'].label} switch · ${this.shortcuts['dock-activate'].label} choose`;
    } else context = this.placement?.label ?? '';
    return { context, hint, status: notice ? noticeText(notice) : undefined };
  }

  #fit(text: string, width: number) {
    if (width <= 0) return '';
    const clean = text.replace(/\p{Cc}/gu, ' ');
    if (this.#width(clean) <= width) return clean;
    let fitted = '',
      used = 0;
    for (const { segment } of iterateGraphemes(clean)) {
      const size = this.#width(segment);
      if (used + size > width - 1) break;
      fitted += segment;
      used += size;
    }
    return fitted + '…';
  }

  #noticeColor(kind: TerminalNotice['kind']) {
    const appearance = this.appearance.getSnapshot();
    if (appearance.palette && (kind === 'error' || kind === 'warning'))
      return RGBA.fromHex(appearance.contentTheme[kind === 'error' ? 'danger' : 'warning']);
    return kind === 'success' || kind === 'progress' ? this.colors.muted : this.colors.foreground;
  }

  get feedbackControl() {
    const notice = this.footerNotice;
    if (!notice) return null;
    const dock = this.dockControls;
    const left = dock.length ? dock.at(-1)!.x + dock.at(-1)!.width + 2 : 1;
    const right = this.#footerContentRight;
    const available = Math.max(0, right - left - 1);
    if (!available) return null;
    const label =
      this.onFeedbackAction && (notice.action || noticeDetail(notice))
        ? noticeAction(notice) || this.t('Details')
        : '';
    const actionWidth = label && this.#width(label) + 2 < available ? this.#width(label) : 0;
    const message = this.#fit(noticeText(notice), available - (actionWidth ? actionWidth + 1 : 0));
    const width = this.#width(message) + (actionWidth ? actionWidth + 1 : 0);
    const x = right - width - 1,
      y = this.footerBounds.y;
    return {
      notice,
      message,
      x,
      y,
      width,
      height: 1,
      action: actionWidth
        ? { label, x: right - actionWidth - 1, y, width: actionWidth, height: 1 }
        : null,
    };
  }

  #renderPanel(buffer: OptimizedBuffer, panel: TerminalPanel) {
    if (panel.underlay) this.#renderPanel(buffer, panel.underlay);
    const layout = this.#layoutPanel(panel);
    if (layout.height < (panel.underlay ? 4 : panel.dialog ? 8 : 4) || layout.width < 20) {
      const top = panel.dialog ? CANVAS_TOP : 0;
      buffer.fillRect(
        0,
        top,
        this.width,
        Math.max(0, this.footerBounds.y - top),
        this.colors.background
      );
      this.#line(
        buffer,
        'Enlarge terminal to use panel · Esc returns',
        0,
        top,
        this.colors.foreground,
        this.colors.background
      );
    } else {
      buffer.fillRect(layout.x, layout.y, layout.width, layout.height, this.colors.background);
      if (panel.dialog) {
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
        for (const tab of this.#panelTabs(panel))
          this.#line(
            buffer,
            tab.label,
            tab.x,
            tab.y,
            tab.index === panel.selectedTab
              ? this.colors.selectionForeground
              : this.colors.foreground,
            tab.index === panel.selectedTab ? this.colors.selection : this.colors.background,
            tab.width,
            createTextAttributes({ bold: tab.index === panel.selectedTab })
          );
      }
      this.#line(
        buffer,
        panel.dialog ? ` ${panel.title} ` : panel.title,
        layout.x + 1,
        layout.y,
        this.colors.foreground,
        this.colors.background,
        layout.width - 5,
        createTextAttributes({ bold: true })
      );
      if (panel.input !== undefined)
        this.#line(
          buffer,
          `> ${panel.input}▏`,
          layout.x + 1,
          layout.y + 1,
          this.colors.foreground,
          this.colors.background,
          layout.width - 2
        );
      const area = panel.scrollArea;
      const start = area
        ? Math.max(0, Math.min(area.scrollTop, area.lines.length - layout.rows))
        : Math.max(0, panel.selected - layout.rows + 1);
      if (!area && !panel.items.length && panel.emptyMessage)
        this.#line(
          buffer,
          panel.emptyMessage,
          layout.x + 2,
          layout.itemsY,
          this.colors.muted,
          this.colors.background,
          layout.width - 4
        );
      for (let row = 0; row < layout.rows; row++) {
        const index = start + row,
          item = area ? area.lines[index] : panel.items[index];
        if (item === undefined) break;
        if (area) {
          this.#line(
            buffer,
            item,
            layout.x + 2,
            layout.itemsY + row,
            this.colors.foreground,
            this.colors.background,
            layout.width - 4
          );
          continue;
        }
        const hint = panel.itemHints?.[index];
        const hintWidth = hint
          ? Math.min(this.#width(hint), Math.floor((layout.width - 6) / 2))
          : 0;
        const selected = panel.dialog && index === panel.selected;
        if (panel.dialog && index === panel.selected)
          buffer.fillRect(
            layout.x + 1,
            layout.itemsY + row,
            layout.width - 2,
            1,
            this.colors.selection
          );
        this.#line(
          buffer,
          `${index === panel.selected ? '›' : ' '} ${item}`,
          layout.x + 1,
          layout.itemsY + row,
          panel.dialog && index === panel.selected
            ? this.colors.selectionForeground
            : index === panel.activeItem
              ? this.colors.accent
              : this.colors.foreground,
          panel.dialog && index === panel.selected ? this.colors.selection : this.colors.background,
          layout.width - 2 - (hintWidth ? hintWidth + 2 : 0),
          createTextAttributes({
            inverse: !panel.dialog && index === panel.selected,
            bold: index === panel.activeItem,
          })
        );
        if (hintWidth)
          this.#line(
            buffer,
            this.#fit(hint!, hintWidth),
            layout.x + layout.width - 2 - hintWidth,
            layout.itemsY + row,
            selected ? this.colors.selectionForeground : this.colors.muted,
            selected ? this.colors.selection : this.colors.background,
            hintWidth
          );
      }
      if (area && area.lines.length > layout.rows && layout.rows > 0) {
        const size = Math.max(1, Math.floor((layout.rows * layout.rows) / area.lines.length));
        const thumb = Math.round(
          (start / (area.lines.length - layout.rows)) * (layout.rows - size)
        );
        for (let row = 0; row < layout.rows; row++)
          this.#line(
            buffer,
            row >= thumb && row < thumb + size ? '┃' : '│',
            layout.x + layout.width - 2,
            layout.itemsY + row,
            this.colors.muted
          );
      }
      if (this.panel === panel) {
        if (area) area.onRendered?.(start, Math.min(area.lines.length, start + layout.rows));
        else panel.onItemsRendered?.(start, Math.min(panel.items.length, start + layout.rows));
      }
      for (const [index, note] of layout.notes.entries())
        this.#line(
          buffer,
          note,
          layout.x + 2,
          layout.itemsY + layout.rows + index,
          panel.error ? this.#noticeColor('error') : this.colors.muted,
          this.colors.background,
          layout.width - 4
        );
      if (panel.dialog && panel.actionPlacement === 'dialog-footer')
        for (const action of this.#panelFooterControls(panel))
          this.#line(
            buffer,
            action.label,
            action.x,
            action.y,
            this.colors.selectionForeground,
            this.colors.selection,
            action.width,
            createTextAttributes({ bold: true })
          );
    }
  }

  #panelNotes(width: number, panel = this.panel) {
    const text = panel?.error || panel?.status;
    if (!text || width <= 0) return [];
    const lines: string[] = [];
    let line = '';
    for (const { segment } of iterateGraphemes(text)) {
      if (segment === '\n' || this.#width(line + segment) > width) {
        lines.push(line);
        line = '';
        if (lines.length === 2) break;
      }
      if (segment !== '\n') line += segment;
    }
    if (lines.length < 2 && line) lines.push(line);
    else if (lines.length === 2) lines[1] = this.#fit(lines[1] + '…', width);
    return lines;
  }

  scrollPanelContent(delta: number) {
    const area = this.panel?.scrollArea;
    if (!area) return false;
    area.scrollTop = Math.max(
      0,
      Math.min(area.lines.length - this.panelLayout.rows, area.scrollTop + delta)
    );
    this.requestRender();
    return true;
  }

  get helpLines() {
    return helpLines(
      this.shortcuts,
      this.inputPolicy,
      this.renderer.capabilities?.hyperlinks,
      this.settings.values.panStep,
      this.t
    );
  }

  get panelTabControls() {
    return this.#panelTabs(this.panel);
  }

  #panelTabs(panel: TerminalPanel | null) {
    const layout = this.#layoutPanel(panel);
    let x = layout.x + 2;
    const names = panel?.tabs ?? [];
    const trailing = panel?.trailingTab;
    const rightLabel =
      trailing !== undefined && names[trailing] !== undefined ? ` ${names[trailing]} ` : undefined;
    const rightX = rightLabel
      ? layout.x + layout.width - 2 - this.#width(rightLabel)
      : layout.x + layout.width;
    const leftTabs = names.flatMap((name, index) => {
      if (index === trailing) return [];
      const label = ` ${name} `,
        width = this.#width(label);
      const control = { index, label, x, y: layout.y + 1, width, height: 1 };
      x += width + 1;
      return x <= (rightLabel ? rightX : layout.x + layout.width) ? [control] : [];
    });
    // A narrow dialog still exposes the selected activity tab alongside the Agent view.
    const selected = panel?.selectedTab;
    if (
      rightLabel &&
      selected !== undefined &&
      selected !== trailing &&
      !leftTabs.some((tab) => tab.index === selected) &&
      names[selected]
    ) {
      const label = ` ${names[selected]} `,
        width = this.#width(label);
      if (layout.x + 2 + width < rightX)
        leftTabs.splice(0, leftTabs.length, {
          index: selected,
          label,
          x: layout.x + 2,
          y: layout.y + 1,
          width,
          height: 1,
        });
    }
    return [
      ...leftTabs,
      ...(rightLabel && rightX >= layout.x + 2
        ? [
            {
              index: trailing!,
              label: rightLabel,
              x: rightX,
              y: layout.y + 1,
              width: this.#width(rightLabel),
              height: 1,
            },
          ]
        : []),
    ];
  }

  get panelFooterControls() {
    return this.#panelFooterControls(this.panel);
  }

  #panelFooterControls(panel: TerminalPanel | null) {
    if (panel?.dialog && panel.actionPlacement === 'dialog-footer') {
      const layout = this.#layoutPanel(panel);
      if (layout.width < 20 || layout.height < (panel.underlay ? 4 : 8)) return [];
      let remaining = layout.width - 4;
      const actions = (panel.actions ?? []).flatMap((action) => {
        const label = `[ ${action.label} ]`,
          width = this.#width(label);
        if (width > remaining) return [];
        remaining -= width + 1;
        return [{ ...action, label, width }];
      });
      const width =
        actions.reduce((sum, action) => sum + action.width, 0) + Math.max(0, actions.length - 1);
      let x = layout.x + layout.width - 2 - width;
      return actions.map((action) => {
        const control = { ...action, x, y: layout.y + layout.height - 2, height: 1 };
        x += action.width + 1;
        return control;
      });
    }
    let x = 1;
    if (panel?.title) x += this.#width(panel.title) + 3;
    return (panel?.actions ?? []).flatMap((action) => {
      const width = this.#width(action.label);
      if (x + width > (this.feedbackControl?.x ?? this.#footerContentRight)) return [];
      const control = { ...action, x, y: this.footerBounds.y, width, height: 1 };
      x += width + 3;
      return [control];
    });
  }

  get panelLayout() {
    return this.#layoutPanel(this.panel);
  }

  #layoutPanel(panel: TerminalPanel | null) {
    if (panel?.dialog) {
      const width = Math.min(
        panel.underlay
          ? Math.min(
              48,
              Math.max(
                20,
                this.#width(panel.title) + 7,
                ...panel.items.map((item) => this.#width(item) + 6)
              )
            )
          : 76,
        Math.max(0, this.width - (panel.underlay ? 8 : 4))
      );
      const height = Math.min(
        panel.underlay ? 4 : 16,
        Math.max(0, this.height - (panel.underlay ? 6 : 4))
      );
      const x = Math.floor((this.width - width) / 2);
      const y = CANVAS_TOP + Math.floor((this.canvasBounds.height - height) / 2);
      const itemsY = y + (panel.underlay ? 1 : 3);
      const notes = this.#panelNotes(width - 4, panel);
      return {
        x,
        y,
        width,
        height,
        itemsY,
        notes,
        rows: Math.max(
          0,
          height -
            (panel.underlay ? 2 : 4) -
            notes.length -
            (panel.actionPlacement === 'dialog-footer' && panel.actions?.length ? 2 : 0)
        ),
      };
    }
    const y = 0,
      height = Math.max(0, this.footerBounds.y);
    const itemsY = y + (panel?.input === undefined ? 1 : 2);
    const notes = this.#panelNotes(this.width - 4, panel);
    return {
      x: 0,
      y,
      width: this.width,
      height,
      itemsY,
      notes,
      rows: Math.max(0, y + height - itemsY - notes.length),
    };
  }

  #edgeEnabled() {
    return (
      !!this.#pointer &&
      this.renderer.useMouse &&
      this.hasDocument &&
      !this.closing &&
      !this.panel &&
      !this.help &&
      !this.contextMenu?.isOpen &&
      !this.placement &&
      !this.#minimapDrag &&
      canEdgeScroll(this.model.gestureState)
    );
  }

  #pointerCell(screen: Point, clamp: boolean): Point {
    const bounds = this.canvasBounds;
    const x = screen.x - this.screenX - bounds.x,
      y = screen.y - this.screenY - bounds.y;
    return {
      x: this.model.viewport.x + (clamp ? Math.max(0, Math.min(bounds.width - 1, x)) : x),
      y: this.model.viewport.y + (clamp ? Math.max(0, Math.min(bounds.height - 1, y)) : y),
    };
  }

  #panOnEdge(x: number, y: number) {
    if (!this.#edgeEnabled() || !this.#pointer) {
      this.#edgeScroll.stop();
      return;
    }
    try {
      const next = { x: this.model.viewport.x + x, y: this.model.viewport.y + y };
      const point = this.#pointerCell(this.#pointer, true);
      if (![next.x, next.y, point.x + x, point.y + y].every(Number.isSafeInteger))
        throw new RangeError(this.t('Canvas coordinate limit reached.'));
      const screen = this.#pointer;
      this.model.editor.transact(() => {
        this.model.pan(x, y);
        this.model.pointer({
          phase: 'move',
          screen,
          cell: this.#pointerCell(screen, true),
          delta: { x: 0, y: 0 },
        });
      });
      this.requestRender();
    } catch (error) {
      this.cancelGesture();
      if (!(error instanceof RangeError)) throw error;
      this.feedback.show(() => this.t('Canvas limit'), 'warning', error.message);
    }
  }

  #updateEdgeScroll() {
    if (!this.#edgeEnabled() || !this.#pointer) {
      this.#edgeScroll.stop();
      return;
    }
    this.#edgeScroll.update({
      clientPoint: { x: this.#pointer.x + 0.5, y: this.#pointer.y + 0.5 },
      getBounds: () => {
        const bounds = this.canvasBounds;
        return {
          left: this.screenX + bounds.x,
          top: this.screenY + bounds.y,
          width: bounds.width,
          height: bounds.height,
        };
      },
      isEnabled: () => {
        const enabled = this.#edgeEnabled();
        if (!enabled && this.#pointer) this.cancelGesture();
        return enabled;
      },
      // Pan and shared pointer replay are one editor transaction above.
      onCameraMove: () => {},
    });
  }

  mouse(event: MouseEvent) {
    // A no-button move recovers a release the terminal did not deliver.
    if (this.#pointer && (event.type === 'move' || event.type === 'out')) this.cancelGesture();
    const dismiss =
      this.panel &&
      event.type === 'down' &&
      event.button === 0 &&
      !cellRectContainsPoint(this.panelLayout, {
        x: event.x - this.screenX,
        y: event.y - this.screenY,
      }) &&
      !this.panelFooterControls.some((control) =>
        cellRectContainsPoint(control, { x: event.x - this.screenX, y: event.y - this.screenY })
      );
    if (!this.input.admit('pointer', dismiss ? 'dismiss' : undefined)) return;
    const feedback = this.feedbackControl;
    if (
      event.type === 'down' &&
      event.button === 0 &&
      feedback?.action &&
      cellRectContainsPoint(feedback.action, {
        x: event.x - this.screenX,
        y: event.y - this.screenY,
      })
    ) {
      this.onFeedbackAction?.(feedback.notice);
      return;
    }
    if (event.type === 'down') this.clearDockFocus();
    if (event.type === 'down' && event.button === 0) {
      const point = { x: event.x - this.screenX, y: event.y - this.screenY };
      const entry = this.viewStatusControls.find((control) =>
        cellRectContainsPoint(control, point)
      );
      if (entry) {
        entry.onPick?.();
        this.requestRender();
        return;
      }
    }
    this.contextMenu?.validate();
    if (this.contextMenu?.isOpen) {
      this.contextMenu.mouse(event);
      return;
    }
    if (this.panel) {
      if (event.type === 'scroll' && event.scroll) {
        const layout = this.panelLayout;
        if (
          layout.width >= 20 &&
          layout.height >= (this.panel.underlay ? 4 : this.panel.dialog ? 8 : 4) &&
          cellRectContainsPoint(layout, { x: event.x - this.screenX, y: event.y - this.screenY }) &&
          (event.scroll.direction === 'up' || event.scroll.direction === 'down')
        ) {
          const delta =
            Math.max(1, Math.abs(event.scroll.delta)) * (event.scroll.direction === 'up' ? -1 : 1);
          if (this.panel.scrollArea) this.scrollPanelContent(delta);
          else
            this.panel.selected = Math.max(
              0,
              Math.min(this.panel.items.length - 1, this.panel.selected + delta)
            );
          this.requestRender();
        }
        return;
      }
      if (event.type === 'down' && event.button === 0) {
        const layout = this.panelLayout,
          localY = event.y - this.screenY;
        const point = { x: event.x - this.screenX, y: localY };
        const action = this.panelFooterControls.find((control) =>
          cellRectContainsPoint(control, point)
        );
        if (action) {
          action.onPick();
          this.requestRender();
          return;
        }
        if (this.panel.dialog) {
          if (!cellRectContainsPoint(layout, point)) {
            this.panel.onClose?.();
            return;
          }
          if (layout.width < 20 || layout.height < (this.panel.underlay ? 4 : 8)) return;
          const tab = this.panelTabControls.find((control) =>
            cellRectContainsPoint(control, point)
          );
          if (tab) {
            this.panel.onTab?.(tab.index);
            return;
          }
          if (point.x <= layout.x || point.x >= layout.x + layout.width - 1) return;
        }
        if (this.panel.scrollArea) return;
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
    if (!this.#pointer && !this.#minimapDrag && this.inspector?.mouse(event)) return;
    if (event.type === 'down' && event.button === 0 && !this.#pointer && !this.#minimapDrag) {
      const point = { x: event.x - this.screenX, y: event.y - this.screenY };
      const control = this.chromeControls.find((control) => cellRectContainsPoint(control, point));
      if (control) {
        this.activateDock(control.id);
        return;
      }
    }
    if (!this.hasDocument) return;
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
    const clamp =
      canEdgeScroll(this.model.gestureState) || this.model.gestureState.type === 'rangeMovePending';
    const cell = this.#pointerCell(screen, clamp);
    const inside =
      local.x >= 0 &&
      local.y >= 0 &&
      local.x < this.model.viewport.width &&
      local.y < this.model.viewport.height;
    if (event.type === 'down' && event.button === 2 && inside) {
      this.contextMenu?.open(cell, { x: local.x, y: local.y + CANVAS_TOP });
      return;
    }
    try {
      if (event.type === 'down' && event.button === 0 && inside) {
        const modifiers = this.inputModifiers.resolveMouse(event.modifiers, this.inputPolicy);
        this.#pointer = screen;
        this.model.pointer({
          phase: 'down',
          screen,
          cell,
          shift: modifiers.shift || (this.model.currentTool === 'select' && modifiers.alt),
          append: modifiers.ctrl,
          button: 0,
        });
        this.#updateEdgeScroll();
      } else if (event.type === 'drag' && this.#pointer) {
        const delta = { x: screen.x - this.#pointer.x, y: screen.y - this.#pointer.y };
        this.#pointer = screen;
        this.model.pointer({ phase: 'move', screen, cell, delta });
        this.#updateEdgeScroll();
      } else if (
        (event.type === 'up' || event.type === 'drag-end') &&
        event.button === 0 &&
        this.#pointer
      ) {
        this.#edgeScroll.stop();
        this.model.pointer({ phase: 'up', screen, cell });
        this.#pointer = null;
      }
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      this.cancelGesture();
      this.feedback.show(() => this.t('Canvas limit'), 'warning', error.message);
    }
    this.requestRender();
  }

  protected override destroySelf() {
    this.input.dispose();
    this.feedback.dispose();
    this.inspector?.close();
    this.#edgeScroll.dispose();
    this.#detachInteraction();
    this.#detachSettings();
    if (this.#pointer || this.#minimapDrag) this.model.cancelInteraction();
    this.#detachAppearanceHost();
    this.#detachAppearance();
    if (this.#ownsAppearance) this.appearance.dispose();
    this.#links.destroy();
    this.#measureView.destroy();
    this.#measurer.destroy();
  }
}
