import { resolveWidgetVisual, resolveEditorGlyphStyle } from "./visual.js";
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
import { DEFAULT_CELL_UI_THEME, type CellUiTheme } from "./theme.js";
import { intersectSceneRects } from "./scene.js";
import { thumbGlyph } from "./scrollbar.js";
import { paintBorder } from "./border.js";
import { isActionableKind } from "./widget-capabilities.js";
import { cellSliderThumbOffset, resolveCellSliderRange } from "./slider.js";
import { collectionChromeMetrics } from "./collection-chrome.js";
import {
  inlineControlChromeGeometry,
  inlineControlChromeMetrics,
} from "./inline-control-chrome.js";
import { hasInlineOutline, inlineOutlineEdges } from "./inline-outline.js";
import { indeterminateProgressRanges } from "./progress.js";

const nonEmpty = (rect: CellRect) => rect.width > 0 && rect.height > 0;

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
    const visual = resolveWidgetVisual(tree, node, theme);
    const { style } = visual;
    const inlineChromeMetrics = inlineControlChromeMetrics(node);
    const ownerViewport = node.parentId
      ? scene.entries.get(node.parentId)?.scrollMetrics?.viewport
      : undefined;
    const outlined = hasInlineOutline(node);
    const outlineInset = outlined ? 1 : 0;
    const chromeRight = node.kind === "select-item" || node.kind === "combobox-item"
      ? Math.min(
          entry.decorationBounds.x + entry.decorationBounds.width,
          ownerViewport ? ownerViewport.x + ownerViewport.width : Number.POSITIVE_INFINITY,
        )
      : entry.decorationBounds.x + entry.decorationBounds.width - outlineInset;
    const inlineChrome = inlineControlChromeGeometry(
      inlineChromeMetrics,
      entry.decorationBounds.x + outlineInset,
      chromeRight,
    );
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
        const contentSurface = visual.surfaceRegion === "content";
        fill(
          buffer,
          contentSurface ? entry.contentBounds : entry.layoutBounds,
          id,
          style,
          contentSurface ? contentClip : outerClip,
        );
      }

      // Chrome: glyphs are painted after surfaces so state fills cannot erase them.
      if (node.frame === "bordered") {
        paintBorder(
          buffer,
          id,
          entry.layoutBounds,
          node.borderShape ?? theme.borderShape,
          visual.borderStyle,
          outerClip
        );
      }
      const outline = outlined
        ? inlineOutlineEdges(entry.layoutBounds.x, entry.layoutBounds.x + entry.layoutBounds.width)
        : null;
      if (outline) {
        buffer.writeGrapheme(
          outline.left,
          entry.layoutBounds.y,
          "[",
          id,
          style,
          outerClip,
          "over"
        );
        buffer.writeGrapheme(
          outline.right,
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
                resolveEditorGlyphStyle(style, glyph, theme, node),
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
            resolveEditorGlyphStyle(style, glyph, theme, node),
            contentClip,
            "over"
          );
        }
      }

      // Decoration: interaction affordances and scrollbars remain topmost for this Widget.
      for (const guardX of [inlineChrome.leadingGuardX, inlineChrome.trailingGuardX]) {
        if (guardX !== null) {
          buffer.writeGrapheme(
            guardX,
            entry.decorationBounds.y,
            " ",
            id,
            style,
            decorationClip,
            "over",
          );
        }
      }
      if ((node.kind === "list-item" || node.kind === "tree-item" || node.kind === "grid-cell") && node.selected) {
        const offset = collectionChromeMetrics(node).selectionOffset;
        buffer.writeGrapheme(entry.decorationBounds.x + offset, entry.decorationBounds.y,
          theme.collectionSelectedIndicator, id, style, decorationClip, "over");
      }
      if (node.kind === "tree-item") {
        const x = entry.decorationBounds.x + collectionChromeMetrics(node).disclosureOffset;
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
      if (node.kind === "toggle") {
        const indicator = inlineChrome.leadingIndicator;
        if (indicator) {
          buffer.writeGrapheme(
            indicator.x,
            entry.decorationBounds.y,
            node.pressed ? theme.toggleOnIndicator : theme.toggleOffIndicator,
            id,
            style,
            decorationClip,
            "over",
          );
        }
      }
      if (node.kind === "progress" || node.kind === "separator") {
        const bounds = entry.decorationBounds;
        const vertical = node.kind === "separator" && node.orientation === "vertical";
        const progressOutlineInset = node.kind === "progress" && outline ? 1 : 0;
        const trackX = bounds.x + progressOutlineInset;
        const length = vertical
          ? bounds.height
          : Math.max(0, bounds.width - progressOutlineInset * 2);
        const progressRanges = node.progress?.value === null
          ? indeterminateProgressRanges(length, node.progressAnimationTimeMs)
          : null;
        const filled = node.progress && node.progress.value !== null
          ? Math.floor(length * node.progress.value / node.progress.max)
          : 0;
        const separatorGlyph = node.kind === "separator"
          ? theme.separatorGlyphs[node.separatorVariant][vertical ? "vertical" : "horizontal"]
          : null;
        const progressGlyphs = theme.progressGlyphs[node.progressVariant];
        for (let offset = 0; offset < length; offset += 1) {
          buffer.writeGrapheme(trackX + (vertical ? 0 : offset), bounds.y + (vertical ? offset : 0),
            node.kind === "separator" ? separatorGlyph ?? theme.separatorGlyphs.line.horizontal
              : progressRanges
                ? progressRanges.some((range) =>
                    offset >= range.start && offset < range.start + range.length)
                  ? progressGlyphs.filled
                  : progressGlyphs.empty
                : offset < filled ? progressGlyphs.filled : progressGlyphs.empty,
            id, node.kind === "separator" ? { ...style, color: theme.borderStyle.color } : style,
            decorationClip, "over");
        }
      }
      if (node.kind === "checkbox" || node.kind === "radio-item") {
        const geometry = inlineChrome.leadingIndicator;
        const radio = node.kind === "radio-item";
        const mark = radio ? node.checked ? theme.radioCheckedIndicator : " " : node.checked === "indeterminate"
          ? theme.checkboxIndeterminateIndicator
          : node.checked
            ? theme.checkboxCheckedIndicator
            : theme.checkboxUncheckedIndicator;
        const glyphs = [radio ? "(" : "[", mark, radio ? ")" : "]"];
        if (geometry) {
          for (let offset = 0; offset < geometry.width; offset += 1) {
            buffer.writeGrapheme(
              geometry.x + offset,
              entry.decorationBounds.y,
              glyphs[offset]!,
              id,
              style,
              decorationClip,
              "over",
            );
          }
        }
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
              ? visual.thumb
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
      if (node.kind === "range-slider") {
        const track = entry.decorationBounds;
        const range = resolveCellSliderRange(node.sliderMin, node.sliderMax, node.sliderStep);
        const thumbs = node.children.map((childId) => tree.nodes.get(childId)!);
        const start = cellSliderThumbOffset(thumbs[0]!.sliderValue, track.width, range);
        const end = cellSliderThumbOffset(thumbs[1]!.sliderValue, track.width, range);
        for (let offset = 0; offset < track.width; offset += 1) {
          buffer.writeGrapheme(
            track.x + offset,
            track.y,
            offset > start && offset < end
              ? theme.sliderFilledTrack
              : theme.sliderEmptyTrack,
            id,
            style,
            decorationClip,
            "over"
          );
        }
      }
      if (node.kind === "range-slider-thumb") {
        buffer.writeGrapheme(
          entry.decorationBounds.x,
          entry.decorationBounds.y,
          visual.thumb,
          id,
          style,
          decorationClip,
          "over",
        );
      }
      if (node.kind === "accordion-trigger") {
        buffer.writeGrapheme(entry.decorationBounds.x, entry.decorationBounds.y,
          node.expanded ? theme.treeExpandedIndicator : theme.treeCollapsedIndicator,
          id, style, decorationClip, "over");
      }
      if (node.kind === "select-trigger" || node.kind === "combobox-input") {
        const indicator = inlineChrome.trailingIndicator;
        if (indicator) {
          buffer.writeGrapheme(
            indicator.x,
            entry.decorationBounds.y,
            node.expanded ? theme.selectExpandedIndicator : theme.selectCollapsedIndicator,
            id,
            style,
            decorationClip,
            "over"
          );
        }
      }
      if ((node.kind === "select-item" || node.kind === "combobox-item") && node.selected) {
        const indicator = inlineChrome.trailingIndicator;
        if (indicator) {
          buffer.writeGrapheme(
            indicator.x,
            entry.decorationBounds.y,
            theme.selectSelectedIndicator,
            id,
            style,
            decorationClip,
            "over"
          );
        }
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
