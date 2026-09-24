# List

Present a navigable Cell collection with controlled focus and selection.

## Installation

Install the full editable source in a React project with components.json and aliases.lib: [Installation](https://ui.chardesk.com/guides/installation.md).

## Usage

```tsx
import { List, ListItem, Root, Text } from "@/lib/cell-ui";
import { useCellListState } from "@/lib/cell-ui/browser";

const list = useCellListState([{ id: "a", label: "Alpha" }]);
<Root><List label="Letters">{list.items.map((item) =>
  <ListItem key={item.id} id={item.id} focused={list.focusedId === item.id}
    selected={list.selectedId === item.id}><Text>{item.label}</Text></ListItem>
)}</List></Root>
```

## View source

- [react.tsx](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/react.tsx)
- [browser-collections.tsx](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/browser-collections.tsx)

## API

| Prop | Type | Description |
| --- | --- | --- |
| `label?` | `string` | Accessible collection name. |
| `ListItem.id` | `string` | Stable focus and command target. |
| `ListItem.focused? / selected?` | `boolean` | Externally controlled focus and selection. |
| `positionInSet? / setSize?` | `number` | Logical position for virtualized collections. |
