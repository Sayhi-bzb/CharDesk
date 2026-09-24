# Select

Choose one value from a Cell-anchored listbox.

## Installation

Install the full editable source in a React project with components.json and aliases.lib: [Installation](https://ui.chardesk.com/guides/installation.md).

## Usage

```tsx
import {
  Root,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  Text,
} from "@/lib/cell-ui";
import { CellSurface, useCellSelectState } from "@/lib/cell-ui/browser";

const themes = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" },
];

export function SelectExample() {
  const select = useCellSelectState("theme", themes, {
    defaultSelectedId: "dark",
  });
  return (
    <CellSurface
      focusedId={select.focusedId}
      onCommand={select.dispatch}
      viewport={{ width: 32, height: 7 }}
    >
      <Root id="root">
        <Select id={select.id} style={{ width: 30 }}>
          <SelectTrigger
            id={select.triggerId}
            label="Theme"
            expanded={select.open}
            controlsId={select.open ? select.contentId : undefined}
          >
            <Text>{select.selectedItem?.label ?? "Select theme"}</Text>
          </SelectTrigger>
          {select.open ? (
            <SelectContent
              id={select.contentId}
              label="Theme options"
              scrollY={select.scrollY}
            >
              {select.items.map((item, index) => (
                <SelectItem
                  id={item.id}
                  key={item.id}
                  disabled={item.disabled}
                  selected={select.selectedId === item.id}
                  positionInSet={index + 1}
                  setSize={select.items.length}
                >
                  <Text>{item.label}</Text>
                </SelectItem>
              ))}
            </SelectContent>
          ) : null}
        </Select>
      </Root>
    </CellSurface>
  );
}
```

## View source

- [react.tsx](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/react.tsx)
- [browser-collections.tsx](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/browser-collections.tsx)

## API

| Prop | Type | Description |
| --- | --- | --- |
| `Select.style` | `CellLayoutStyle` | Sets the shared Trigger and Content width. |
| `Select.variant?` | `"surface" \| "ghost"` | Shared surface recipe; the local value overrides the global recipe. |
| `SelectTrigger.expanded` | `boolean` | Controls disclosure state and chrome. |
| `SelectTrigger.controlsId?` | `string` | Relates the open Trigger to its listbox. |
| `SelectContent` | `Cell primitive` | Portaled listbox anchored to the Trigger. |
| `SelectContent.frame?` | `"none" \| "bordered"` | Optional one-Cell dropdown frame; none by default. |
| `SelectContent.borderShape?` | `"square" \| "rounded"` | Border glyphs when Content is bordered. |
| `SelectContent.scrollY?` | `number` | Controlled offset for a constrained listbox. |
| `SelectItem.selected?` | `boolean` | Persistent committed selection. |
| `useCellSelectState` | `CellSelectState` | Owns open, provisional focus, selection, listbox scroll, and commands. |
