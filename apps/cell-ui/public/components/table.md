# Table

Display read-only rows on a Cell grid with lines or alternating backgrounds.

## Installation

Install the full editable source in a React project with components.json and aliases.lib: [Installation](https://ui.chardesk.com/guides/installation.md).

## Usage

```tsx
import { Root, Table, TableRow, TableCell } from "@/lib/cell-ui";

<Root>
  <Table
    label="Files"
    variant="outline"
    columns={[
      { label: "Name", width: 12 },
      { label: "Status", width: 10 },
      { label: "Size", width: 7, align: "right" },
    ]}
  >
    <TableRow>
      <TableCell>Notes.txt</TableCell>
      <TableCell>Synced</TableCell>
      <TableCell>12 KB</TableCell>
    </TableRow>
    <TableRow>
      <TableCell>Draft.md</TableCell>
      <TableCell>Editing</TableCell>
      <TableCell>3 KB</TableCell>
    </TableRow>
  </Table>
</Root>;
```

## View source

- [react.tsx](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/react.tsx)
- [table.ts](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/table.ts)
- [paint.ts](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/paint.ts)
- [semantics.ts](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/semantics.ts)

## API

| Prop | Type | Description |
| --- | --- | --- |
| `label` | `string` | Accessible table name. |
| `columns` | `TableColumn[]` | Ordered headers and integer Cell widths; optional right alignment. |
| `variant?` | `"plain" \| "outline" \| "surface"` | Gap-separated, square boxed, or alternating row backgrounds. |
| `TableRow / TableCell` | `children` | One read-only text cell per column, in order. |
