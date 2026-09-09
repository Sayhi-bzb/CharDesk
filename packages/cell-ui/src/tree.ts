import type { WidgetDescriptor } from "./react.js";
import type {
  WidgetId,
  WidgetMutation,
  WidgetNode,
  WidgetTree,
} from "./types.js";
import { normalizeCellRangeSliderValues, resolveCellSliderRange } from "./slider.js";

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

export const sameWidgetValue = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);

const sameNodeContent = (left: WidgetNode, right: WidgetNode) =>
  left.kind === right.kind
  && left.key === right.key
  && left.text === right.text
  && left.label === right.label
  && left.disabled === right.disabled
  && left.focused === right.focused
  && left.focusActive === right.focusActive
  && left.focusVisible === right.focusVisible
  && left.hovered === right.hovered
  && left.manipulating === right.manipulating
  && left.pressActive === right.pressActive
  && left.activationFlash === right.activationFlash
  && left.confirming === right.confirming
  && sameWidgetValue(left.confirmation, right.confirmation)
  && left.selected === right.selected
  && left.checked === right.checked
  && left.pressed === right.pressed
  && left.radioValue === right.radioValue
  && sameWidgetValue(left.progress, right.progress)
  && left.buttonVariant === right.buttonVariant
  && left.buttonSize === right.buttonSize
  && left.sliderValue === right.sliderValue
  && left.sliderMin === right.sliderMin
  && left.sliderMax === right.sliderMax
  && left.sliderStep === right.sliderStep
  && left.sliderValueText === right.sliderValueText
  && left.expanded === right.expanded
  && left.hasChildren === right.hasChildren
  && left.level === right.level
  && left.parentItemId === right.parentItemId
  && left.rowIndex === right.rowIndex
  && left.columnIndex === right.columnIndex
  && left.rowCount === right.rowCount
  && left.columnCount === right.columnCount
  && left.positionInSet === right.positionInSet
  && left.setSize === right.setSize
  && left.orientation === right.orientation
  && left.controlsId === right.controlsId
  && left.labelledById === right.labelledById
  && sameWidgetValue(left.textEditor, right.textEditor)
  && left.readOnly === right.readOnly
  && sameWidgetValue(left.overlayPosition, right.overlayPosition)
  && left.modal === right.modal
  && sameWidgetValue(left.style, right.style)
  && sameWidgetValue(left.textStyle, right.textStyle)
  && sameWidgetValue(left.scrollOffset, right.scrollOffset)
  && sameWidgetValue(left.children, right.children);

const materializeTree = (descriptor: WidgetDescriptor | null): WidgetTree => {
  if (!descriptor) return EMPTY_TREE;
  const nodes = new Map<WidgetId, WidgetNode>();

  const visit = (
    current: WidgetDescriptor,
    parentId: WidgetId | null,
    index: number
  ): WidgetId => {
    const parent = parentId ? nodes.get(parentId) : undefined;
    if (current.kind === "radio-item" && parent?.kind !== "radio-group") {
      throw new TypeError("RadioItem must be a direct child of RadioGroup.");
    }
    if (current.kind === "range-slider-thumb" && parent?.kind !== "range-slider") {
      throw new TypeError("RangeSliderThumb must be a direct child of RangeSlider.");
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
      text: current.text,
      textStyle: current.textStyle,
      label: current.label,
      disabled: current.disabled || (
        (current.kind === "range-slider-thumb" || current.kind === "radio-item") && parent?.disabled === true
      ),
      focused: current.focused,
      focusActive: false,
      focusVisible: false,
      hovered: false,
      manipulating: false,
      pressActive: false,
      activationFlash: false,
      selected: current.selected,
      checked: current.kind === "radio-item" ? current.radioValue === parent?.radioValue : current.checked,
      pressed: current.pressed,
      radioValue: current.radioValue,
      progress: current.progress,
      buttonVariant: current.buttonVariant,
      buttonSize: current.buttonSize,
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
      labelledById: current.labelledById,
      textEditor: current.textEditor,
      readOnly: current.readOnly,
      overlayPosition: current.overlayPosition,
      modal: current.modal,
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
    return id;
  };

  const rootId = visit(descriptor, null, 0);
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
