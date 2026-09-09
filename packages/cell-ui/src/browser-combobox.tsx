import { useMemo, useState } from "react";
import type { WidgetCommand } from "./interaction.js";
import { CellTextEditor, type CellTextSnapshot } from "./text.js";
import type { CellListItem } from "./browser-collections.js";
import type { WidgetId } from "./types.js";

export type CellComboboxItem = CellListItem;

export type CellComboboxState = Readonly<{
  id: WidgetId;
  inputId: WidgetId;
  contentId: WidgetId;
  items: readonly CellComboboxItem[];
  filteredItems: readonly CellComboboxItem[];
  inputSnapshot: CellTextSnapshot;
  open: boolean;
  focusedId: WidgetId | null;
  activeId: WidgetId | null;
  selectedId: WidgetId | null;
  selectedItem: CellComboboxItem | null;
  query: string;
  scrollY: number;
  dispatch: (command: WidgetCommand) => void;
}>;

export const filterCellComboboxItems = (
  items: readonly CellComboboxItem[],
  query: string,
): readonly CellComboboxItem[] => {
  const needle = query.trim().toLocaleLowerCase();
  return needle ? items.filter(({ label }) => label.toLocaleLowerCase().includes(needle)) : items;
};

export const useCellComboboxState = (
  id: WidgetId,
  items: readonly CellComboboxItem[],
  options: Readonly<{
    selectedId?: WidgetId | null;
    defaultSelectedId?: WidgetId;
    query?: string;
    defaultQuery?: string;
    open?: boolean;
    defaultOpen?: boolean;
    onSelectionChange?: (id: WidgetId) => void;
    onQueryChange?: (query: string) => void;
    onOpenChange?: (open: boolean) => void;
  }> = {},
): CellComboboxState => {
  const inputId = `${id}-input`;
  const contentId = `${id}-content`;
  const selectedControlled = Object.prototype.hasOwnProperty.call(options, "selectedId");
  const queryControlled = Object.prototype.hasOwnProperty.call(options, "query");
  const openControlled = Object.prototype.hasOwnProperty.call(options, "open");
  const { onOpenChange, onQueryChange, onSelectionChange } = options;
  const [internalSelectedId, setInternalSelectedId] = useState<WidgetId | null>(options.defaultSelectedId ?? null);
  const [internalQuery, setInternalQuery] = useState(options.defaultQuery ?? "");
  const [internalOpen, setInternalOpen] = useState(options.defaultOpen ?? false);
  const selectedCandidate = selectedControlled ? options.selectedId ?? null : internalSelectedId;
  const selectedId = items.some(({ id }) => id === selectedCandidate) ? selectedCandidate : null;
  const selectedItem = items.find(({ id }) => id === selectedId) ?? null;
  const query = queryControlled ? options.query ?? "" : internalQuery;
  const open = openControlled ? options.open === true : internalOpen;
  const [drafting, setDrafting] = useState(!!options.defaultOpen && !!options.defaultQuery);
  const filterQuery = drafting || query.length > 0 ? query : "";
  const filteredItems = useMemo(() => filterCellComboboxItems(items, filterQuery), [filterQuery, items]);
  const enabled = filteredItems.filter(({ disabled }) => !disabled);
  const preferredId = enabled.some(({ id }) => id === selectedId) ? selectedId : enabled[0]?.id ?? null;
  const [editor] = useState(() => {
    const instance = new CellTextEditor({ value: open ? query : selectedItem?.label ?? "" });
    if (!open && selectedItem?.label) instance.dispatch({ type: "select-all" });
    return instance;
  });
  const [inputSnapshot, setInputSnapshot] = useState(() => editor.snapshot());
  const [focusedId, setFocusedId] = useState<WidgetId | null>(inputId);
  const [activeId, setActiveId] = useState<WidgetId | null>(open ? preferredId : null);
  const [scrollY, setScrollY] = useState(0);

  const replaceInput = (value: string, selectAll = false) => {
    let next = editor.dispatch({ type: "replace-document", value });
    if (selectAll) next = editor.dispatch({ type: "select-all" });
    setInputSnapshot(next);
  };
  const updateQuery = (next: string) => {
    if (!queryControlled) setInternalQuery(next);
    if (next !== query) onQueryChange?.(next);
  };
  const updateOpen = (next: boolean) => {
    if (!openControlled) setInternalOpen(next);
    if (next !== open) onOpenChange?.(next);
    setScrollY(0);
    if (next) {
      setDrafting(false);
      updateQuery("");
      replaceInput(selectedItem?.label ?? "", true);
      setActiveId(preferredId);
    } else {
      setDrafting(false);
      updateQuery("");
      replaceInput(selectedItem?.label ?? "", true);
      setActiveId(null);
    }
  };

  const synchronizationKey = JSON.stringify({
    open,
    drafting,
    query,
    selected: selectedItem ? [selectedItem.id, selectedItem.label] : null,
    enabled: enabled.map(({ id, label }) => [id, label]),
  });
  const [previousSynchronizationKey, setPreviousSynchronizationKey] = useState(synchronizationKey);
  if (previousSynchronizationKey !== synchronizationKey) {
    setPreviousSynchronizationKey(synchronizationKey);
    const desired = open && (drafting || query.length > 0) ? query : selectedItem?.label ?? "";
    if (!inputSnapshot.composition && inputSnapshot.value !== desired) {
      replaceInput(desired, !open && !!desired);
    }
    if (!open) {
      if (activeId !== null) setActiveId(null);
      if (scrollY !== 0) setScrollY(0);
    } else if (!enabled.some(({ id }) => id === activeId)) setActiveId(preferredId);
  }

  const dispatch = (command: WidgetCommand) => {
    if (command.type === "text" && command.targetId === inputId) {
      const before = editor.snapshot();
      const next = editor.dispatch(command.command);
      setInputSnapshot(next);
      if (next.value !== before.value) {
        setDrafting(true);
        updateQuery(next.value);
        if (!open) {
          if (!openControlled) setInternalOpen(true);
          onOpenChange?.(true);
        }
      }
      return;
    }
    if (command.type === "focus") {
      setFocusedId(command.targetId);
      if (open && command.targetId !== inputId) updateOpen(false);
      return;
    }
    if (command.type === "set-expanded" && command.targetId === inputId) {
      updateOpen(command.expanded);
      setFocusedId(inputId);
      return;
    }
    if (command.type === "set-active" && enabled.some(({ id }) => id === command.targetId)) {
      setActiveId(command.targetId);
      return;
    }
    if (command.type === "activate" && command.targetId === inputId) {
      updateOpen(true);
      return;
    }
    if (command.type === "activate" && enabled.some(({ id }) => id === command.targetId)) {
      if (!selectedControlled) setInternalSelectedId(command.targetId);
      if (command.targetId !== selectedId) onSelectionChange?.(command.targetId);
      const item = items.find(({ id }) => id === command.targetId)!;
      setDrafting(false);
      updateQuery("");
      replaceInput(item.label);
      setActiveId(command.targetId);
      return;
    }
    if (command.type === "dismiss" && command.targetId === contentId) {
      updateOpen(false);
      setFocusedId(inputId);
      return;
    }
    if (command.type === "scroll" && command.targetId === contentId) setScrollY(command.scrollY);
  };

  return { id, inputId, contentId, items, filteredItems, inputSnapshot, open, focusedId, activeId,
    selectedId, selectedItem, query, scrollY, dispatch };
};
