import type { CellHitPart, CellPoint, WidgetId } from "./types.js";

export type GestureKind = "tap" | "drag" | "scroll";
export type GestureAxis = "x" | "y" | "both";
export type GesturePhase = "start" | "update" | "end" | "cancel";

export type GestureCandidate = Readonly<{
  targetId: WidgetId;
  kind: GestureKind;
  axis?: GestureAxis;
  part?: CellHitPart;
}>;

export type GestureSignal = Readonly<{
  pointerId: number;
  targetId: WidgetId;
  kind: GestureKind;
  phase: GesturePhase;
  point: CellPoint;
  delta: CellPoint;
  part?: CellHitPart;
}>;

type GestureArena = {
  start: CellPoint;
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
  movement: CellPoint
): GestureSignal => ({
  pointerId,
  targetId: candidate.targetId,
  kind: candidate.kind,
  phase,
  point,
  delta: movement,
  part: candidate.part,
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
    candidates: readonly GestureCandidate[]
  ): readonly GestureSignal[] {
    const cancelled = this.cancel(pointerId);
    this.#arenas.set(pointerId, {
      start: point,
      previous: point,
      candidates: [...candidates],
      winner: null,
    });
    return cancelled;
  }

  move(pointerId: number, point: CellPoint): readonly GestureSignal[] {
    const arena = this.#arenas.get(pointerId);
    if (!arena) return [];
    const step = delta(arena.previous, point);
    arena.previous = point;
    if (arena.winner) {
      return [signal(pointerId, arena.winner, "update", point, step)];
    }

    const total = delta(arena.start, point);
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
      signal(pointerId, winner, "start", point, total),
    ];
  }

  end(pointerId: number, point: CellPoint): readonly GestureSignal[] {
    const arena = this.#arenas.get(pointerId);
    if (!arena) return [];
    this.#arenas.delete(pointerId);
    if (arena.winner) {
      return [signal(
        pointerId,
        arena.winner,
        "end",
        point,
        delta(arena.previous, point)
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
      signal(pointerId, tap, "end", point, total),
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
}
