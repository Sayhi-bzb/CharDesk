import { useState } from "react";
import { Box, Button, List, ListItem, Menu, MenuItem, Root, Text,
  reorderCellItems, type WidgetCommand } from "@chardesk/cell-ui";
import { CellAlertDialog, CellContextMenu, CellOverlayHost, CellPopover,
  CellToastViewport, useCellToastState } from "@chardesk/cell-ui/browser";
import { GallerySurface } from "../appearance";

export function OverlayHostDemo() {
  const [anchor, setAnchor] = useState<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [contextAnchor, setContextAnchor] = useState<DOMRect | null>(null);
  const [submenuAnchor, setSubmenuAnchor] = useState<Element | null>(null);
  const [alertOpen, setAlertOpen] = useState(false);
  const [layers, setLayers] = useState<readonly { id: string; label: string }[]>([
    { id: "layer-title", label: "Title" },
    { id: "layer-chart", label: "Chart" },
    { id: "layer-notes", label: "Notes" },
  ]);
  const toast = useCellToastState();
  const command = (event: WidgetCommand) => {
    if (event.type === "activate" && event.targetId === "host-menu-trigger") setOpen(true);
    if (event.type === "activate" && event.targetId === "host-menu-item") setOpen(false);
    if (event.type === "activate" && event.targetId === "host-menu-more") {
      setSubmenuAnchor(document.querySelector('[data-cell-semantic-id="host-menu-more"]'));
    }
    if (event.type === "activate" && event.targetId === "host-submenu-item") {
      setSubmenuAnchor(null);
      setOpen(false);
    }
    if (event.type === "activate" && event.targetId === "host-context-item") setContextAnchor(null);
    if (event.type === "activate" && event.targetId === "host-alert-trigger") setAlertOpen(true);
    if (event.type === "activate" && event.targetId === "host-alert-cancel") setAlertOpen(false);
    if (event.type === "activate" && event.targetId === "host-toast-trigger") {
      toast.push({ id: "host-toast", content: <GallerySurface label="Save notice" probeId="host-toast"
        viewport={{ width: 20, height: 2 }} onCommand={() => {}}>
        <Root><Text>Saved to workspace</Text></Root>
      </GallerySurface>, durationMs: 3000 });
    }
    if (event.type === "reorder") setLayers((current) => reorderCellItems(current, event.targetId, event.toIndex));
  };
  return <CellOverlayHost>
    <div ref={setAnchor} data-testid="host-top-surface">
      <GallerySurface label="Host top bar" probeId="host-top-surface"
        viewport={{ width: 52, height: 2 }} onCommand={command}>
        <Root style={{ direction: "row", gap: 1 }}>
          <Button id="host-menu-trigger" label="Open host menu"><Text>Menu ▾</Text></Button>
          <Button id="host-alert-trigger" label="Open alert dialog"><Text>Confirm</Text></Button>
          <Button id="host-toast-trigger" label="Show toast"><Text>Notify</Text></Button>
        </Root>
      </GallerySurface>
    </div>
    <div data-testid="host-canvas-surface" style={{ marginTop: 16 }}
      onContextMenu={(event) => {
        event.preventDefault();
        setContextAnchor(new DOMRect(event.clientX, event.clientY, 0, 0));
      }}>
      <GallerySurface label="Host canvas" probeId="host-canvas-surface"
        viewport={{ width: 42, height: 8 }} onCommand={command}>
        <Root><Box frame="bordered" style={{ width: "100%", height: "100%" }}>
          <Text>Canvas layers · Alt+↑/↓ or drag to reorder</Text>
          <List id="host-layers" label="Canvas layers" reorderable>
            {layers.map((layer) => <ListItem key={layer.id} id={layer.id}
              label={layer.label}><Text>{layer.label}</Text></ListItem>)}
          </List>
        </Box></Root>
      </GallerySurface>
    </div>
    <CellPopover open={open} anchor={anchor} onKeyDown={(event) => {
      if (event.key === "ArrowRight" && document.activeElement?.getAttribute("data-cell-semantic-id") === "host-menu-more") {
        event.preventDefault();
        setSubmenuAnchor(document.activeElement);
      }
    }} onDismiss={() => {
      setSubmenuAnchor(null); setOpen(false);
    }}>
      <GallerySurface label="Host menu" probeId="host-menu-surface"
        viewport={{ width: 20, height: 4 }} focusedId="host-menu-item" onCommand={command}
        onHoverChange={(targetId) => {
          if (targetId === "host-menu-more") {
            setSubmenuAnchor(document.querySelector('[data-cell-semantic-id="host-menu-more"]'));
          } else if (targetId === "host-menu-item") {
            setSubmenuAnchor(null);
          }
        }}>
        <Root><Box variant="surface" frame="bordered" style={{ width: "100%" }}>
          <Menu id="host-menu" label="Host menu"><MenuItem id="host-menu-item" focused label="Choose menu item">
            <Text>Choose</Text>
          </MenuItem><MenuItem id="host-menu-more" label="More actions"><Text>More ▸</Text></MenuItem></Menu>
        </Box></Root>
      </GallerySurface>
    </CellPopover>
    <CellPopover open={submenuAnchor !== null} anchor={submenuAnchor} placement="right-item"
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") { event.preventDefault(); setSubmenuAnchor(null); }
      }}
      onDismiss={() => setSubmenuAnchor(null)}>
      <GallerySurface label="More actions" probeId="host-submenu" focusedId="host-submenu-item"
        viewport={{ width: 20, height: 3 }} onCommand={command}>
        <Root><Box variant="surface" frame="bordered" style={{ width: "100%" }}>
          <Menu id="host-submenu-menu" label="More actions">
            <MenuItem id="host-submenu-item" focused label="Nested action"><Text>Nested action</Text></MenuItem>
          </Menu>
        </Box></Root>
      </GallerySurface>
    </CellPopover>
    <CellContextMenu open={contextAnchor !== null} anchor={contextAnchor}
      onDismiss={() => setContextAnchor(null)}>
      <GallerySurface label="Canvas context menu" probeId="host-context-menu"
        viewport={{ width: 20, height: 3 }} focusedId="host-context-item" onCommand={command}>
        <Root><Box variant="surface" frame="bordered" style={{ width: "100%" }}>
          <Menu id="host-context-menu" label="Canvas context menu"><MenuItem id="host-context-item" focused
            label="Context action"><Text>Context action</Text></MenuItem></Menu>
        </Box></Root>
      </GallerySurface>
    </CellContextMenu>
    <CellAlertDialog open={alertOpen} label="Delete item?" onDismiss={() => setAlertOpen(false)}>
      <GallerySurface label="Delete confirmation" probeId="host-alert" focusedId="host-alert-cancel"
        viewport={{ width: 28, height: 5 }} onCommand={command}>
        <Root><Box variant="surface" frame="bordered" style={{ width: "100%", height: "100%" }}>
          <Text>Delete this item?</Text>
          <Button id="host-alert-cancel" focused label="Cancel delete"><Text>Cancel</Text></Button>
        </Box></Root>
      </GallerySurface>
    </CellAlertDialog>
    <CellToastViewport state={toast} />
  </CellOverlayHost>;
}
