import { CellPlaneIndex, decodeCellPlaneOperationRows } from '@chardesk/cell-plane';
import type { GridCell } from '@chardesk/cell-plane/types';
import type { CellRect } from '@chardesk/cell-core';
import { getGraphemeCellWidth, getTextCellWidth } from '@chardesk/protocol';
import type { CanvasMutationActivityEvent } from '@chardesk/local-runtime/agents';
import { CANVAS_READ_CAMERA } from '@chardesk/editor-core/viewport';
import { areJsonValuesEqual } from '@chardesk/editor-core/equality';

type PlacedCell = { x: number; y: number; cell: GridCell };
type Group = {
  x: number;
  y: number;
  width: number;
  unit: number;
  before: PlacedCell[];
  after: PlacedCell[];
};
export class MutationPresentation {
  readonly mode: 'character' | 'line';
  readonly units: number;
  readonly duration: number;
  readonly #rows = new Map<number, Group[]>();
  visible = 0;
  constructor(event: CanvasMutationActivityEvent, viewport: CellRect) {
    this.mode =
      event.kind === 'write' &&
      event.writtenCells <= CANVAS_READ_CAMERA.width * CANVAS_READ_CAMERA.height
        ? 'character'
        : 'line';
    let groups: Group[] = [];
    if (viewport.width * viewport.height <= 32768) {
      const changed = new Map(
        decodeCellPlaneOperationRows(event.before)
          .filter((row) => row.y >= viewport.y && row.y < viewport.y + viewport.height)
          .map((row) => [
            row.y,
            [
              ...row.erase.map((range) => ({ x: range.from, end: range.to + 1 })),
              ...row.spans.map((span) => ({
                x: span.x,
                end: span.x + getTextCellWidth(span.text),
              })),
            ],
          ])
      );
      const cells: Array<PlacedCell & { before: boolean }> = [];
      for (const [operation, before] of [
        [event.before, true],
        [event.after, false],
      ] as const) {
        const source = new CellPlaneIndex([operation]);
        try {
          source.visit(
            { ...viewport, x: viewport.x - 1, width: viewport.width + 2 },
            (x, y, cell) => {
              const width = getGraphemeCellWidth(cell.char);
              if (changed.get(y)?.some((range) => x < range.end && range.x < x + width))
                cells.push({ x, y, cell: structuredClone(cell), before });
            }
          );
        } finally {
          source.dispose();
        }
      }
      cells.sort((a, b) => a.y - b.y || a.x - b.x);
      for (const item of cells) {
        const width = getGraphemeCellWidth(item.cell.char);
        let group = groups.at(-1);
        if (!group || group.y !== item.y || group.x + group.width <= item.x) {
          group = { x: item.x, y: item.y, width, unit: 0, before: [], after: [] };
          groups.push(group);
        } else group.width = Math.max(group.width, item.x + width - group.x);
        group[item.before ? 'before' : 'after'].push({ x: item.x, y: item.y, cell: item.cell });
      }
      groups = groups.filter((group) => !areJsonValuesEqual(group.before, group.after));
    }
    const rowOrder = [...new Set(groups.map((group) => group.y))];
    if (event.kind === 'erase') rowOrder.reverse();
    const rowUnits = new Map(rowOrder.map((y, index) => [y, index]));
    groups.forEach((group, index) => {
      group.unit = this.mode === 'character' ? index : rowUnits.get(group.y)!;
      const row = this.#rows.get(group.y) ?? [];
      row.push(group);
      this.#rows.set(group.y, row);
    });
    this.units = this.mode === 'character' ? groups.length : rowOrder.length;
    this.duration =
      this.mode === 'character'
        ? Math.min(9000, Math.max(1500, this.units * 75))
        : Math.min(
            6000,
            Math.max(
              { write: 1800, render: 2400, erase: 2600, fill: 2300 }[event.kind],
              this.units * 350
            )
          );
  }
  group(x: number, y: number, width: number) {
    return this.#rows.get(y)?.find((group) => group.x < x + width && x < group.x + group.width);
  }
  visit(visitor: (x: number, y: number, cell: GridCell) => void) {
    for (const groups of this.#rows.values())
      for (const group of groups) {
        const revealed = group.unit < this.visible;
        for (const { x, y, cell } of group[revealed ? 'after' : 'before'])
          visitor(x, y, revealed ? cell : { ...cell, href: undefined });
      }
  }
  get cursor() {
    if (this.mode !== 'character' || this.visible >= this.units) return null;
    for (const groups of this.#rows.values()) {
      const group = groups.find((group) => group.unit === this.visible);
      if (group) return { x: group.x, y: group.y, width: group.width, height: 1 };
    }
    return null;
  }
  get feedback(): CellRect | null {
    if (this.visible <= 0 || !this.units) return null;
    const unit = Math.min(this.visible, this.units) - 1;
    for (const groups of this.#rows.values()) {
      if (!groups.some((group) => group.unit === unit)) continue;
      const active = groups.filter((group) =>
        this.mode === 'line' ? group.unit === unit : group.unit <= unit && group.unit > unit - 12
      );
      const x = active[0]!.x;
      const end = Math.max(...active.map((group) => group.x + group.width));
      return { x, y: groups[0]!.y, width: end - x, height: 1 };
    }
    return null;
  }
}
