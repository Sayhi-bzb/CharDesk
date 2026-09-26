'use client';

import {
  createExpandedRowModel,
  rowExpandingFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
} from '@tanstack/react-table';
import { ChevronRight } from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import {
  cn,
  Pressable,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@chardesk/ui';



export type SettingsDataTableColumn<ColumnId extends string = string> = {
  id: ColumnId;
  header: ReactNode;
  widthClassName?: string;
  headerClassName?: string;
  cellClassName?: string;
  visuallyHiddenHeader?: boolean;
};

export type SettingsDataTableGroup<Item> = {
  id: string;
  label: string;
  items: readonly Item[];
};

type SettingsDataTableGroupRow<Item> = {
  id: string;
  kind: 'group';
  group: SettingsDataTableGroup<Item>;
  children: SettingsDataTableItemRow<Item>[];
};

type SettingsDataTableItemRow<Item> = {
  id: string;
  kind: 'item';
  item: Item;
};

type SettingsDataTableRow<Item> =
  | SettingsDataTableGroupRow<Item>
  | SettingsDataTableItemRow<Item>;

type SettingsDataTableProps<Item, ColumnId extends string> = {
  columns: readonly SettingsDataTableColumn<ColumnId>[];
  groups: readonly SettingsDataTableGroup<Item>[];
  getItemId: (item: Item) => string;
  getGroupToggleLabel: (group: SettingsDataTableGroup<Item>, expanded: boolean) => string;
  renderItemCell: (item: Item, columnId: ColumnId) => ReactNode;
  renderGroupSummary?: (group: SettingsDataTableGroup<Item>) => ReactNode;
  getItemRowData?: (item: Item) => Record<`data-${string}`, string | undefined>;
  revealItemId?: string | null;
  onRevealItem?: (row: HTMLTableRowElement, item: Item) => void;
  onRevealComplete?: () => void;
  dataSlot?: string;
  bodyDataSlot?: string;
  groupRowDataSlot?: string;
};

const settingsDataTableFeatures = tableFeatures({
  rowExpandingFeature,
  expandedRowModel: createExpandedRowModel(),
});

export function SettingsDataTable<Item, ColumnId extends string>({
  columns,
  groups,
  getItemId,
  getGroupToggleLabel,
  renderItemCell,
  renderGroupSummary,
  getItemRowData,
  revealItemId,
  onRevealItem,
  onRevealComplete,
  dataSlot = 'settings-data-table',
  bodyDataSlot,
  groupRowDataSlot = 'settings-data-group-row',
}: SettingsDataTableProps<Item, ColumnId>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const rows = useMemo<SettingsDataTableGroupRow<Item>[]>(
    () =>
      groups.map((group) => ({
        id: `group:${group.id}`,
        kind: 'group',
        group,
        children: group.items.map((item) => ({
          id: getItemId(item),
          kind: 'item',
          item,
        })),
      })),
    [getItemId, groups]
  );
  const tableColumns = useMemo<
    ColumnDef<typeof settingsDataTableFeatures, SettingsDataTableRow<Item>>[]
  >(
    () => columns.map(({ id, header }) => ({ id, header: () => header, accessorFn: () => null })),
    [columns]
  );
  const table = useTable({
    features: settingsDataTableFeatures,
    columns: tableColumns,
    data: rows,
    getRowId: (row) => row.id,
    getSubRows: (row) => (row.kind === 'group' ? row.children : undefined),
    initialState: { expanded: true },
    autoResetExpanded: false,
  });

  useEffect(() => {
    if (!revealItemId) return;
    const group = rows.find((candidate) =>
      candidate.children.some((child) => child.id === revealItemId)
    );
    if (group) table.getRow(group.id, true).toggleExpanded(true);

    const frame = requestAnimationFrame(() => {
      const itemRow = rows
        .flatMap((candidate) => candidate.children)
        .find((candidate) => candidate.id === revealItemId);
      const row = [
        ...(rootRef.current?.querySelectorAll<HTMLTableRowElement>(
          '[data-settings-data-item-id]'
        ) ?? []),
      ].find((candidate) => candidate.dataset.settingsDataItemId === revealItemId);
      if (row && itemRow) onRevealItem?.(row, itemRow.item);
      onRevealComplete?.();
    });
    return () => cancelAnimationFrame(frame);
  }, [onRevealComplete, onRevealItem, revealItemId, rows, table]);

  return (
    <div ref={rootRef} data-slot={dataSlot}>
      <Table
        density="compact"
        rowHover="none"
        containerClassName="overflow-x-hidden"
        className="min-w-0 table-fixed"
      >
        <colgroup>
          {columns.map((column) => (
            <col key={column.id} className={column.widthClassName} />
          ))}
        </colgroup>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const column = columns.find((candidate) => candidate.id === header.column.id);
                const content = header.isPlaceholder ? null : (
                  <table.FlexRender header={header} />
                );
                return (
                  <TableHead
                    key={header.id}
                    scope="col"
                    className={cn(
                      'min-w-0 overflow-hidden whitespace-nowrap px-2',
                      column?.headerClassName
                    )}
                  >
                    {column?.visuallyHiddenHeader ? (
                      <span className="sr-only">{content}</span>
                    ) : (
                      content
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody data-slot={bodyDataSlot}>
          {table.getRowModel().rows.map((row) => {
            const value = row.original;
            if (value.kind === 'group') {
              return (
                <TableRow key={row.id} data-slot={groupRowDataSlot}>
                  <TableCell className="p-0" colSpan={columns.length}>
                    <Pressable
                      type="button"
                      className="flex h-8 min-w-0 w-full items-center gap-2 overflow-hidden px-2 text-left"
                      aria-expanded={row.getIsExpanded()}
                      aria-label={getGroupToggleLabel(value.group, row.getIsExpanded())}
                      onClick={row.getToggleExpandedHandler()}
                    >
                      <ChevronRight
                        className={cn(
                          'size-4 shrink-0 transition-transform',
                          row.getIsExpanded() && 'rotate-90'
                        )}
                      />
                      <span className="min-w-0 truncate font-semibold">{value.group.label}</span>
                      {renderGroupSummary ? (
                        <span className="ml-auto min-w-0 truncate text-muted-foreground">
                          {renderGroupSummary(value.group)}
                        </span>
                      ) : null}
                    </Pressable>
                  </TableCell>
                </TableRow>
              );
            }

            const rowData = getItemRowData?.(value.item);
            return (
              <TableRow
                {...rowData}
                key={row.id}
                data-settings-data-item-id={value.id}
              >
                {columns.map((column) => (
                  <TableCell
                    key={column.id}
                    className={cn(
                      'min-w-0 overflow-hidden px-2',
                      column.cellClassName
                    )}
                  >
                    {renderItemCell(value.item, column.id)}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
