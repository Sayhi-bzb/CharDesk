import { resolveCellFeedback, type CellFeedbackConfig } from "./feedback.js";
import { isFocusableKind, isPrimitiveControlKind } from "./widget-capabilities.js";
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
import { classifyWidgetChange } from "./widget-change.js";
import { createCellTextLayout } from "./text.js";
import { resolveCellUiTheme, type CellUiTheme, type CellUiThemeInput } from "./theme.js";
import { resolveCellUiPresentation, type CellUiPresentation } from "./presentation.js";
import {
  resolveCellUiRecipe,
  type CellUiRecipe,
} from "./recipe.js";
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
  LayoutSnapshot,
  SceneSnapshot,
  WidgetId,
  WidgetKind,
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

type RailInsets = Readonly<{ right: number; bottom: number }>;

const ownsFlowingScrollContent = (kind: WidgetKind): boolean =>
  kind === "scroll-area" || kind === "select-content" || kind === "combobox-content";

const layoutWithRailInsets = (
  tree: WidgetTree,
  viewport: CellSize,
  overlayViewport: CellRect,
  engine: LayoutEngine,
): Readonly<{ layout: LayoutSnapshot; scene: SceneSnapshot }> => {
  const owners = [...tree.nodes.values()].filter((node) => ownsFlowingScrollContent(node.kind));
  const reserved = new Map<WidgetId, RailInsets>();
  for (let pass = 0; pass <= owners.length * 2; pass += 1) {
    const layoutTree: WidgetTree = reserved.size === 0 ? tree : {
      ...tree,
      nodes: new Map([...tree.nodes].map(([id, node]) => {
        const rail = reserved.get(id);
        return [id, !rail ? node : {
          ...node,
          style: {
            ...node.style,
            paddingRight: (node.style.paddingRight ?? node.style.padding ?? 0) + rail.right,
            paddingBottom: (node.style.paddingBottom ?? node.style.padding ?? 0) + rail.bottom,
          },
        }];
      })),
    };
    const rawLayout = engine.compute(layoutTree, viewport);
    let layout: LayoutSnapshot = rawLayout;
    if (reserved.size > 0) {
      const entries = new Map(rawLayout.entries);
      for (const [id, railInsets] of reserved) {
        const entry = entries.get(id);
        if (entry) entries.set(id, { ...entry, railInsets });
      }
      layout = { ...rawLayout, entries };
    }
    const scene = composeScene(tree, layout, overlayViewport);
    let changed = false;
    for (const owner of owners) {
      const metrics = scene.entries.get(owner.id)?.scrollMetrics;
      const previous = reserved.get(owner.id);
      const right = metrics?.verticalTrack ? 1 : 0;
      const bottom = metrics?.horizontalTrack ? 1 : 0;
      if (right === (previous?.right ?? 0) && bottom === (previous?.bottom ?? 0)) continue;
      if (right || bottom) reserved.set(owner.id, { right, bottom });
      else reserved.delete(owner.id);
      changed = true;
    }
    if (!changed) return { layout, scene };
  }
  throw new Error("Scroll rail layout did not converge.");
};

export type CellUiRuntimeOptions = Readonly<{
  viewport: CellSize;
  overlayViewport?: CellSize;
  onFrame?: (frame: FrameSnapshot) => void;
  layoutEngine?: LayoutEngine;
  theme?: CellUiThemeInput;
  recipe?: CellUiRecipe;
  presentation?: CellUiPresentation;
  feedback?: Partial<CellFeedbackConfig>;
}>;

export class CellUiRuntime {
  readonly #layout: LayoutEngine;
  #viewport: CellSize;
  #overlayViewport: CellSize;
  readonly #onFrame: ((frame: FrameSnapshot) => void) | undefined;
  #theme: CellUiTheme;
  #recipe: CellUiRecipe;
  #presentation: CellUiPresentation;
  #feedback: CellFeedbackConfig;

  get feedback(): CellFeedbackConfig { return this.#feedback; }

  setFeedback(feedback?: Partial<CellFeedbackConfig>): void {
    this.#feedback = resolveCellFeedback(feedback);
  }
  #appearanceDirty = false;
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
    this.#recipe = resolveCellUiRecipe(options.recipe);
    this.#presentation = resolveCellUiPresentation(options.presentation);
    this.#feedback = resolveCellFeedback(options.feedback);
  }

