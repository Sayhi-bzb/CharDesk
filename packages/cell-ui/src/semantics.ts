import type {
  SceneSnapshot,
  SemanticNode,
  SemanticSnapshot,
  WidgetId,
  WidgetNode,
  WidgetTree,
} from "./types.js";

export type SemanticAuditIssue = Readonly<{
  nodeId: WidgetId | null;
  code:
    | "missing-node"
    | "invalid-root"
    | "invalid-order"
    | "invalid-bounds"
    | "missing-name"
    | "invalid-focus"
    | "invalid-relation"
    | "invalid-position"
    | "invalid-state"
    | "missing-action"
    | "invalid-action";
  message: string;
}>;

const descendantText = (tree: WidgetTree, node: WidgetNode): string => {
  if (node.text !== null) return node.text;
  return node.children
    .map((id) => tree.nodes.get(id))
    .filter((child): child is WidgetNode => child !== undefined)
    .map((child) => descendantText(tree, child))
    .join(" ")
    .trim();
};

const semanticParent = (tree: WidgetTree, node: WidgetNode): WidgetId | null => {
  let parentId = node.parentId;
  while (parentId) {
    const parent = tree.nodes.get(parentId);
    if (!parent) return null;
    if (
      parent.kind === "list"
      || parent.kind === "menu"
      || parent.kind === "tree"
      || parent.kind === "tabs"
      || parent.kind === "grid"
      || parent.kind === "grid-row"
      || parent.kind === "overlay"
    ) return parent.id;
    parentId = parent.parentId;
  }
  return null;
};

const semanticRole = (node: WidgetNode): SemanticNode["role"] | null => {
  if (node.kind === "overlay") return "dialog";
  if (node.kind === "list") return "listbox";
  if (node.kind === "list-item") return "option";
  if (node.kind === "menu") return "menu";
  if (node.kind === "menu-item") return "menuitem";
  if (node.kind === "tree") return "tree";
  if (node.kind === "tree-item") return "treeitem";
  if (node.kind === "tabs") return "tablist";
  if (node.kind === "tab") return "tab";
  if (node.kind === "tab-panel") return "tabpanel";
  if (node.kind === "grid") return "grid";
  if (node.kind === "grid-row") return "row";
  if (node.kind === "grid-cell") return "gridcell";
  if (node.kind === "text-input" || node.kind === "text-area") return "textbox";
  return null;
};

const selectable = (node: WidgetNode) => node.kind === "list-item"
  || node.kind === "tree-item"
  || node.kind === "tab"
  || node.kind === "grid-cell";

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

export const createSemanticSnapshot = (
  tree: WidgetTree,
  scene: SceneSnapshot,
  revision: number,
  focusedId: WidgetId | null
): SemanticSnapshot => {
  const nodes = new Map<WidgetId, SemanticNode>();
  const roots: WidgetId[] = [];
  let traversalOrder = 0;
  const modalId = [...tree.nodes.values()]
    .filter((node) => node.kind === "overlay" && node.modal)
    .at(-1)?.id ?? null;
  const activeFocusedId = [...tree.nodes.values()]
    .find((node) => node.focused)?.id ?? null;
  const activeAncestorIds = new Set<WidgetId>();
  let activeAncestorId = activeFocusedId
    ? tree.nodes.get(activeFocusedId)?.parentId ?? null
    : null;
  while (activeAncestorId) {
    activeAncestorIds.add(activeAncestorId);
    activeAncestorId = tree.nodes.get(activeAncestorId)?.parentId ?? null;
  }

  for (const node of tree.nodes.values()) {
    const isTextEditor = node.kind === "text-input" || node.kind === "text-area";
    const role = semanticRole(node);
    if (!role) continue;
    if (modalId && !isDescendantOf(tree, node.id, modalId)) continue;
    const parentId = semanticParent(tree, node);
    const sceneEntry = scene.entries.get(node.id);
    const semantic: SemanticNode = {
      id: node.id,
      semanticParentId: parentId,
      traversalOrder,
      bounds: sceneEntry?.layoutBounds ?? null,
      role,
      label: node.label ?? descendantText(tree, node),
      disabled: node.disabled,
      hidden: sceneEntry === undefined,
      focused: node.focused,
      ...(selectable(node) ? { selected: node.selected } : {}),
      ...(node.kind === "tree-item"
        ? {
            expanded: node.hasChildren ? node.expanded : undefined,
            level: node.level ?? undefined,
          }
        : {}),
      ...(node.rowIndex !== null ? { rowIndex: node.rowIndex } : {}),
      ...(node.columnIndex !== null ? { columnIndex: node.columnIndex } : {}),
      ...(node.rowCount !== null ? { rowCount: node.rowCount } : {}),
      ...(node.columnCount !== null ? { columnCount: node.columnCount } : {}),
      ...(node.positionInSet !== null ? { positionInSet: node.positionInSet } : {}),
      ...(node.setSize !== null ? { setSize: node.setSize } : {}),
      ...(node.orientation ? { orientation: node.orientation } : {}),
      ...(node.controlsId ? { controlsId: node.controlsId } : {}),
      ...(node.labelledById ? { labelledById: node.labelledById } : {}),
      ...(isTextEditor
        ? {
            value: node.textEditor?.value ?? "",
            multiline: node.kind === "text-area",
            readOnly: node.readOnly,
          }
        : {}),
      ...(node.kind === "overlay" ? { modal: node.modal } : {}),
      actions: node.disabled || node.kind === "overlay"
        ? []
        : node.kind === "tree-item" && node.hasChildren
          ? ["focus", node.expanded ? "collapse" : "expand"]
          : node.kind === "list-item"
            || node.kind === "menu-item"
            || node.kind === "tree-item"
            || node.kind === "tab"
            || node.kind === "grid-cell"
            ? ["focus", "activate"]
            : isTextEditor
              ? ["focus"]
              : [],
      ...(
        node.kind === "list"
        || node.kind === "menu"
        || node.kind === "tree"
        || node.kind === "tabs"
        || node.kind === "grid"
        ? {
            activeDescendantId: activeFocusedId && activeAncestorIds.has(node.id)
              ? activeFocusedId
              : undefined,
          }
        : {}),
    };
    traversalOrder += 1;
    nodes.set(node.id, semantic);
    if (parentId === null) roots.push(node.id);
  }

  return { roots, nodes, focusedId, revision };
};

