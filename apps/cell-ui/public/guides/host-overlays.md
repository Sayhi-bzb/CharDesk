# Host overlays

One overlay host coordinates menus, modal panels, and notices across independent CellSurfaces.

## Installation



## Usage

Mount CellOverlayHost above every participating surface. CellPopover and CellContextMenu use an element or pointer rectangle as their anchor; CellSheet and CellAlertDialog are modal. Render CellSurface content inside each portal. CellToastViewport shares the layer without taking focus.

```tsx
import { CellOverlayHost, CellPopover, CellSurface } from "@chardesk/cell-ui/browser";
import { Root, Menu, MenuItem, Text } from "@chardesk/cell-ui";

<CellOverlayHost>
  <CellSurface viewport={{ width: 40, height: 10 }}>
    <Root />
  </CellSurface>
  <CellPopover open={open} anchor={trigger} onDismiss={() => setOpen(false)}>
    <CellSurface viewport={{ width: 20, height: 3 }}>
      <Root>
        <Menu id="actions" label="Actions">
          <MenuItem id="open" label="Open">
            <Text>Open</Text>
          </MenuItem>
        </Menu>
      </Root>
    </CellSurface>
  </CellPopover>
</CellOverlayHost>;
```

## Contract

The host owns stacking, viewport placement, outside/Escape dismissal, modal background inertness, and focus return. Menu content stays a Cell descriptor; app state decides when to open or close it.

- [Browser host source](https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/browser-overlay-host.tsx)
- [Gallery acceptance](https://github.com/Sayhi-bzb/CharDesk/blob/main/apps/cell-ui/e2e/overlay-host.spec.ts)
