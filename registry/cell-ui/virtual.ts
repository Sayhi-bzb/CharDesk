import type { CellPoint, CellSize } from "./types.js";

export type VirtualRange = Readonly<{ start: number; end: number }>;

export type VirtualGridCell<Row> = Readonly<{
  key: string;
  rowKey: string;
  rowIndex: number;
  columnIndex: number;
  row: Row;
  keptAlive: boolean;
}>;

export type VirtualGridSnapshot<Row> = Readonly<{
  scrollOffset: CellPoint;
  contentSize: CellSize;
  visibleRows: VirtualRange;
  visibleColumns: VirtualRange;
  cacheRows: VirtualRange;
  cacheColumns: VirtualRange;
  cells: readonly VirtualGridCell<Row>[];
  mountedCount: number;
  anchor: Readonly<{
    rowKey: string | null;
    rowOffset: number;
    columnIndex: number;
    columnOffset: number;
  }>;
}>;

export type VirtualGridOptions<Row> = Readonly<{
  rows: readonly Row[];
  columnCount: number;
  getRowKey: (row: Row) => string;
  viewport: CellSize;
  rowHeight?: number;
  columnWidth?: number;
  overscanRows?: number;
  overscanColumns?: number;
  keepAliveLimit?: number;
}>;

const positiveInteger = (value: number, label: string) => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive integer.`);
  }
  return value;
};

const nonNegativeInteger = (value: number, label: string) => {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer.`);
  }
  return value;
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const visibleRange = (
  scroll: number,
  viewport: number,
  extent: number,
  count: number
): VirtualRange => ({
  start: Math.min(count, Math.floor(scroll / extent)),
  end: Math.min(count, Math.ceil((scroll + viewport) / extent)),
});

const cacheRange = (
  visible: VirtualRange,
  overscan: number,
  count: number
): VirtualRange => ({
  start: Math.max(0, visible.start - overscan),
  end: Math.min(count, visible.end + overscan),
});

const cellKey = (rowKey: string, columnIndex: number) =>
  `${encodeURIComponent(rowKey)}::${columnIndex}`;

const revealOffset = (
  current: number,
  viewport: number,
  itemStart: number,
  itemExtent: number,
  align: "nearest" | "start" | "center" | "end"
) => {
  if (align === "start") return itemStart;
  if (align === "center") return itemStart - Math.floor((viewport - itemExtent) / 2);
  if (align === "end") return itemStart + itemExtent - viewport;
  if (itemStart < current) return itemStart;
  if (itemStart + itemExtent > current + viewport) {
    return itemStart + itemExtent - viewport;
  }
  return current;
};

