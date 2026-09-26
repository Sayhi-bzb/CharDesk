import type {
  CellRect,
  SceneSnapshot,
  SemanticNode,
  SemanticSnapshot,
  WidgetId,
  WidgetNode,
  WidgetTree,
} from "./types.js";
import {
  isActionableKind,
  isSelectableKind,
  isTextEditorKind,
} from "./widget-capabilities.js";
import { resolveCellRangeSliderThumbContext } from "./slider.js";
import { isDescendantOf } from "./tree.js";

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
  if (node.markdownCenteredText !== null) return node.markdownCenteredText;
  const content = node.children
    .map((id) => tree.nodes.get(id))
    .filter((child): child is WidgetNode => child !== undefined)
    .map((child) => descendantText(tree, child))
    .join(node.kind === "markdown-block" && node.markdownRole !== "list" && node.markdownRole !== "listitem" ? "" : " ");
  return content.replace(/\s+/gu, " ").trim();
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
      || parent.kind === "table"
      || parent.kind === "table-header"
      || parent.kind === "table-row"
      || parent.kind === "select-content"
      || parent.kind === "combobox-content"
      || parent.kind === "overlay"
      || parent.kind === "alert"
      || parent.kind === "toast"
      || parent.kind === "range-slider"
      || parent.kind === "radio-group"
      || parent.kind === "markdown-block"
      || parent.probeId !== null
    ) return parent.id;
    parentId = parent.parentId;
  }
  return null;
};

const semanticRole = (node: WidgetNode): SemanticNode["role"] | null => {
  if (node.kind === "box" && node.probeId) return "group";
  if (node.kind === "markdown-link") return "link";
  if (node.kind === "markdown-block") return node.markdownRole;
  if (node.dialogPart === "title") return "heading";
  if (node.dialogPart === "description") return "paragraph";
  if (node.kind === "accordion-trigger") return "button";
  if (node.kind === "accordion-content") return "region";
  if (node.kind === "overlay") return node.dialog?.role ?? "dialog";
  if (node.kind === "button") return "button";
  if (node.kind === "text" && node.invalid) return "alert";
  if (node.kind === "badge-action") return "button";
  if (node.kind === "badge") return "paragraph";
  if (node.kind === "alert") return node.badgeTone === "warning" || node.badgeTone === "error" ? "alert" : "status";
  if (node.kind === "toast") return "group";
  if (node.kind === "checkbox") return "checkbox";
  if (node.kind === "toggle") return "button";
  if (node.kind === "radio-group") return "radiogroup";
  if (node.kind === "radio-item") return "radio";
  if (node.kind === "progress") return "progressbar";
  if (node.kind === "tooltip") return "tooltip";
  if (node.kind === "spinner") return "progressbar";
  if (node.kind === "separator") return "separator";
  if (node.kind === "slider") return "slider";
  if (node.kind === "range-slider") return "group";
  if (node.kind === "range-slider-thumb") return "slider";
  if (node.kind === "select-trigger") return "button";
  if (node.kind === "combobox-input") return "combobox";
  if (node.kind === "select-content" || node.kind === "combobox-content") return "listbox";
  if (node.kind === "select-item" || node.kind === "combobox-item") return "option";
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
  if (node.kind === "table") return "table";
  if (node.kind === "table-header" || node.kind === "table-row") return "row";
  if (node.kind === "table-head") return "columnheader";
  if (node.kind === "table-cell") return "cell";
  if (node.kind === "text-input" || node.kind === "text-area") return "textbox";
  return null;
};

