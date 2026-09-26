import { useState } from "react";
import {
  Box, Button, Menu, MenuItem, Root, Text, Toast, cellTextWidth,
  type BadgeTone, type CellBorderShape, type CellFrame, type CellUiPresentation, type SurfaceVariant, type WidgetCommand,
} from "@chardesk/cell-ui";
import {
  CellOverlayHost, CellPopover, CellSurface, CellToastViewport,
  DEFAULT_CELL_UI_METRICS, useCellSelectState, useCellToastState, type CellSurfaceProps,
} from "@chardesk/cell-ui/browser";
import { useGalleryAppearance } from "../appearance";
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
const menuNaturalWidth = (entries: readonly MenuEntry[]) => Math.max(1,
  ...entries.map((entry) => 2 + cellTextWidth(entry.label) + (entry.submenu ? 3 : 0) + 1 + 2));
const menuItemText = (entry: MenuEntry, innerWidth: number) => entry.submenu
  ? `${entry.label}${" ".repeat(Math.max(1, innerWidth - 2 - 1 - 1 - cellTextWidth(entry.label)))}▸`
  : entry.label;
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
  const mainEntries = menuEntries[activeMenu?.title ?? "File"];
  const mainWidth = menuNaturalWidth(mainEntries);
  const submenuWidth = menuNaturalWidth(submenuEntries);
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
  const onPopupHoverChange = (targetId: string | null) => {
    if (disabled || !activeMenu || !targetId) return;
    if (targetId === menuItemId("export")) {
      setSubmenuAnchor(menuAnchor(targetId));
    } else if (mainEntries.some((entry) => menuItemId(entry.id) === targetId)) {
      setSubmenuAnchor(null);
    }
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
        viewport={{ width: mainWidth, height: (activeMenu ? menuEntries[activeMenu.title].length : 0) + popupInset }}
        focusedId={menuItemId(menuEntries[activeMenu?.title ?? "File"][0]!.id)}
        onCommand={onCommand} onHoverChange={onPopupHoverChange}>
        <Root><Box variant={variant.selectedId as SurfaceVariant} frame={popupFrame}
          borderShape={popupBorderShape} style={{ width: mainWidth }}>
          <Menu id="component-menu-list" label={activeMenu?.title ?? "File"}>
            {mainEntries.map((entry, index) =>
              <MenuItem key={entry.id} id={menuItemId(entry.id)} focused={index === 0}
                  label={entry.label} style={{ width: mainWidth - popupInset }}>
                  <Text>{menuItemText(entry, mainWidth - popupInset)}</Text>
                </MenuItem>)}
          </Menu>
        </Box></Root>
      </HostedSurface>
    </CellPopover>
    <CellPopover open={submenuAnchor !== null} anchor={submenuAnchor} placement="right-item"
      onDismiss={() => setSubmenuAnchor(null)} onKeyDown={(event) => {
        if (event.key === "ArrowLeft") { event.preventDefault(); setSubmenuAnchor(null); }
      }}>
      <HostedSurface label="Export" probeId="component-menu-submenu-popup"
        presentation={presentation} viewport={{ width: submenuWidth, height: submenuEntries.length + popupInset }}
        focusedId={menuItemId("export-text")} onCommand={onCommand}>
        <Root><Box variant={variant.selectedId as SurfaceVariant} frame={popupFrame}
          borderShape={popupBorderShape} style={{ width: submenuWidth }}>
          <Menu id="component-menu-submenu" label="Export">
            {submenuEntries.map((entry, index) => <MenuItem key={entry.id} id={menuItemId(entry.id)}
              focused={index === 0} label={entry.label} style={{ width: submenuWidth - popupInset }}><Text>{entry.label}</Text></MenuItem>)}
          </Menu>
        </Box></Root>
      </HostedSurface>
    </CellPopover>
  </CellOverlayHost>;
}

export function ToastComponentDemo() {
  const [presentation, setPresentation] = useState<CellUiPresentation>("rich");
  const tone = useCellSelectState("component-toast-tone", (["neutral", "info", "success", "warning", "error"] as const)
    .map((value) => ({ id: value, label: value })), { defaultSelectedId: "neutral" });
  const variant = useCellSelectState("component-toast-variant", surfaceVariantItems, { defaultSelectedId: "surface" });
  const frame = useCellSelectState("component-toast-frame", frameItems, { defaultSelectedId: "bordered" });
  const borderShape = useCellSelectState("component-toast-border-shape", borderShapeItems, { defaultSelectedId: "square" });
  const focus = usePlaygroundFocus("component-toast-trigger", [tone, variant, frame, borderShape]);
  const toast = useCellToastState();
  const onCommand = (command: WidgetCommand) => {
    focus.dispatch(command);
    if (command.type !== "activate" || command.targetId !== "component-toast-trigger") return;
    const toastRows = presentation === "text" || frame.selectedId === "bordered" ? 3 : 1;
    toast.push({ id: "component-toast-saved", durationMs: 3000,
      content: <HostedSurface label="Save notice" probeId="component-toast-notice"
        presentation={presentation} viewport={{ width: 24, height: toastRows }} onCommand={() => {}}>
        <Root><Toast id="component-toast-content" tone={tone.selectedId as BadgeTone}
          variant={variant.selectedId as SurfaceVariant} frame={frame.selectedId as CellFrame}
          borderShape={borderShape.selectedId as CellBorderShape}>
          <Text>Saved to workspace</Text>
        </Toast></Root>
      </HostedSurface> });
  };
  return <CellOverlayHost>
    <ComponentPlayground id="component-toast-playground" label="Toast component" probeId="component-toast"
      focusedId={focus.focusedId} onCommand={onCommand} previewMinColumns={30} controlsColumns={28} rows={9}
      presentation={presentation} onPresentationChange={setPresentation}
      preview={<Button id="component-toast-trigger" label="Show toast"><Text>Save workspace</Text></Button>}
      controls={[
        renderPlaygroundSelectControl("tone", tone, focus.focusedId),
        renderPlaygroundSelectControl("variant", variant, focus.focusedId),
        renderRichOnlySelectControl("frame", frame, focus.focusedId),
        ...(frame.selectedId === "bordered"
          ? [renderRichOnlySelectControl("border shape", borderShape, focus.focusedId)] : []),
      ]} />
    <CellToastViewport state={toast} />
  </CellOverlayHost>;
}
