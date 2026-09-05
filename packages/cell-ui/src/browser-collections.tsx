import { Item } from "@react-stately/collections";
import { useListState } from "@react-stately/list";
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { WidgetCommand } from "./interaction.js";
import type { WidgetId } from "./types.js";

export type CellListItem = Readonly<{
  id: string;
  label: string;
  disabled?: boolean;
}>;

export type CellListState = Readonly<{
  items: readonly CellListItem[];
  focusedId: WidgetId | null;
  selectedId: WidgetId | null;
  dispatch: (command: WidgetCommand) => void;
}>;

export const useCellListState = (
  items: readonly CellListItem[],
  options: Readonly<{
    defaultFocusedId?: string;
    defaultSelectedId?: string;
    onAction?: (id: string) => void;
  }> = {}
): CellListState => {
  const state = useListState<CellListItem>({
    items,
    children: (item) => (
      <Item key={item.id} textValue={item.label}>{item.label}</Item>
    ),
    selectionMode: "single",
    disallowEmptySelection: true,
    disabledKeys: items.filter(({ disabled }) => disabled).map(({ id }) => id),
    defaultSelectedKeys: options.defaultSelectedId
      ? [options.defaultSelectedId]
      : undefined,
  });
  const initialized = useRef(false);
  useLayoutEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const initial = options.defaultFocusedId ?? options.defaultSelectedId;
    if (initial) {
      state.selectionManager.setFocused(true);
      state.selectionManager.setFocusedKey(initial);
    }
  }, [options.defaultFocusedId, options.defaultSelectedId, state.selectionManager]);

  const dispatch = useCallback((command: WidgetCommand) => {
    if (command.type !== "focus" && command.type !== "activate") return;
    const key = command.targetId;
    if (!state.collection.getItem(key) || state.disabledKeys.has(key)) {
      state.selectionManager.setFocused(false);
      state.selectionManager.setFocusedKey(null);
      return;
    }
    state.selectionManager.setFocused(true);
    state.selectionManager.setFocusedKey(key);
    if (command.type === "activate") {
      state.selectionManager.setSelectedKeys(new Set([key]));
      options.onAction?.(String(key));
    }
  }, [options, state]);

  const selected = [...state.selectionManager.selectedKeys][0];
  return {
    items: [...state.collection]
      .map((node) => node.value)
      .filter((item): item is CellListItem => item !== null),
    focusedId: state.selectionManager.focusedKey === null
      ? null
      : String(state.selectionManager.focusedKey),
    selectedId: selected === undefined ? null : String(selected),
    dispatch,
  };
};

export type CellMenuState = Readonly<{
  items: readonly CellListItem[];
  focusedId: WidgetId | null;
  dispatch: (command: WidgetCommand) => void;
}>;

export const useCellMenuState = (
  items: readonly CellListItem[],
  options: Readonly<{
    defaultFocusedId?: WidgetId;
    onAction?: (id: WidgetId) => void;
  }> = {}
): CellMenuState => {
  const base = useCellListState(items, { defaultFocusedId: options.defaultFocusedId });
  const dispatch = useCallback((command: WidgetCommand) => {
    if (command.type === "activate") {
      base.dispatch({ type: "focus", targetId: command.targetId });
      options.onAction?.(command.targetId);
      return;
    }
    base.dispatch(command);
  }, [base, options]);
  return { items: base.items, focusedId: base.focusedId, dispatch };
};

export type CellTabItem = CellListItem & Readonly<{ panelId: WidgetId }>;

export type CellTabsState = Readonly<{
  items: readonly CellTabItem[];
  focusedId: WidgetId | null;
  selectedId: WidgetId | null;
  dispatch: (command: WidgetCommand) => void;
}>;

