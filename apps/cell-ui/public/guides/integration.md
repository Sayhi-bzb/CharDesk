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

## Browser viewport

Browser hosts can derive an integer Cell viewport from a measured parent without stretching Cells. useCellViewport owns ResizeObserver measurement; the host passes its viewport and returned metrics to CellSurface. Headless hosts continue to pass viewport explicitly.

```tsx
import { useRef } from "react";
import { Root, Text } from "@/lib/cell-ui";
import { CellSurface, useCellViewport } from "@/lib/cell-ui/browser";

function ResponsiveSurface() {
  const elementRef = useRef<HTMLDivElement>(null);
  const { viewport, metrics, ready } = useCellViewport({ elementRef });
  return (
    <div ref={elementRef}>
      {ready ? (
        <CellSurface viewport={viewport} metrics={metrics} onCommand={() => {}}>
          <Root>
            <Text>Measured Cells</Text>
          </Root>
        </CellSurface>
      ) : null}
    </div>
  );
}
```

## Geometry diagnostics

resolveCellSurfaceGeometry exposes the committed surface and canvas rectangles, Cell viewport, metrics, guard Cells, and content Cell rect. Use it to distinguish a small viewport from a clipped DOM surface.

```tsx
import { resolveCellSurfaceGeometry } from "@/lib/cell-ui/browser";

const geometry = resolveCellSurfaceGeometry(surfaceElement);
console.log(geometry?.viewport, geometry?.canvasRectPx);
```

## State and commands

Application state remains outside the renderer. Pass controlled values and focused IDs into descriptors, then handle CellSurface onCommand or use the matching /browser state adapter. Direct adapter dispatch has no presentation lifecycle.

## Reordering

Use List's reorderable capability with stable List and ListItem IDs. Pointer drag previews the row and insertion point; release or Alt+↑/↓ emits a reorder command. Application state owns the final order. Try the live host fixture to drag the visible Cell rows.

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

[Open live drag fixture](https://ui.chardesk.com/#/__fixtures/overlay-host)

## Overlay host

Mount one CellOverlayHost around participating surfaces. It owns stacking, viewport placement, outside/Escape dismissal, modal background inertness, and focus return. Outside input closes nonmodal layers above its target; Escape closes only the top layer. App state controls visibility. Menu uses CellPopover or CellContextMenu; CellAlertDialog is modal; Toast shares the host layer without taking focus.

- [Menu](https://ui.chardesk.com/#/components/menu)
- [Toast](https://ui.chardesk.com/#/components/toast)
- [Browser host source](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/browser-overlay-host.tsx)

## Headless hosts

CellUiRuntime commits a dense Cell buffer and Scene without a browser. Headless hosts supply viewport, state, focus, and animationTimeMs explicitly. The browser adapter supplies font loading, pointer, input, and semantic focus.