  render(
    element: ReactElement<RootProps> | null,
    state: Readonly<{
      focusedId?: string | null;
      activeFocusId?: string | null;
      focusVisible?: boolean;
      hoveredId?: string | null;
      manipulatingIds?: ReadonlySet<string>;
      pressActiveId?: string | null;
      activationFlashId?: string | null;
      activationTargetId?: string | null;
      confirmation?: FrameSnapshot["confirmation"];
      colors?: FrameSnapshot["colors"];
      animationTimeMs?: number;
      tooltipTargetId?: string | null;
      resolveFocusedId?: (tree: WidgetTree) => string | null;
    }> = {}
  ): FrameSnapshot {
    if (this.#disposed) throw new Error("CellUiRuntime has been disposed.");
    const descriptor = createWidgetDescriptor(element, this.#recipe, this.#presentation);
    const reconciliation = reconcileWidgetTree(this.#tree, descriptor);
    const focusedId = state.resolveFocusedId
      ? state.resolveFocusedId(reconciliation.tree)
      : state.focusedId
        ?? [...reconciliation.tree.nodes.values()].find((node) => node.focused)?.id
        ?? null;
    const defaultActiveFocusId = (state.focusVisible ?? focusedId !== null)
      ? focusedId
      : null;
    const activeFocusId = state.activeFocusId === undefined
      ? defaultActiveFocusId
      : state.activeFocusId;
    const focusActive = focusedId !== null && activeFocusId === focusedId;
    const focusVisible = state.focusVisible ?? focusActive;
    const hoveredNode = state.hoveredId ? reconciliation.tree.nodes.get(state.hoveredId) : undefined;
    const hoveredId = focusVisible && focusedId !== null && hoveredNode && isPrimitiveControlKind(hoveredNode.kind)
      ? null : state.hoveredId;
    const animationTimeMs = typeof state.animationTimeMs === "number" && Number.isFinite(state.animationTimeMs)
      ? Math.max(0, state.animationTimeMs)
      : 0;
    const tooltipTarget = state.tooltipTargetId
      ? reconciliation.tree.nodes.get(state.tooltipTargetId)
      : undefined;
    const activeTooltipTargetId = tooltipTarget && isFocusableKind(tooltipTarget.kind) && !tooltipTarget.disabled
      ? tooltipTarget.id : null;
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
          && node.animationTimeMs === (node.kind === "spinner" || node.progress?.value === null ? animationTimeMs : 0)
          && node.tooltipOpen === (node.kind === "tooltip" && node.tooltipTargetId === activeTooltipTargetId)
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
              animationTimeMs: node.kind === "spinner" || node.progress?.value === null ? animationTimeMs : 0,
              tooltipOpen: node.kind === "tooltip" && node.tooltipTargetId === activeTooltipTargetId,
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
    let paintDirty = structuralDirty || this.#appearanceDirty;
    let semanticsDirty = structuralDirty;
    const paintIds = new Set<WidgetId>();
    const geometryIds = new Set<WidgetId>();
    for (const [id, node] of tree.nodes) {
      const before = previous?.tree.nodes.get(id);
      if (!before) {
        paintIds.add(id);
        continue;
      }
      const change = classifyWidgetChange(before, node);
      if (change.layout) layoutDirty = true;
      if (change.geometry) {
        geometryDirty = true;
        geometryIds.add(id);
      }
      if (change.paint) {
        paintDirty = true;
        paintIds.add(id);
      }
      if (change.semantics) semanticsDirty = true;
    }
    if (layoutDirty) {
      geometryDirty = true;
      paintDirty = true;
      semanticsDirty = true;
    } else if (geometryDirty) {
      paintDirty = true;
      semanticsDirty = true;
    }
    const overlayRect = {
      x: 0,
      y: 0,
      width: this.#overlayViewport.width,
      height: this.#overlayViewport.height,
    };
    const computed = layoutDirty || !previous
      ? layoutWithRailInsets(tree, this.#viewport, overlayRect, this.#layout)
      : null;
    const layout = computed?.layout ?? previous!.layout;
    const scene = computed?.scene ?? (geometryDirty
      ? composeScene(tree, layout, overlayRect)
      : previous!.scene);
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
    const rawDirtyRegions = !previous || layoutDirty || this.#appearanceDirty
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
    this.#appearanceDirty = false;
    this.#tree = reconciliation.tree;
    this.#frame = frame;
    this.#onFrame?.(frame);
    return frame;
  }

  setTheme(theme?: CellUiThemeInput): void {
    if (this.#disposed) throw new Error("CellUiRuntime has been disposed.");
    const next = resolveCellUiTheme(theme);
    if (sameWidgetValue(this.#theme, next)) return;
    this.#theme = next;
    this.#appearanceDirty = true;
  }

  setRecipe(recipe?: CellUiRecipe): void {
    if (this.#disposed) throw new Error("CellUiRuntime has been disposed.");
    this.#recipe = resolveCellUiRecipe(recipe);
  }

  setPresentation(presentation?: CellUiPresentation): void {
    if (this.#disposed) throw new Error("CellUiRuntime has been disposed.");
    const next = resolveCellUiPresentation(presentation);
    if (next === this.#presentation) return;
    this.#presentation = next;
    this.#appearanceDirty = true;
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
