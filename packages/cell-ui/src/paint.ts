import {
  getGraphemeCellWidth,
  iterateGraphemes,
} from "@chardesk/protocol";
import { CellBuffer } from "./buffer.js";
import type {
  CellRect,
  CellTextStyle,
  SceneEntry,
  SceneSnapshot,
  WidgetNode,
  WidgetTree,
} from "./types.js";
import type { CellTextLayoutSnapshot } from "./text.js";
import { DEFAULT_CELL_UI_THEME, resolveCellStateStyle, resolveCellTextStyle, type CellUiTheme } from "./theme.js";
import { intersectSceneRects } from "./scene.js";
import { thumbGlyph } from "./scrollbar.js";
import { paintBorder } from "./border.js";
import { isActionableKind, isFilledSurfaceKind } from "./widget-capabilities.js";
import { cellSliderThumbOffset, resolveCellSliderRange } from "./slider.js";
import { checkboxChromeMetrics } from "./checkbox.js";

const nonEmpty = (rect: CellRect) => rect.width > 0 && rect.height > 0;

const stateOwner = (tree: WidgetTree, node: WidgetNode): WidgetNode | null => {
  let current: WidgetNode | undefined = node;
  while (current) {
    if (isActionableKind(current.kind)) return current;
    current = current.parentId ? tree.nodes.get(current.parentId) : undefined;
  }
  return null;
};

const stateStyle = (
  tree: WidgetTree,
  node: WidgetNode,
  theme: CellUiTheme
): CellTextStyle => {
  const owner = stateOwner(tree, node);
  const focusNode = owner
    ?? (node.kind === "text-input" || node.kind === "text-area" ? node : null);
  const focused = focusNode?.focused === true && focusNode.focusVisible;
  const selected = owner?.selected === true;
  const baseStyle = isFilledSurfaceKind(node.kind)
    || (owner?.kind === "button" && owner.buttonVariant === "default")
    || owner?.kind === "select-trigger"
    ? { ...theme.surfaceStyle, ...node.textStyle }
    : node.textStyle;
  return resolveCellStateStyle(
    baseStyle,
    {
      focused,
      selected,
      hovered: owner?.hovered,
      pressActive: owner?.pressActive,
      activationFlash: owner?.activationFlash,
      collection: owner !== null,
      disabled: node.disabled || owner?.disabled,
    },
    theme
  );
};

const fill = (
  buffer: CellBuffer,
  bounds: CellRect,
  ownerId: string,
  style: CellTextStyle,
  clip: CellRect
) => {
  for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
      buffer.writeGrapheme(x, y, " ", ownerId, style, clip, "over");
    }
  }
};

const paintText = (
  buffer: CellBuffer,
  text: string,
  ownerId: string,
  style: CellTextStyle,
  bounds: CellRect,
  clip: CellRect
): void => {
  if (bounds.width <= 0 || bounds.height <= 0) return;
  let x = bounds.x;
  let y = bounds.y;
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;
  for (const { segment } of iterateGraphemes(text)) {
    if (segment === "\n") {
      x = bounds.x;
      y += 1;
      if (y >= bottom) break;
      continue;
    }
    const width = getGraphemeCellWidth(segment);
    if (x > bounds.x && x + width > right) {
      x = bounds.x;
      y += 1;
    }
    if (y >= bottom || width > bounds.width) break;
    buffer.writeGrapheme(x, y, segment, ownerId, style, clip, "over");
    x += width;
  }
};

