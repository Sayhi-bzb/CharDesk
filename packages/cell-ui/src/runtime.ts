import { resolveCellFeedback, type CellFeedbackConfig } from "./feedback.js";
import { isPrimitiveControlKind } from "./widget-capabilities.js";
import type { ReactElement } from "react";
import { intersectCellRects } from "@chardesk/cell-core";
import { YogaLayoutEngine, type LayoutEngine } from "./layout.js";
import { CellBuffer } from "./buffer.js";
import { paintScene } from "./paint.js";
import {
  createWidgetDescriptor,
  type RootProps,
} from "./react.js";
import { composeScene } from "./scene.js";
import { createSemanticSnapshot } from "./semantics.js";
import { reconcileWidgetTree, sameWidgetValue } from "./tree.js";
import { createCellTextLayout } from "./text.js";
import { resolveCellUiTheme, type CellUiTheme } from "./theme.js";
import {
  isPortalKind,
  supportsActivationFeedback,
  supportsManipulationFeedback,
  supportsPressFeedback,
} from "./widget-capabilities.js";
import type {
  CellRect,
  CellSize,
  FramePhase,
  FrameSnapshot,
  SceneSnapshot,
  WidgetId,
  WidgetNode,
  WidgetTree,
} from "./types.js";

const regionsFor = (
  ids: Iterable<WidgetId>,
  previous: SceneSnapshot | undefined,
  next: SceneSnapshot
): readonly CellRect[] => {
  const regions: CellRect[] = [];
  const keys = new Set<string>();
  for (const id of ids) {
    for (const entry of [previous?.entries.get(id), next.entries.get(id)]) {
      if (!entry) continue;
      const region = intersectCellRects(entry.paintBounds, next.overlayViewport);
      if (!region) continue;
      const key = `${region.x}:${region.y}:${region.width}:${region.height}`;
      if (!keys.has(key)) {
        keys.add(key);
        regions.push(region);
      }
    }
  }
  return regions;
};

const expandForWideCells = (
  regions: readonly CellRect[],
  viewport: CellRect
): readonly CellRect[] => regions.map((region) => {
  const left = Math.max(viewport.x, region.x - 1);
  const right = Math.min(viewport.x + viewport.width, region.x + region.width + 1);
  return { ...region, x: left, width: right - left };
});

const hasLayoutChange = (before: WidgetNode, after: WidgetNode) =>
  before.kind !== after.kind
  || before.parentId !== after.parentId
  || before.index !== after.index
  || before.text !== after.text
  || before.buttonVariant !== after.buttonVariant
  || before.buttonSize !== after.buttonSize
  || before.orientation !== after.orientation
  || !sameWidgetValue(before.style, after.style)
  || !sameWidgetValue(before.children, after.children);

const hasGeometryChange = (before: WidgetNode, after: WidgetNode) =>
  !sameWidgetValue(before.scrollOffset, after.scrollOffset)
  || (before.kind === "range-slider-thumb" && (
    before.sliderValue !== after.sliderValue
    || before.sliderMin !== after.sliderMin
    || before.sliderMax !== after.sliderMax
    || before.sliderStep !== after.sliderStep
  ))
  || before.textEditor?.value !== after.textEditor?.value
  || before.textEditor?.scrollX !== after.textEditor?.scrollX
  || before.textEditor?.scrollY !== after.textEditor?.scrollY
  || !sameWidgetValue(before.textEditor?.composition, after.textEditor?.composition)
  || !sameWidgetValue(before.overlayPosition, after.overlayPosition);

const hasPaintChange = (before: WidgetNode, after: WidgetNode) =>
  before.focused !== after.focused
  || before.focusActive !== after.focusActive
  || before.focusVisible !== after.focusVisible
  || before.hovered !== after.hovered
  || before.manipulating !== after.manipulating
  || before.pressActive !== after.pressActive
  || before.activationFlash !== after.activationFlash
  || before.confirming !== after.confirming
  || !sameWidgetValue(before.confirmation, after.confirmation)
  || before.selected !== after.selected
  || before.checked !== after.checked
  || before.pressed !== after.pressed
  || !sameWidgetValue(before.progress, after.progress)
  || before.buttonVariant !== after.buttonVariant
  || before.sliderValue !== after.sliderValue
  || before.sliderMin !== after.sliderMin
  || before.sliderMax !== after.sliderMax
  || before.expanded !== after.expanded
  || before.disabled !== after.disabled
  || !sameWidgetValue(before.textStyle, after.textStyle)
  || !sameWidgetValue(before.textEditor, after.textEditor);