const focusRoles = new Set<SemanticNode["role"]>([
  "option", "textbox", "menuitem", "treeitem", "tab", "gridcell",
]);
const activateRoles = new Set<SemanticNode["role"]>([
  "option", "menuitem", "treeitem", "tab", "gridcell",
]);
const selectedRoles = new Set<SemanticNode["role"]>([
  "option", "treeitem", "tab", "gridcell",
]);
const compositeRoles = new Set<SemanticNode["role"]>([
  "listbox", "menu", "tree", "tablist", "grid",
]);

export const auditSemanticSnapshot = (
  snapshot: SemanticSnapshot
): readonly SemanticAuditIssue[] => {
  const issues: SemanticAuditIssue[] = [];
  const orders = new Set<number>();
  const issue = (
    nodeId: WidgetId | null,
    code: SemanticAuditIssue["code"],
    message: string
  ) => issues.push({ nodeId, code, message });
  const descendantOf = (id: WidgetId, ancestorId: WidgetId): boolean => {
    let current: WidgetId | null = id;
    while (current) {
      if (current === ancestorId) return true;
      current = snapshot.nodes.get(current)?.semanticParentId ?? null;
    }
    return false;
  };

  for (const rootId of snapshot.roots) {
    const root = snapshot.nodes.get(rootId);
    if (!root) issue(rootId, "missing-node", `Semantic root ${rootId} does not exist.`);
    else if (root.semanticParentId !== null) {
      issue(rootId, "invalid-root", `Semantic root ${rootId} has a parent.`);
    }
  }
  for (const node of snapshot.nodes.values()) {
    if (node.label.trim().length === 0) issue(node.id, "missing-name", "Semantic name is empty.");
    if (orders.has(node.traversalOrder) || !Number.isInteger(node.traversalOrder)) {
      issue(node.id, "invalid-order", "Traversal order must be a unique integer.");
    }
    orders.add(node.traversalOrder);
    if (node.bounds && Object.values(node.bounds).some((value) => !Number.isInteger(value))) {
      issue(node.id, "invalid-bounds", "Semantic bounds must use integer Cells.");
    }
    if (
      (node.positionInSet === undefined) !== (node.setSize === undefined)
      || (node.positionInSet !== undefined
        && (node.role !== "option"
          || !Number.isInteger(node.positionInSet)
          || !Number.isInteger(node.setSize)
          || node.positionInSet < 1
          || node.setSize! < node.positionInSet))
    ) {
      issue(node.id, "invalid-position", "Set position requires 1 <= positionInSet <= setSize.");
    }
    const positiveInteger = (value: number | undefined) =>
      value === undefined || (Number.isInteger(value) && value > 0);
    if (node.selected !== undefined && !selectedRoles.has(node.role)) {
      issue(node.id, "invalid-state", `selected is invalid for role ${node.role}.`);
    }
    if (node.expanded !== undefined && node.role !== "treeitem") {
      issue(node.id, "invalid-state", `expanded is invalid for role ${node.role}.`);
    }
    if (node.level !== undefined && (node.role !== "treeitem" || !positiveInteger(node.level))) {
      issue(node.id, "invalid-state", `level must be a positive treeitem index.`);
    }
    if (node.rowIndex !== undefined && (
      (node.role !== "row" && node.role !== "gridcell") || !positiveInteger(node.rowIndex)
    )) issue(node.id, "invalid-state", `rowIndex is invalid for role ${node.role}.`);
    if (node.columnIndex !== undefined && (
      node.role !== "gridcell" || !positiveInteger(node.columnIndex)
    )) issue(node.id, "invalid-state", `columnIndex is invalid for role ${node.role}.`);
    if ((node.rowCount !== undefined || node.columnCount !== undefined) && (
      node.role !== "grid" || !positiveInteger(node.rowCount) || !positiveInteger(node.columnCount)
    )) issue(node.id, "invalid-state", "Grid counts must be positive integers on a grid.");
    if (node.modal !== undefined && node.role !== "dialog") {
      issue(node.id, "invalid-state", `modal is invalid for role ${node.role}.`);
    }
    if (node.orientation !== undefined && !compositeRoles.has(node.role)) {
      issue(node.id, "invalid-state", `orientation is invalid for role ${node.role}.`);
    }
    if (
      (node.value !== undefined || node.multiline !== undefined || node.readOnly !== undefined)
      && node.role !== "textbox"
    ) issue(node.id, "invalid-state", `Text state is invalid for role ${node.role}.`);
    if (node.focused && !focusRoles.has(node.role)) {
      issue(node.id, "invalid-focus", `Role ${node.role} cannot own focus.`);
    }
    if (node.activeDescendantId !== undefined && !compositeRoles.has(node.role)) {
      issue(node.id, "invalid-state", `activeDescendantId is invalid for role ${node.role}.`);
    }
    if (node.semanticParentId) {
      const parent = snapshot.nodes.get(node.semanticParentId);
      if (!parent) issue(node.id, "invalid-relation", "Semantic parent does not exist.");
      else if (parent.traversalOrder >= node.traversalOrder) {
        issue(node.id, "invalid-order", "Semantic parent must precede its child.");
      }
    } else if (!snapshot.roots.includes(node.id)) {
      issue(node.id, "invalid-root", "Parentless semantic node is missing from roots.");
    }
    for (const relatedId of [node.controlsId, node.labelledById]) {
      if (relatedId && !snapshot.nodes.has(relatedId)) {
        issue(node.id, "invalid-relation", `Related semantic node ${relatedId} does not exist.`);
      }
    }
    if (node.activeDescendantId) {
      const active = snapshot.nodes.get(node.activeDescendantId);
      if (!active || !descendantOf(active.id, node.id) || !active.focused) {
        issue(node.id, "invalid-relation", "Active descendant must be a focused semantic descendant.");
      }
    }
    for (const action of node.actions) {
      const valid = action === "focus"
        ? focusRoles.has(node.role)
        : action === "activate"
          ? activateRoles.has(node.role)
            && !(node.role === "treeitem" && node.expanded !== undefined)
          : node.role === "treeitem" && node.expanded !== undefined;
      if (!valid) issue(node.id, "invalid-action", `${action} is invalid for role ${node.role}.`);
    }
    if (!node.disabled) {
      if (focusRoles.has(node.role) && !node.actions.includes("focus")) {
        issue(node.id, "missing-action", `Role ${node.role} must expose focus.`);
      }
      if (
        activateRoles.has(node.role)
        && !(node.role === "treeitem" && node.expanded !== undefined)
        && !node.actions.includes("activate")
      ) {
        issue(node.id, "missing-action", `Role ${node.role} must expose activate.`);
      }
      if (node.role === "treeitem" && node.expanded !== undefined) {
        const expected = node.expanded ? "collapse" : "expand";
        if (!node.actions.includes(expected)) {
          issue(node.id, "missing-action", `Expandable treeitem must expose ${expected}.`);
        }
      }
    } else if (node.actions.length > 0) {
      issue(node.id, "invalid-action", "Disabled semantic nodes cannot expose actions.");
    }
  }
  const focused = [...snapshot.nodes.values()].filter((node) => node.focused);
  if (
    (snapshot.focusedId === null && focused.length !== 0)
    || (snapshot.focusedId !== null
      && (focused.length !== 1 || focused[0]?.id !== snapshot.focusedId))
  ) issue(snapshot.focusedId, "invalid-focus", "focusedId must match exactly one focused node.");
  return issues;
};
