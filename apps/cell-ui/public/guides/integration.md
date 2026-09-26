# Integration

Connect Cell descriptors, browser projection, and application-owned state.

## Surface

Import descriptors and CellUiRuntime from @/lib/cell-ui; import CellSurface and state adapters from @/lib/cell-ui/browser. Root is the top-level structural descriptor. CellSurface retains the runtime across viewport, theme, and presentation changes. Presentation defaults to rich; text is an equally interactive Unicode rendering of the same state and commands.

```tsx
import { Root, Text } from "@/lib/cell-ui";
import { CellSurface } from "@/lib/cell-ui/browser";

<CellSurface
  viewport={{ width: 30, height: 4 }}
  presentation="text"
  onCommand={dispatch}
>
  <Root>
    <Text>Hello, Cells</Text>
  </Root>
</CellSurface>;
```

## State and commands

Application state remains outside the renderer. Pass controlled values and focused IDs into descriptors, then handle CellSurface onCommand or use the matching /browser state adapter. Direct adapter dispatch has no presentation lifecycle.

## Reordering

Use List's reorderable capability with stable List and ListItem IDs. Pointer drag previews the row and insertion point; release or Alt+↑/↓ emits a reorder command. Application state owns the final order.

```tsx
import { useState } from "react";
import { List, ListItem, Root, Text, reorderCellItems } from "@/lib/cell-ui";
import { CellSurface } from "@/lib/cell-ui/browser";

function Layers() {
  const [items, setItems] = useState([
    { id: "title", label: "Title" },
    { id: "chart", label: "Chart" },
  ]);
  return (
    <CellSurface
      viewport={{ width: 24, height: 4 }}
      onCommand={(command) => {
        if (command.type === "reorder")
          setItems((current) => [
            ...reorderCellItems(current, command.targetId, command.toIndex),
          ]);
      }}
    >
      <Root>
        <List id="layers" label="Layers" reorderable>
          {items.map((item) => (
            <ListItem key={item.id} id={item.id} label={item.label}>
              <Text>{item.label}</Text>
            </ListItem>
          ))}
        </List>
      </Root>
    </CellSurface>
  );
}
```

## Overlay host

Mount one CellOverlayHost around participating surfaces. It owns stacking, viewport placement, outside/Escape dismissal, modal background inertness, and focus return. Outside input closes nonmodal layers above its target; Escape closes only the top layer. App state controls visibility. Menu uses CellPopover or CellContextMenu; CellAlertDialog is modal; Toast shares the host layer without taking focus.

- [Menu](https://ui.chardesk.com/#/components/menu)
- [Toast](https://ui.chardesk.com/#/components/toast)
- [Browser host source](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/browser-overlay-host.tsx)

## Headless hosts

CellUiRuntime commits a dense Cell buffer and Scene without a browser. Headless hosts supply viewport, state, focus, and animationTimeMs explicitly. The browser adapter supplies font loading, pointer, input, and semantic focus.
