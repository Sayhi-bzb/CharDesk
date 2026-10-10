import { useEffect, useState, type RefObject } from "react";
import {
  listCellSurfaceElements,
  resolveCellSurfaceFrame,
  resolveCellSurfaceInspection,
  resolveCellSurfaceTrace,
  type CellSurfaceInspectionQuery,
} from "./browser-surface-geometry.js";
import { captureCellProbe, type CellProbeSnapshot } from "./probe.js";
import {
  cellDebugReference,
  verifyCellFrame,
  type CellDebugReference,
  type CellInspectionSnapshot,
  type CellInteractionTraceEvent,
  type CellVerificationIssue,
} from "./debug.js";

export type CellInspectorOverlayProps = Readonly<{
  surface: Element | null | RefObject<Element | null>;
  enabled?: boolean;
  show?: readonly ("owner" | "semantic" | "bounds" | "hit")[];
}>;

/** Registers a host-owned debug artifact without pretending it is a Cell frame. */
export type CellDebugAdapter = Readonly<{
  id: string;
  snapshot: () => unknown;
  verify?: () => readonly CellVerificationIssue[];
  references?: () => readonly CellDebugReference[];
  resolveRef?: (ref: string) => string | null;
  trace?: () => readonly CellInteractionTraceEvent[];
}>;

const adapters = new Map<string, CellDebugAdapter>();

export const registerCellDebugAdapter = (adapter: CellDebugAdapter): (() => void) => {
  adapters.set(adapter.id, adapter);
  return () => {
    if (adapters.get(adapter.id) === adapter) adapters.delete(adapter.id);
  };
};

export const verifyCellSurface = (target: Element): readonly CellVerificationIssue[] => {
  const frame = resolveCellSurfaceFrame(target);
  return frame ? verifyCellFrame(frame) : [{
    code: "surface-frame-unavailable",
    severity: "warning",
    hint: "render a committed CellFrame before verifying the surface",
  }];
};

export type CellDebugBridge = Readonly<{
  listSurfaces: () => readonly string[];
  inspect: (surfaceId: string, query: CellSurfaceInspectionQuery) => CellInspectionSnapshot | null;
  references: (surfaceId: string) => readonly CellDebugReference[];
  resolveRef: (surfaceId: string, ref: string) => string | null;
  artifact: (surfaceId: string) => unknown | null;
  snapshot: (surfaceId: string) => CellProbeSnapshot | null;
  verify: (surfaceId: string) => readonly CellVerificationIssue[];
  trace: (surfaceId: string) => readonly CellInteractionTraceEvent[];
}>;

const surfaceId = (surface: Element, index: number): string =>
  surface.getAttribute("data-cell-probe")
  ?? surface.getAttribute("aria-label")
  ?? `surface-${index}`;

export const installCellDebugBridge = (): (() => void) => {
  if (typeof window === "undefined") return () => undefined;
  const previous = (window as Window & { __CELL_UI_DEBUG__?: CellDebugBridge }).__CELL_UI_DEBUG__;
  const find = (id: string) => listCellSurfaceElements().find((surface, index) => surfaceId(surface, index) === id) ?? null;
  const findAdapter = (id: string) => adapters.get(id) ?? null;
  const referencesFor = (surface: Element): readonly CellDebugReference[] => {
    const frame = resolveCellSurfaceFrame(surface);
    if (!frame) return [];
    const ids = new Set<string>();
    for (const id of frame.scene.entries.keys()) ids.add(id);
    for (const id of frame.semantics.nodes.keys()) ids.add(id);
    for (const plane of frame.overlayPlanes) ids.add(plane.rootId);
    const refs = new Map<string, CellDebugReference>();
    for (const id of ids) {
      const reference = cellDebugReference(id);
      if (!refs.has(reference.ref)) refs.set(reference.ref, reference);
    }
    return [...refs.values()];
  };
  const bridge: CellDebugBridge = {
    listSurfaces: () => [...listCellSurfaceElements().map(surfaceId), ...adapters.keys()],
    inspect: (id, query) => {
      const surface = find(id);
      return surface ? resolveCellSurfaceInspection(surface, query) : null;
    },
    references: (id) => {
      const surface = find(id);
      return surface ? referencesFor(surface) : findAdapter(id)?.references?.() ?? [];
    },
    resolveRef: (id, ref) => {
      const surface = find(id);
      return surface
        ? referencesFor(surface).find((candidate) => candidate.ref === ref)?.canonicalId ?? null
        : findAdapter(id)?.resolveRef?.(ref) ?? null;
    },
    artifact: (id) => findAdapter(id)?.snapshot() ?? null,
    snapshot: (id) => {
      const surface = find(id);
      const frame = surface ? resolveCellSurfaceFrame(surface) : null;
      return frame ? captureCellProbe(frame, { probeId: id }) : null;
    },
    verify: (id) => {
      const surface = find(id);
      return surface ? verifyCellSurface(surface) : findAdapter(id)?.verify?.() ?? [{ code: "surface-not-found", severity: "warning", hint: id } as const];
    },
    trace: (id) => {
      const surface = find(id);
      return surface ? resolveCellSurfaceTrace(surface) : findAdapter(id)?.trace?.() ?? [];
    },
  };
  (window as Window & { __CELL_UI_DEBUG__?: CellDebugBridge }).__CELL_UI_DEBUG__ = bridge;
  return () => {
    const current = (window as Window & { __CELL_UI_DEBUG__?: CellDebugBridge }).__CELL_UI_DEBUG__;
    if (current === bridge) {
      if (previous) (window as Window & { __CELL_UI_DEBUG__?: CellDebugBridge }).__CELL_UI_DEBUG__ = previous;
      else delete (window as Window & { __CELL_UI_DEBUG__?: CellDebugBridge }).__CELL_UI_DEBUG__;
    }
  };
};

