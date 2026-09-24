# Menu

Navigate actions whose activation follows Cell feedback.

## Installation

Install the full editable source in a React project with components.json and aliases.lib: [Installation](https://ui.chardesk.com/guides/installation.md).

## Usage

```tsx
import { Menu, MenuItem, Root, Text } from "@/lib/cell-ui";

<Root><Menu label="Actions"><MenuItem id="save"><Text>Save</Text></MenuItem></Menu></Root>
```

## View source

- [react.tsx](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/react.tsx)
- [browser-collections.tsx](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/browser-collections.tsx)

## API

| Prop | Type | Description |
| --- | --- | --- |
| `label?` | `string` | Accessible menu name. |
| `MenuItem.id` | `string` | Stable action target. |
| `MenuItem.focused?` | `boolean` | Controlled keyboard focus. |
| `useCellMenuState` | `items, options` | Handles navigation and action dispatch outside the renderer. |
