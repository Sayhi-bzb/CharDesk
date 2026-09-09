import type { WidgetNode, WidgetTree } from "./types.js";
import { isActionableKind } from "./widget-capabilities.js";

/** Geometry/behavior projection, independent of colors and rendering. */
export const projectWidgetState = (tree: WidgetTree, node: WidgetNode) => {
  let owner: WidgetNode | undefined = node;
  while (owner && !isActionableKind(owner.kind)) {
    owner = owner.parentId ? tree.nodes.get(owner.parentId) : undefined;
  }
  const target = owner ?? node;
  const disabled = !!(node.disabled || target.disabled);
  return {
    owner,
    target,
    disabled,
    highlighted: !disabled && ((target.focused && target.focusVisible) || target.hovered),
    pressed: !disabled && target.pressActive,
    manipulating: !disabled && !!target.manipulating,
    confirming: !disabled && !!target.confirming,
    flash: !disabled && target.activationFlash,
  };
};