const hasSemanticChange = (before: WidgetNode, after: WidgetNode) =>
  before.label !== after.label
  || before.disabled !== after.disabled
  || before.focused !== after.focused
  || before.selected !== after.selected
  || before.checked !== after.checked
  || before.pressed !== after.pressed
  || !sameWidgetValue(before.progress, after.progress)
  || before.sliderValue !== after.sliderValue
  || before.sliderMin !== after.sliderMin
  || before.sliderMax !== after.sliderMax
  || before.sliderValueText !== after.sliderValueText
  || before.expanded !== after.expanded
  || before.hasChildren !== after.hasChildren
  || before.level !== after.level
  || before.rowIndex !== after.rowIndex
  || before.columnIndex !== after.columnIndex
  || before.rowCount !== after.rowCount
  || before.columnCount !== after.columnCount
  || before.positionInSet !== after.positionInSet
  || before.setSize !== after.setSize
  || before.orientation !== after.orientation
  || before.controlsId !== after.controlsId
  || before.labelledById !== after.labelledById
  || before.readOnly !== after.readOnly
  || before.modal !== after.modal
  || before.text !== after.text
  || !sameWidgetValue(before.textEditor, after.textEditor);

export type CellUiRuntimeOptions = Readonly<{
  viewport: CellSize;
  overlayViewport?: CellSize;
  onFrame?: (frame: FrameSnapshot) => void;
  layoutEngine?: LayoutEngine;
  theme?: Partial<CellUiTheme>;
  feedback?: Partial<CellFeedbackConfig>;
}>;

export class CellUiRuntime {
  readonly #layout: LayoutEngine;
  #viewport: CellSize;
  #overlayViewport: CellSize;
  readonly #onFrame: ((frame: FrameSnapshot) => void) | undefined;
  #theme: CellUiTheme;
  #feedback: CellFeedbackConfig;

