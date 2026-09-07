import type { GridCell, NodeBounds, Point } from "@/shared/types";
import { getCellOccupancy } from "@/shared/metrics";
import { GridManager } from "@/shared/utils/grid";
import { getStructuredNodeBounds, renderStructuredScene } from "./scene";
import type { StructuredNode } from "./types";
import {
  bindStructuredSceneQuery,
  createStructuredSceneQuery,
  type StructuredSceneQuery,
} from "./box";

const CHUNK_WIDTH = 128;
const CHUNK_HEIGHT = 64;
const CHUNK_CACHE_LIMIT = 64;
const CHUNK_CACHE_BYTE_LIMIT = 32 * 1024 * 1024;
const ESTIMATED_CELL_BYTES = 128;
const INVALIDATION_HISTORY_LIMIT = 256;
const INVALIDATION_BOUNDS_LIMIT = 64;
const MAX_BUCKETS_PER_NODE = 256;

type SurfaceSpan = { x: number; cells: GridCell[] };
type SurfaceRow = { y: number; spans: readonly SurfaceSpan[] };

export type StructuredSurfaceStats = {
  indexDurationMs: number;
  updateDurationMs: number;
  maxUpdateDurationMs: number;
  revision: number;
  residentChunks: number;
  residentBytes: number;
  projectedCells: number;
  resolvedChunks: number;
  materializations: number;
  projectionDurationMs: number;
  maxProjectionDurationMs: number;
};

type StructuredSceneChanges =
  | { revision: number; full: true }
  | { revision: number; full: false; bounds: readonly NodeBounds[] };

export interface StructuredSceneSurface {
  get(point: Point): GridCell | undefined;
  getCell(point: Point): GridCell | undefined;
  visit(bounds: NodeBounds, visitor: (x: number, y: number, cell: GridCell) => void): void;
  visitCells(bounds: NodeBounds, visitor: (x: number, y: number, cell: GridCell) => void): void;
  query(bounds: NodeBounds): Iterable<SurfaceSpan & { y: number }>;
  rows(bounds?: NodeBounds): Iterable<SurfaceRow>;
  getContentBounds(): NodeBounds | null;
  materialize(bounds?: NodeBounds): Map<string, GridCell>;
  getStats(): StructuredSurfaceStats;
  getRevision(): number;
  getChangesSince(revision: number): StructuredSceneChanges;
  update(scene: readonly StructuredNode[], changedIds?: readonly string[]): void;
  dispose(): void;
}

const floorDiv = (value: number, divisor: number) => Math.floor(value / divisor);
const chunkKey = (x: number, y: number) => `${x},${y}`;

