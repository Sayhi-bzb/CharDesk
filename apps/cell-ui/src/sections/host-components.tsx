import { useState } from "react";
import {
  Box, Button, Menu, MenuItem, Root, Text,
  type CellBorderShape, type CellFrame, type CellUiPresentation, type SurfaceVariant, type WidgetCommand,
} from "@chardesk/cell-ui";
import {
  CellOverlayHost, CellPopover, CellSheet, CellSurface, CellToastViewport,
  DEFAULT_CELL_UI_METRICS, useCellSelectState, useCellToastState, type CellSurfaceProps,
} from "@chardesk/cell-ui/browser";
import { GallerySurface, useGalleryAppearance } from "../appearance";
import { ComponentPlayground } from "../component-playground";
import {
  renderPlaygroundCheckboxControl, renderPlaygroundSelectControl,
  renderRichOnlySelectControl, usePlaygroundFocus,
  surfaceVariantItems, frameItems, borderShapeItems,
} from "../playground-controls";

function HostedSurface(props: CellSurfaceProps) {
  const { theme, palette, recipe, fontProfile, feedback } = useGalleryAppearance();
  return <CellSurface {...props} metrics={DEFAULT_CELL_UI_METRICS} theme={theme}
    palette={palette} recipe={recipe} fontProfile={fontProfile} feedback={feedback} />;
}

const menuTitles = ["File", "Edit", "View"] as const;
type MenuTitle = typeof menuTitles[number];
type MenuEntry = Readonly<{ label: string; id: string; submenu?: boolean }>;
const menuEntries: Readonly<Record<MenuTitle, readonly MenuEntry[]>> = {
  File: [
    { id: "new", label: "New" }, { id: "open", label: "Open…" },
    { id: "export", label: "Export", submenu: true },
  ],
  Edit: [{ id: "undo", label: "Undo" }, { id: "redo", label: "Redo" }],
  View: [{ id: "zoom-in", label: "Zoom In" }, { id: "zoom-out", label: "Zoom Out" }],
};
const submenuEntries = [{ id: "export-text", label: "As Text" }, { id: "export-image", label: "As Image" }] as const;
const menuTriggerId = (title: MenuTitle) => `component-menu-${title.toLowerCase()}-trigger`;
const menuItemId = (id: string) => `component-menu-${id}`;
const menuAnchor = (id: string) => document.querySelector(`[data-cell-semantic-id="${id}"]`);

