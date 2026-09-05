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
import { intersectCellRects } from "./scene.js";

const interactiveKinds = new Set<WidgetNode["kind"]>([
  "list-item", "menu-item", "tree-item", "tab", "grid-cell",
]);

const nonEmpty = (rect: CellRect) => rect.width > 0 && rect.height > 0;

const stateOwner = (tree: WidgetTree, node: WidgetNode): WidgetNode | null => {
  let current: WidgetNode | undefined = node;
  while (current) {
    if (interactiveKinds.has(current.kind)) return current;
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
  return resolveCellStateStyle(
    node.kind === "overlay" ? { ...theme.surfaceStyle, ...node.textStyle } : node.textStyle,
    { focused, selected, hovered: owner?.hovered, collection: owner !== null, disabled: node.disabled || owner?.disabled },
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

const paintBorder = (
  buffer: CellBuffer,
  node: WidgetNode,
  bounds: CellRect,
  style: CellTextStyle,
  clip: CellRect
): void => {
  if (!node.style.border || bounds.width < 2 || bounds.height < 2) return;
  const right = bounds.x + bounds.width - 1;
  const bottom = bounds.y + bounds.height - 1;
  buffer.writeGrapheme(bounds.x, bounds.y, "┌", node.id, style, clip, "over");
  buffer.writeGrapheme(right, bounds.y, "┐", node.id, style, clip, "over");
  buffer.writeGrapheme(bounds.x, bottom, "└", node.id, style, clip, "over");
  buffer.writeGrapheme(right, bottom, "┘", node.id, style, clip, "over");
  for (let x = bounds.x + 1; x < right; x += 1) {
    buffer.writeGrapheme(x, bounds.y, "─", node.id, style, clip, "over");
    buffer.writeGrapheme(x, bottom, "─", node.id, style, clip, "over");
  }
  for (let y = bounds.y + 1; y < bottom; y += 1) {
    buffer.writeGrapheme(bounds.x, y, "│", node.id, style, clip, "over");
    buffer.writeGrapheme(right, y, "│", node.id, style, clip, "over");
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
  if (metrics.horizontalThumb) {
    for (let offset = 0; offset < metrics.horizontalThumb.width; offset += 1) {
      buffer.writeGrapheme(
        metrics.horizontalThumb.x + offset,
        metrics.horizontalThumb.y,
        theme.scrollThumb,
        node.id,
        theme.scrollThumbStyle,
        clip,
        "over"
      );
    }
  }
  if (metrics.verticalThumb) {
    for (let offset = 0; offset < metrics.verticalThumb.height; offset += 1) {
      buffer.writeGrapheme(
        metrics.verticalThumb.x,
        metrics.verticalThumb.y + offset,
        theme.scrollThumb,
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
}>;

export const paintScene = (
  tree: WidgetTree,
  scene: SceneSnapshot,
  textLayouts: ReadonlyMap<string, CellTextLayoutSnapshot> = new Map(),
  theme: CellUiTheme = DEFAULT_CELL_UI_THEME,
  options: PaintSceneOptions = {}
): CellBuffer => {
  const incremental = options.previous
    && options.previous.width === scene.viewport.width
    && options.previous.height === scene.viewport.height
    && options.dirtyRegions !== undefined;
  const buffer = incremental
    ? options.previous!.clone()
    : new CellBuffer(scene.viewport);
  const regions = incremental ? options.dirtyRegions! : [scene.viewport];
  for (const region of regions) buffer.clear(region);
  for (const id of scene.paintList) {
    const node = tree.nodes.get(id);
    const entry = scene.entries.get(id);
    if (!node || !entry) continue;
    const style = stateStyle(tree, node, theme);
    for (const region of regions) {
      const outerClip = intersectCellRects(entry.outerClip, region);
      if (!nonEmpty(outerClip)) continue;
      const decorationClip = intersectCellRects(entry.decorationBounds, outerClip);
      const contentClip = intersectCellRects(entry.contentClip, region);

      // Surface: state and overlay backgrounds establish the Cell style first.
      if (style.backgroundColor || (
        interactiveKinds.has(node.kind)
        && (node.selected || (node.focused && node.focusVisible))
      )) {
        fill(buffer, entry.layoutBounds, id, style, outerClip);
      }

      // Chrome: glyphs are painted after surfaces so state fills cannot erase them.
      paintBorder(buffer, node, entry.layoutBounds, { ...style, ...theme.borderStyle }, outerClip);

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
      if (node.kind === "tab" && node.selected && entry.decorationBounds.height > 1) {
        const y = entry.decorationBounds.y + entry.decorationBounds.height - 1;
        for (let x = entry.decorationBounds.x; x < entry.decorationBounds.x + entry.decorationBounds.width; x += 1) {
          buffer.writeGrapheme(x, y, theme.tabUnderline, id, style, decorationClip, "over");
        }
      }
      if (node.kind === "scroll-area") paintScrollbars(buffer, node, entry, theme, outerClip);
    }
  }
  return buffer;
};
