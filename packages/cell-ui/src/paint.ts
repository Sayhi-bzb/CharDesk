import { resolveWidgetVisual, resolveEditorGlyphStyle } from "./visual.js";
import {
  getGraphemeCellWidth,
  getTextCellWidth,
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
import { TEXT_VERTICAL_TRACK_GLYPH, textVerticalThumbGlyph, thumbGlyph } from "./scrollbar.js";
import { paintBorder } from "./border.js";
import { isActionableKind } from "./widget-capabilities.js";
import { cellSliderThumbOffset, resolveCellSliderRange } from "./slider.js";
import { collectionChromeGeometry } from "./collection-chrome.js";
import {
  inlineControlChromeGeometry,
  inlineControlChromeMetrics,
} from "./inline-control-chrome.js";
import { hasInlineOutline, inlineOutlineEdges } from "./inline-outline.js";
import { indeterminateProgressRanges, progressNumberLayout } from "./progress.js";
import { spinnerGlyph } from "./spinner.js";
import { fitTooltipText } from "./tooltip.js";
import { TAB_UNDERLINE_GLYPH } from "./tabs.js";
import { alertGlyph } from "./alert.js";
import { fitSingleLineText, isSingleLineControlText, singleLineText } from "./single-line-text.js";
import { resolveScrollbarAppearance } from "./scrollbar-appearance.js";

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
  clip: CellRect,
  copyMode: "normal" | "source" | "layout" = "normal"
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
    buffer.writeGrapheme(x, y, segment, ownerId, style, clip, "over",
      copyMode === "layout" ? "" : copyMode === "source" ? segment : undefined);
    x += width;
  }
};