const resolveSurface = (surface: CellInspectorOverlayProps["surface"]): Element | null =>
  surface && "current" in surface ? surface.current : surface;

const queryFor = (surface: Element, event: PointerEvent): CellSurfaceInspectionQuery => ({
  clientPoint: { clientX: event.clientX, clientY: event.clientY },
});

const labelFor = (inspection: CellInspectionSnapshot, show: CellInspectorOverlayProps["show"]): string => {
  const lines: string[] = [];
  if (show?.includes("owner") !== false) lines.push(`owner=${inspection.ownerRef ?? "none"}`);
  if (show?.includes("semantic") !== false && inspection.semantic) {
    lines.push(`role=${inspection.semantic.role}`, `label=${inspection.semantic.label}`);
  }
  if (show?.includes("bounds") !== false) {
    const bounds = inspection.scene.paintBounds ?? inspection.scene.hitBounds;
    if (bounds) lines.push(`cell=(${bounds.x},${bounds.y}) ${bounds.width}×${bounds.height}`);
  }
  if (show?.includes("hit") !== false) lines.push(`hit=${inspection.hitRefs.join(" → ") || "none"}`);
  return lines.join("\n");
};

export function CellInspectorOverlay({ surface: surfaceInput, enabled = true, show }: CellInspectorOverlayProps) {
  const [hovered, setHovered] = useState<CellInspectionSnapshot | null>(null);
  const [pinned, setPinned] = useState<CellInspectionSnapshot | null>(null);
  useEffect(() => {
    if (!enabled) {
      setHovered(null);
      setPinned(null);
      return;
    }
    const uninstallBridge = installCellDebugBridge();
    const move = (event: PointerEvent) => {
      const surface = resolveSurface(surfaceInput);
      if (!surface || !(event.target instanceof Element) || !surface.contains(event.target)) {
        setHovered(null);
        return;
      }
      const eventSurface = event.target.closest("[data-cell-surface]");
      if (!eventSurface || !surface.contains(eventSurface)) {
        setHovered(null);
        return;
      }
      setHovered(resolveCellSurfaceInspection(eventSurface, queryFor(eventSurface, event)));
    };
    const down = (event: PointerEvent) => {
      const surface = resolveSurface(surfaceInput);
      if (!surface || !(event.target instanceof Element) || !surface.contains(event.target)) return;
      const eventSurface = event.target.closest("[data-cell-surface]");
      if (!eventSurface || !surface.contains(eventSurface)) return;
      setPinned(resolveCellSurfaceInspection(eventSurface, queryFor(eventSurface, event)));
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPinned(null);
    };
    document.addEventListener("pointermove", move, true);
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("keydown", key, true);
    return () => {
      uninstallBridge();
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("keydown", key, true);
    };
  }, [enabled, surfaceInput]);
  if (!enabled) return null;
  const inspection = pinned ?? hovered;
  const rect = inspection?.projection?.cellRectPx;
  if (!inspection || !rect) return null;
  return <div data-cell-inspector-overlay="" aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: 2147483000, pointerEvents: "none" }}>
    <div style={{ position: "fixed", left: rect.left, top: rect.top, width: rect.width, height: rect.height, outline: "1px solid #00e5ff", background: "rgba(0,229,255,0.08)" }} />
    <pre style={{ position: "fixed", left: Math.max(4, rect.left), top: Math.max(4, rect.top - 8), margin: 0, padding: "4px 6px", color: "#dffaff", background: "#10242a", font: "12px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace", whiteSpace: "pre", boxShadow: "0 2px 8px rgba(0,0,0,.35)" }}>
      {labelFor(inspection, show)}
    </pre>
  </div>;
}