  get feedback(): CellFeedbackConfig { return this.#feedback; }

  setFeedback(feedback?: Partial<CellFeedbackConfig>): void {
    this.#feedback = resolveCellFeedback(feedback);
  }
  #themeDirty = false;
  #tree: WidgetTree | undefined;
  #frame: FrameSnapshot | undefined;
  #revision = 0;
  #disposed = false;

  constructor(options: CellUiRuntimeOptions) {
    const overlayViewport = options.overlayViewport ?? options.viewport;
    if (
      !Number.isInteger(overlayViewport.width)
      || !Number.isInteger(overlayViewport.height)
      || overlayViewport.width < options.viewport.width
      || overlayViewport.height < options.viewport.height
    ) throw new RangeError("CellUiRuntime overlay viewport must contain the base viewport.");
    this.#layout = options.layoutEngine ?? new YogaLayoutEngine();
    this.#viewport = { ...options.viewport };
    this.#overlayViewport = { ...overlayViewport };
    this.#onFrame = options.onFrame;
    this.#theme = resolveCellUiTheme(options.theme);
    this.#feedback = resolveCellFeedback(options.feedback);
  }

  render(
    element: ReactElement<RootProps> | null,
    state: Readonly<{
      focusedId?: string | null;
      focusActive?: boolean;
      focusVisible?: boolean;
      hoveredId?: string | null;
      manipulatingIds?: ReadonlySet<string>;
      pressActiveId?: string | null;
      activationFlashId?: string | null;
      activationTargetId?: string | null;
      confirmation?: FrameSnapshot["confirmation"];
      colors?: FrameSnapshot["colors"];
      resolveFocusedId?: (tree: WidgetTree) => string | null;
    }> = {}
  ): FrameSnapshot {
    if (this.#disposed) throw new Error("CellUiRuntime has been disposed.");
    const descriptor = createWidgetDescriptor(element);
    const reconciliation = reconcileWidgetTree(this.#tree, descriptor);
    const focusedId = state.resolveFocusedId?.(reconciliation.tree)
      ?? state.focusedId
      ?? [...reconciliation.tree.nodes.values()].find((node) => node.focused)?.id
      ?? null;
    const focusActive = state.focusActive ?? state.focusVisible ?? focusedId !== null;
    const focusVisible = state.focusVisible ?? focusActive;
    const hoveredNode = state.hoveredId ? reconciliation.tree.nodes.get(state.hoveredId) : undefined;
    const hoveredId = focusVisible && focusedId !== null && hoveredNode && isPrimitiveControlKind(hoveredNode.kind)
      ? null : state.hoveredId;
    const tree: WidgetTree = {
      rootId: reconciliation.tree.rootId,
      nodes: new Map([...reconciliation.tree.nodes].map(([id, node]) => [
        id,
        node.focused === (id === focusedId)
          && node.focusActive === (id === focusedId && focusActive)
          && node.focusVisible === (id === focusedId && focusVisible)
          && node.hovered === (id === hoveredId && !node.disabled)
          && node.manipulating === (state.manipulatingIds?.has(id) === true && supportsManipulationFeedback(node.kind) && !node.disabled)
          && node.pressActive === (id === state.pressActiveId && supportsPressFeedback(node.kind) && !node.disabled)
          && node.activationFlash === (id === state.activationFlashId && supportsActivationFeedback(node.kind) && !node.disabled)
          && node.confirming === (id === state.activationTargetId && !node.disabled)
          && sameWidgetValue(node.confirmation, id === state.confirmation?.targetId ? state.confirmation : undefined)
          ? node
          : {
              ...node,
              focused: id === focusedId,
              focusActive: id === focusedId && focusActive,
              focusVisible: id === focusedId && focusVisible,
              hovered: id === hoveredId && !node.disabled,
              manipulating: state.manipulatingIds?.has(id) === true && supportsManipulationFeedback(node.kind) && !node.disabled,
              pressActive: id === state.pressActiveId && supportsPressFeedback(node.kind) && !node.disabled,
              activationFlash: id === state.activationFlashId && supportsActivationFeedback(node.kind) && !node.disabled,
              confirming: id === state.activationTargetId && !node.disabled,
              confirmation: id === state.confirmation?.targetId ? state.confirmation : undefined,
            },
      ])),
    };
    const previous = this.#frame;
    const viewportDirty = !!previous && (
      previous.layout.viewport.width !== this.#viewport.width
      || previous.layout.viewport.height !== this.#viewport.height
      || previous.scene.overlayViewport.width !== this.#overlayViewport.width
      || previous.scene.overlayViewport.height !== this.#overlayViewport.height
    );
    const structuralDirty = !previous || reconciliation.mutations.some(
      ({ type }) => type === "mount" || type === "unmount" || type === "move"
    );
    let layoutDirty = structuralDirty || viewportDirty;
    let geometryDirty = structuralDirty;
    let paintDirty = structuralDirty || this.#themeDirty;
    let semanticsDirty = structuralDirty;
    const paintIds = new Set<WidgetId>();
    const geometryIds = new Set<WidgetId>();
    for (const [id, node] of tree.nodes) {
      const before = previous?.tree.nodes.get(id);
      if (!before) {
        paintIds.add(id);
        continue;
      }
      if (hasLayoutChange(before, node)) layoutDirty = true;
      if (hasGeometryChange(before, node)) {
        geometryDirty = true;
        geometryIds.add(id);
      }
      if (hasPaintChange(before, node)) {
        paintDirty = true;
        paintIds.add(id);
      }
      if (hasSemanticChange(before, node)) semanticsDirty = true;
    }
    if (layoutDirty) {
      geometryDirty = true;
      paintDirty = true;
      semanticsDirty = true;
    } else if (geometryDirty) {
      paintDirty = true;
      semanticsDirty = true;
    }
    const layout = layoutDirty || !previous
      ? this.#layout.compute(tree, this.#viewport)
      : previous.layout;
    const scene = geometryDirty || !previous
      ? composeScene(tree, layout, {
          x: 0,
          y: 0,
          width: this.#overlayViewport.width,
          height: this.#overlayViewport.height,
        })
      : previous.scene;
    const textLayouts = paintDirty || !previous
      ? new Map([...tree.nodes.values()].flatMap((node) => {
          if (!node.textEditor) return [];
          const sceneEntry = scene.entries.get(node.id);
          const layoutEntry = layout.entries.get(node.id);
          return sceneEntry && layoutEntry
            ? [[node.id, createCellTextLayout(
                node.id,
                sceneEntry.layoutBounds,
                sceneEntry.scrollMetrics?.viewport ?? sceneEntry.contentBounds,
                node.textEditor
              )] as const]
            : [];
        }))
      : previous.textLayouts;
    const revision = this.#revision + 1;
    const semantics = semanticsDirty || !previous
      ? createSemanticSnapshot(tree, scene, revision, focusedId)
      : { ...previous.semantics, revision };
    const rawDirtyRegions = !previous || layoutDirty || this.#themeDirty
      ? [scene.overlayViewport]
      : geometryDirty
        ? regionsFor(geometryIds, previous.scene, scene)
        : paintDirty
          ? regionsFor(paintIds, previous.scene, scene)
          : [];
    const dirtyRegions = expandForWideCells(rawDirtyRegions, scene.overlayViewport);
    const hasOverlayLayer = scene.paintList.some((id) => scene.entries.get(id)?.layer !== 0);
    const baseBuffer = paintDirty || !previous
      ? paintScene(tree, scene, textLayouts, this.#theme, {
          previous: previous?.baseBuffer,
          dirtyRegions,
          viewport: scene.viewport,
          layer: "base",
        })
      : previous.baseBuffer;
    let overlayBuffer: CellBuffer;
    if (hasOverlayLayer && (paintDirty || !previous)) {
      overlayBuffer = paintScene(tree, scene, textLayouts, this.#theme, {
        previous: previous?.overlayBuffer,
        dirtyRegions,
        viewport: scene.overlayViewport,
        layer: "overlay",
      });
    } else if (hasOverlayLayer) {
      overlayBuffer = previous!.overlayBuffer;
    } else if (
      previous
      && previous.overlayPlanes.length === 0
      && previous.overlayBuffer.width === scene.overlayViewport.width
      && previous.overlayBuffer.height === scene.overlayViewport.height
    ) {
      overlayBuffer = previous.overlayBuffer;
    } else {
      overlayBuffer = new CellBuffer(scene.overlayViewport);
    }
    const canUseBaseProjection = !hasOverlayLayer
      && scene.viewport.width === scene.overlayViewport.width
      && scene.viewport.height === scene.overlayViewport.height;
    const buffer = canUseBaseProjection
      ? baseBuffer
      : paintDirty || !previous
        ? new CellBuffer({
          width: scene.overlayViewport.width,
          height: scene.overlayViewport.height,
        })
        : previous.buffer;
    if (!canUseBaseProjection && (paintDirty || !previous)) {
      buffer.overlay(baseBuffer);
      buffer.overlay(overlayBuffer);
    }
    const overlayPlanes = [...tree.nodes.values()]
      .filter((node) => isPortalKind(node.kind))
      .flatMap((node) => {
        const entry = scene.entries.get(node.id);
        return entry && entry.paintVisible
          ? [{
              rootId: node.id,
              bounds: entry.outerClip,
              layer: entry.layer,
              paintOrder: entry.paintOrder,
            }]
          : [];
      })
      .sort((left, right) => left.layer - right.layer || left.paintOrder - right.paintOrder);
    const phases: FramePhase[] = [
      ...(structuralDirty ? ["tree" as const] : []),
      ...(layoutDirty ? ["layout" as const] : []),
      ...(geometryDirty ? ["geometry" as const] : []),
      ...(paintDirty ? ["paint" as const] : []),
      ...(semanticsDirty ? ["semantics" as const] : []),
      ...(dirtyRegions.length > 0 ? ["present" as const] : []),
    ];
    const frame: FrameSnapshot = {
      colors: state.colors ?? { color: this.#theme.foreground, backgroundColor: this.#theme.background },
      confirmation: state.confirmation,
      revision,
      tree,
      layout,
      scene,
      semantics,
      textLayouts,
      baseBuffer,
      overlayBuffer,
      buffer,
      overlayPlanes,
      mutations: reconciliation.mutations,
      invalidation: {
        phases,
        dirtyRegions,
        work: {
          layout: layoutDirty ? "computed" : "reused",
          geometry: geometryDirty ? "computed" : "reused",
          paint: paintDirty ? "computed" : "reused",
          semantics: semanticsDirty ? "computed" : "reused",
          present: dirtyRegions.length > 0 ? "required" : "skipped",
        },
      },
    };
    this.#revision = frame.revision;
    this.#themeDirty = false;
    this.#tree = reconciliation.tree;
    this.#frame = frame;
    this.#onFrame?.(frame);
    return frame;
  }

  setTheme(theme?: Partial<CellUiTheme>): void {
    if (this.#disposed) throw new Error("CellUiRuntime has been disposed.");
    const next = resolveCellUiTheme(theme);
    if (sameWidgetValue(this.#theme, next)) return;
    this.#theme = next;
    this.#themeDirty = true;
  }

  resize(viewport: CellSize, overlayViewport: CellSize = viewport): void {
    if (this.#disposed) throw new Error("CellUiRuntime has been disposed.");
    if (
      !Number.isInteger(viewport.width)
      || !Number.isInteger(viewport.height)
      || viewport.width < 0
      || viewport.height < 0
    ) throw new RangeError("CellUiRuntime viewport must use non-negative integer Cells.");
    if (
      !Number.isInteger(overlayViewport.width)
      || !Number.isInteger(overlayViewport.height)
      || overlayViewport.width < viewport.width
      || overlayViewport.height < viewport.height
    ) throw new RangeError("CellUiRuntime overlay viewport must contain the base viewport.");
    this.#viewport = { ...viewport };
    this.#overlayViewport = { ...overlayViewport };
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#layout.dispose();
    this.#disposed = true;
  }
}
