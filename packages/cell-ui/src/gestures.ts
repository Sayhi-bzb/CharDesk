import type { CellHitPart, CellPoint, WidgetId } from "./types.js";
import { cellCenter } from "./scrollbar.js";

export type ScrollDragAnchor = Readonly<{
  point: CellPoint;
  offset: number;
  maximum: number;
  trackStart: number;
  trackCross: number;
  trackLength: number;
  thumbLength: number;
}>;

export type GestureKind = "tap" | "drag" | "scroll";
export type GestureAxis = "x" | "y" | "both";
export type GesturePhase = "start" | "update" | "end" | "cancel";

export type GestureCandidate = Readonly<{
  targetId: WidgetId;
  kind: GestureKind;
  axis?: GestureAxis;
  part?: CellHitPart;
  scrollbar?: ScrollDragAnchor;
}>;

export type GestureSignal = Readonly<{
  pointerId: number;
  targetId: WidgetId;
  kind: GestureKind;
  phase: GesturePhase;
  point: CellPoint;
  delta: CellPoint;
  part?: CellHitPart;
  scrollbar?: ScrollDragAnchor;
  precisePoint?: CellPoint;
  totalDelta?: CellPoint;
}>;

type GestureArena = {
  start: CellPoint;
  preciseStart: CellPoint;
  previous: CellPoint;
  candidates: readonly GestureCandidate[];
  winner: GestureCandidate | null;
};

const delta = (from: CellPoint, to: CellPoint): CellPoint => ({
  x: to.x - from.x,
  y: to.y - from.y,
});

const signal = (
  pointerId: number,
  candidate: GestureCandidate,
  phase: GesturePhase,
  point: CellPoint,
  movement: CellPoint,
  precisePoint = cellCenter(point)
): GestureSignal => ({
  pointerId,
  targetId: candidate.targetId,
  kind: candidate.kind,
  phase,
  point,
  delta: movement,
  part: candidate.part,
  ...(candidate.scrollbar ? {
    scrollbar: candidate.scrollbar,
    precisePoint,
    totalDelta: delta(candidate.scrollbar.point, precisePoint),
  } : {}),
});

const acceptsAxis = (candidate: GestureCandidate, axis: "x" | "y") => {
  const candidateAxis = candidate.axis ?? (candidate.kind === "scroll" ? "y" : "both");
  return candidateAxis === "both" || candidateAxis === axis;
};

export class GestureManager {
  readonly #threshold: number;
  readonly #arenas = new Map<number, GestureArena>();

  constructor(options: Readonly<{ threshold?: number }> = {}) {
    this.#threshold = Math.max(1, Math.trunc(options.threshold ?? 1));
  }

  has(pointerId: number): boolean {
    return this.#arenas.has(pointerId);
  }

  begin(
    pointerId: number,
    point: CellPoint,
    candidates: readonly GestureCandidate[],
    precisePoint = cellCenter(point)
  ): readonly GestureSignal[] {
    const cancelled = this.cancel(pointerId);
    this.#arenas.set(pointerId, {
      start: point,
      preciseStart: precisePoint,
      previous: point,
      candidates: [...candidates],
      winner: null,
    });
    return cancelled;
  }

  move(pointerId: number, point: CellPoint, precisePoint = cellCenter(point)): readonly GestureSignal[] {
    const arena = this.#arenas.get(pointerId);
    if (!arena) return [];
    const step = delta(arena.previous, point);
    arena.previous = point;
    if (arena.winner) {
      return [signal(pointerId, arena.winner, "update", point, step, precisePoint)];
    }

    const total = delta(arena.start, point);
    const preciseTotal = delta(arena.preciseStart, precisePoint);
    const thumb = arena.candidates.find((candidate) => candidate.kind === "drag" && candidate.scrollbar);
    if (thumb && Math.abs(thumb.axis === "x" ? preciseTotal.x : preciseTotal.y) >= 0.5) {
      arena.winner = thumb;
      return [
        ...arena.candidates.filter((candidate) => candidate !== thumb)
          .map((candidate) => signal(pointerId, candidate, "cancel", point, total, precisePoint)),
        signal(pointerId, thumb, "start", point, total, precisePoint),
      ];
    }
    if (thumb && Math.abs(thumb.axis === "x" ? preciseTotal.y : preciseTotal.x) < this.#threshold) return [];
    if (Math.max(Math.abs(total.x), Math.abs(total.y)) < this.#threshold) return [];
    const axis = Math.abs(total.x) > Math.abs(total.y) ? "x" : "y";
    const winner = arena.candidates.find(
      (candidate) => candidate.kind !== "tap" && acceptsAxis(candidate, axis)
    );
    if (!winner) {
      this.#arenas.delete(pointerId);
      return arena.candidates.map((candidate) =>
        signal(pointerId, candidate, "cancel", point, total)
      );
    }
    arena.winner = winner;
    return [
      ...arena.candidates
        .filter((candidate) => candidate !== winner)
        .map((candidate) => signal(pointerId, candidate, "cancel", point, total)),
      signal(pointerId, winner, "start", point, total, precisePoint),
    ];
  }

  end(pointerId: number, point: CellPoint, precisePoint = cellCenter(point)): readonly GestureSignal[] {
    const arena = this.#arenas.get(pointerId);
    if (!arena) return [];
    this.#arenas.delete(pointerId);
    if (arena.winner) {
      return [signal(
        pointerId,
        arena.winner,
        "end",
        point,
        delta(arena.previous, point),
        precisePoint
      )];
    }
    const tap = arena.candidates.find((candidate) => candidate.kind === "tap");
    const total = delta(arena.start, point);
    if (!tap) {
      return arena.candidates.map((candidate) =>
        signal(pointerId, candidate, "cancel", point, total)
      );
    }
    return [
      ...arena.candidates
        .filter((candidate) => candidate !== tap)
        .map((candidate) => signal(pointerId, candidate, "cancel", point, total)),
      signal(pointerId, tap, "end", point, total, precisePoint),
    ];
  }

  cancel(pointerId: number): readonly GestureSignal[] {
    const arena = this.#arenas.get(pointerId);
    if (!arena) return [];
    this.#arenas.delete(pointerId);
    const candidates = arena.winner ? [arena.winner] : arena.candidates;
    return candidates.map((candidate) =>
      signal(pointerId, candidate, "cancel", arena.previous, { x: 0, y: 0 })
    );
  }

  sync(valid: (candidate: GestureCandidate) => boolean): readonly number[] {
    const cancelled: number[] = [];
    for (const [id, arena] of this.#arenas) {
      if (arena.candidates.every(valid)) continue;
      this.cancel(id);
      cancelled.push(id);
    }
    return cancelled;
  }
}