const unionBounds = (left: NodeBounds | null, right: NodeBounds): NodeBounds => {
  if (!left) return { ...right };
  const minX = Math.min(left.x, right.x);
  const minY = Math.min(left.y, right.y);
  const maxX = Math.max(left.x + left.width, right.x + right.width);
  const maxY = Math.max(left.y + left.height, right.y + right.height);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

const intersects = (left: NodeBounds, right: NodeBounds) =>
  left.x < right.x + right.width &&
  left.x + left.width > right.x &&
  left.y < right.y + right.height &&
  left.y + left.height > right.y;

const touches = (left: NodeBounds, right: NodeBounds) =>
  left.x <= right.x + right.width &&
  left.x + left.width >= right.x &&
  left.y <= right.y + right.height &&
  left.y + left.height >= right.y;

const touchesOuterEdge = (inner: NodeBounds, outer: NodeBounds) =>
  inner.x <= outer.x ||
  inner.y <= outer.y ||
  inner.x + inner.width >= outer.x + outer.width ||
  inner.y + inner.height >= outer.y + outer.height;

/** Lazily projects only structured nodes intersecting requested cell-plane chunks. */
export class StructuredSceneSurfaceIndex implements StructuredSceneSurface {
  #scene: readonly StructuredNode[];
  readonly #sceneQuery: StructuredSceneQuery;
  readonly #nodesById = new Map<string, StructuredNode>();
  readonly #boundsById = new Map<string, NodeBounds>();
  readonly #nodeIdsByChunk = new Map<string, Set<string>>();
  readonly #chunkKeysByNodeId = new Map<string, Set<string>>();
  readonly #largeNodeIds = new Set<string>();
  readonly #chunkCache = new Map<
    string,
    { cells: Map<string, GridCell>; bytes: number }
  >();
  #contentBounds: NodeBounds | null = null;
  readonly #indexDurationMs: number;
  #residentBytes = 0;
  #revision = 0;
  readonly #invalidations: Array<{ revision: number; bounds: NodeBounds }> = [];
  #updateDurationMs = 0;
  #maxUpdateDurationMs = 0;
  #projectedCells = 0;
  #resolvedChunks = 0;
  #materializations = 0;
  #projectionDurationMs = 0;
  #maxProjectionDurationMs = 0;

  constructor(scene: readonly StructuredNode[]) {
    const startedAt = performance.now();
    this.#scene = scene;
    this.#sceneQuery = createStructuredSceneQuery(scene);
    scene.forEach((node) => this.#indexNode(node));
    this.#indexDurationMs = performance.now() - startedAt;
  }

  update(scene: readonly StructuredNode[], changedIds?: readonly string[]) {
    if (scene === this.#scene && (!changedIds || changedIds.length === 0)) return;
    const startedAt = performance.now();
    const nextById = new Map(scene.map((node) => [node.id, node]));
    const changed = changedIds
      ? new Set(changedIds)
      : new Set([
          ...this.#nodesById.keys(),
          ...nextById.keys(),
        ].filter((id) => this.#nodesById.get(id) !== nextById.get(id)));
    if (changed.size === 0) {
      this.#scene = scene;
      bindStructuredSceneQuery(scene, this.#sceneQuery);
      return;
    }

    const dirtyBounds: NodeBounds[] = [];
    let recomputeContentBounds = false;
    changed.forEach((id) => {
      const previousBounds = this.#boundsById.get(id);
      if (
        previousBounds &&
        this.#contentBounds &&
        touchesOuterEdge(previousBounds, this.#contentBounds)
      ) recomputeContentBounds = true;
      if (previousBounds) dirtyBounds.push({ ...previousBounds });
      this.#unindexNode(id);
      const next = nextById.get(id);
      if (next) {
        this.#indexNode(next);
        dirtyBounds.push({ ...this.#boundsById.get(id)! });
      }
    });
    this.#scene = scene;
    bindStructuredSceneQuery(scene, this.#sceneQuery, [...changed]);
    if (recomputeContentBounds) this.#recomputeContentBounds();

    this.#revision += 1;
    for (const bounds of dirtyBounds) {
      this.#invalidations.push({ revision: this.#revision, bounds });
      this.#invalidateCachedBounds(bounds);
    }
    if (this.#invalidations.length > INVALIDATION_HISTORY_LIMIT) {
      this.#invalidations.splice(
        0,
        this.#invalidations.length - INVALIDATION_HISTORY_LIMIT
      );
    }
    const duration = performance.now() - startedAt;
    this.#updateDurationMs += duration;
    this.#maxUpdateDurationMs = Math.max(this.#maxUpdateDurationMs, duration);
  }

  getRevision() {
    return this.#revision;
  }

  getSceneQuery() {
    return this.#sceneQuery;
  }

  getChangesSince(revision: number): StructuredSceneChanges {
    if (!Number.isSafeInteger(revision) || revision < 0 || revision > this.#revision) {
      return { revision: this.#revision, full: true };
    }
    if (revision === this.#revision) {
      return { revision: this.#revision, full: false, bounds: [] };
    }
    const oldestRevision = this.#invalidations[0]?.revision ?? this.#revision;
    if (revision < oldestRevision - 1) {
      return { revision: this.#revision, full: true };
    }
    const bounds: NodeBounds[] = [];
    for (const invalidation of this.#invalidations) {
      if (invalidation.revision <= revision) continue;
      let merged = { ...invalidation.bounds };
      for (let index = 0; index < bounds.length;) {
        if (!touches(bounds[index]!, merged)) {
          index += 1;
          continue;
        }
        merged = unionBounds(bounds[index]!, merged);
        bounds.splice(index, 1);
        index = 0;
      }
      bounds.push(merged);
      if (bounds.length > INVALIDATION_BOUNDS_LIMIT) {
        return { revision: this.#revision, full: true };
      }
    }
    return { revision: this.#revision, full: false, bounds };
  }

  getCell(point: Point) {
    return this.#resolveChunk(
      floorDiv(point.x, CHUNK_WIDTH),
      floorDiv(point.y, CHUNK_HEIGHT)
    ).get(GridManager.toKey(point.x, point.y));
  }

  get(point: Point) {
    return this.getCell(point);
  }

  visit(bounds: NodeBounds, visitor: (x: number, y: number, cell: GridCell) => void) {
    for (const row of this.rows(bounds)) {
      for (const span of row.spans) {
        let x = span.x;
        for (const cell of span.cells) {
          visitor(x, row.y, cell);
          x += getCellOccupancy(cell.char);
        }
      }
    }
  }

  visitCells(bounds: NodeBounds, visitor: (x: number, y: number, cell: GridCell) => void) {
    this.visit(bounds, visitor);
  }

  *query(bounds: NodeBounds) {
    for (const row of this.rows(bounds)) {
      for (const span of row.spans) yield { ...span, y: row.y };
    }
  }

  *rows(bounds: NodeBounds = this.#contentBounds ?? { x: 0, y: 0, width: 0, height: 0 }) {
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const cellsByRow = new Map<number, Array<{ x: number; cell: GridCell }>>();
    const minChunkX = floorDiv(bounds.x, CHUNK_WIDTH);
    const maxChunkX = floorDiv(bounds.x + bounds.width - 1, CHUNK_WIDTH);
    const minChunkY = floorDiv(bounds.y, CHUNK_HEIGHT);
    const maxChunkY = floorDiv(bounds.y + bounds.height - 1, CHUNK_HEIGHT);
    for (let chunkY = minChunkY; chunkY <= maxChunkY; chunkY += 1) {
      for (let chunkX = minChunkX; chunkX <= maxChunkX; chunkX += 1) {
        this.#resolveChunk(chunkX, chunkY).forEach((cell, key) => {
          const point = GridManager.fromKey(key);
          if (
            point.x < bounds.x || point.x >= bounds.x + bounds.width ||
            point.y < bounds.y || point.y >= bounds.y + bounds.height
          ) return;
          const row = cellsByRow.get(point.y) ?? [];
          row.push({ x: point.x, cell });
          cellsByRow.set(point.y, row);
        });
      }
    }
    for (const [y, entries] of [...cellsByRow].sort(([a], [b]) => a - b)) {
      entries.sort((a, b) => a.x - b.x);
      const spans: SurfaceSpan[] = [];
      let spanEnd = -Infinity;
      entries.forEach((entry) => {
        const previous = spans[spans.length - 1];
        if (previous && spanEnd === entry.x) previous.cells.push(entry.cell);
        else spans.push({ x: entry.x, cells: [entry.cell] });
        spanEnd = entry.x + getCellOccupancy(entry.cell.char);
      });
      yield { y, spans };
    }
  }

  getContentBounds() {
    return this.#contentBounds ? { ...this.#contentBounds } : null;
  }

  materialize(bounds = this.#contentBounds ?? undefined) {
    this.#materializations += 1;
    const grid = new Map<string, GridCell>();
    if (!bounds) return grid;
    for (const row of this.rows(bounds)) {
      for (const span of row.spans) {
        let x = span.x;
        for (const cell of span.cells) {
          grid.set(GridManager.toKey(x, row.y), cell);
          x += getCellOccupancy(cell.char);
        }
      }
    }
    return grid;
  }

  getStats(): StructuredSurfaceStats {
    return {
      indexDurationMs: this.#indexDurationMs,
      updateDurationMs: this.#updateDurationMs,
      maxUpdateDurationMs: this.#maxUpdateDurationMs,
      revision: this.#revision,
      residentChunks: this.#chunkCache.size,
      residentBytes: this.#residentBytes,
      projectedCells: this.#projectedCells,
      resolvedChunks: this.#resolvedChunks,
      materializations: this.#materializations,
      projectionDurationMs: this.#projectionDurationMs,
      maxProjectionDurationMs: this.#maxProjectionDurationMs,
    };
  }

  dispose() {
    this.#chunkCache.clear();
    this.#residentBytes = 0;
    this.#nodeIdsByChunk.clear();
    this.#chunkKeysByNodeId.clear();
    this.#largeNodeIds.clear();
    this.#boundsById.clear();
    this.#nodesById.clear();
    this.#invalidations.length = 0;
  }

  #indexNode(node: StructuredNode) {
    this.#nodesById.set(node.id, node);
    const bounds = getStructuredNodeBounds(node);
    this.#boundsById.set(node.id, bounds);
    this.#contentBounds = unionBounds(this.#contentBounds, bounds);
    const minChunkX = floorDiv(bounds.x, CHUNK_WIDTH);
    const maxChunkX = floorDiv(bounds.x + bounds.width - 1, CHUNK_WIDTH);
    const minChunkY = floorDiv(bounds.y, CHUNK_HEIGHT);
    const maxChunkY = floorDiv(bounds.y + bounds.height - 1, CHUNK_HEIGHT);
    const bucketCount =
      (maxChunkX - minChunkX + 1) * (maxChunkY - minChunkY + 1);
    if (bucketCount > MAX_BUCKETS_PER_NODE) {
      this.#largeNodeIds.add(node.id);
      return;
    }
    const keys = new Set<string>();
    for (let chunkY = minChunkY; chunkY <= maxChunkY; chunkY += 1) {
      for (let chunkX = minChunkX; chunkX <= maxChunkX; chunkX += 1) {
        const key = chunkKey(chunkX, chunkY);
        keys.add(key);
        const ids = this.#nodeIdsByChunk.get(key) ?? new Set<string>();
        ids.add(node.id);
        this.#nodeIdsByChunk.set(key, ids);
      }
    }
    this.#chunkKeysByNodeId.set(node.id, keys);
  }

  #unindexNode(id: string) {
    this.#chunkKeysByNodeId.get(id)?.forEach((key) => {
      const ids = this.#nodeIdsByChunk.get(key);
      ids?.delete(id);
      if (ids?.size === 0) this.#nodeIdsByChunk.delete(key);
    });
    this.#chunkKeysByNodeId.delete(id);
    this.#largeNodeIds.delete(id);
    this.#boundsById.delete(id);
    this.#nodesById.delete(id);
  }

  #recomputeContentBounds() {
    this.#contentBounds = null;
    this.#boundsById.forEach((bounds) => {
      this.#contentBounds = unionBounds(this.#contentBounds, bounds);
    });
  }

  #deleteCachedChunk(key: string) {
    const cached = this.#chunkCache.get(key);
    if (!cached) return;
    this.#residentBytes -= cached.bytes;
    this.#chunkCache.delete(key);
  }

  #invalidateCachedBounds(bounds: NodeBounds) {
    const minChunkX = floorDiv(bounds.x - 1, CHUNK_WIDTH);
    const maxChunkX = floorDiv(bounds.x + bounds.width, CHUNK_WIDTH);
    const minChunkY = floorDiv(bounds.y, CHUNK_HEIGHT);
    const maxChunkY = floorDiv(bounds.y + bounds.height - 1, CHUNK_HEIGHT);
    for (let chunkY = minChunkY; chunkY <= maxChunkY; chunkY += 1) {
      for (let chunkX = minChunkX; chunkX <= maxChunkX; chunkX += 1) {
        this.#deleteCachedChunk(chunkKey(chunkX, chunkY));
      }
    }
  }

  #resolveChunk(chunkX: number, chunkY: number) {
    const key = chunkKey(chunkX, chunkY);
    const cached = this.#chunkCache.get(key);
    if (cached) {
      this.#chunkCache.delete(key);
      this.#chunkCache.set(key, cached);
      return cached.cells;
    }
    const startedAt = performance.now();
    const bounds = {
      x: chunkX * CHUNK_WIDTH,
      y: chunkY * CHUNK_HEIGHT,
      width: CHUNK_WIDTH,
      height: CHUNK_HEIGHT,
    };
    const candidateIds = new Set(this.#nodeIdsByChunk.get(key) ?? []);
    this.#largeNodeIds.forEach((id) => {
      const node = this.#nodesById.get(id);
      if (node && intersects(getStructuredNodeBounds(node), bounds)) candidateIds.add(id);
    });
    const candidates = [...candidateIds]
      .flatMap((id) => {
        const node = this.#nodesById.get(id);
        return node ? [node] : [];
      })
      .sort((left, right) => left.order - right.order);
    const expandedBounds = {
      x: bounds.x - 1,
      y: bounds.y,
      width: bounds.width + 2,
      height: bounds.height,
    };
    const rendered = renderStructuredScene(candidates, expandedBounds);
    const projection = new Map<string, GridCell>();
    rendered.forEach((cell, cellKey) => {
      const point = GridManager.fromKey(cellKey);
      if (
        point.x >= bounds.x && point.x < bounds.x + bounds.width &&
        point.y >= bounds.y && point.y < bounds.y + bounds.height
      ) projection.set(cellKey, cell);
    });
    this.#resolvedChunks += 1;
    this.#projectedCells += projection.size;
    const duration = performance.now() - startedAt;
    this.#projectionDurationMs += duration;
    this.#maxProjectionDurationMs = Math.max(this.#maxProjectionDurationMs, duration);
    const bytes = 256 + projection.size * ESTIMATED_CELL_BYTES;
    this.#chunkCache.set(key, { cells: projection, bytes });
    this.#residentBytes += bytes;
    while (
      this.#chunkCache.size > CHUNK_CACHE_LIMIT ||
      this.#residentBytes > CHUNK_CACHE_BYTE_LIMIT
    ) {
      this.#deleteCachedChunk(this.#chunkCache.keys().next().value!);
    }
    return projection;
  }
}

export const createStructuredSceneSurface = (scene: readonly StructuredNode[]) =>
  new StructuredSceneSurfaceIndex(scene);
