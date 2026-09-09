import { hitTest } from "./scene.js";
import { gridEntry, gridOwnerId, gridTarget } from "./grid-navigation.js";
import { scrollCommandForOffset, scrollOffsetFor } from "./scroll.js";
import type {
  CellPoint,
  FrameSnapshot,
  SemanticAction,
  SemanticNode,
  WidgetId,
  WidgetNode,
  WidgetTree,
} from "./types.js";
import type { CellTextCommand } from "./text.js";
import type { KeyInput } from "@chardesk/keyboard";
import { acceptsWidgetKeyInput } from "./keyboard.js";
import {
  isActionableKind,
  isCollectionItemKind,
  isDismissableScope,
  isFocusScope,
  isFocusableKind,
} from "./widget-capabilities.js";
import {
  cellRangeSliderThumbIndexAtCoordinate,
  constrainCellRangeSliderThumbValue,
  resolveCellRangeSliderThumbContext,
  resolveCellSliderRange,
  stepCellSliderValue,
} from "./slider.js";

export type EngineInput =
  | KeyInput
  | Readonly<{
      type: "pointer";
      phase: "down" | "move" | "up" | "cancel";
      point: CellPoint;
      button: number;
    }>
  | Readonly<{ type: "wheel"; point: CellPoint; deltaX: number; deltaY: number }>
  | Readonly<{ type: "semantic"; targetId: WidgetId; action: SemanticAction }>;

export type WidgetCommand =
  | Readonly<{
      type: "focus";
      targetId: WidgetId;
      reveal?: Readonly<{ targetId: WidgetId; scrollX: number; scrollY: number }>;
    }>
  | Readonly<{ type: "activate"; targetId: WidgetId }>
  | Readonly<{ type: "select-radio"; targetId: WidgetId }>
  | Readonly<{ type: "dismiss"; targetId: WidgetId }>
  | Readonly<{ type: "set-expanded"; targetId: WidgetId; expanded: boolean }>
  | Readonly<{ type: "set-value"; targetId: WidgetId; value: number }>
  | Readonly<{ type: "text"; targetId: WidgetId; command: CellTextCommand }>
  | Readonly<{
      type: "scroll";
      targetId: WidgetId;
      scrollX: number;
      scrollY: number;
      page?: Readonly<{ direction: -1 | 1; cellCount: number }>;
    }>;

const isDescendantOf = (
  tree: WidgetTree,
  id: WidgetId,
  ancestorId: WidgetId
): boolean => {
  let current: WidgetId | null = id;
  while (current) {
    if (current === ancestorId) return true;
    current = tree.nodes.get(current)?.parentId ?? null;
  }
  return false;
};

const scopeIds = (
  tree: WidgetTree,
  includes: (node: WidgetNode) => boolean
): readonly WidgetId[] =>
  [...tree.nodes.values()]
    .filter(includes)
    .map(({ id }) => id);

const focusScopeIds = (tree: WidgetTree): readonly WidgetId[] =>
  scopeIds(tree, isFocusScope);

export const topFocusScopeId = (tree: WidgetTree): WidgetId | null =>
  focusScopeIds(tree).at(-1) ?? null;

export const topDismissableScopeId = (tree: WidgetTree): WidgetId | null =>
  scopeIds(tree, isDismissableScope).at(-1) ?? null;

export const dismissCommandForFocusExit = (
  frame: FrameSnapshot
): WidgetCommand | null => {
  const scopeId = topDismissableScopeId(frame.tree);
  return scopeId ? { type: "dismiss", targetId: scopeId } : null;
};

const focusableWidgets = (
  tree: WidgetTree,
  scopeId: WidgetId | null = null
): readonly WidgetNode[] =>
  [...tree.nodes.values()].filter(
    (node) => isFocusableKind(node.kind)
      && !node.disabled
      && (!scopeId || isDescendantOf(tree, node.id, scopeId))
  );

const ancestorOfKind = (
  tree: WidgetTree,
  fromId: WidgetId | undefined,
  kind: WidgetNode["kind"]
): WidgetNode | undefined => {
  let id = fromId;
  while (id) {
    const node = tree.nodes.get(id);
    if (!node) return undefined;
    if (node.kind === kind) return node;
    id = node.parentId ?? undefined;
  }
  return undefined;
};

