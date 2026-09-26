import { CellBuffer } from "./buffer.js";
import { reorderDropForPoint } from "./pointer.js";
import type { CellPoint, CellRect, FrameSnapshot, WidgetId } from "./types.js";
import type { CellUiTheme } from "./theme.js";
import { resolveWidgetVisual } from "./visual.js";

export type ReorderDrag = Readonly<{
  pointerId: number;
  sourceId: WidgetId;
  point: CellPoint;
}>;

/** A presentation-only projection; the committed frame remains the copy and hit source. */
export const paintReorderPreview = (
  frame: FrameSnapshot,
  drag: ReorderDrag,
  theme: CellUiTheme,
): CellBuffer | null => {
  const source = frame.tree.nodes.get(drag.sourceId);
  const list = source?.parentId ? frame.tree.nodes.get(source.parentId) : undefined;
  const listBounds = list ? frame.scene.entries.get(list.id)?.contentBounds : undefined;
  const drop = reorderDropForPoint(frame, drag.sourceId, drag.point);
  if (!list || !listBounds || !drop) return null;

  const rows: { id: WidgetId; bounds: CellRect }[] = [];
  for (const id of list.children) {
    const bounds = frame.scene.entries.get(id)?.layoutBounds;
    if (!bounds) return null;
    rows.push({ id, bounds });
  }
  const fromIndex = list.children.indexOf(drag.sourceId);
  if (fromIndex < 0) return null;
  const projected = [...rows];
  projected.splice(drop.toIndex, 0, projected.splice(fromIndex, 1)[0]!);

  const buffer = frame.baseBuffer.clone();
  const clip = {
    x: Math.max(0, listBounds.x),
    y: Math.max(0, listBounds.y),
    width: Math.min(frame.baseBuffer.width, listBounds.x + listBounds.width) - Math.max(0, listBounds.x),
    height: Math.min(frame.baseBuffer.height, listBounds.y + listBounds.height) - Math.max(0, listBounds.y),
  };
  const listBackground = resolveWidgetVisual(frame.tree, list, theme).style.backgroundColor ?? theme.background;
  const firstY = rows[0]?.bounds.y ?? listBounds.y;
  const lastBottom = rows.at(-1)?.bounds;
  for (let y = firstY; y < (lastBottom ? lastBottom.y + lastBottom.height : firstY); y += 1) {
    for (let x = listBounds.x; x < listBounds.x + listBounds.width; x += 1) {
      buffer.writeGrapheme(x, y, " ", list.id, { backgroundColor: listBackground }, clip);
    }
  }

  let projectedY = firstY;
  for (let index = 0; index < projected.length; index += 1) {
    if (index > 0) {
      const previous = rows[index - 1]!.bounds;
      projectedY += Math.max(0, rows[index]!.bounds.y - previous.y - previous.height);
    }
    const { id, bounds } = projected[index]!;
    for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
      for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
        const cell = frame.baseBuffer.get(x, y);
        if (cell && !cell.continuation) {
          const style = id === drag.sourceId ? { ...cell.style, ...theme.selectedStyle } : cell.style;
          buffer.writeGrapheme(x, projectedY + y - bounds.y, cell.text,
            cell.ownerId ?? id, style, clip, "replace", cell.copyText);
        }
      }
    }
    projectedY += bounds.height;
  }
  return buffer;
};
