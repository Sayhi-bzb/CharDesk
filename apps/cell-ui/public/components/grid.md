# Grid

Navigate a two-dimensional Cell collection without coupling focus to selection.

## Installation

Install the full editable source in a React project with components.json and aliases.lib: [Installation](https://ui.chardesk.com/guides/installation.md).

## Usage

```tsx
import { Grid, GridCell, GridRow, Root, Text } from "@/lib/cell-ui";

<Root><Grid label="Properties" rowCount={1} columnCount={1}>
  <GridRow id="row" rowIndex={1}><GridCell id="name" rowIndex={1} columnIndex={1}>
    <Text>Name</Text>
  </GridCell></GridRow>
</Grid></Root>
```

## View source

- [react.tsx](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/react.tsx)
- [browser-collections.tsx](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/browser-collections.tsx)

## API

| Prop | Type | Description |
| --- | --- | --- |
| `rowCount? / columnCount?` | `number` | Logical grid dimensions. |
| `GridRow.rowIndex` | `number` | One-based row coordinate. |
| `GridCell.rowIndex / columnIndex` | `number` | One-based cell coordinate. |
| `GridCell.focused? / selected?` | `boolean` | Independent focus and selection state. |