const scrollAncestor = (
  frame: FrameSnapshot,
  fromId: WidgetId | undefined
): WidgetNode | undefined => {
  let id = fromId
    ? frame.tree.nodes.get(fromId)?.parentId ?? undefined
    : undefined;
  while (id) {
    const node = frame.tree.nodes.get(id);
    if (!node) return undefined;
    if (frame.scene.entries.get(id)?.scrollMetrics) return node;
    id = node.parentId ?? undefined;
  }
  return undefined;
};

const collectionOwner = (
  tree: WidgetTree,
  fromId: WidgetId | null
): WidgetNode | undefined => {
  let id = fromId;
  while (id) {
    const node = tree.nodes.get(id);
    if (!node) return undefined;
    if (
      node.kind === "menu"
      || node.kind === "tree"
      || node.kind === "tabs"
      || node.kind === "grid"
      || node.kind === "select-content"
    ) return node;
    id = node.parentId;
  }
  return undefined;
};

const interactiveItem = (
  tree: WidgetTree,
  fromId: WidgetId | undefined
): WidgetNode | undefined => {
  let id = fromId;
  while (id) {
    const node = tree.nodes.get(id);
    if (!node) return undefined;
    if (isActionableKind(node.kind)) return node;
    id = node.parentId ?? undefined;
  }
  return undefined;
};

export const primarySemanticAction = (node: SemanticNode): SemanticAction | null => {
  if (node.actions.includes("collapse")) return "collapse";
  if (node.actions.includes("expand")) return "expand";
  return node.actions.includes("activate") ? "activate" : null;
};

const commandForSemanticAction = (
  frame: FrameSnapshot,
  targetId: WidgetId,
  action: SemanticAction,
  focusScopeId: WidgetId | null
): WidgetCommand | null => {
  const node = frame.tree.nodes.get(targetId);
  const semantic = frame.semantics.nodes.get(targetId);
  if (
    !node
    || !semantic?.actions.includes(action)
    || node.disabled
    || (focusScopeId !== null && !isDescendantOf(frame.tree, node.id, focusScopeId))
  ) return null;
  if (action === "expand" || action === "collapse") {
    return (node.kind === "tree-item" && node.hasChildren) || node.kind === "select-trigger"
      ? {
          type: "set-expanded",
          targetId: node.id,
          expanded: action === "expand",
        }
      : null;
  }
  return action === "activate"
    ? { type: "activate", targetId }
    : focusCommand(frame, targetId);
};

const collectionItems = (tree: WidgetTree, ownerId: WidgetId) =>
  focusableWidgets(tree).filter(
    (node) => isCollectionItemKind(node.kind) && isDescendantOf(tree, node.id, ownerId)
  );

const moveInCollection = (
  items: readonly WidgetNode[],
  focusedId: WidgetId | null,
  delta: -1 | 1,
  wrap = false
) => {
  if (items.length === 0) return null;
  const current = items.findIndex(({ id }) => id === focusedId);
  if (current < 0) return delta > 0 ? items[0]!.id : items.at(-1)!.id;
  const candidate = current + delta;
  if (wrap) return items[(candidate + items.length) % items.length]!.id;
  return items[Math.max(0, Math.min(items.length - 1, candidate))]!.id;
};

export class FocusManager {
  #focusedId: WidgetId | null = null;
  #focusedGridId: WidgetId | null = null;
  readonly #gridEntries = new Map<WidgetId, WidgetId>();
  #treeAncestors: WidgetId[] = [];
  #scopes: Array<Readonly<{ id: WidgetId; restoreId: WidgetId | null }>> = [];

  get focusedId(): WidgetId | null {
    return this.#focusedId;
  }

