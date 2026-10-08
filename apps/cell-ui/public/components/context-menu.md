# Context Menu

Open a host-managed Cell menu from a pointer rectangle without coupling the menu surface to domain actions.

## Installation

Install the full editable source in a React project with components.json and aliases.lib: [Installation](https://ui.chardesk.com/guides/installation.md).

## Usage

```tsx
import { useState } from "react";
import { Box, Menu, MenuItem, Root, Text } from "@/lib/cell-ui";
import { CellContextMenu, CellOverlayHost, CellSurface } from "@/lib/cell-ui/browser";

export function ContextMenuExample() {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const presentation = "rich";
  const close = () => setAnchor(null);
  return (
    <CellOverlayHost>
      <div
        onContextMenu={(event) => {
          event.preventDefault();
          setAnchor(new DOMRect(event.clientX, event.clientY, 0, 0));
        }}
      >
        <CellSurface viewport={{ width: 28, height: 9 }} onCommand={() => {}}>
          <Root>
            <Box
              frame="bordered"
              style={{ width: 26, height: 7, paddingTop: 2, alignItems: "center" }}
            >
              <Text>Right click here</Text>
            </Box>
          </Root>
        </CellSurface>
      </div>
      <CellContextMenu open={anchor !== null} anchor={anchor} onDismiss={close}>
        <CellSurface
          presentation={presentation}
          viewport={{ width: 20, height: 3 }}
          focusedId="context-action"
          onCommand={(command) => {
            if (command.type === "activate" && command.targetId === "context-action")
              close();
          }}
        >
          <Root>
            <Box variant="surface" frame="bordered" style={{ width: 20 }}>
              <Menu id="context-menu" label="Context menu">
                <MenuItem id="context-action" focused label="Context action">
                  <Text>Context action</Text>
                </MenuItem>
              </Menu>
            </Box>
          </Root>
        </CellSurface>
      </CellContextMenu>
    </CellOverlayHost>
  );
}
```

## Composition

```text
CellOverlayHost
├── CellSurface (context target)
└── CellContextMenu (opened by pointer state)
    └── CellSurface
        └── Menu
            └── MenuItem
```

## View source

- [react.tsx](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/react.tsx)
- [browser-collections.tsx](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/browser-collections.tsx)
- [browser-overlay-host.tsx](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/browser-overlay-host.tsx)

## API

| Prop | Type | Description |
| --- | --- | --- |
| `CellContextMenu.open` | `boolean` | Controlled visibility for the context menu. |
| `CellContextMenu.anchor` | `DOMRect \| null` | Pointer rectangle used for bottom-start placement. |
| `CellContextMenu.onDismiss` | `(reason: "escape" \| "outside") => void` | Close the menu and restore focus according to the host policy. |
| `CellSurface.presentation` | `"rich" \| "text"` | Select the visual contract for the hosted menu surface; Text uses a square character frame. |
| `Box.variant / frame / borderShape` | `surface recipe` | Configure the popup surface appearance independently from the right-click target. |
| `Menu / MenuItem` | `Cell descriptors` | Accessible menu content; the application handles activate commands. |
