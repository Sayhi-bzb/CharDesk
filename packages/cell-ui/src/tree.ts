import type { WidgetDescriptor } from "./react.js";
import type {
  WidgetId,
  WidgetMutation,
  WidgetNode,
  WidgetTree,
} from "./types.js";
import { normalizeCellRangeSliderValues, resolveCellSliderRange } from "./slider.js";
import { sameNodeContent } from "./widget-change.js";
export { sameWidgetValue } from "./widget-change.js";

const EMPTY_TREE: WidgetTree = Object.freeze({
  rootId: null,
  nodes: new Map<WidgetId, WidgetNode>(),
});

const segmentFor = (descriptor: WidgetDescriptor, index: number) => {
  if (descriptor.explicitId) return descriptor.explicitId;
  if (descriptor.key !== null) {
    return `${descriptor.kind}:${encodeURIComponent(descriptor.key)}`;
  }
  return `${descriptor.kind}[${index}]`;
};

export const isDescendantOf = (
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

const materializeTree = (descriptor: WidgetDescriptor | null): WidgetTree => {
  if (!descriptor) return EMPTY_TREE;
  const nodes = new Map<WidgetId, WidgetNode>();

  const visit = (
    current: WidgetDescriptor,
    parentId: WidgetId | null,
    index: number
  ): WidgetId => {
    const parent = parentId ? nodes.get(parentId) : undefined;
    if (current.dialogPart && !parent?.dialog) {
      throw new TypeError("DialogTitle and DialogDescription must be direct children of Dialog.");
    }
    let inheritedDisabled = false;
    let ancestor = parent;
    while (ancestor) {
      if ((ancestor.kind === "accordion" || ancestor.kind === "accordion-item" || ancestor.kind === "combobox")
        && ancestor.disabled) inheritedDisabled = true;
      ancestor = ancestor.parentId ? nodes.get(ancestor.parentId) : undefined;
    }
    if (current.kind === "accordion-item" && (parent?.kind !== "accordion" || !current.explicitId)) {
      throw new TypeError("AccordionItem requires an id and must be a direct child of Accordion.");
    }
    if ((current.kind === "accordion-trigger" || current.kind === "accordion-content") && parent?.kind !== "accordion-item") {
      throw new TypeError("AccordionTrigger and AccordionContent must be direct children of AccordionItem.");
    }
    if (current.kind === "radio-item" && parent?.kind !== "radio-group") {
      throw new TypeError("RadioItem must be a direct child of RadioGroup.");
    }
    if (current.reorderable && current.kind === "list"
      && (!current.explicitId || current.children.some((child) => child.kind !== "list-item" || !child.explicitId))) {
      throw new TypeError("A reorderable List requires an id and direct ListItem children with ids.");
    }
    if (current.kind === "range-slider-thumb" && parent?.kind !== "range-slider") {
      throw new TypeError("RangeSliderThumb must be a direct child of RangeSlider.");
    }
    if ((current.kind === "combobox-input" || current.kind === "combobox-content") && parent?.kind !== "combobox") {
      throw new TypeError("ComboboxInput and ComboboxContent must be direct children of Combobox.");
    }
    if (current.kind === "combobox-item" && parent?.kind !== "combobox-content") {
      throw new TypeError("ComboboxItem must be a direct child of ComboboxContent.");
    }
    const segment = segmentFor(current, index);
    const id = parentId && !current.explicitId ? `${parentId}/${segment}` : segment;
    if (!id) throw new TypeError("Widget ids must not be empty.");
    if (nodes.has(id)) throw new TypeError(`Duplicate WidgetId: ${id}`);

    nodes.set(id, {
      id,
      key: current.key,
      kind: current.kind,
      parentId,
      index,
      style: current.style,
      presentation: current.presentation,
      overlayScope: current.overlayScope,
      probeId: current.probeId,
      surfaceVariant: current.surfaceVariant,
      frame: current.frame,
      borderShape: current.borderShape,
      text: current.text,
      href: current.href,
      current: current.current,
      target: current.target,
      markdownRole: current.markdownRole,
      markdownCode: current.markdownCode,
      markdownTone: current.markdownTone,
      markdownSource: current.markdownSource,
      markdownLayoutOnly: current.markdownLayoutOnly,
      markdownCenteredText: current.markdownCenteredText,
      sharedScrollGuard: current.kind === "scroll-area" && current.sharedScrollGuard,
      textStyle: current.textStyle,
      label: current.label,
      disabled: current.disabled || inheritedDisabled || (
        (current.kind === "range-slider-thumb" || current.kind === "radio-item") && parent?.disabled === true
      ),
      invalid: current.invalid,
      focused: current.focused,
      focusActive: false,
      focusVisible: false,
      hovered: false,
      scrollbarVisible: false,
      manipulating: false,
      pressActive: false,
      activationFlash: false,
      selected: current.selected,
      reorderable: current.reorderable || (current.kind === "list-item" && parent?.kind === "list" && parent.reorderable),
      active: current.active,
      checked: current.kind === "radio-item" ? current.radioValue === parent?.radioValue : current.checked,
      pressed: current.pressed,
      radioValue: current.radioValue,
      progress: current.progress,
      animationTimeMs: 0,
      progressVariant: current.progressVariant,
      spinnerVariant: current.spinnerVariant,
      tooltipTargetId: current.tooltipTargetId,
      tooltipOpen: false,
      tabsVariant: current.kind === "tab" && parent?.kind === "tabs" ? parent.tabsVariant : current.tabsVariant,
      separatorVariant: current.separatorVariant,
      buttonVariant: current.buttonVariant,
      buttonTone: current.buttonTone,
      badgeTone: current.badgeTone,
      sliderValue: current.sliderValue,
      sliderMin: current.sliderMin,
      sliderMax: current.sliderMax,
      sliderStep: current.sliderStep,
      sliderValueText: current.sliderValueText,
      expanded: current.expanded,
      hasChildren: current.hasChildren,
      level: current.level,
      parentItemId: current.parentItemId,
      rowIndex: current.rowIndex,
      columnIndex: current.columnIndex,
      rowCount: current.rowCount,
      columnCount: current.columnCount,
      positionInSet: current.positionInSet,
      setSize: current.setSize,
      orientation: current.orientation,
      controlsId: current.controlsId,
      activeDescendantId: current.activeDescendantId,
      labelledById: current.labelledById,
      describedById: current.describedById,
      textEditor: current.textEditor,
      readOnly: current.readOnly,
      overlayPosition: current.overlayPosition,
      modal: current.modal,
      dialog: current.dialog,
      dialogPart: current.dialogPart,
      closeOnOutsideClick: current.closeOnOutsideClick,
      scrollOffset: { x: current.scrollX, y: current.scrollY },
      children: [],
    });
    const childIds = current.children.map((child, childIndex) =>
      visit(child, id, childIndex)
    );
    if (current.kind === "radio-group") {
      const items = childIds.map((childId) => nodes.get(childId)!);
      if (items.some((item) => item.kind !== "radio-item" || !item.radioValue)
        || new Set(items.map((item) => item.radioValue)).size !== items.length) {
        throw new TypeError("RadioGroup requires RadioItem children with unique non-empty values.");
      }
    }
    if (current.kind === "range-slider") {
      const thumbs = childIds.map((childId) => nodes.get(childId)!);
      if (thumbs.length !== 2 || thumbs.some((child) => child.kind !== "range-slider-thumb")) {
        throw new TypeError("RangeSlider must contain exactly two RangeSliderThumb children.");
      }
      const parentNode = nodes.get(id)!;
      const range = resolveCellSliderRange(
        parentNode.sliderMin,
        parentNode.sliderMax,
        parentNode.sliderStep,
      );
      const values = normalizeCellRangeSliderValues(
        thumbs[0]!.sliderValue,
        thumbs[1]!.sliderValue,
        range,
      );
      thumbs.forEach((thumb, thumbIndex) => {
        nodes.set(thumb.id, {
          ...thumb,
          sliderValue: values[thumbIndex as 0 | 1],
          sliderMin: range.min,
          sliderMax: range.max,
          sliderStep: range.step,
        });
      });
    }
    nodes.set(id, { ...nodes.get(id)!, children: childIds });
    if (current.kind === "combobox") {
      const [input, content] = childIds.map((child) => nodes.get(child)!);
      if (input?.kind !== "combobox-input" || childIds.length > 2 || (content && content.kind !== "combobox-content")) {
        throw new TypeError("Combobox requires one Input followed by optional Content.");
      }
      if (content) {
        const activeItems = content.children.map((child) => nodes.get(child)!)
          .filter((child) => child.kind === "combobox-item" && child.active);
        if (activeItems.length > 1 || (activeItems[0]?.id ?? null) !== input.activeDescendantId) {
          throw new TypeError("Combobox must have at most one active Item matching Input.activeDescendantId.");
        }
        nodes.set(input.id, { ...input, controlsId: content.id });
        nodes.set(content.id, { ...content, labelledById: input.id });
      }
    }
    if (current.kind === "combobox-content" && childIds.some((child) => {
      const kind = nodes.get(child)?.kind;
      return kind !== "combobox-item" && kind !== "text";
    })) throw new TypeError("ComboboxContent accepts ComboboxItem or Text children.");
    if (current.dialog) {
      const parts = childIds.map((child) => nodes.get(child)!);
      const titles = parts.filter((node) => node.dialogPart === "title");
      const descriptions = parts.filter((node) => node.dialogPart === "description");
      const title = titles[0];
      if (titles.length !== 1 || !title?.text?.trim() || descriptions.length > 1) {
        throw new TypeError("Dialog requires one direct, non-empty DialogTitle and at most one DialogDescription.");
      }
      nodes.set(id, { ...nodes.get(id)!, label: title.text, labelledById: title.id, describedById: descriptions[0]?.id });
    }
    if (current.kind === "accordion") {
      const kinds = childIds.map((child) => nodes.get(child)!.kind);
      if (kinds.some((kind, index) => kind !== "accordion-item"
        && (kind !== "separator" || index === 0 || index === kinds.length - 1
          || kinds[index - 1] !== "accordion-item" || kinds[index + 1] !== "accordion-item"))) {
        throw new TypeError("Accordion requires AccordionItem children with optional Separators between items.");
      }
    }
    if (current.kind === "accordion-item") {
      const [trigger, content] = childIds.map((child) => nodes.get(child)!);
      if (childIds.length !== 2 || trigger?.kind !== "accordion-trigger" || content?.kind !== "accordion-content") {
        throw new TypeError("AccordionItem requires one Trigger followed by one Content.");
      }
      nodes.set(trigger.id, { ...trigger, expanded: current.expanded, controlsId: content.id });
      nodes.set(content.id, { ...content, expanded: current.expanded, labelledById: trigger.id });
    }
    return id;
  };

  const rootId = visit(descriptor, null, 0);
  const tooltipTargets = new Set<WidgetId>();
  for (const node of nodes.values()) {
    if (node.kind !== "tooltip" || !node.tooltipTargetId) continue;
    if (tooltipTargets.has(node.tooltipTargetId)) {
      throw new TypeError(`Only one Tooltip may target ${node.tooltipTargetId}.`);
    }
    tooltipTargets.add(node.tooltipTargetId);
  }
  return { rootId, nodes };
};

export const reconcileWidgetTree = (
  previous: WidgetTree | undefined,
  descriptor: WidgetDescriptor | null
): Readonly<{ tree: WidgetTree; mutations: readonly WidgetMutation[] }> => {
  const before = previous ?? EMPTY_TREE;
  const tree = materializeTree(descriptor);
  const mutations: WidgetMutation[] = [];

  for (const [id, node] of tree.nodes) {
    const old = before.nodes.get(id);
    if (!old) {
      mutations.push({ type: "mount", id, parentId: node.parentId, index: node.index });
      continue;
    }
    if (old.kind !== node.kind) {
      mutations.push({ type: "unmount", id });
      mutations.push({ type: "mount", id, parentId: node.parentId, index: node.index });
      continue;
    }
    if (old.parentId !== node.parentId || old.index !== node.index) {
      mutations.push({
        type: "move",
        id,
        fromParentId: old.parentId,
        toParentId: node.parentId,
        fromIndex: old.index,
        toIndex: node.index,
      });
    }
    if (!sameNodeContent(old, node)) mutations.push({ type: "update", id });
  }

  const removed = [...before.nodes.values()]
    .filter((node) => !tree.nodes.has(node.id))
    .sort((left, right) => right.id.split("/").length - left.id.split("/").length);
  for (const node of removed) mutations.push({ type: "unmount", id: node.id });

  return { tree, mutations };
};