export function MenuComponentDemo() {
  const [presentation, setPresentation] = useState<CellUiPresentation>("rich");
  const [disabled, setDisabled] = useState(false);
  const variant = useCellSelectState("component-menu-variant", surfaceVariantItems, { defaultSelectedId: "surface" });
  const frame = useCellSelectState("component-menu-frame", frameItems, { defaultSelectedId: "none" });
  const borderShape = useCellSelectState("component-menu-border-shape", borderShapeItems, { defaultSelectedId: "square" });
  const focus = usePlaygroundFocus(menuTriggerId("File"), [variant, frame, borderShape]);
  const [activeMenu, setActiveMenu] = useState<{ title: MenuTitle; anchor: Element } | null>(null);
  const [submenuAnchor, setSubmenuAnchor] = useState<Element | null>(null);
  const popupFrame: CellFrame = presentation === "text" ? "bordered" : frame.selectedId as CellFrame;
  const popupBorderShape = presentation === "text" ? "square" : borderShape.selectedId as CellBorderShape;
  const popupInset = popupFrame === "bordered" ? 2 : 0;
  const dismiss = () => { setSubmenuAnchor(null); setActiveMenu(null); };
  const openMenu = (title: MenuTitle) => {
    if (disabled) return;
    const anchor = menuAnchor(menuTriggerId(title));
    if (!anchor) return;
    setSubmenuAnchor(null);
    setActiveMenu({ title, anchor });
  };
  const switchMenu = (direction: -1 | 1) => {
    if (!activeMenu) return;
    const index = menuTitles.indexOf(activeMenu.title);
    openMenu(menuTitles[(index + direction + menuTitles.length) % menuTitles.length]!);
  };
  const onHoverChange = (targetId: string | null) => {
    if (disabled || !activeMenu) return;
    const title = menuTitles.find((item) => menuTriggerId(item) === targetId);
    if (title && title !== activeMenu.title) openMenu(title);
  };
  const onCommand = (command: WidgetCommand) => {
    focus.dispatch(command);
    if (command.type !== "activate") return;
    if (command.targetId === "component-menu-disabled") {
      if (!disabled) dismiss();
      setDisabled((current) => !current);
      return;
    }
    if (disabled) return;
    const title = menuTitles.find((item) => menuTriggerId(item) === command.targetId);
    if (title) { openMenu(title); return; }
    if (command.targetId === menuItemId("export")) {
      setSubmenuAnchor(menuAnchor(menuItemId("export")));
      return;
    }
    const item = [...Object.values(menuEntries).flat(), ...submenuEntries]
      .find((entry) => menuItemId(entry.id) === command.targetId);
    if (!item) return;
    dismiss();
  };
  return <CellOverlayHost>
    <ComponentPlayground id="component-menu-playground" label="Menu component" probeId="component-menu"
      focusedId={focus.focusedId} onCommand={onCommand} onHoverChange={onHoverChange}
      previewMinColumns={30} controlsColumns={28} rows={9}
      presentation={presentation} onPresentationChange={setPresentation}
      preview={<Box style={{ direction: "row", gap: 2, width: 30 }}>
        {menuTitles.map((title) => <Button key={title} id={menuTriggerId(title)}
          label={`${title} menu`} disabled={disabled}
          variant={activeMenu?.title === title ? "solid" : "ghost"}
          style={{ paddingLeft: 1, paddingRight: 1 }}>
          <Text>{title}</Text>
        </Button>)}
      </Box>}
      controls={[
        renderPlaygroundSelectControl("variant", variant, focus.focusedId),
        renderRichOnlySelectControl("dropdown frame", frame, focus.focusedId),
        ...(frame.selectedId === "bordered"
          ? [renderRichOnlySelectControl("border shape", borderShape, focus.focusedId)] : []),
        renderPlaygroundCheckboxControl("disabled", "component-menu-disabled", disabled, focus.focusedId),
      ]} />
    <CellPopover open={activeMenu !== null} anchor={activeMenu?.anchor} onDismiss={dismiss}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight" && document.activeElement?.getAttribute("data-cell-semantic-id") === menuItemId("export")) {
          event.preventDefault();
          setSubmenuAnchor(document.activeElement);
        } else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
          event.preventDefault();
          switchMenu(event.key === "ArrowRight" ? 1 : -1);
        }
      }}>
      <HostedSurface label={`${activeMenu?.title ?? "File"} menu`} probeId="component-menu-popup"
        presentation={presentation}
        viewport={{ width: 26, height: (activeMenu ? menuEntries[activeMenu.title].length : 0) + popupInset }}
        focusedId={menuItemId(menuEntries[activeMenu?.title ?? "File"][0]!.id)}
        onCommand={onCommand}>
        <Root><Box variant={variant.selectedId as SurfaceVariant} frame={popupFrame}
          borderShape={popupBorderShape} style={{ width: 26 }}>
          <Menu id="component-menu-list" label={activeMenu?.title ?? "File"}>
            {menuEntries[activeMenu?.title ?? "File"].map((entry, index) =>
              <MenuItem key={entry.id} id={menuItemId(entry.id)} focused={index === 0}
                  label={entry.label} style={{ width: 26 - popupInset }}>
                  <Text>{entry.submenu ? `${entry.label.padEnd(20)}▸` : entry.label}</Text>
                </MenuItem>)}
          </Menu>
        </Box></Root>
      </HostedSurface>
    </CellPopover>
    <CellPopover open={submenuAnchor !== null} anchor={submenuAnchor} placement="right-start"
      onDismiss={() => setSubmenuAnchor(null)} onKeyDown={(event) => {
        if (event.key === "ArrowLeft") { event.preventDefault(); setSubmenuAnchor(null); }
      }}>
      <HostedSurface label="Export" probeId="component-menu-submenu-popup"
        presentation={presentation} viewport={{ width: 20, height: submenuEntries.length + popupInset }}
        focusedId={menuItemId("export-text")} onCommand={onCommand}>
        <Root><Box variant={variant.selectedId as SurfaceVariant} frame={popupFrame}
          borderShape={popupBorderShape} style={{ width: 20 }}>
          <Menu id="component-menu-submenu" label="Export">
            {submenuEntries.map((entry, index) => <MenuItem key={entry.id} id={menuItemId(entry.id)}
              focused={index === 0} label={entry.label} style={{ width: 20 - popupInset }}><Text>{entry.label}</Text></MenuItem>)}
          </Menu>
        </Box></Root>
      </HostedSurface>
    </CellPopover>
  </CellOverlayHost>;
}

export function SheetComponentDemo() {
  const [open, setOpen] = useState(false);
  const onCommand = (command: WidgetCommand) => {
    if (command.type !== "activate") return;
    if (command.targetId === "component-sheet-trigger") setOpen(true);
    if (command.targetId === "component-sheet-close") setOpen(false);
  };
  return <CellOverlayHost>
    <GallerySurface label="Sheet component" probeId="component-sheet" viewport={{ width: 36, height: 4 }}
      focusedId="component-sheet-trigger" onCommand={onCommand}>
      <Root><Button id="component-sheet-trigger" label="Open sheet"><Text>Open settings</Text></Button></Root>
    </GallerySurface>
    <CellSheet open={open} label="Workspace settings" onDismiss={() => setOpen(false)}>
      <HostedSurface label="Workspace settings" viewport={{ width: 28, height: 12 }}
        focusedId="component-sheet-close" onCommand={onCommand}>
        <Root><Box variant="surface" frame="bordered" style={{ width: "100%", height: "100%" }}>
          <Text>Workspace settings</Text>
          <Button id="component-sheet-close" focused label="Close sheet"><Text>Close</Text></Button>
        </Box></Root>
      </HostedSurface>
    </CellSheet>
  </CellOverlayHost>;
}

export function ToastComponentDemo() {
  const toast = useCellToastState();
  const onCommand = (command: WidgetCommand) => {
    if (command.type !== "activate" || command.targetId !== "component-toast-trigger") return;
    toast.push({ id: "component-toast-saved", durationMs: 3000,
      content: <HostedSurface label="Save notice" probeId="component-toast-notice"
        viewport={{ width: 22, height: 2 }} onCommand={() => {}}>
        <Root><Box variant="surface" frame="bordered" style={{ width: "100%" }}>
          <Text>Saved to workspace</Text>
        </Box></Root>
      </HostedSurface> });
  };
  return <CellOverlayHost>
    <GallerySurface label="Toast component" probeId="component-toast" viewport={{ width: 36, height: 4 }}
      focusedId="component-toast-trigger" onCommand={onCommand}>
      <Root><Button id="component-toast-trigger" label="Show toast"><Text>Save workspace</Text></Button></Root>
    </GallerySurface>
    <CellToastViewport state={toast} />
  </CellOverlayHost>;
}
