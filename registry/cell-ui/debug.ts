import { inspectCell, type CellInspection } from "./probe.js";
import type { CellPoint, CellRect, FrameSnapshot, SemanticNode, WidgetId } from "./types.js";
import { cellDebugReference, cellDebugRefFor } from "./debug-ref.js";
export { cellDebugReference, cellDebugRefFor } from "./debug-ref.js";
export type { CellDebugReference } from "./debug-ref.js";
export type CellInspectionSnapshot = Readonly<{
  schemaVersion: 1;
  revision: number;
  point: CellPoint;
  cell: CellInspection["cell"];
  ownerId: WidgetId | null;
  ownerRef: string | null;
  hit: CellInspection["hit"];
  hitStack: readonly WidgetId[];
  hitRefs: readonly string[];
  scene: Readonly<{
    layoutBounds: CellRect | null;
    paintBounds: CellRect | null;
    hitBounds: CellRect | null;
    contentClip: CellRect | null;
    layer: number | null;
  }>;
  semantic: Readonly<{
    id: WidgetId;
    semanticParentId: WidgetId | null;
    semanticParentRef: string | null;
    role: SemanticNode["role"];
    label: string;
    bounds: CellRect | null;
    actions: readonly SemanticNode["actions"][number][];
    focused: boolean;
    selected: boolean;
    disabled: boolean;
    invalid: boolean;
    hidden: boolean;
    orientation?: SemanticNode["orientation"];
    valueNow?: number;
    valueMin?: number;
    valueMax?: number;
    valueText?: string;
    pressed?: boolean;
    checked?: SemanticNode["checked"];
    expanded?: boolean;
    value?: string;
    readOnly?: boolean;
  }> | null;
  semanticRef: string | null;
  focusedId: WidgetId | null;
  ownerFocused: boolean;
  projection?: Readonly<{
    cellRectPx: DOMRectReadOnly | null;
    surfaceRectPx: DOMRectReadOnly | null;
  }>;
}>;

import type { CellDebugReference } from "./debug-ref.js";

const semanticSnapshot = (frame: FrameSnapshot, id: WidgetId | null) => {
  if (!id) return null;
  const node = frame.semantics.nodes.get(id);
  if (!node) return null;
  return {
    id: node.id,
    semanticParentId: node.semanticParentId,
    semanticParentRef: cellDebugRefFor(node.semanticParentId),
    role: node.role,
    label: node.label,
    bounds: node.bounds ? { ...node.bounds } : null,
    actions: [...node.actions],
    focused: node.focused,
    selected: node.selected ?? false,
    disabled: node.disabled,
    invalid: node.invalid ?? false,
    hidden: node.hidden,
    ...(node.orientation ? { orientation: node.orientation } : {}),
    ...(node.valueNow === undefined ? {} : { valueNow: node.valueNow }),
    ...(node.valueMin === undefined ? {} : { valueMin: node.valueMin }),
    ...(node.valueMax === undefined ? {} : { valueMax: node.valueMax }),
    ...(node.valueText === undefined ? {} : { valueText: node.valueText }),
    ...(node.pressed === undefined ? {} : { pressed: node.pressed }),
    ...(node.checked === undefined ? {} : { checked: node.checked }),
    ...(node.expanded === undefined ? {} : { expanded: node.expanded }),
    ...(node.value === undefined ? {} : { value: node.value }),
    ...(node.readOnly === undefined ? {} : { readOnly: node.readOnly }),
  } as const;
};

export const inspectCellFrame = (frame: FrameSnapshot, point: CellPoint): CellInspectionSnapshot => {
  const inspection = inspectCell(frame, point);
  const owner = inspection.owner;
  const ownerId = inspection.cell?.ownerId ?? inspection.hit?.ownerId ?? null;
  const semanticId = inspection.hitStack.find((id) => frame.semantics.nodes.has(id))
    ?? inspection.owner?.id ?? inspection.hit?.ownerId ?? null;
  return {
    schemaVersion: 1,
    revision: frame.revision,
    point: { ...point },
    cell: inspection.cell,
    ownerId,
    ownerRef: cellDebugRefFor(ownerId),
    hit: inspection.hit,
    hitStack: [...inspection.hitStack],
    hitRefs: inspection.hitStack.map((id) => cellDebugReference(id).ref),
    scene: {
      layoutBounds: owner?.layoutBounds ? { ...owner.layoutBounds } : null,
      paintBounds: owner?.paintBounds ? { ...owner.paintBounds } : null,
      hitBounds: owner?.hitBounds ? { ...owner.hitBounds } : null,
      contentClip: owner?.contentClip ? { ...owner.contentClip } : null,
      layer: owner?.layer ?? null,
    },
    semantic: semanticSnapshot(frame, semanticId),
    semanticRef: cellDebugRefFor(semanticId),
    focusedId: inspection.focusedId,
    ownerFocused: inspection.ownerFocused,
  };
};

