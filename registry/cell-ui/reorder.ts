/** Apply a Cell UI reorder command to app-owned list data. */
export function reorderCellItems<T extends Readonly<{ id: string }>>(
  items: readonly T[], sourceId: string, toIndex: number,
): readonly T[] {
  const fromIndex = items.findIndex((item) => item.id === sourceId);
  if (fromIndex < 0 || !Number.isInteger(toIndex) || toIndex < 0 || toIndex >= items.length
    || fromIndex === toIndex) return items;
  const next = [...items];
  next.splice(toIndex, 0, next.splice(fromIndex, 1)[0]!);
  return next;
}