export const useCellTabsState = (
  items: readonly CellTabItem[],
  options: Readonly<{
    defaultSelectedId?: WidgetId;
    onSelectionChange?: (id: WidgetId) => void;
  }> = {}
): CellTabsState => {
  const base = useCellListState(items, {
    defaultFocusedId: options.defaultSelectedId,
    defaultSelectedId: options.defaultSelectedId,
    onAction: options.onSelectionChange,
  });
  const ids = new Set(base.items.map(({ id }) => id));
  return {
    items: items.filter(({ id }) => ids.has(id)),
    focusedId: base.focusedId,
    selectedId: base.selectedId,
    dispatch: base.dispatch,
  };
};

export type CellTreeItem = CellListItem & Readonly<{
  children?: readonly CellTreeItem[];
}>;

export type CellTreeRow = Readonly<{
  item: CellTreeItem;
  level: number;
  parentId: WidgetId | null;
  hasChildren: boolean;
  expanded: boolean;
}>;

export type CellTreeState = Readonly<{
  rows: readonly CellTreeRow[];
  focusedId: WidgetId | null;
  selectedId: WidgetId | null;
  expandedIds: ReadonlySet<WidgetId>;
  dispatch: (command: WidgetCommand) => void;
}>;

export const useCellTreeState = (
  items: readonly CellTreeItem[],
  options: Readonly<{
    defaultFocusedId?: WidgetId;
    defaultSelectedId?: WidgetId;
    defaultExpandedIds?: readonly WidgetId[];
    onAction?: (id: WidgetId) => void;
  }> = {}
): CellTreeState => {
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<WidgetId>>(
    () => new Set(options.defaultExpandedIds ?? [])
  );
  const rows = useMemo(() => {
    const result: CellTreeRow[] = [];
    const visit = (
      current: readonly CellTreeItem[],
      level: number,
      parentId: WidgetId | null
    ) => {
      for (const item of current) {
        const hasChildren = (item.children?.length ?? 0) > 0;
        const expanded = hasChildren && expandedIds.has(item.id);
        result.push({ item, level, parentId, hasChildren, expanded });
        if (expanded) visit(item.children!, level + 1, item.id);
      }
    };
    visit(items, 1, null);
    return result;
  }, [expandedIds, items]);
  const base = useCellListState(rows.map(({ item }) => item), {
    defaultFocusedId: options.defaultFocusedId,
    defaultSelectedId: options.defaultSelectedId,
    onAction: options.onAction,
  });
  const dispatch = useCallback((command: WidgetCommand) => {
    if (command.type !== "set-expanded") {
      base.dispatch(command);
      return;
    }
    if (!rows.some(({ item, hasChildren }) => item.id === command.targetId && hasChildren)) {
      return;
    }
    base.dispatch({ type: "focus", targetId: command.targetId });
    setExpandedIds((current) => {
      const next = new Set(current);
      if (command.expanded) next.add(command.targetId);
      else next.delete(command.targetId);
      return next;
    });
  }, [base, rows]);
  return {
    rows,
    focusedId: base.focusedId,
    selectedId: base.selectedId,
    expandedIds,
    dispatch,
  };
};

export type CellGridCell = CellListItem;
export type CellGridRow = Readonly<{
  id: WidgetId;
  label?: string;
  cells: readonly CellGridCell[];
}>;

export type CellGridState = Readonly<{
  rows: readonly CellGridRow[];
  focusedId: WidgetId | null;
  selectedId: WidgetId | null;
  rowCount: number;
  columnCount: number;
  dispatch: (command: WidgetCommand) => void;
}>;

export const useCellGridState = (
  rows: readonly CellGridRow[],
  options: Readonly<{
    defaultFocusedId?: WidgetId;
    defaultSelectedId?: WidgetId;
    onAction?: (id: WidgetId) => void;
  }> = {}
): CellGridState => {
  const cells = rows.flatMap(({ cells: rowCells }) => rowCells);
  const base = useCellListState(cells, options);
  return {
    rows,
    focusedId: base.focusedId,
    selectedId: base.selectedId,
    rowCount: rows.length,
    columnCount: rows.reduce((count, row) => Math.max(count, row.cells.length), 0),
    dispatch: base.dispatch,
  };
};