const paintScrollbars = (
  buffer: CellBuffer,
  node: WidgetNode,
  entry: SceneEntry,
  theme: CellUiTheme,
  clip: CellRect
) => {
  const metrics = entry.scrollMetrics;
  if (!metrics) return;
  for (const track of [metrics.horizontalTrack, metrics.verticalTrack]) {
    if (track) fill(buffer, track, node.id, theme.scrollTrackStyle, clip);
  }
  if (metrics.horizontalThumb && metrics.horizontalThumbAxis && metrics.horizontalTrack) {
    for (let offset = 0; offset < metrics.horizontalThumb.width; offset += 1) {
      const cell = metrics.horizontalThumb.x + offset - metrics.horizontalTrack.x;
      buffer.writeGrapheme(
        metrics.horizontalThumb.x + offset,
        metrics.horizontalThumb.y,
        thumbGlyph(metrics.horizontalThumbAxis, cell, true),
        node.id,
        theme.scrollThumbStyle,
        clip,
        "over"
      );
    }
  }
  if (metrics.verticalThumb && metrics.verticalThumbAxis && metrics.verticalTrack) {
    for (let offset = 0; offset < metrics.verticalThumb.height; offset += 1) {
      const cell = metrics.verticalThumb.y + offset - metrics.verticalTrack.y;
      buffer.writeGrapheme(
        metrics.verticalThumb.x,
        metrics.verticalThumb.y + offset,
        thumbGlyph(metrics.verticalThumbAxis, cell, false),
        node.id,
        theme.scrollThumbStyle,
        clip,
        "over"
      );
    }
  }
  if (metrics.corner) fill(buffer, metrics.corner, node.id, theme.scrollTrackStyle, clip);
};

export type PaintSceneOptions = Readonly<{
  previous?: CellBuffer;
  dirtyRegions?: readonly CellRect[];
  viewport?: CellRect;
  layer?: "all" | "base" | "overlay";
}>;

