import { useState } from "react";
import { cellTextWidth, type WidgetCommand } from "@chardesk/cell-ui";
import { type CellSelectState } from "@chardesk/cell-ui/browser";
import { richOnly } from "./component-playground";
import { PLAYGROUND_CONTROL_COLUMNS } from "./component-playground-layout";
import { renderGalleryCheckbox, renderGallerySelect } from "./gallery-component-recipes";

export const playgroundControlWidth = 15;

export const surfaceVariantItems = (["surface", "ghost"] as const)
  .map((value) => ({ id: value, label: value }));
export const frameItems = (["none", "bordered"] as const)
  .map((value) => ({ id: value, label: value }));
export const borderShapeItems = (["square", "rounded"] as const)
  .map((value) => ({ id: value, label: value }));

export const usePlaygroundFocus = (
  initialFocusedId: string,
  selects: readonly CellSelectState[],
) => {
  const [focusedId, setFocusedId] = useState(initialFocusedId);
  const activeSelect = selects.find(({ open }) => open) ?? null;
  const dispatch = (command: WidgetCommand) => {
    if (command.type === "focus") setFocusedId(command.targetId);
    selects.forEach((select) => {
      select.dispatch(command);
      if (command.type === "dismiss" && command.targetId === select.contentId) {
        setFocusedId(select.triggerId);
      }
      if (command.type === "activate" && select.items.some(({ id }) => id === command.targetId)) {
        setFocusedId(select.triggerId);
      }
    });
  };
  return {
    activeSelect,
    dispatch,
    focusedId: activeSelect?.focusedId ?? focusedId,
  };
};

export const renderPlaygroundSelectControl = (
  label: string,
  select: CellSelectState,
  focusedId: string,
  itemSemanticLabel?: (id: string) => string,
) => renderGallerySelect({
  label,
  select,
  focusedId,
  width: Math.min(PLAYGROUND_CONTROL_COLUMNS, Math.max(playgroundControlWidth,
    ...select.items.map((item) => cellTextWidth(item.label) + 6))),
  itemSemanticLabel,
});

export const renderRichOnlySelectControl = (
  label: string,
  select: CellSelectState,
  focusedId: string,
) => richOnly(renderPlaygroundSelectControl(label, select, focusedId), select);

export const renderPlaygroundCheckboxControl = (
  label: string,
  id: string,
  checked: boolean,
  focusedId: string,
) => renderGalleryCheckbox({ id, label, checked, focusedId });
