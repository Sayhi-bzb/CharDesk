# Menu

Compose a Cell menubar with host-managed command menus across surfaces.

## Installation

Install the full editable source in a React project with components.json and aliases.lib: [Installation](https://ui.chardesk.com/guides/installation.md).

## Usage

```tsx
import { useState } from "react";
import {
  Box,
  Button,
  Menu,
  MenuItem,
  Root,
  Text,
  cellTextWidth,
} from "@/lib/cell-ui";
import { CellOverlayHost, CellPopover, CellSurface } from "@/lib/cell-ui/browser";

const titles = ["File", "Edit", "View"] as const;
type Title = (typeof titles)[number];
const action: Record<Title, string> = { File: "Open", Edit: "Undo", View: "Zoom In" };

export function MenuExample() {
  const [menu, setMenu] = useState<{ title: Title; anchor: Element } | null>(null);
  const popupWidth = cellTextWidth(action[menu?.title ?? "File"]) + 5;
  const open = (title: Title) => {
    const anchor = document.querySelector(
      '[data-cell-semantic-id="menu-' + title + '"]',
    );
    if (anchor) setMenu({ title, anchor });
  };
  return (
    <CellOverlayHost>
      <CellSurface
        viewport={{ width: 28, height: 1 }}
        onCommand={(command) => {
          const title = titles.find((item) => command.targetId === "menu-" + item);
          if (command.type === "activate" && title) open(title);
        }}
        onHoverChange={(id) => {
          const title = menu && titles.find((item) => id === "menu-" + item);
          if (title && title !== menu.title) open(title);
        }}
      >
        <Root>
          <Box style={{ direction: "row", gap: 2, width: 28 }}>
            {titles.map((title) => (
              <Button
                key={title}
                id={"menu-" + title}
                label={title + " menu"}
                variant={menu?.title === title ? "solid" : "ghost"}
                style={{ paddingLeft: 1, paddingRight: 1 }}
              >
                <Text>{title}</Text>
              </Button>
            ))}
          </Box>
        </Root>
      </CellSurface>
      <CellPopover
        open={menu !== null}
        anchor={menu?.anchor}
        onDismiss={() => setMenu(null)}
      >
        <CellSurface
          viewport={{ width: popupWidth, height: 1 }}
          focusedId="menu-action"
          onCommand={(command) => {
            if (command.type === "activate" && command.targetId === "menu-action")
              setMenu(null);
          }}
        >
          <Root>
            <Box variant="surface" frame="none" style={{ width: popupWidth }}>
              <Menu id="command-menu" label={menu?.title ?? "File"}>
                <MenuItem id="menu-action" label={action[menu?.title ?? "File"]}>
                  <Text>{action[menu?.title ?? "File"]}</Text>
                </MenuItem>
              </Menu>
            </Box>
          </Root>
        </CellSurface>
      </CellPopover>
    </CellOverlayHost>
  );
}
```

## Composition

```text
CellOverlayHost
├── CellSurface (trigger Buttons)
└── CellPopover | CellContextMenu (opened by app state)
    └── CellSurface
        └── Menu
            └── MenuItem (repeatable)
```

## View source

- [react.tsx](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/react.tsx)
- [browser-collections.tsx](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/browser-collections.tsx)
- [browser-overlay-host.tsx](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/browser-overlay-host.tsx)

## API

| Prop | Type | Description |
| --- | --- | --- |
| `Menu / MenuItem` | `Cell descriptors` | Accessible command collection and its items; app state handles activate commands. |
| `Box.variant?` | `"surface" \| "ghost"` | Popup surface recipe; applies independently of the menubar Button's active state. |
| `Box.frame?` | `"none" \| "bordered"` | Optional dropdown border; the Menu preview defaults to none in Rich and uses a square character frame in Text. |
| `Box.borderShape?` | `"square" \| "rounded"` | Rich border shape when frame is bordered; Text uses square characters. |
| `Button.disabled?` | `boolean` | Disable menubar triggers; the caller also dismisses any open menu. |
| `CellSurface.presentation` | `"rich" \| "text"` | Pass one mode to the menubar and every hosted menu surface. |
| `CellSurface.onHoverChange` | `(id: string \| null) => void` | Pointer hover target; use it to switch an already-open menubar. |
| `CellPopover.open` | `boolean` | Controlled popup visibility; mount inside CellOverlayHost. |
| `CellPopover.anchor` | `Element \| DOMRect \| null` | Element or pointer rectangle used for placement and focus return. |
| `CellPopover.onDismiss` | `(reason: "escape" \| "outside") => void` | Close the controlled popup; Escape returns focus to its anchor. |
| `CellContextMenu` | `browser component` | Same host-managed menu surface, anchored to a pointer rectangle. |
