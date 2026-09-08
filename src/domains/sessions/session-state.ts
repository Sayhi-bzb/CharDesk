import type {
  CanvasSessionDescriptor,
  CanvasSessionSnapshot,
} from "./model";
import type { Point } from "@/shared/types";
import type { CanvasMode } from "./mode";
import type { StructuredComponentInstance, StructuredNode } from "@/domains/structured-content/public";
import type { SlideDeckSnapshot } from "@/domains/slides/public";
import { createEntityId } from "@/shared/utils/id";

export const resolveNextSessionName = (
  sessions: readonly CanvasSessionDescriptor[],
  mode: CanvasMode = "freeform"
) => {
  const prefix = mode === "slide"
    ? "Slides"
    : "Canvas";
  const pattern = new RegExp(`^${prefix}\\s+(\\d+)$`, "i");
  let maxIndex = 0;
  sessions.forEach((session) => {
    const match = session.name.match(pattern);
    if (!match) return;
    const value = Number(match[1]);
    if (Number.isFinite(value)) {
      maxIndex = Math.max(maxIndex, value);
    }
  });
  return `${prefix} ${maxIndex + 1}`;
};

export const createSessionId = (sessions: readonly CanvasSessionDescriptor[]) => {
  const existing = new Set(sessions.map((session) => session.id));
  let candidate = "";
  do {
    candidate = createEntityId("canvas");
  } while (existing.has(candidate));
  return candidate;
};

type StaticActiveSnapshot = {
  mode: "freeform" | "structured";
  scene: StructuredNode[];
  components?: StructuredComponentInstance[];
  grid: [string, { char: string; color: string }][];
  viewport?: { offset: Point; zoom: number };
};

type SlideActiveSnapshot = {
  mode: "slide";
  slideDeck: SlideDeckSnapshot;
  viewport?: { offset: Point; zoom: number };
};

type ActiveSnapshot = StaticActiveSnapshot | SlideActiveSnapshot;

export const withActiveCanvasSnapshot = (
  sessions: CanvasSessionSnapshot[],
  activeCanvasId: string,
  snapshot: ActiveSnapshot
) => {
  return sessions.map((session): CanvasSessionSnapshot => {
    if (session.id !== activeCanvasId) return session;
    if (snapshot.mode === "slide") {
      return {
        id: session.id,
        name: session.name,
        mode: "slide",
        slideDeck: snapshot.slideDeck,
        ...(session.sourceBinding
          ? { sourceBinding: session.sourceBinding }
          : {}),
        scene: [],
        components: [],
        grid: [],
        viewport: snapshot.viewport,
      };
    }
    return {
      ...session,
      mode: snapshot.mode,
      scene: snapshot.scene,
      components: snapshot.components,
      grid: snapshot.grid,
      viewport: snapshot.viewport,
    } as CanvasSessionSnapshot;
  });
};

export const normalizeSessionMode = (mode: unknown): CanvasMode => {
  if (mode === "slide") return "slide";
  if (mode === "structured") return "structured";
  return "freeform";
};
