# Tree

Navigate hierarchical items with controlled expansion.

## Installation

Install the full editable source in a React project with components.json and aliases.lib: [Installation](https://ui.chardesk.com/guides/installation.md).

## Usage

```tsx
import { Root, Text, Tree, TreeItem } from "@/lib/cell-ui";

<Root><Tree label="Files"><TreeItem id="src" level={1} hasChildren expanded>
  <Text>src</Text>
</TreeItem></Tree></Root>
```

## View source

- [react.tsx](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/react.tsx)
- [browser-collections.tsx](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/browser-collections.tsx)

## API

| Prop | Type | Description |
| --- | --- | --- |
| `label?` | `string` | Accessible tree name. |
| `TreeItem.level` | `number` | One-based depth in the logical tree. |
| `TreeItem.parentItemId?` | `string` | Logical parent for navigation. |
| `expanded? / hasChildren?` | `boolean` | Controlled disclosure state and affordance. |
