import { hitTest } from "./scene.js";
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

export type EngineInput =
  | Readonly<{ type: "key"; key: string }>
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
  | Readonly<{ type: "dismiss"; targetId: WidgetId }>
  | Readonly<{ type: "set-expanded"; targetId: WidgetId; expanded: boolean }>
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

const modalOverlayIds = (tree: WidgetTree): readonly WidgetId[] =>
  [...tree.nodes.values()]
    .filter((node) => node.kind === "overlay" && node.modal)
    .map(({ id }) => id);

const topModalOverlayId = (tree: WidgetTree): WidgetId | null =>
  modalOverlayIds(tree).at(-1) ?? null;

const focusableWidgets = (
  tree: WidgetTree,
  scopeId: WidgetId | null = null
): readonly WidgetNode[] =>
  [...tree.nodes.values()].filter(
    (node) => (
      node.kind === "list-item"
      || node.kind === "menu-item"
      || node.kind === "tree-item"
      || node.kind === "tab"
      || node.kind === "grid-cell"
      || node.kind === "text-input"
      || node.kind === "text-area"
    )
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
    if (
      node.kind === "list-item"
      || node.kind === "menu-item"
      || node.kind === "tree-item"
      || node.kind === "tab"
      || node.kind === "grid-cell"
    ) return node;
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
  modalId: WidgetId | null
): WidgetCommand | null => {
  const node = frame.tree.nodes.get(targetId);
  const semantic = frame.semantics.nodes.get(targetId);
  if (
    !node
    || !semantic?.actions.includes(action)
    || node.disabled
    || (modalId !== null && !isDescendantOf(frame.tree, node.id, modalId))
  ) return null;
  if (action === "expand" || action === "collapse") {
    return node.kind === "tree-item" && node.hasChildren
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
  focusableWidgets(tree).filter((node) => isDescendantOf(tree, node.id, ownerId));

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

const gridTarget = (
  items: readonly WidgetNode[],
  current: WidgetNode,
  key: string
) => {
  const row = current.rowIndex ?? 1;
  const column = current.columnIndex ?? 1;
  if (key === "Home" || key === "End") {
    const rowItems = items.filter((item) => item.rowIndex === row);
    return (key === "Home" ? rowItems[0] : rowItems.at(-1))?.id ?? current.id;
  }
  const nextRow = row + (key === "ArrowUp" ? -1 : key === "ArrowDown" ? 1 : 0);
  const nextColumn = column + (key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1 : 0);
  return items.find((item) => (
    item.rowIndex === nextRow && item.columnIndex === nextColumn
  ))?.id ?? current.id;
};

export class FocusManager {
  #focusedId: WidgetId | null = null;
  #scopes: Array<Readonly<{ id: WidgetId; restoreId: WidgetId | null }>> = [];

  get focusedId(): WidgetId | null {
    return this.#focusedId;
  }

  sync(tree: WidgetTree, preferredId?: WidgetId | null): void {
    const nextScopeIds = modalOverlayIds(tree);
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
      ?? restored
      ?? (scopeId ? enabled[0]?.id : null)
      ?? null;
  }

  first(tree: WidgetTree): WidgetId | null {
    return focusableWidgets(tree, this.#scopes.at(-1)?.id ?? null)[0]?.id ?? null;
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
    if (command.type === "focus" || command.type === "activate" || command.type === "text") {
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
  if (!node || node.kind !== "scroll-area" || !metrics) {
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
  const modalId = topModalOverlayId(frame.tree);
  if (modalId && (!hit || !isDescendantOf(frame.tree, hit, modalId))) {
    return { consumed: false, command: null };
  }
  let scroll = ancestorOfKind(frame.tree, hit, "scroll-area");
  while (scroll) {
    if (modalId && !isDescendantOf(frame.tree, scroll.id, modalId)) break;
    const range = getScrollRange(frame, scroll.id);
    if (range.x.max > range.x.min || range.y.max > range.y.min) {
      return {
        consumed: true,
        command: scrollCommand(frame, scroll.id, { x: Math.sign(input.deltaX), y: Math.sign(input.deltaY) }),
      };
    }
    scroll = ancestorOfKind(frame.tree, scroll.parentId ?? undefined, "scroll-area");
  }
  return { consumed: false, command: null };
};

const scrollCommand = (
  frame: FrameSnapshot,
  targetId: WidgetId | undefined,
  delta: CellPoint,
  page?: Readonly<{ direction: -1 | 1; cellCount: number }>
): WidgetCommand | null => {
  const scroll = ancestorOfKind(frame.tree, targetId, "scroll-area");
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
  const scroll = ancestorOfKind(frame.tree, targetId, "scroll-area");
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

export const commandForInput = (
  input: EngineInput,
  frame: FrameSnapshot,
  focus: FocusManager
): WidgetCommand | null => {
  const modalId = topModalOverlayId(frame.tree);
  if (input.type === "semantic") {
    return commandForSemanticAction(frame, input.targetId, input.action, modalId);
  }

  if (input.type === "pointer") {
    if (input.button !== 0 || input.phase === "move" || input.phase === "cancel") return null;
    const hit = hitTest(frame.scene, input.point)[0];
    if (modalId && (!hit || !isDescendantOf(frame.tree, hit, modalId))) {
      return { type: "dismiss", targetId: modalId };
    }
    const item = interactiveItem(frame.tree, hit);
    if (!item || item.disabled) return null;
    if (input.phase === "down") return focusCommand(frame, item.id);
    const semantic = frame.semantics.nodes.get(item.id);
    const action = semantic ? primarySemanticAction(semantic) : null;
    return action ? commandForSemanticAction(frame, item.id, action, modalId) : null;
  }

  if (input.type === "wheel") {
    return resolveWheelInput(frame, input).command;
  }

  if (input.key === "Escape" && modalId) {
    return { type: "dismiss", targetId: modalId };
  }
  const focused = focus.focusedId
    ? frame.tree.nodes.get(focus.focusedId)
    : undefined;
  const owner = collectionOwner(frame.tree, focused?.id ?? null);
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
  if (owner?.kind === "tabs" && (input.key === "ArrowLeft" || input.key === "ArrowRight")) {
    const targetId = moveInCollection(
      collectionItems(frame.tree, owner.id),
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
      ? commandForSemanticAction(frame, focus.focusedId, action, modalId)
      : null;
  }
  if (input.key === "PageUp" || input.key === "PageDown") {
    const focused = focus.focusedId ?? undefined;
    const scroll = ancestorOfKind(frame.tree, focused, "scroll-area");
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