export class FixedVirtualGrid<Row> {
  #rows: readonly Row[];
  #rowKeys: readonly string[] = [];
  #rowIndex = new Map<string, number>();
  #columnCount: number;
  #viewport: CellSize;
  #scrollOffset: CellPoint = { x: 0, y: 0 };
  readonly #getRowKey: (row: Row) => string;
  readonly #rowHeight: number;
  readonly #columnWidth: number;
  readonly #overscanRows: number;
  readonly #overscanColumns: number;
  readonly #keepAliveLimit: number;
  readonly #keepAlive = new Map<string, Readonly<{
    rowKey: string;
    columnIndex: number;
  }>>();
  readonly #listeners = new Set<() => void>();
  #snapshotCache: VirtualGridSnapshot<Row> | null = null;
  #disposed = false;

  constructor(options: VirtualGridOptions<Row>) {
    this.#getRowKey = options.getRowKey;
    this.#rowHeight = positiveInteger(options.rowHeight ?? 1, "rowHeight");
    this.#columnWidth = positiveInteger(options.columnWidth ?? 1, "columnWidth");
    this.#overscanRows = nonNegativeInteger(options.overscanRows ?? 2, "overscanRows");
    this.#overscanColumns = nonNegativeInteger(
      options.overscanColumns ?? 1,
      "overscanColumns"
    );
    this.#keepAliveLimit = nonNegativeInteger(
      options.keepAliveLimit ?? 8,
      "keepAliveLimit"
    );
    this.#columnCount = positiveInteger(options.columnCount, "columnCount");
    this.#viewport = this.#validateViewport(options.viewport);
    this.#rows = [];
    this.setRows(options.rows);
  }

  setRows(rows: readonly Row[]): void {
    this.#assertActive();
    const anchor = this.#anchor();
    const keys = rows.map(this.#getRowKey);
    const index = new Map<string, number>();
    keys.forEach((key, rowIndex) => {
      if (!key) throw new TypeError("Virtual row keys must not be empty.");
      if (index.has(key)) throw new TypeError(`Duplicate virtual row key: ${key}`);
      index.set(key, rowIndex);
    });
    this.#rows = rows;
    this.#rowKeys = keys;
    this.#rowIndex = index;
    if (anchor.rowKey && index.has(anchor.rowKey)) {
      this.#scrollOffset = {
        ...this.#scrollOffset,
        y: index.get(anchor.rowKey)! * this.#rowHeight + anchor.rowOffset,
      };
    }
    for (const [key, kept] of this.#keepAlive) {
      if (!index.has(kept.rowKey) || kept.columnIndex >= this.#columnCount) {
        this.#keepAlive.delete(key);
      }
    }
    this.#scrollOffset = this.#clampScroll(this.#scrollOffset);
    this.#changed();
  }

  setViewport(viewport: CellSize): void {
    this.#assertActive();
    const next = this.#validateViewport(viewport);
    if (next.width === this.#viewport.width && next.height === this.#viewport.height) return;
    this.#viewport = next;
    this.#scrollOffset = this.#clampScroll(this.#scrollOffset);
    this.#changed();
  }

  scrollTo(point: CellPoint): VirtualGridSnapshot<Row> {
    this.#assertActive();
    const next = this.#clampScroll({
      x: Math.trunc(point.x),
      y: Math.trunc(point.y),
    });
    if (next.x !== this.#scrollOffset.x || next.y !== this.#scrollOffset.y) {
      this.#scrollOffset = next;
      this.#changed();
    }
    return this.snapshot();
  }

  reveal(
    rowKey: string,
    columnIndex: number,
    align: "nearest" | "start" | "center" | "end" = "nearest"
  ): VirtualGridSnapshot<Row> {
    this.#assertActive();
    const rowIndex = this.#rowIndex.get(rowKey);
    if (rowIndex === undefined) throw new RangeError(`Unknown virtual row key: ${rowKey}`);
    if (!Number.isInteger(columnIndex) || columnIndex < 0 || columnIndex >= this.#columnCount) {
      throw new RangeError(`Column index is outside the virtual grid: ${columnIndex}`);
    }
    this.#scrollOffset = this.#clampScroll({
      x: revealOffset(
        this.#scrollOffset.x,
        this.#viewport.width,
        columnIndex * this.#columnWidth,
        this.#columnWidth,
        align
      ),
      y: revealOffset(
        this.#scrollOffset.y,
        this.#viewport.height,
        rowIndex * this.#rowHeight,
        this.#rowHeight,
        align
      ),
    });
    this.#changed();
    return this.snapshot();
  }

  keepAlive(rowKey: string, columnIndex: number): void {
    this.#assertActive();
    if (!this.#rowIndex.has(rowKey)) throw new RangeError(`Unknown virtual row key: ${rowKey}`);
    if (!Number.isInteger(columnIndex) || columnIndex < 0 || columnIndex >= this.#columnCount) {
      throw new RangeError(`Column index is outside the virtual grid: ${columnIndex}`);
    }
    const key = cellKey(rowKey, columnIndex);
    this.#keepAlive.delete(key);
    this.#keepAlive.set(key, { rowKey, columnIndex });
    while (this.#keepAlive.size > this.#keepAliveLimit) {
      this.#keepAlive.delete(this.#keepAlive.keys().next().value!);
    }
    this.#changed();
  }

  release(rowKey: string, columnIndex: number): void {
    this.#assertActive();
    if (this.#keepAlive.delete(cellKey(rowKey, columnIndex))) this.#changed();
  }

  subscribe(listener: () => void): () => void {
    this.#assertActive();
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  snapshot(): VirtualGridSnapshot<Row> {
    this.#assertActive();
    if (this.#snapshotCache) return this.#snapshotCache;
    const visibleRows = visibleRange(
      this.#scrollOffset.y,
      this.#viewport.height,
      this.#rowHeight,
      this.#rows.length
    );
    const visibleColumns = visibleRange(
      this.#scrollOffset.x,
      this.#viewport.width,
      this.#columnWidth,
      this.#columnCount
    );
    const cacheRows = cacheRange(visibleRows, this.#overscanRows, this.#rows.length);
    const cacheColumns = cacheRange(
      visibleColumns,
      this.#overscanColumns,
      this.#columnCount
    );
    const cells: VirtualGridCell<Row>[] = [];
    const mounted = new Set<string>();
    for (let rowIndex = cacheRows.start; rowIndex < cacheRows.end; rowIndex += 1) {
      const rowKey = this.#rowKeys[rowIndex]!;
      for (
        let columnIndex = cacheColumns.start;
        columnIndex < cacheColumns.end;
        columnIndex += 1
      ) {
        const key = cellKey(rowKey, columnIndex);
        mounted.add(key);
        cells.push({
          key,
          rowKey,
          rowIndex,
          columnIndex,
          row: this.#rows[rowIndex]!,
          keptAlive: false,
        });
      }
    }
    for (const [key, kept] of this.#keepAlive) {
      if (mounted.has(key)) continue;
      const rowIndex = this.#rowIndex.get(kept.rowKey);
      if (rowIndex === undefined) continue;
      cells.push({
        key,
        rowKey: kept.rowKey,
        rowIndex,
        columnIndex: kept.columnIndex,
        row: this.#rows[rowIndex]!,
        keptAlive: true,
      });
    }
    this.#snapshotCache = {
      scrollOffset: this.#scrollOffset,
      contentSize: this.#contentSize(),
      visibleRows,
      visibleColumns,
      cacheRows,
      cacheColumns,
      cells,
      mountedCount: cells.length,
      anchor: this.#anchor(),
    };
    return this.#snapshotCache;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#rows = [];
    this.#rowKeys = [];
    this.#rowIndex.clear();
    this.#keepAlive.clear();
    this.#disposed = true;
    this.#snapshotCache = null;
    for (const listener of this.#listeners) listener();
    this.#listeners.clear();
  }

  #anchor() {
    const rowIndex = Math.min(
      Math.max(0, this.#rows.length - 1),
      Math.floor(this.#scrollOffset.y / this.#rowHeight)
    );
    const columnIndex = Math.min(
      Math.max(0, this.#columnCount - 1),
      Math.floor(this.#scrollOffset.x / this.#columnWidth)
    );
    return {
      rowKey: this.#rowKeys[rowIndex] ?? null,
      rowOffset: this.#scrollOffset.y - rowIndex * this.#rowHeight,
      columnIndex,
      columnOffset: this.#scrollOffset.x - columnIndex * this.#columnWidth,
    };
  }

  #contentSize(): CellSize {
    return {
      width: this.#columnCount * this.#columnWidth,
      height: this.#rows.length * this.#rowHeight,
    };
  }

  #clampScroll(point: CellPoint): CellPoint {
    const content = this.#contentSize();
    return {
      x: clamp(point.x, 0, Math.max(0, content.width - this.#viewport.width)),
      y: clamp(point.y, 0, Math.max(0, content.height - this.#viewport.height)),
    };
  }

  #validateViewport(viewport: CellSize): CellSize {
    return {
      width: positiveInteger(viewport.width, "viewport.width"),
      height: positiveInteger(viewport.height, "viewport.height"),
    };
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error("FixedVirtualGrid has been disposed.");
  }

  #changed(): void {
    this.#snapshotCache = null;
    for (const listener of this.#listeners) listener();
  }
}