const selectable = (node: WidgetNode) => isSelectableKind(node.kind);

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
    .filter((node) => node.kind === "overlay" && node.modal && scene.entries.has(node.id))
    .at(-1)?.id ?? null;
  const activeFocusedId = [...tree.nodes.values()]
    .find((node) => node.focused)?.id ?? null;
  const activeAncestorIds = new Set<WidgetId>();
  const visibleTooltips = new Map<WidgetId, WidgetId>();
  for (const id of scene.entries.keys()) {
    const node = tree.nodes.get(id);
    if (node?.kind === "tooltip" && node.tooltipTargetId
      && (!modalId || isDescendantOf(tree, node.tooltipTargetId, modalId))) {
      visibleTooltips.set(node.tooltipTargetId, id);
    }
  }
  let activeAncestorId = activeFocusedId
    ? tree.nodes.get(activeFocusedId)?.parentId ?? null
    : null;
  while (activeAncestorId) {
    activeAncestorIds.add(activeAncestorId);
    activeAncestorId = tree.nodes.get(activeAncestorId)?.parentId ?? null;
  }

  for (const node of tree.nodes.values()) {
    const isTextEditor = isTextEditorKind(node.kind);
    const role = semanticRole(node);
    if (!role) continue;
    const describedByIds = [...new Set([node.describedById, visibleTooltips.get(node.id)]
      .filter((id): id is WidgetId => !!id))];
    const tooltipTargetInModal = modalId && node.kind === "tooltip" && node.tooltipTargetId
      && isDescendantOf(tree, node.tooltipTargetId, modalId);
    const modalProbeAncestor = modalId && node.probeId && isDescendantOf(tree, modalId, node.id);
    if (modalId && !isDescendantOf(tree, node.id, modalId)
      && !tooltipTargetInModal && !modalProbeAncestor) continue;
    const candidateParentId = tooltipTargetInModal ? modalId : semanticParent(tree, node);
    const parentId = modalId && candidateParentId && !isDescendantOf(tree, candidateParentId, modalId)
      && !(tree.nodes.get(candidateParentId)?.probeId && isDescendantOf(tree, modalId, candidateParentId))
      ? null : candidateParentId;
    const sceneEntry = scene.entries.get(node.id);
    const rangeThumb = node.kind === "range-slider-thumb"
      ? resolveCellRangeSliderThumbContext(tree, node.id)
      : null;
    const semantic: SemanticNode = {
      id: node.id,
      ...(node.probeId ? { probeId: node.probeId } : {}),
      semanticParentId: parentId,
      traversalOrder,
      bounds: sceneEntry?.layoutBounds ?? null,
      role,
      label: node.label ?? (node.kind === "accordion-content" && node.labelledById
        ? tree.nodes.get(node.labelledById)!.label ?? descendantText(tree, tree.nodes.get(node.labelledById)!)
        : descendantText(tree, node)),
      ...(node.href ? { href: node.href } : {}),
      ...(node.current ? { current: node.current } : {}),
      ...(node.target ? { target: node.target } : {}),
      disabled: node.disabled,
      ...(node.invalid ? { invalid: true } : {}),
      hidden: sceneEntry === undefined,
      focused: node.focused,
      ...(selectable(node) ? { selected: node.selected } : {}),
      ...(node.kind === "toggle" ? { pressed: node.pressed } : {}),
      ...(node.kind === "accordion-trigger" ? { expanded: node.expanded } : {}),
      ...(node.progress && node.progress.value !== null
        ? { valueNow: node.progress.value, valueMin: 0, valueMax: node.progress.max,
            valueText: node.progress.valueText }
        : node.progress?.valueText ? { valueText: node.progress.valueText } : {}),
      ...(node.kind === "separator" || node.kind === "radio-group"
        ? { orientation: node.orientation ?? (node.kind === "separator" ? "horizontal" : "vertical") } : {}),
      ...(node.kind === "checkbox" || node.kind === "radio-item"
        ? { checked: node.checked === "indeterminate" ? "mixed" as const : node.checked }
        : {}),
      ...(node.kind === "slider" || node.kind === "range-slider-thumb"
        ? {
            valueNow: node.sliderValue,
            valueMin: rangeThumb?.thumbIndex === 1
              ? rangeThumb.values[0]
              : node.sliderMin,
            valueMax: rangeThumb?.thumbIndex === 0
              ? rangeThumb.values[1]
              : node.sliderMax,
            valueText: node.sliderValueText ?? undefined,
            orientation: "horizontal" as const,
          }
        : {}),
      ...(node.kind === "tree-item"
        ? {
            expanded: node.hasChildren ? node.expanded : undefined,
            level: node.level ?? undefined,
          }
        : node.kind === "select-trigger" || node.kind === "combobox-input"
          ? { expanded: node.expanded, hasPopup: "listbox" as const }
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
      ...(describedByIds.length
        ? { describedById: describedByIds[0], describedByIds }
        : {}),
      ...(node.dialogPart === "title" ? { level: 2 } : node.markdownRole === "heading" && node.level
        ? { level: node.level } : {}),
      ...(isTextEditor
        ? {
            value: node.textEditor?.value ?? "",
            multiline: node.kind === "text-area",
            readOnly: node.readOnly,
          }
        : {}),
      ...(node.kind === "overlay" ? { modal: node.modal } : {}),
      actions: node.disabled || (node.kind === "overlay" && !node.dialog) || sceneEntry === undefined
        ? []
        : node.dialog ? ["focus"]
        : node.kind === "slider" || node.kind === "range-slider-thumb"
          ? ["focus"]
        : node.kind === "combobox-input"
          ? ["focus", node.expanded ? "collapse" : "expand"]
        : node.kind === "combobox-item"
          ? ["activate"]
        : node.kind === "tree-item" && node.hasChildren
          ? ["focus", node.expanded ? "collapse" : "expand"]
          : node.kind === "select-trigger" || node.kind === "accordion-trigger"
            ? ["focus", node.expanded ? "collapse" : "expand"]
          : isActionableKind(node.kind)
            ? ["focus", "activate"]
            : isTextEditor
              ? ["focus"]
              : [],
      ...(
        node.kind === "combobox-input"
        ? { activeDescendantId: node.activeDescendantId ?? undefined }
        : node.kind === "list"
        || node.kind === "menu"
        || node.kind === "tree"
        || node.kind === "tabs"
        || node.kind === "grid"
        || node.kind === "select-content"
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

/** Scroll-only frames preserve semantic content and order; only scene bounds can move. */
export const updateSemanticSnapshotForScroll = (
  previous: SemanticSnapshot,
  scene: SceneSnapshot,
  revision: number,
  affectedIds: ReadonlySet<WidgetId>,
): SemanticSnapshot => {
  const nodes = new Map(previous.nodes);
  for (const id of affectedIds) {
    const semantic = nodes.get(id);
    if (!semantic) continue;
    const bounds = scene.entries.get(id)?.layoutBounds ?? null;
    if (!sameSemanticBounds(semantic.bounds, bounds)) nodes.set(id, { ...semantic, bounds });
  }
  return { roots: previous.roots, nodes, focusedId: previous.focusedId, revision };
};

const sameSemanticBounds = (left: CellRect | null, right: CellRect | null): boolean =>
  left === right || !!left && !!right && left.x === right.x && left.y === right.y
    && left.width === right.width && left.height === right.height;

const focusRoles = new Set<SemanticNode["role"]>([
  "button", "link", "checkbox", "radio", "slider", "option", "textbox", "combobox", "menuitem", "treeitem", "tab", "gridcell",
]);
const activateRoles = new Set<SemanticNode["role"]>([
  "button", "link", "checkbox", "radio", "option", "menuitem", "treeitem", "tab", "gridcell",
]);
const selectedRoles = new Set<SemanticNode["role"]>([
  "option", "treeitem", "tab", "gridcell",
]);
const compositeRoles = new Set<SemanticNode["role"]>([
  "listbox", "menu", "tree", "tablist", "grid", "radiogroup",
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
    if ((node.role === "link") !== (node.href !== undefined)) {
      issue(node.id, "invalid-state", "Only links may expose href, and links require href.");
    }
    if (node.current && node.role !== "link") issue(node.id, "invalid-state", "Only links may be current.");
    if (node.role !== "separator" && node.label.trim().length === 0) issue(node.id, "missing-name", "Semantic name is empty.");
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
    if (node.pressed !== undefined && node.role !== "button") {
      issue(node.id, "invalid-state", `pressed is invalid for role ${node.role}.`);
    }
    if (node.checked !== undefined && node.role !== "checkbox" && node.role !== "radio") {
      issue(node.id, "invalid-state", `checked is invalid for role ${node.role}.`);
    }
    if (
      node.expanded !== undefined
      && node.role !== "treeitem"
      && node.role !== "combobox"
      && !(node.role === "button" && (node.hasPopup === "listbox" || node.controlsId))
    ) {
      issue(node.id, "invalid-state", `expanded is invalid for role ${node.role}.`);
    }
    if (node.hasPopup !== undefined && node.role !== "button" && node.role !== "combobox") {
      issue(node.id, "invalid-state", `hasPopup is invalid for role ${node.role}.`);
    }
    if (node.level !== undefined && ((node.role !== "treeitem" && node.role !== "heading") || !positiveInteger(node.level))) {
      issue(node.id, "invalid-state", `level must be a positive treeitem or heading index.`);
    }
    if (node.rowIndex !== undefined && (
      (node.role !== "row" && node.role !== "gridcell") || !positiveInteger(node.rowIndex)
    )) issue(node.id, "invalid-state", `rowIndex is invalid for role ${node.role}.`);
    if (node.columnIndex !== undefined && (
      (node.role !== "gridcell" && node.role !== "cell" && node.role !== "columnheader") || !positiveInteger(node.columnIndex)
    )) issue(node.id, "invalid-state", `columnIndex is invalid for role ${node.role}.`);
    if ((node.rowCount !== undefined || node.columnCount !== undefined) && (
      (node.role !== "grid" && node.role !== "table") || !positiveInteger(node.rowCount) || !positiveInteger(node.columnCount)
    )) issue(node.id, "invalid-state", "Grid counts must be positive integers on a grid.");
    if (node.modal !== undefined && node.role !== "dialog" && node.role !== "alertdialog") {
      issue(node.id, "invalid-state", `modal is invalid for role ${node.role}.`);
    }
    if (node.orientation !== undefined && !compositeRoles.has(node.role) && node.role !== "slider" && node.role !== "separator") {
      issue(node.id, "invalid-state", `orientation is invalid for role ${node.role}.`);
    }
    if (
      (node.valueNow !== undefined
        || node.valueMin !== undefined
        || node.valueMax !== undefined
        || node.valueText !== undefined)
      && node.role !== "slider" && node.role !== "progressbar"
    ) issue(node.id, "invalid-state", `Numeric value is invalid for role ${node.role}.`);
    if (node.role === "slider" && (
      node.valueNow === undefined
      || node.valueMin === undefined
      || node.valueMax === undefined
      || node.valueNow < node.valueMin
      || node.valueNow > node.valueMax
    )) issue(node.id, "invalid-state", "Slider value must be inside its numeric range.");
    const hasProgressRange = node.valueNow !== undefined
      || node.valueMin !== undefined
      || node.valueMax !== undefined;
    if (node.role === "progressbar" && hasProgressRange && (
      node.valueNow === undefined
      || node.valueMin === undefined
      || node.valueMax === undefined
      || node.valueNow < node.valueMin
      || node.valueNow > node.valueMax
    )) issue(node.id, "invalid-state", "Progress value must be inside its numeric range.");
    if (
      (node.value !== undefined || node.multiline !== undefined || node.readOnly !== undefined)
      && node.role !== "textbox" && node.role !== "combobox"
    ) issue(node.id, "invalid-state", `Text state is invalid for role ${node.role}.`);
    if (node.focused && !focusRoles.has(node.role) && node.role !== "dialog" && node.role !== "alertdialog") {
      issue(node.id, "invalid-focus", `Role ${node.role} cannot own focus.`);
    }
    if (node.activeDescendantId !== undefined && !compositeRoles.has(node.role) && node.role !== "combobox") {
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
    if (node.describedByIds) {
      if (node.describedById !== node.describedByIds[0]) {
        issue(node.id, "invalid-relation", "Primary description must be the first description.");
      }
      if (new Set(node.describedByIds).size !== node.describedByIds.length) {
        issue(node.id, "invalid-relation", "Description targets must be unique.");
      }
    }
    for (const relatedId of [node.controlsId, node.labelledById,
      ...(node.describedByIds ?? (node.describedById ? [node.describedById] : []))]) {
      if (relatedId && !snapshot.nodes.has(relatedId)) {
        issue(node.id, "invalid-relation", `Related semantic node ${relatedId} does not exist.`);
      }
    }
    if (node.activeDescendantId) {
      const active = snapshot.nodes.get(node.activeDescendantId);
      const validComboboxTarget = node.role === "combobox" && !!node.controlsId
        && descendantOf(active?.id ?? "", node.controlsId);
      if (!active || (!(descendantOf(active.id, node.id) && active.focused) && !validComboboxTarget)) {
        issue(node.id, "invalid-relation", "Active descendant must be a focused semantic descendant.");
      }
    }
    for (const action of node.actions) {
      const valid = action === "focus"
        ? focusRoles.has(node.role) || node.role === "dialog" || node.role === "alertdialog"
        : action === "activate"
          ? activateRoles.has(node.role)
            && !(node.role === "treeitem" && node.expanded !== undefined)
          : (node.role === "treeitem" || node.hasPopup === "listbox" || (node.role === "button" && !!node.controlsId))
            && node.expanded !== undefined;
      if (!valid) issue(node.id, "invalid-action", `${action} is invalid for role ${node.role}.`);
    }
    if (!node.disabled) {
      const comboboxOption = node.role === "option" && [...snapshot.nodes.values()]
        .some((owner) => owner.role === "combobox" && owner.controlsId === node.semanticParentId);
      if (focusRoles.has(node.role) && !comboboxOption && !node.actions.includes("focus")) {
        issue(node.id, "missing-action", `Role ${node.role} must expose focus.`);
      }
      if (
        activateRoles.has(node.role)
        && !(node.expanded !== undefined
          && (node.role === "treeitem" || node.hasPopup === "listbox" || (node.role === "button" && !!node.controlsId)))
        && !node.actions.includes("activate")
      ) {
        issue(node.id, "missing-action", `Role ${node.role} must expose activate.`);
      }
      if (
        node.expanded !== undefined
        && (node.role === "treeitem" || node.hasPopup === "listbox" || (node.role === "button" && !!node.controlsId))
      ) {
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