const paintScrollbars = (
  buffer: CellBuffer,
  node: WidgetNode,
  entry: SceneEntry,
  theme: CellUiTheme,
  ownerStyle: CellTextStyle,
  clip: CellRect
) => {
  const metrics = entry.scrollMetrics;
  if (!metrics) return;
  const appearances = new Map<string, ReturnType<typeof resolveScrollbarAppearance>>();
  const appearanceAt = (x: number, y: number) => {
    const background = buffer.get(x, y)?.style.backgroundColor;
    const key = background ?? "";
    let appearance = appearances.get(key);
    if (!appearance) {
      appearance = resolveScrollbarAppearance(node, ownerStyle, theme, background);
      appearances.set(key, appearance);
    }
    return appearance;
  };
  for (const [track, vertical] of [[metrics.horizontalTrack, false], [metrics.verticalTrack, true]] as const) {
    if (!track) continue;
    if (node.presentation === "rich") fill(buffer, track, node.id, theme.scrollTrackStyle, clip);
    else for (let y = track.y; y < track.y + track.height; y += 1) {
      for (let x = track.x; x < track.x + track.width; x += 1) {
        buffer.writeGrapheme(x, y, vertical ? TEXT_VERTICAL_TRACK_GLYPH : " ", node.id,
          appearanceAt(x, y).track, clip, "over");
      }
    }
  }
  if (metrics.horizontalThumb && metrics.horizontalThumbAxis && metrics.horizontalTrack) {
    for (let offset = 0; offset < metrics.horizontalThumb.width; offset += 1) {
      const cell = metrics.horizontalThumb.x + offset - metrics.horizontalTrack.x;
      buffer.writeGrapheme(
        metrics.horizontalThumb.x + offset,
        metrics.horizontalThumb.y,
        thumbGlyph(metrics.horizontalThumbAxis, cell, true),
        node.id,
        appearanceAt(metrics.horizontalThumb.x + offset, metrics.horizontalThumb.y).thumb,
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
        node.presentation === "text"
          ? textVerticalThumbGlyph(metrics.verticalThumbAxis, cell)
          : thumbGlyph(metrics.verticalThumbAxis, cell, false),
        node.id,
        appearanceAt(metrics.verticalThumb.x, metrics.verticalThumb.y + offset).thumb,
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
        let surfaceBounds = entry.layoutBounds;
        let surfaceClip = outerClip;
        if (visual.surfaceRegion === "content") {
          surfaceBounds = entry.contentBounds;
          surfaceClip = contentClip;
        } else if (visual.surfaceRegion === "decoration") {
          surfaceBounds = entry.decorationBounds;
          surfaceClip = decorationClip;
        }
        if (node.kind === "tab" && node.tabsVariant === "underline" && visual.surfaceRegion === "layout") {
          surfaceBounds = entry.hitBounds;
        }
        fill(
          buffer,
          surfaceBounds,
          id,
          style,
          surfaceClip,
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
      if (node.kind === "table" && node.surfaceVariant !== "surface") {
        const header = tree.nodes.get(node.children[0] ?? "");
        const divider = scene.entries.get(node.children[1] ?? "");
        const cells = header?.children.map((cellId) => scene.entries.get(cellId)).filter((cell): cell is SceneEntry => cell !== undefined) ?? [];
        if (divider && cells.length > 0) {
          const outlined = node.frame === "bordered";
          const lineStyle = visual.borderStyle;
          const write = (x: number, y: number, glyph: string) =>
            buffer.writeGrapheme(x, y, glyph, id, lineStyle, outerClip, "over");
          const dividerY = divider.layoutBounds.y;
          if (outlined) {
            for (let x = entry.layoutBounds.x; x < entry.layoutBounds.x + entry.layoutBounds.width; x += 1) {
              write(x, dividerY, x === entry.layoutBounds.x ? "├" : x === entry.layoutBounds.x + entry.layoutBounds.width - 1 ? "┤" : "─");
            }
          } else {
            for (const cell of cells) for (let x = cell.layoutBounds.x; x < cell.layoutBounds.x + cell.layoutBounds.width; x += 1) {
              write(x, dividerY, "─");
            }
          }
          if (outlined) for (let index = 1; index < cells.length; index += 1) {
            const x = cells[index]!.layoutBounds.x - 1;
            write(x, entry.layoutBounds.y, "┬");
            write(x, dividerY, "┼");
            write(x, entry.layoutBounds.y + entry.layoutBounds.height - 1, "┴");
            for (let y = entry.layoutBounds.y + 1; y < entry.layoutBounds.y + entry.layoutBounds.height - 1; y += 1) {
              if (y !== dividerY) write(x, y, "│");
            }
          }
        }
      }
      if (node.kind === "alert") {
        buffer.writeGrapheme(
          entry.decorationBounds.x + 1,
          entry.contentBounds.y,
          alertGlyph(node.badgeTone === "neutral" ? "info" : node.badgeTone),
          id,
          style,
          outerClip,
          "over",
        );
      }
      if (node.presentation === "text" && (node.kind === "badge" || node.kind === "badge-action") && node.badgeTone !== "neutral") {
        buffer.writeGrapheme(entry.decorationBounds.x + 1, entry.decorationBounds.y,
          alertGlyph(node.badgeTone), id, style, decorationClip, "over");
      }
      const progressNumber = node.kind === "progress" && node.progress?.number && node.progress.value !== null
        ? progressNumberLayout(node.progress.value, node.progress.max, entry.decorationBounds.width, node.progressVariant)
        : null;
      const progressTrackWidth = progressNumber?.trackWidth ?? entry.decorationBounds.width;
      const outline = outlined
        ? inlineOutlineEdges(entry.layoutBounds.x, entry.layoutBounds.x + (
            node.kind === "progress" ? progressTrackWidth : entry.layoutBounds.width
          ))
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
      if (node.markdownCenteredText !== null) {
        const centered = node.markdownCenteredText;
        const left = entry.contentClip.x;
        const width = entry.contentClip.width;
        const offset = Math.max(0, Math.floor((width - getTextCellWidth(centered)) / 2));
        for (let column = 0; column < width; column += 1) {
          buffer.writeGrapheme(left + column, entry.contentBounds.y, " ", id, style, contentClip, "over", "");
        }
        paintText(buffer, centered, id, style,
          { x: left + offset, y: entry.contentBounds.y, width: Math.max(0, width - offset), height: 1 },
          contentClip, "source");
      }
      if (node.kind === "text" || node.kind === "markdown-link" || node.kind === "table-head" || node.kind === "table-cell") {
        const singleLine = isSingleLineControlText(tree, node);
        paintText(
          buffer,
          singleLine
            ? fitSingleLineText(singleLineText(node.text ?? ""), entry.contentBounds.width)
            : node.text ?? "",
          id,
          style,
          singleLine ? { ...entry.contentBounds, height: Math.min(1, entry.contentBounds.height) } : entry.contentBounds,
          contentClip,
          node.markdownLayoutOnly ? "layout" : node.markdownSource ? "source" : "normal"
        );
      }
      if (node.kind === "tooltip") {
        paintText(
          buffer,
          fitTooltipText(node.text ?? "", entry.contentBounds.width),
          id,
          style,
          entry.contentBounds,
          contentClip,
        );
      }
      if (node.kind === "spinner") {
        buffer.writeGrapheme(
          entry.decorationBounds.x,
          entry.decorationBounds.y,
          spinnerGlyph(theme.spinnerGlyphs[node.spinnerVariant], node.animationTimeMs),
          id,
          style,
          decorationClip,
          "over",
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
      const promptGuardX = (node.kind === "text-input" || node.kind === "combobox-input")
        && inlineChrome.leadingGuardX !== inlineChrome.trailingGuardX
        ? inlineChrome.leadingGuardX : null;
      for (const guardX of [inlineChrome.leadingGuardX, inlineChrome.trailingGuardX]) {
        if (guardX !== null) {
          buffer.writeGrapheme(
            guardX,
            entry.decorationBounds.y,
            guardX === promptGuardX ? ">"
              : node.presentation === "text" && node.kind === "select-trigger"
                ? guardX === inlineChrome.leadingGuardX ? "[" : "]"
                : node.presentation === "text" && (node.kind === "select-item" || node.kind === "combobox-item")
                  && guardX === inlineChrome.leadingGuardX && !node.disabled && (node.focused || node.hovered || node.active) ? ">" : " ",
            id,
            style,
            decorationClip,
            "over",
          );
        }
      }
      if (promptGuardX !== null) {
        for (let offset = 0; offset < inlineChromeMetrics.leadingGap; offset += 1) {
          const x = promptGuardX + 1 + offset;
          if (x >= entry.contentBounds.x) break;
          buffer.writeGrapheme(x, entry.decorationBounds.y, " ", id, style, decorationClip, "over");
        }
      }
      if (node.kind === "tab" && node.tabsVariant === "underline" && node.selected && !node.disabled) {
        const underlineY = entry.contentBounds.y + entry.contentBounds.height;
        const underlineStyle = { color: theme.selectedStyle.backgroundColor ?? theme.foreground };
        for (let x = entry.contentBounds.x; x < entry.contentBounds.x + entry.contentBounds.width; x += 1) {
          buffer.writeGrapheme(x, underlineY, TAB_UNDERLINE_GLYPH, id, underlineStyle, decorationClip, "over");
        }
      }
      if (node.kind === "list-item" || node.kind === "tree-item" || node.kind === "grid-cell") {
        const chrome = collectionChromeGeometry(node, entry.decorationBounds.width);
        for (const offset of [chrome.leadingGuardOffset, chrome.trailingGuardOffset]) {
          if (offset !== null) buffer.writeGrapheme(
            entry.decorationBounds.x + offset, entry.decorationBounds.y,
            node.presentation === "text" && offset === chrome.leadingGuardOffset
              && !node.disabled && (node.focused || node.hovered) ? ">" : " ", id, style, decorationClip, "over"
          );
        }
        if (node.selected) buffer.writeGrapheme(
          entry.decorationBounds.x + chrome.selectionOffset, entry.decorationBounds.y,
          theme.collectionSelectedIndicator, id, style, decorationClip, "over"
        );
        if (node.kind === "tree-item") buffer.writeGrapheme(
          entry.decorationBounds.x + chrome.disclosureOffset, entry.decorationBounds.y,
          node.hasChildren
            ? node.expanded ? theme.treeExpandedIndicator : theme.treeCollapsedIndicator
            : " ",
          id, style, decorationClip, "over"
        );
      }
      if (node.kind === "menu-item" && node.presentation === "text" && !node.disabled && (node.focused || node.hovered)) {
        buffer.writeGrapheme(entry.decorationBounds.x, entry.decorationBounds.y, ">", id, style, decorationClip, "over");
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
          : Math.max(0, (node.kind === "progress" ? progressTrackWidth : bounds.width) - progressOutlineInset * 2);
        const progressRanges = node.progress?.value === null
          ? indeterminateProgressRanges(length, node.animationTimeMs)
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
        if (progressNumber) {
          const labelX = bounds.x + progressNumber.trackWidth + 1;
          for (let offset = 0; offset < progressNumber.label.length; offset += 1) {
            buffer.writeGrapheme(labelX + offset, bounds.y, progressNumber.label[offset]!, id, style, decorationClip, "over");
          }
          buffer.writeGrapheme(labelX - 1, bounds.y, " ", id, style, decorationClip, "over");
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
        const indicator = node.presentation === "text" ? inlineChrome.leadingIndicator : inlineChrome.trailingIndicator;
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
      if (node.kind === "badge-action" && node.presentation === "text") {
        const left = entry.layoutBounds.x;
        const right = left + entry.layoutBounds.width - 1;
        if (right > left) {
          buffer.writeGrapheme(left, entry.layoutBounds.y, "[", id, style, outerClip, "over");
          buffer.writeGrapheme(right, entry.layoutBounds.y, "]", id, style, outerClip, "over");
        }
      }
      if (entry.scrollMetrics) paintScrollbars(buffer, node, entry, theme, style, outerClip);
    }
  }
  return buffer;
};