  sync(tree: WidgetTree, preferredId?: WidgetId | null): void {
    const nextScopeIds = focusScopeIds(tree);
    let shared = 0;
    while (
      shared < this.#scopes.length
      && shared < nextScopeIds.length
      && this.#scopes[shared]?.id === nextScopeIds[shared]
    ) shared += 1;

    let restoreId: WidgetId | null = null;
    for (let index = this.#scopes.length - 1; index >= shared; index -= 1) {
      restoreId = this.#scopes[index]?.restoreId ?? restoreId;
    }
    this.#scopes.length = shared;
    for (let index = shared; index < nextScopeIds.length; index += 1) {
      this.#scopes.push({
        id: nextScopeIds[index]!,
        restoreId: this.#focusedId,
      });
      this.#focusedId = null;
    }

    const scopeId = this.#scopes.at(-1)?.id ?? null;
    const enabled = focusableWidgets(tree, scopeId);
    for (const id of this.#gridEntries.keys()) if (tree.nodes.get(id)?.kind !== "grid") this.#gridEntries.delete(id);
    const requested = preferredId
      ? enabled.find(({ id }) => id === preferredId)?.id
      : undefined;
    const retained = this.#focusedId
      ? enabled.find(({ id }) => id === this.#focusedId)?.id
      : undefined;
    const restored = restoreId
      ? enabled.find(({ id }) => id === restoreId)?.id
      : undefined;
    this.#focusedId = requested
      ?? retained
      ?? (this.#focusedGridId ? gridEntry(enabled.filter((item) => gridOwnerId(tree, item.id) === this.#focusedGridId),
        this.#gridEntries.get(this.#focusedGridId))?.id : undefined)
      ?? this.#treeAncestors.find((id) => enabled.some((item) => item.id === id))
      ?? restored
      ?? (scopeId ? enabled[0]?.id : null)
      ?? null;
    this.#focusedGridId = this.#focusedId && tree.nodes.get(this.#focusedId)?.kind === "grid-cell"
      ? gridOwnerId(tree, this.#focusedId) : null;
    if (this.#focusedGridId && this.#focusedId) this.#gridEntries.set(this.#focusedGridId, this.#focusedId);
    this.#treeAncestors = [];
    let ancestor = tree.nodes.get(this.#focusedId ?? "")?.parentItemId;
    while (ancestor) {
      this.#treeAncestors.push(ancestor);
      ancestor = tree.nodes.get(ancestor)?.parentItemId;
    }
  }

  first(tree: WidgetTree): WidgetId | null {
    return this.tabStops(tree)[0]?.id ?? null;
  }

  private tabStops(tree: WidgetTree): WidgetNode[] {
    const items = focusableWidgets(tree, this.#scopes.at(-1)?.id ?? null);
    const stops: WidgetNode[] = [];
    const groups = new Set<WidgetId | null>();
    for (const item of items) {
      if (item.kind === "grid-cell") {
        const gridId = gridOwnerId(tree, item.id);
        if (gridId) {
          if (groups.has(gridId)) continue;
          groups.add(gridId);
          const entry = gridEntry(items.filter((cell) => gridOwnerId(tree, cell.id) === gridId), this.#gridEntries.get(gridId));
          if (entry) stops.push(entry);
          continue;
        }
      }
      if (item.kind !== "radio-item") {
        stops.push(item);
        continue;
      }
      if (groups.has(item.parentId)) continue;
      groups.add(item.parentId);
      stops.push(items.find((candidate) => candidate.parentId === item.parentId && candidate.checked) ?? item);
    }
    return stops;
  }

  tab(tree: WidgetTree, delta: -1 | 1): WidgetId | null {
    const stops = this.tabStops(tree);
    const current = tree.nodes.get(this.#focusedId ?? "");
    const index = stops.findIndex((item) => item.id === current?.id
      || (current?.kind === "grid-cell" && item.kind === "grid-cell" && gridOwnerId(tree, item.id) === gridOwnerId(tree, current.id))
      || (current?.kind === "radio-item" && item.kind === "radio-item" && item.parentId === current.parentId));
    return stops[index < 0 ? delta > 0 ? 0 : stops.length - 1 : index + delta]?.id ?? null;
  }

  move(tree: WidgetTree, delta: -1 | 1): WidgetId | null {
    const items = focusableWidgets(tree, this.#scopes.at(-1)?.id ?? null);
    if (items.length === 0) return null;
    const index = items.findIndex(({ id }) => id === this.#focusedId);
    const next = index < 0
      ? (delta > 0 ? 0 : items.length - 1)
      : Math.max(0, Math.min(items.length - 1, index + delta));
    return items[next]?.id ?? null;
  }

  apply(command: WidgetCommand): void {
    if (
      command.type === "focus"
      || command.type === "activate"
      || command.type === "select-radio"
      || command.type === "set-value"
      || command.type === "text"
    ) {
      this.#focusedId = command.targetId;
    }
  }
}

export const getScrollRange = (
  frame: FrameSnapshot,
  scrollId: WidgetId
): Readonly<{
  x: Readonly<{ min: 0; max: number }>;
  y: Readonly<{ min: 0; max: number }>;
}> => {
  const node = frame.tree.nodes.get(scrollId);
  const metrics = frame.scene.entries.get(scrollId)?.scrollMetrics;
  if (!node || !metrics) {
    return { x: { min: 0, max: 0 }, y: { min: 0, max: 0 } };
  }
  return {
    x: { min: 0, max: metrics.maxOffset.x },
    y: { min: 0, max: metrics.maxOffset.y },
  };
};

export const textEditorAtPoint = (
  frame: FrameSnapshot,
  point: CellPoint
): WidgetNode | undefined => {
  const hit = hitTest(frame.scene, point)[0];
  const input = ancestorOfKind(frame.tree, hit, "text-input");
  return input ?? ancestorOfKind(frame.tree, hit, "text-area");
};

export const resolveWheelInput = (
  frame: FrameSnapshot,
  input: Extract<EngineInput, { type: "wheel" }>
): Readonly<{ consumed: boolean; command: WidgetCommand | null }> => {
  const hit = hitTest(frame.scene, input.point)[0];
  const scopeId = topFocusScopeId(frame.tree);
  if (scopeId && (!hit || !isDescendantOf(frame.tree, hit, scopeId))) {
    return { consumed: false, command: null };
  }
  let scroll = hit ? frame.tree.nodes.get(hit) : undefined;
  while (scroll) {
    if (scopeId && !isDescendantOf(frame.tree, scroll.id, scopeId)) break;
    const range = getScrollRange(frame, scroll.id);
    if (!scroll.disabled && (range.x.max > range.x.min || range.y.max > range.y.min)) {
      const offset = scrollOffsetFor(scroll);
      return {
        consumed: true,
        command: scrollCommandForOffset(frame, scroll.id, { x: offset.x + Math.sign(input.deltaX), y: offset.y + Math.sign(input.deltaY) }),
      };
    }
    scroll = scroll.parentId ? frame.tree.nodes.get(scroll.parentId) : undefined;
  }
  return { consumed: false, command: null };
};

const scrollCommand = (
  frame: FrameSnapshot,
  targetId: WidgetId | undefined,
  delta: CellPoint,
  page?: Readonly<{ direction: -1 | 1; cellCount: number }>
): WidgetCommand | null => {
  const scroll = scrollAncestor(frame, targetId);
  if (!scroll) return null;
  const range = getScrollRange(frame, scroll.id);
  const scrollX = Math.max(range.x.min, Math.min(range.x.max, scroll.scrollOffset.x + delta.x));
  const scrollY = Math.max(range.y.min, Math.min(range.y.max, scroll.scrollOffset.y + delta.y));
  return scrollX === scroll.scrollOffset.x && scrollY === scroll.scrollOffset.y && !page
    ? null
    : {
        type: "scroll",
        targetId: scroll.id,
        scrollX,
        scrollY,
        ...(page ? { page } : {}),
      };
};

const focusCommand = (
  frame: FrameSnapshot,
  targetId: WidgetId
): WidgetCommand => {
  const scroll = scrollAncestor(frame, targetId);
  const target = frame.scene.entries.get(targetId);
  const viewport = scroll ? frame.scene.entries.get(scroll.id) : undefined;
  if (!scroll || !target || !viewport) return { type: "focus", targetId };
  const visible = viewport.scrollMetrics?.viewport ?? viewport.contentBounds;
  const top = visible.y;
  const left = visible.x;
  const bottom = visible.y + visible.height;
  const right = visible.x + visible.width;
  const deltaY = target.layoutBounds.y < top
    ? target.layoutBounds.y - top
    : target.layoutBounds.y + target.layoutBounds.height > bottom
      ? target.layoutBounds.y + target.layoutBounds.height - bottom
      : 0;
  const deltaX = target.layoutBounds.x < left
    ? target.layoutBounds.x - left
    : target.layoutBounds.x + target.layoutBounds.width > right
      ? target.layoutBounds.x + target.layoutBounds.width - right
      : 0;
  if (deltaX === 0 && deltaY === 0) return { type: "focus", targetId };
  const range = getScrollRange(frame, scroll.id);
  const scrollX = Math.max(
    range.x.min,
    Math.min(range.x.max, scroll.scrollOffset.x + deltaX)
  );
  const scrollY = Math.max(
    range.y.min,
    Math.min(range.y.max, scroll.scrollOffset.y + deltaY)
  );
  if (scrollX === scroll.scrollOffset.x && scrollY === scroll.scrollOffset.y) {
    return { type: "focus", targetId };
  }
  return {
    type: "focus",
    targetId,
    reveal: { targetId: scroll.id, scrollX, scrollY },
  };
};

export const revealCommandForTarget = (
  frame: FrameSnapshot,
  targetId: WidgetId
): WidgetCommand | null => {
  const command = focusCommand(frame, targetId);
  return command.type === "focus" && command.reveal ? command : null;
};

export const commandForInput = (
  input: EngineInput,
  frame: FrameSnapshot,
  focus: FocusManager
): WidgetCommand | null => {
  const focusScopeId = topFocusScopeId(frame.tree);
  const dismissableScopeId = topDismissableScopeId(frame.tree);
  if (input.type === "semantic") {
    return commandForSemanticAction(frame, input.targetId, input.action, focusScopeId);
  }

  if (input.type === "pointer") {
    if (input.button !== 0 || input.phase === "move" || input.phase === "cancel") return null;
    const hit = hitTest(frame.scene, input.point)[0];
    if (
      dismissableScopeId
      && (!hit || !isDescendantOf(frame.tree, hit, dismissableScopeId))
    ) {
      return { type: "dismiss", targetId: dismissableScopeId };
    }
    if (focusScopeId && (!hit || !isDescendantOf(frame.tree, hit, focusScopeId))) return null;
    const rangeSlider = ancestorOfKind(frame.tree, hit, "range-slider");
    if (rangeSlider && !rangeSlider.disabled && input.phase === "down") {
      const entry = frame.scene.entries.get(rangeSlider.id);
      const thumbs = rangeSlider.children.map((id) => frame.tree.nodes.get(id)!);
      if (entry && thumbs.length === 2) {
        const focusedIndex = thumbs.findIndex((thumb) => thumb.focused);
        const thumbIndex = cellRangeSliderThumbIndexAtCoordinate(
          input.point.x + 0.5,
          entry.decorationBounds.x,
          entry.decorationBounds.width,
          [thumbs[0]!.sliderValue, thumbs[1]!.sliderValue],
          resolveCellSliderRange(
            rangeSlider.sliderMin,
            rangeSlider.sliderMax,
            rangeSlider.sliderStep,
          ),
          focusedIndex === 0 || focusedIndex === 1 ? focusedIndex : null,
        );
        return focusCommand(frame, thumbs[thumbIndex]!.id);
      }
    }
    const item = interactiveItem(frame.tree, hit);
    if (!item || item.disabled) return null;
    if (input.phase === "down") return focusCommand(frame, item.id);
    const semantic = frame.semantics.nodes.get(item.id);
    const action = semantic ? primarySemanticAction(semantic) : null;
    return action ? commandForSemanticAction(frame, item.id, action, focusScopeId) : null;
  }

  if (input.type === "wheel") {
    return resolveWheelInput(frame, input).command;
  }

  if (!acceptsWidgetKeyInput(input)) return null;

  if (input.key === "Escape" && dismissableScopeId) {
    return { type: "dismiss", targetId: dismissableScopeId };
  }
  const focused = focus.focusedId
    ? frame.tree.nodes.get(focus.focusedId)
    : undefined;
  const owner = collectionOwner(frame.tree, focused?.id ?? null);
  if (focused?.kind === "radio-item" && (
    input.key === "ArrowUp" || input.key === "ArrowDown"
    || input.key === "ArrowLeft" || input.key === "ArrowRight"
  )) {
    const items = focusableWidgets(frame.tree).filter((item) => item.parentId === focused.parentId);
    const targetId = moveInCollection(items, focused.id,
      input.key === "ArrowUp" || input.key === "ArrowLeft" ? -1 : 1, true);
    return targetId ? { type: "select-radio", targetId } : null;
  }
  if (focused?.kind === "range-slider-thumb" && input.key === "Tab") {
    const context = resolveCellRangeSliderThumbContext(frame.tree, focused.id);
    const nextIndex = input.modifiers.shift
      ? context?.thumbIndex === 1 ? 0 : null
      : context?.thumbIndex === 0 ? 1 : null;
    return context && nextIndex !== null
      ? focusCommand(frame, context.thumbs[nextIndex].id)
      : null;
  }
  if (input.key === "Tab") {
    const targetId = focus.tab(frame.tree, input.modifiers.shift ? -1 : 1);
    return targetId ? focusCommand(frame, targetId) : null;
  }
  if (focused?.kind === "slider" || focused?.kind === "range-slider-thumb") {
    const context = focused.kind === "range-slider-thumb"
      ? resolveCellRangeSliderThumbContext(frame.tree, focused.id)
      : null;
    const range = context?.range ?? resolveCellSliderRange(
      focused.sliderMin,
      focused.sliderMax,
      focused.sliderStep
    );
    const allowedMin = context?.thumbIndex === 1 ? context.values[0] : range.min;
    const allowedMax = context?.thumbIndex === 0 ? context.values[1] : range.max;
    const direction = input.key === "ArrowRight" || input.key === "ArrowUp"
      ? 1
      : input.key === "ArrowLeft" || input.key === "ArrowDown"
        ? -1
        : null;
    const candidate = input.key === "Home"
      ? allowedMin
      : input.key === "End"
        ? allowedMax
        : direction
          ? stepCellSliderValue(focused.sliderValue, range, direction)
          : input.key === "PageUp"
            ? stepCellSliderValue(focused.sliderValue, range, 1, 10)
            : input.key === "PageDown"
              ? stepCellSliderValue(focused.sliderValue, range, -1, 10)
              : null;
    const value = candidate === null || !context
      ? candidate
      : constrainCellRangeSliderThumbValue(
          candidate,
          context.thumbIndex,
          context.values,
          context.range,
        );
    if (value !== null) {
      return value === focused.sliderValue
        ? null
        : { type: "set-value", targetId: focused.id, value };
    }
  }
  if (
    focused?.kind === "select-trigger"
    && (input.key === "ArrowDown" || input.key === "ArrowUp")
  ) {
    return { type: "set-expanded", targetId: focused.id, expanded: true };
  }
  if (focused?.kind === "tree-item" && input.key === "ArrowRight") {
    if (focused.hasChildren && !focused.expanded) {
      return { type: "set-expanded", targetId: focused.id, expanded: true };
    }
    const child = [...frame.tree.nodes.values()].find(
      (node) => node.parentItemId === focused.id && !node.disabled
    );
    return child ? focusCommand(frame, child.id) : null;
  }
  if (focused?.kind === "tree-item" && input.key === "ArrowLeft") {
    if (focused.hasChildren && focused.expanded) {
      return { type: "set-expanded", targetId: focused.id, expanded: false };
    }
    return focused.parentItemId
      ? focusCommand(frame, focused.parentItemId)
      : null;
  }
  if (owner?.kind === "grid" && focused?.kind === "grid-cell" && (
    input.key === "ArrowUp"
    || input.key === "ArrowDown"
    || input.key === "ArrowLeft"
    || input.key === "ArrowRight"
    || input.key === "Home"
    || input.key === "End"
  )) {
    return focusCommand(
      frame,
      gridTarget(collectionItems(frame.tree, owner.id), focused, input.key)
    );
  }
  if (owner?.kind === "tabs" && (input.key === "ArrowLeft" || input.key === "ArrowRight" || input.key === "Home" || input.key === "End")) {
    const items = collectionItems(frame.tree, owner.id);
    const targetId = input.key === "Home" ? items[0]?.id : input.key === "End" ? items.at(-1)?.id : moveInCollection(
      items,
      focus.focusedId,
      input.key === "ArrowLeft" ? -1 : 1,
      true
    );
    return targetId ? { type: "activate", targetId } : null;
  }
  if (owner && (input.key === "Home" || input.key === "End")) {
    const items = collectionItems(frame.tree, owner.id);
    const targetId = (input.key === "Home" ? items[0] : items.at(-1))?.id;
    return targetId ? focusCommand(frame, targetId) : null;
  }
  if (input.key === "ArrowUp" || input.key === "ArrowDown") {
    const targetId = owner && owner.kind !== "tabs"
      ? moveInCollection(
          collectionItems(frame.tree, owner.id),
          focus.focusedId,
          input.key === "ArrowUp" ? -1 : 1
        )
      : focus.move(frame.tree, input.key === "ArrowUp" ? -1 : 1);
    return targetId ? focusCommand(frame, targetId) : null;
  }
  if ((input.key === "Enter" || input.key === " ") && focus.focusedId) {
    const semantic = frame.semantics.nodes.get(focus.focusedId);
    const action = semantic ? primarySemanticAction(semantic) : null;
    return action
      ? commandForSemanticAction(frame, focus.focusedId, action, focusScopeId)
      : null;
  }
  if (input.key === "PageUp" || input.key === "PageDown") {
    const focused = focus.focusedId ?? undefined;
    const scroll = scrollAncestor(frame, focused);
    const page = scroll ? frame.scene.entries.get(scroll.id)?.scrollMetrics?.viewport.height ?? 3 : 3;
    const direction = input.key === "PageUp" ? -1 : 1;
    return scrollCommand(
      frame,
      focused,
      { x: 0, y: direction * page },
      { direction, cellCount: page }
    );
  }
  return null;
};