export const paintScene = (
  tree: WidgetTree,
  scene: SceneSnapshot,
  textLayouts: ReadonlyMap<string, CellTextLayoutSnapshot> = new Map(),
  theme: CellUiTheme = DEFAULT_CELL_UI_THEME,
  options: PaintSceneOptions = {}
): CellBuffer => {
  const viewport = options.viewport ?? scene.viewport;
  const incremental = options.previous
    && options.previous.width === viewport.width
    && options.previous.height === viewport.height
    && options.dirtyRegions !== undefined;
  const buffer = incremental
    ? options.previous!.clone()
    : new CellBuffer(viewport);
  const regions = incremental ? options.dirtyRegions! : [viewport];
  for (const region of regions) buffer.clear(region);
  for (const id of scene.paintList) {
    const node = tree.nodes.get(id);
    const entry = scene.entries.get(id);
    if (!node || !entry) continue;
    if (options.layer === "base" && entry.layer !== 0) continue;
    if (options.layer === "overlay" && entry.layer === 0) continue;
    const style = stateStyle(tree, node, theme);
    for (const region of regions) {
      const outerClip = intersectSceneRects(entry.outerClip, region);
      if (!nonEmpty(outerClip)) continue;
      const decorationClip = intersectSceneRects(entry.decorationBounds, outerClip);
      const contentClip = intersectSceneRects(entry.contentClip, region);

      // Surface: state and overlay backgrounds establish the Cell style first.
      if (style.backgroundColor || (
        isActionableKind(node.kind)
        && (node.pressActive || node.activationFlash || node.selected || (node.focused && node.focusVisible))
      )) {
        fill(buffer, entry.layoutBounds, id, style, outerClip);
      }

      // Chrome: glyphs are painted after surfaces so state fills cannot erase them.
      if (node.style.border ?? node.kind === "select-content") {
        paintBorder(
          buffer,
          id,
          entry.layoutBounds,
          node.style.borderShape ?? theme.borderShape,
          { ...style, ...theme.borderStyle },
          outerClip
        );
      }
      if (node.kind === "button" && node.buttonVariant === "outline" && entry.layoutBounds.width >= 2) {
        buffer.writeGrapheme(
          entry.layoutBounds.x,
          entry.layoutBounds.y,
          "[",
          id,
          style,
          outerClip,
          "over"
        );
        buffer.writeGrapheme(
          entry.layoutBounds.x + entry.layoutBounds.width - 1,
          entry.layoutBounds.y,
          "]",
          id,
          style,
          outerClip,
          "over"
        );
      }

      // Content: local text and editor glyphs stay within contentClip.
      if (node.kind === "text") {
        paintText(
          buffer,
          node.text ?? "",
          id,
          style,
          entry.contentBounds,
          contentClip
        );
      }
      const textLayout = textLayouts.get(id);
      if (textLayout) {
        for (const glyph of textLayout.glyphs) {
          if (glyph.text === "\t") {
            for (let offset = 0; offset < glyph.width; offset += 1) {
              buffer.writeGrapheme(
                glyph.point.x + offset,
                glyph.point.y,
                " ",
                id,
                resolveCellTextStyle(style, glyph, theme),
                contentClip,
                "over"
              );
            }
            continue;
          }
          buffer.writeGrapheme(
            glyph.point.x,
            glyph.point.y,
            glyph.text,
            id,
            resolveCellTextStyle(style, glyph, theme),
            contentClip,
            "over"
          );
        }
      }

      // Decoration: interaction affordances and scrollbars remain topmost for this Widget.
      if (node.kind === "tree-item") {
        const x = entry.decorationBounds.x + Math.max(0, (node.level ?? 1) - 1) * 2;
        buffer.writeGrapheme(
          x,
          entry.decorationBounds.y,
          node.hasChildren
            ? node.expanded ? theme.treeExpandedIndicator : theme.treeCollapsedIndicator
            : " ",
          id,
          style,
          decorationClip,
          "over"
        );
      }
      if (node.kind === "checkbox") {
        const x = entry.decorationBounds.x
          + checkboxChromeMetrics(node.children.length > 0).indicatorOffset;
        const indicator = node.checked === "indeterminate"
          ? theme.checkboxIndeterminateIndicator
          : node.checked
            ? theme.checkboxCheckedIndicator
            : theme.checkboxUncheckedIndicator;
        buffer.writeGrapheme(x, entry.decorationBounds.y, "[", id, style, decorationClip, "over");
        buffer.writeGrapheme(x + 1, entry.decorationBounds.y, indicator, id, style, decorationClip, "over");
        buffer.writeGrapheme(x + 2, entry.decorationBounds.y, "]", id, style, decorationClip, "over");
      }
      if (node.kind === "slider") {
        const track = entry.decorationBounds;
        const thumb = cellSliderThumbOffset(
          node.sliderValue,
          track.width,
          resolveCellSliderRange(node.sliderMin, node.sliderMax, node.sliderStep)
        );
        for (let offset = 0; offset < track.width; offset += 1) {
          buffer.writeGrapheme(
            track.x + offset,
            track.y,
            offset === thumb
              ? theme.sliderThumb
              : offset < thumb
                ? theme.sliderFilledTrack
                : theme.sliderEmptyTrack,
            id,
            style,
            decorationClip,
            "over"
          );
        }
      }
      if (node.kind === "select-trigger") {
        buffer.writeGrapheme(
          entry.decorationBounds.x + entry.decorationBounds.width - 1,
          entry.decorationBounds.y,
          node.expanded ? theme.selectExpandedIndicator : theme.selectCollapsedIndicator,
          id,
          style,
          decorationClip,
          "over"
        );
      }
      if (node.kind === "select-item" && node.selected) {
        const ownerViewport = node.parentId
          ? scene.entries.get(node.parentId)?.scrollMetrics?.viewport
          : undefined;
        const visibleRight = Math.min(
          entry.decorationBounds.x + entry.decorationBounds.width,
          ownerViewport
            ? ownerViewport.x + ownerViewport.width
            : Number.POSITIVE_INFINITY
        );
        buffer.writeGrapheme(
          visibleRight - 1,
          entry.decorationBounds.y,
          theme.selectSelectedIndicator,
          id,
          style,
          decorationClip,
          "over"
        );
      }
      if (node.kind === "tab" && node.selected && entry.decorationBounds.height > 1) {
        const y = entry.decorationBounds.y + entry.decorationBounds.height - 1;
        for (let x = entry.decorationBounds.x; x < entry.decorationBounds.x + entry.decorationBounds.width; x += 1) {
          buffer.writeGrapheme(x, y, theme.tabUnderline, id, style, decorationClip, "over");
        }
      }
      if (entry.scrollMetrics) paintScrollbars(buffer, node, entry, theme, outerClip);
    }
  }
  return buffer;
};
