# Combobox

Click the input row to open local options, filter, then commit one value.

## Installation

Install the full editable source in a React project with components.json and aliases.lib: [Installation](https://ui.chardesk.com/guides/installation.md).

## Usage

```tsx
import { Combobox, ComboboxContent, ComboboxInput, ComboboxItem, Root, Text } from "@/lib/cell-ui";
import { CellSurface, useCellComboboxState } from "@/lib/cell-ui/browser";

const fonts = [
  { id: "maple", label: "Maple Mono" },
  { id: "fusion", label: "Fusion Pixel 12px Mono" },
];

export function ComboboxExample() {
  const combo = useCellComboboxState("font", fonts, { defaultSelectedId: "maple" });
  return <CellSurface viewport={{ width: 32, height: 8 }} focusedId={combo.focusedId}
    onCommand={combo.dispatch}><Root>
    <Combobox id={combo.id} style={{ width: 30 }}>
      <ComboboxInput id={combo.inputId} label="Font" state={combo.inputSnapshot}
        expanded={combo.open} activeDescendantId={combo.activeId ?? undefined} />
      {combo.open && <ComboboxContent id={combo.contentId} label="Font options" scrollY={combo.scrollY}>
        {combo.filteredItems.map((item, index) => <ComboboxItem id={item.id} key={item.id}
          active={combo.activeId === item.id} selected={combo.selectedId === item.id}
          positionInSet={index + 1} setSize={combo.filteredItems.length}>
          <Text>{item.label}</Text>
        </ComboboxItem>)}
      </ComboboxContent>}
    </Combobox>
  </Root></CellSurface>;
}
```

## View source

- [react.tsx](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/react.tsx)
- [combobox.ts](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/combobox.ts)
- [browser-combobox.tsx](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/browser-combobox.tsx)

## API

| Prop | Type | Description |
| --- | --- | --- |
| `Combobox.disabled?` | `boolean` | Disables the input and every candidate. |
| `ComboboxInput.state` | `CellTextSnapshot` | Controlled editor state; selection underlines while editing and only the Cell Cursor inverts. |
| `ComboboxInput.style?` | `CellSingleLineInputStyle` | Width constraints and flex behavior; height, padding, and border belong to the component. |
| `ComboboxInput.activeDescendantId?` | `string` | Relates keyboard navigation to one active option without moving focus. |
| `ComboboxContent` | `Cell primitive` | Portaled listbox anchored to the input. |
| `Combobox.variant?` | `"surface" \| "ghost"` | Shared surface recipe; the local value overrides the global recipe. |
| `ComboboxContent.frame?` | `"none" \| "bordered"` | Optional one-Cell dropdown frame; none by default. |
| `ComboboxItem.active?` | `boolean` | Provisional keyboard or pointer candidate, separate from committed selection. |
| `useCellComboboxState` | `CellComboboxState` | Owns local filtering, editor state, active candidate, selection, opening, and scroll. |
