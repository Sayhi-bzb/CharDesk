import type { WidgetId, WidgetNode, WidgetTree } from "./types.js";

export const gridOwnerId = (tree: WidgetTree, id: WidgetId): WidgetId | null => {
  let node = tree.nodes.get(id);
  while (node && node.kind !== "grid") node = node.parentId ? tree.nodes.get(node.parentId) : undefined;
  return node?.id ?? null;
};

export const orderedGridCells = (items: readonly WidgetNode[]) => items
  .filter((item) => item.kind === "grid-cell" && !item.disabled)
  .sort((a, b) => (a.rowIndex ?? 1) - (b.rowIndex ?? 1) || (a.columnIndex ?? 1) - (b.columnIndex ?? 1));

export const gridEntry = (items: readonly WidgetNode[], remembered?: WidgetId): WidgetNode | undefined => {
  const cells = orderedGridCells(items);
  return cells.find((cell) => cell.id === remembered) ?? cells.find((cell) => cell.selected) ?? cells[0];
};

export const gridTarget = (items: readonly WidgetNode[], current: WidgetNode, key: string): WidgetId => {
  const row = current.rowIndex ?? 1;
  const column = current.columnIndex ?? 1;
  const cells = orderedGridCells(items);
  if (key === "Home" || key === "End") {
    const line = cells.filter((cell) => cell.rowIndex === row);
    return (key === "Home" ? line[0] : line.at(-1))?.id ?? current.id;
  }
  const horizontal = key === "ArrowLeft" || key === "ArrowRight";
  const forward = key === "ArrowRight" || key === "ArrowDown";
  const candidates = cells.filter((cell) => horizontal
    ? cell.rowIndex === row && (forward ? cell.columnIndex! > column : cell.columnIndex! < column)
    : cell.columnIndex === column && (forward ? cell.rowIndex! > row : cell.rowIndex! < row));
  return (forward ? candidates[0] : candidates.at(-1))?.id ?? current.id;
};