export const inspectCellWidget = (frame: FrameSnapshot, widgetId: WidgetId): CellInspectionSnapshot | null => {
  const entry = frame.scene.entries.get(widgetId);
  const semantic = frame.semantics.nodes.get(widgetId);
  const bounds = entry?.hitBounds ?? semantic?.bounds;
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return null;
  return inspectCellFrame(frame, { x: bounds.x, y: bounds.y });
};

export type CellVerificationIssue = Readonly<{
  code: string;
  severity: "error" | "warning";
  targetId?: WidgetId;
  expected?: unknown;
  actual?: unknown;
  evidence?: unknown;
  hint?: string;
}>;

export type CellInteractionTraceEvent = Readonly<{
  type: "pointer" | "gesture" | "command";
  phase?: string;
  pointerId?: number;
  targetId?: WidgetId;
  point?: CellPoint;
  commandType?: string;
  frameRevision?: number | null;
}>;

const finiteRect = (rect: CellRect) =>
  [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)
  && rect.width >= 0 && rect.height >= 0;

export const verifyCellFrame = (frame: FrameSnapshot): readonly CellVerificationIssue[] => {
  const issues: CellVerificationIssue[] = [];
  const { viewport, overlayViewport } = frame.scene;
  if (overlayViewport.width < viewport.width || overlayViewport.height < viewport.height) {
    issues.push({
      code: "overlay-viewport-too-small",
      severity: "error",
      expected: { width: viewport.width, height: viewport.height },
      actual: { width: overlayViewport.width, height: overlayViewport.height },
      hint: "overlayViewport must contain the base viewport",
    });
  }
  for (const entry of frame.scene.entries.values()) {
    for (const [name, rect] of [["layoutBounds", entry.layoutBounds], ["paintBounds", entry.paintBounds], ["hitBounds", entry.hitBounds]] as const) {
      if (!finiteRect(rect)) issues.push({
        code: "invalid-scene-rect",
        severity: "error",
        targetId: entry.id,
        evidence: { name, rect },
        hint: "scene rectangles must be finite and non-negative",
      });
    }
  }
  if (frame.baseBuffer.width !== viewport.width || frame.baseBuffer.height !== viewport.height) {
    issues.push({
      code: "base-buffer-viewport-mismatch",
      severity: "error",
      expected: { width: viewport.width, height: viewport.height },
      actual: { width: frame.baseBuffer.width, height: frame.baseBuffer.height },
      hint: "base buffer dimensions must match the committed Cell viewport",
    });
  }
  for (const plane of frame.overlayPlanes) {
    const right = plane.bounds.x + plane.bounds.width;
    const bottom = plane.bounds.y + plane.bounds.height;
    if (plane.bounds.x < 0 || plane.bounds.y < 0 || right > overlayViewport.width || bottom > overlayViewport.height) {
      issues.push({
        code: "overlay-plane-out-of-bounds",
        severity: "error",
        targetId: plane.rootId,
        expected: { width: overlayViewport.width, height: overlayViewport.height },
        actual: plane.bounds,
        hint: "overlay planes must remain inside overlayViewport",
      });
    }
  }
  if (frame.semantics.focusedId && !frame.semantics.nodes.has(frame.semantics.focusedId)) {
    issues.push({
      code: "focused-semantic-missing",
      severity: "error",
      targetId: frame.semantics.focusedId,
      hint: "focusedId must reference a semantic node in the committed frame",
    });
  }
  for (const node of frame.semantics.nodes.values()) {
    if (node.semanticParentId && !frame.semantics.nodes.has(node.semanticParentId)) {
      issues.push({
        code: "semantic-parent-missing",
        severity: "warning",
        targetId: node.id,
        actual: node.semanticParentId,
        hint: "semantic parent should exist in the same snapshot",
      });
    }
    if (node.bounds && !finiteRect(node.bounds)) issues.push({
      code: "invalid-semantic-rect",
      severity: "error",
      targetId: node.id,
      evidence: node.bounds,
      hint: "semantic bounds must be finite and non-negative",
    });
  }
  for (let y = 0; y < frame.buffer.height; y += 1) {
    for (let x = 0; x < frame.buffer.width; x += 1) {
      const cell = frame.buffer.get(x, y);
      if (!cell?.continuation) continue;
      const lead = x > 0 ? frame.buffer.get(x - 1, y) : undefined;
      if (!lead || !lead.width || !lead.ownerId || lead.ownerId !== cell.ownerId) {
        issues.push({
          code: "wide-cell-corruption",
          severity: "error",
          targetId: cell.ownerId ?? undefined,
          evidence: { x, y, cell, lead },
          hint: "continuation cells must follow their wide-glyph lead cell",
        });
      }
    }
  }
  return issues;
};
