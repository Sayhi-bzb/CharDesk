import { Fragment, useEffect, useState } from "react";
import {
  Box,
  Dialog,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
  Button,
  Badge,
  Checkbox,
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  Toggle,
  Progress,
  Separator,
  RadioGroup,
  RadioItem,
  List,
  ListItem,
  RangeSlider,
  RangeSliderThumb,
  Root,
  ScrollArea,
  Slider,
  Tab,
  TabPanel,
  Tabs,
  Text,
  TextInput,
  type ButtonVariant,
  type CellBorderShape,
  type CellFrame,
  type ProgressVariant,
  type SeparatorVariant,
  type SurfaceVariant,
  type WidgetCommand,
} from "@chardesk/cell-ui";
import {
  useCellListState,
  useCellComboboxState,
  useCellRadioState,
  useCellSelectState,
  useCellTabsState,
  useCellTextState,
} from "@chardesk/cell-ui/browser";
import { GallerySurface } from "../appearance";
import { ComponentPlayground } from "../component-playground";
import {
  renderGalleryCheckbox,
  renderGallerySelect,
} from "../gallery-component-recipes";

const noCommand = () => undefined;

const dialogVariantItems = (["surface", "ghost"] as const).map((value) => ({ id: value, label: value }));
const dialogFrameItems = (["bordered", "none"] as const).map((value) => ({ id: value, label: value }));
const dialogBorderShapeItems = (["square", "rounded"] as const).map((value) => ({ id: value, label: value }));
const buttonVariantItems = (["solid", "surface", "outline", "ghost"] as const).map((value) => ({ id: value, label: value }));
const buttonSaveIcon = "\uEB4B"; // cod-save in the pinned Nerd Fonts 3.5.1 catalog.
const buttonContentItems = [
  { id: "text", label: "text", text: "Save" },
  { id: "icon-only", label: "icon-only", text: buttonSaveIcon },
  { id: "icon-text", label: "icon + text", text: `${buttonSaveIcon} Save` },
] as const;
const surfaceVariantItems = (["surface", "ghost"] as const).map((value) => ({ id: value, label: value }));
const frameItems = (["none", "bordered"] as const).map((value) => ({ id: value, label: value }));
const borderShapeItems = (["square", "rounded"] as const).map((value) => ({ id: value, label: value }));
const progressVariantItems = (["solid", "outline"] as const).map((value) => ({ id: value, label: value }));
const separatorVariantItems = [
  { id: "line", label: "───────" },
  { id: "slash", label: "///////" },
  { id: "double", label: "═══════" },
  { id: "dots", label: "·······" },
] satisfies readonly Readonly<{ id: SeparatorVariant; label: string }>[];

export const DialogComponentDemo = () => {
  const [open, setOpen] = useState(false);
  const variant = useCellSelectState("component-dialog-variant", dialogVariantItems, {
    defaultSelectedId: "surface",
  });
  const frame = useCellSelectState("component-dialog-frame", dialogFrameItems, {
    defaultSelectedId: "bordered",
  });
  const borderShape = useCellSelectState("component-dialog-border-shape", dialogBorderShapeItems, {
    defaultSelectedId: "square",
  });
  const focus = usePlaygroundFocus("dialog-open", [variant, frame, borderShape]);
  const dispatch = (command: WidgetCommand) => {
    focus.dispatch(command);
    if (command.type === "dismiss" && command.targetId === "demo-dialog") setOpen(false);
    if (command.type !== "activate") return;
    if (command.targetId === "dialog-open") setOpen(true);
    if (command.targetId === "dialog-cancel" || command.targetId === "dialog-confirm") setOpen(false);
  };
  return <ComponentPlayground id="component-dialog-playground" label="Dialog component" probeId="component-dialog"
    focusedId={focus.focusedId} onCommand={dispatch} previewMinColumns={36} controlsColumns={29} overlayRows={5}
    preview={<Box variant="ghost">
      <Button id="dialog-open"><Text>Open dialog</Text></Button>
      {open && <Dialog id="demo-dialog" initialFocusId="dialog-cancel"
        variant={variant.selectedId as SurfaceVariant}
        frame={frame.selectedId as CellFrame}
        borderShape={frame.selectedId === "bordered" ? borderShape.selectedId as CellBorderShape : undefined}>
        <DialogTitle>Continue?</DialogTitle>
        <DialogDescription>This is a preview confirmation.</DialogDescription>
        <DialogFooter>
          <Button id="dialog-cancel" variant="ghost"><Text>Cancel</Text></Button>
          <Button id="dialog-confirm"><Text>Continue</Text></Button>
        </DialogFooter>
      </Dialog>}
    </Box>}
    controls={[
      renderPlaygroundSelectControl("variant", variant, focus.focusedId),
      renderPlaygroundSelectControl("frame", frame, focus.focusedId),
      ...(frame.selectedId === "bordered"
        ? [renderPlaygroundSelectControl("border shape", borderShape, focus.focusedId)]
        : []),
    ]} />;
};

export const AccordionComponentDemo = () => {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [disabled, setDisabled] = useState(false);
  const [separated, setSeparated] = useState(false);
  const [sound, setSound] = useState(true);
  const theme = useCellSelectState("accordion-theme", [
    { id: "accordion-dark", label: "Dark" }, { id: "accordion-light", label: "Light" },
  ], { defaultSelectedId: "accordion-dark" });
  const focus = usePlaygroundFocus("accordion-general-trigger", [theme]);
  const dispatch = (command: WidgetCommand) => {
    focus.dispatch(command);
    if (command.type === "set-expanded" && ["accordion-general", "accordion-appearance", "accordion-advanced"].includes(command.targetId)) {
      setExpanded((current) => {
        const next = new Set(current);
        if (command.expanded) next.add(command.targetId); else next.delete(command.targetId);
        return next;
      });
    }
    if (command.type === "activate" && command.targetId === "accordion-sound") setSound((current) => !current);
    if (command.type === "activate" && command.targetId === "accordion-disabled") setDisabled((current) => !current);
    if (command.type === "activate" && command.targetId === "accordion-separator") setSeparated((current) => !current);
  };
  return <ComponentPlayground id="component-accordion-playground" label="Accordion component" probeId="component-accordion"
    focusedId={focus.focusedId} onCommand={dispatch} previewMinColumns={30} controlsColumns={25}
    overlayRows={theme.open ? theme.items.length : 0}
    preview={<Accordion id="accordion-settings" disabled={disabled} style={{ width: 30 }}>
      {["general", "appearance", "advanced"].map((name, index) => <Fragment key={name}>
        {separated && index > 0 ? <Separator id={`accordion-${name}-separator`} /> : null}
        <AccordionItem id={`accordion-${name}`} expanded={expanded.has(`accordion-${name}`)}>
        <AccordionTrigger id={`accordion-${name}-trigger`}><Text>{name.charAt(0).toUpperCase() + name.slice(1)}</Text></AccordionTrigger>
        <AccordionContent style={{ paddingLeft: 4 }}>
          {name === "appearance" ? <Box style={{ width: playgroundControlWidth }}>
            {renderPlaygroundSelectControl("Theme", theme, focus.focusedId)}
            <Checkbox id="accordion-sound" label="Sound" checked={sound}><Text>Sound</Text></Checkbox>
          </Box> : <Text>{name === "general" ? "Project settings" : "Advanced settings"}</Text>}
        </AccordionContent>
        </AccordionItem>
      </Fragment>)}
    </Accordion>}
    controls={[
      renderPlaygroundCheckboxControl("separator", "accordion-separator", separated, focus.focusedId),
      renderPlaygroundCheckboxControl("disabled", "accordion-disabled", disabled, focus.focusedId),
    ]} />;
};

export const ToggleComponentDemo = () => {
  const [pressed, setPressed] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const focus = usePlaygroundFocus("component-toggle-bold", []);
  const dispatch = (command: WidgetCommand) => {
    focus.dispatch(command);
    if (command.type !== "activate") return;
    if (command.targetId === "component-toggle-bold") {
      setPressed((value) => !value);
    }
    if (command.targetId === "component-toggle-disabled") setDisabled((value) => !value);
  };
  return <ComponentPlayground id="component-toggle-playground" label="Toggle component" probeId="component-toggle"
    focusedId={focus.focusedId} onCommand={dispatch} previewMinColumns={10} controlsColumns={25}
    preview={<Toggle id="component-toggle-bold" label="Bold" pressed={pressed} disabled={disabled}
      focused={focus.focusedId === "component-toggle-bold"}><Text>Bold</Text></Toggle>}
    controls={[
      renderPlaygroundCheckboxControl("disabled", "component-toggle-disabled", disabled, focus.focusedId),
    ]} />;
};

const PROGRESS_DEMO_STEPS = [
  { delayMs: 180, value: 7 },
  { delayMs: 260, value: 15 },
  { delayMs: 520, value: 18 },
  { delayMs: 160, value: 31 },
  { delayMs: 240, value: 47 },
  { delayMs: 700, value: 49 },
  { delayMs: 140, value: 68 },
  { delayMs: 360, value: 79 },
  { delayMs: 900, value: 82 },
  { delayMs: 180, value: 94 },
  { delayMs: 420, value: 100 },
  { delayMs: 800, value: 0 },
] as const;
export const ProgressComponentDemo = () => {
  const [indeterminate, setIndeterminate] = useState(false);
  const [number, setNumber] = useState(false);
  const [value, setValue] = useState(0);
  const variant = useCellSelectState("component-progress-variant", progressVariantItems, {
    defaultSelectedId: "solid",
  });
  const focus = usePlaygroundFocus("component-progress-indeterminate", [variant]);
  useEffect(() => {
    if (indeterminate) return;
    let stepIndex = 0;
    let timer: number | undefined;
    const advance = () => {
      const step = PROGRESS_DEMO_STEPS[stepIndex]!;
      timer = window.setTimeout(() => {
        setValue(step.value);
        stepIndex = (stepIndex + 1) % PROGRESS_DEMO_STEPS.length;
        advance();
      }, step.delayMs);
    };
    advance();
    return () => { if (timer !== undefined) window.clearTimeout(timer); };
  }, [indeterminate]);
  const dispatch = (command: WidgetCommand) => {
    focus.dispatch(command);
    if (command.type === "activate" && command.targetId === "component-progress-indeterminate") {
      setValue(0);
      setIndeterminate((current) => !current);
    }
    if (command.type === "activate" && command.targetId === "component-progress-number") {
      setNumber((current) => !current);
    }
  };
  return <ComponentPlayground id="component-progress-playground" label="Progress component"
    probeId="component-progress" focusedId={focus.focusedId} onCommand={dispatch}
    previewMinColumns={20} controlsColumns={25}
    overlayRows={focus.activeSelect?.items.length ?? 0}
    preview={<Progress id="component-progress-bar" label="Progress"
      value={indeterminate ? null : value} number={number} variant={variant.selectedId as ProgressVariant}
      style={{ width: 20 }} />}
    controls={[
      renderPlaygroundSelectControl("variant", variant, focus.focusedId),
      renderPlaygroundCheckboxControl(
        "number",
        "component-progress-number",
        number,
        focus.focusedId,
      ),
      renderPlaygroundCheckboxControl(
        "indeterminate",
        "component-progress-indeterminate",
        indeterminate,
        focus.focusedId,
      ),
    ]} />;
};

const orientationItems = ["horizontal", "vertical"].map((value) => ({ id: value, label: value }));
export const SeparatorComponentDemo = () => {
  const variant = useCellSelectState("component-separator-variant", separatorVariantItems, {
    defaultSelectedId: "line",
  });
  const orientation = useCellSelectState("component-separator-orientation", orientationItems, {
    defaultSelectedId: "horizontal",
  });
  const focus = usePlaygroundFocus(variant.triggerId, [variant, orientation]);
  const vertical = orientation.selectedId === "vertical";
  return <ComponentPlayground id="component-separator-playground" label="Separator component" probeId="component-separator"
    focusedId={focus.focusedId} onCommand={focus.dispatch} previewMinColumns={20} controlsColumns={25}
    overlayRows={focus.activeSelect ? focus.activeSelect.items.length : 0}
    preview={<Separator id="component-separator-line" orientation={vertical ? "vertical" : "horizontal"}
      variant={variant.selectedId as SeparatorVariant}
      style={vertical ? { height: 5 } : { width: 20 }} />}
    controls={[
      renderPlaygroundSelectControl("variant", variant, focus.focusedId, (id) => id),
      renderPlaygroundSelectControl("direction", orientation, focus.focusedId),
    ]} />;
};

const radioItems = ["Light", "Dark", "System"].map((label) => ({
  id: `component-radio-${label.toLowerCase()}`, value: label.toLowerCase(), label,
}));
export const RadioComponentDemo = () => {
  const [value, setValue] = useState("light");
  const [disabled, setDisabled] = useState(false);
  const radio = useCellRadioState(radioItems, { value, disabled, onValueChange: setValue });
  const focus = usePlaygroundFocus(radio.focusedId ?? "component-radio-disabled", []);
  const dispatch = (command: WidgetCommand) => {
    focus.dispatch(command);
    radio.dispatch(command);
    if (command.type === "select-radio" || (command.type === "activate" && radioItems.some((item) => item.id === command.targetId))) {
      focus.dispatch({ type: "focus", targetId: command.targetId });
    }
    if (command.type === "activate" && command.targetId === "component-radio-disabled") setDisabled((value) => !value);
  };
  return <ComponentPlayground id="component-radio-playground" label="Radio component" probeId="component-radio"
    focusedId={focus.focusedId} onCommand={dispatch} previewMinColumns={14} controlsColumns={25}
    preview={<RadioGroup id="component-radio-group" label="Appearance" value={value} disabled={disabled}>
      {radio.items.map((item) => <RadioItem key={item.id} id={item.id} value={item.value}
        focused={focus.focusedId === item.id}><Text>{item.label}</Text></RadioItem>)}
    </RadioGroup>}
    controls={[
      renderPlaygroundCheckboxControl("disabled", "component-radio-disabled", disabled, focus.focusedId),
    ]} />;
};

export const TextComponentDemo = () => (
  <GallerySurface
    viewport={{ width: 36, height: 14 }}
    onCommand={noCommand}
    label="Text component"
    probeId="component-text"
  >
    <Root id="component-text-root">
      <Box id="component-text-frame" frame="bordered" style={{ height: 14, padding: 1 }}>
        <Text id="component-text-plain" textStyle={{ bold: true }}>◆ Plain text · READY</Text>
        <Text id="component-text-unicode">→ Unicode: 世界 👋</Text>
        <Text id="component-text-move">↔ Move: ← ↑ ↓ →</Text>
        <Text id="component-text-status">✓ Status: PASS · IDLE</Text>
        <Text id="component-text-math">∞ Math: ≠ ≤ ≥ ± × ÷</Text>
        <Text id="component-text-signal">▓ Signal: ░▒▓█</Text>
        <Text id="component-text-cell-graphics">{`⣿ Cell: \ue0b0 \uee03 \uf5ee`}</Text>
        <Text id="component-text-legacy">{`Legacy: \u{1fb95} \u{1fbb0} \u{1fbc5}`}</Text>
        <Text id="component-text-wrap" textStyle={{ dim: true }}>↳ Wraps on integer Cell boundaries.</Text>
      </Box>
    </Root>
  </GallerySurface>
);

type PlaygroundSelectState = ReturnType<typeof useCellSelectState>;
const playgroundControlWidth = 15;

const usePlaygroundFocus = (
  initialFocusedId: string,
  selects: readonly PlaygroundSelectState[],
) => {
  const [focusedId, setFocusedId] = useState(initialFocusedId);
  const activeSelect = selects.find(({ open }) => open) ?? null;
  const dispatch = (command: WidgetCommand) => {
    if (command.type === "focus") setFocusedId(command.targetId);
    selects.forEach((select) => {
      select.dispatch(command);
      if (command.type === "dismiss" && command.targetId === select.contentId) {
        setFocusedId(select.triggerId);
      }
      if (command.type === "activate" && select.items.some(({ id }) => id === command.targetId)) {
        setFocusedId(select.triggerId);
      }
    });
  };
  return {
    activeSelect,
    dispatch,
    focusedId: activeSelect?.focusedId ?? focusedId,
  };
};

const renderPlaygroundSelectControl = (
  label: string,
  select: PlaygroundSelectState,
  focusedId: string,
  itemSemanticLabel?: (id: string) => string,
) => renderGallerySelect({
  label,
  select,
  focusedId,
  width: playgroundControlWidth,
  itemSemanticLabel,
});

const renderPlaygroundCheckboxControl = (
  label: string,
  id: string,
  checked: boolean,
  focusedId: string,
) => renderGalleryCheckbox({ id, label, checked, focusedId });

export const BoxComponentDemo = () => {
  const variant = useCellSelectState("component-box-variant", surfaceVariantItems, {
    defaultSelectedId: "ghost",
  });
  const frame = useCellSelectState("component-box-frame", frameItems, {
    defaultSelectedId: "none",
  });
  const borderShape = useCellSelectState("component-box-border-shape", borderShapeItems, {
    defaultSelectedId: "square",
  });
  const focus = usePlaygroundFocus(variant.triggerId, [variant, frame, borderShape]);
  return <ComponentPlayground
    id="component-box-playground"
    focusedId={focus.focusedId}
    onCommand={focus.dispatch}
    label="Box component"
    probeId="component-box"
    previewMinColumns={20}
    controlsColumns={25}
    overlayRows={focus.activeSelect?.items.length ?? 0}
    preview={
      <Box
        id="component-box-preview"
        variant={variant.selectedId as SurfaceVariant}
        frame={frame.selectedId as CellFrame}
        borderShape={frame.selectedId === "bordered" ? borderShape.selectedId as CellBorderShape : undefined}
        style={{ width: 20, height: 3, paddingLeft: 1 }}
      ><Text>Block</Text></Box>
    }
    controls={[
      renderPlaygroundSelectControl("variant", variant, focus.focusedId),
      renderPlaygroundSelectControl("frame", frame, focus.focusedId),
      ...(frame.selectedId === "bordered"
        ? [renderPlaygroundSelectControl("border shape", borderShape, focus.focusedId)]
        : []),
    ]}
  />;
};

export const ButtonComponentDemo = () => {
  const [disabled, setDisabled] = useState(false);
  const variant = useCellSelectState("component-button-variant", buttonVariantItems, {
    defaultSelectedId: "solid",
  });
  const content = useCellSelectState("component-button-content", buttonContentItems, {
    defaultSelectedId: "text",
  });
  const previewText = buttonContentItems.find((item) => item.id === content.selectedId)?.text ?? "Save";
  const focus = usePlaygroundFocus("component-button-save", [variant, content]);
  const dispatch = (command: WidgetCommand) => {
    focus.dispatch(command);
    if (command.type === "activate" && command.targetId === "component-button-disabled") {
      setDisabled((current) => !current);
    }
  };
  return <ComponentPlayground
    id="component-button-playground"
    focusedId={focus.focusedId}
    onCommand={dispatch}
    label="Button component"
    probeId="component-button"
    previewMinColumns={10}
    controlsColumns={25}
    overlayRows={focus.activeSelect?.items.length ?? 0}
    preview={
      <Button
        id="component-button-save"
        label="Save document"
        variant={variant.selectedId as ButtonVariant}
        disabled={disabled}
        focused={focus.focusedId === "component-button-save"}
      ><Text>{previewText}</Text></Button>
    }
    controls={[
      renderPlaygroundSelectControl("variant", variant, focus.focusedId),
      renderPlaygroundSelectControl("content", content, focus.focusedId),
      renderPlaygroundCheckboxControl(
        "disabled",
        "component-button-disabled",
        disabled,
        focus.focusedId,
      ),
    ]}
  />;
};

export const BadgeComponentDemo = () => {
  const [focusedId, setFocusedId] = useState<string | null>(null);
  return <ComponentPlayground
    id="component-badge-playground"
    focusedId={focusedId}
    onCommand={(command) => {
      if (command.type === "focus") setFocusedId(command.targetId);
    }}
    label="Badge component"
    probeId="component-badge"
    previewMinColumns={26}
    preview={<Box style={{ direction: "column", gap: 1 }}>
      <Box style={{ direction: "row", gap: 1 }}>
        <Badge id="component-badge-neutral" tone="neutral"><Text>Waiting</Text></Badge>
        <Badge id="component-badge-info" tone="info"><Text>Syncing</Text></Badge>
        <Badge id="component-badge-success" tone="success"><Text>Done</Text></Badge>
      </Box>
      <Box style={{ direction: "row", gap: 1 }}>
        <Badge id="component-badge-warning" tone="warning"><Text>Delayed</Text></Badge>
        <Badge id="component-badge-error" tone="error"><Text>Failed</Text></Badge>
      </Box>
      <Box style={{ direction: "row", gap: 1 }}>
        <Badge id="component-badge-retry" tone="error" interactive
          focused={focusedId === "component-badge-retry"}><Text>Retry</Text></Badge>
        <Badge id="component-badge-disabled" tone="neutral" interactive disabled><Text>Disabled</Text></Badge>
      </Box>
    </Box>}
  />;
};

const tabItems = [
  { id: "component-tabs-code", label: "Code", panelId: "component-tabs-code-panel" },
  { id: "component-tabs-preview", label: "Preview", panelId: "component-tabs-preview-panel" },
  { id: "component-tabs-settings", label: "Settings", panelId: "component-tabs-settings-panel", disabled: true },
];

export const TabsComponentDemo = () => {
  const tabs = useCellTabsState(tabItems, { defaultSelectedId: "component-tabs-code" });
  const selectedTab = tabs.items.find((item) => item.id === tabs.selectedId);
  return <ComponentPlayground
    id="component-tabs-playground"
    label="Tabs component"
    probeId="component-tabs"
    focusedId={tabs.focusedId}
    onCommand={tabs.dispatch}
    previewMinColumns={32}
    preview={<Box style={{ direction: "column", width: 32 }}>
      <Tabs id="component-tabs-list" label="Views" orientation="horizontal">
        {tabs.items.map((item) => <Tab
          id={item.id}
          key={item.id}
          controlsId={item.panelId}
          disabled={item.disabled}
          focused={tabs.focusedId === item.id}
          selected={tabs.selectedId === item.id}
        ><Text>{item.label}</Text></Tab>)}
      </Tabs>
      {selectedTab && <TabPanel
        id={selectedTab.panelId}
        label={`${selectedTab.label} panel`}
        labelledById={selectedTab.id}
        style={{ height: 2 }}
      ><Text>{selectedTab.id === "component-tabs-code"
        ? 'const greeting = "Hello";'
        : "Hello"}</Text></TabPanel>}
    </Box>}
  />;
};

const selectItems = [
  { id: "component-select-light", label: "Light" },
  { id: "component-select-dark", label: "Dark" },
  { id: "component-select-system", label: "System" },
] as const;

type SelectDemoValue = "light" | "dark" | "system";

export const SelectComponentDemo = () => {
  const [value, setValue] = useState<SelectDemoValue>("dark");
  const [disabled, setDisabled] = useState(false);
  const select = useCellSelectState("component-select", selectItems, {
    selectedId: `component-select-${value}`,
    onSelectionChange: (id) => {
      setValue(id.slice("component-select-".length) as SelectDemoValue);
    },
  });
  const variant = useCellSelectState("component-select-surface-variant", surfaceVariantItems, {
    defaultSelectedId: "surface",
  });
  const frame = useCellSelectState("component-select-content-frame", frameItems, {
    defaultSelectedId: "none",
  });
  const borderShape = useCellSelectState("component-select-content-border-shape", borderShapeItems, {
    defaultSelectedId: "square",
  });
  const focus = usePlaygroundFocus(select.triggerId, [select, variant, frame, borderShape]);
  const dispatch = (command: WidgetCommand) => {
    focus.dispatch(command);
    if (command.type === "activate" && command.targetId === "component-select-disabled") {
      setDisabled((current) => !current);
    }
  };
  return <ComponentPlayground
    id="component-select-playground"
    focusedId={focus.focusedId}
    onCommand={dispatch}
    label="Select component"
    probeId="component-select"
    previewMinColumns={30}
    controlsColumns={25}
    overlayRows={focus.activeSelect
      ? focus.activeSelect.items.length + (focus.activeSelect === select && frame.selectedId === "bordered" ? 2 : 0)
      : 0}
    preview={renderGallerySelect({
      fieldId: "component-select-preview",
      labelId: "component-select-label",
      label: "Theme",
      select,
      focusedId: focus.focusedId,
      width: 30,
      disabled,
      emptyLabel: "Select theme",
      variant: variant.selectedId as SurfaceVariant,
      contentFrame: frame.selectedId as CellFrame,
      contentBorderShape: frame.selectedId === "bordered" ? borderShape.selectedId as CellBorderShape : undefined,
    })}
    controls={[
      renderPlaygroundSelectControl("variant", variant, focus.focusedId),
      renderPlaygroundSelectControl("dropdown frame", frame, focus.focusedId),
      ...(frame.selectedId === "bordered"
        ? [renderPlaygroundSelectControl("border shape", borderShape, focus.focusedId)]
        : []),
      renderPlaygroundCheckboxControl(
        "disabled",
        "component-select-disabled",
        disabled,
        focus.focusedId,
      ),
    ]}
  />;
};

const comboboxFonts = [
  { id: "component-combobox-maple", label: "Maple Mono" },
  { id: "component-combobox-fusion", label: "Fusion Pixel 12px Mono" },
  { id: "component-combobox-xiaolai", label: "Xiaolai Mono" },
] as const;

export const ComboboxComponentDemo = () => {
  const [value, setValue] = useState("component-combobox-maple");
  const [disabled, setDisabled] = useState(false);
  const combo = useCellComboboxState("component-combobox", comboboxFonts, {
    selectedId: value,
    onSelectionChange: setValue,
  });
  const variant = useCellSelectState("component-combobox-surface-variant", surfaceVariantItems, {
    defaultSelectedId: "surface",
  });
  const frame = useCellSelectState("component-combobox-content-frame", frameItems, {
    defaultSelectedId: "none",
  });
  const borderShape = useCellSelectState("component-combobox-content-border-shape", borderShapeItems, {
    defaultSelectedId: "square",
  });
  const focus = usePlaygroundFocus(combo.inputId, [variant, frame, borderShape]);
  const dispatch = (command: WidgetCommand) => {
    focus.dispatch(command);
    combo.dispatch(command);
    if (command.type === "activate" && command.targetId === "component-combobox-disabled") {
      setDisabled((current) => !current);
    }
  };
  return <ComponentPlayground id="component-combobox-playground" label="Combobox component"
    probeId="component-combobox" focusedId={focus.focusedId} onCommand={dispatch}
    previewMinColumns={30} controlsColumns={25}
    overlayRows={combo.open
      ? Math.min(Math.max(combo.filteredItems.length, 1), 3) + 2
      : focus.activeSelect?.items.length ?? 0}
    preview={<Box id="component-combobox-preview" variant="ghost" style={{ width: 30 }}>
      <Text>Font</Text>
      <Combobox id={combo.id} disabled={disabled} variant={variant.selectedId as SurfaceVariant} style={{ width: 30 }}>
        <ComboboxInput id={combo.inputId} label="Font" state={combo.inputSnapshot} expanded={combo.open}
          activeDescendantId={combo.activeId ?? undefined} />
        {combo.open ? <ComboboxContent id={combo.contentId} label="Font options" scrollY={combo.scrollY}
          frame={frame.selectedId as CellFrame}
          borderShape={frame.selectedId === "bordered" ? borderShape.selectedId as CellBorderShape : undefined}
          style={{ maxHeight: 5 }}>
          {combo.filteredItems.length ? combo.filteredItems.map((item, index) => <ComboboxItem
            id={item.id} key={item.id} active={combo.activeId === item.id} selected={combo.selectedId === item.id}
            disabled={item.disabled} positionInSet={index + 1} setSize={combo.filteredItems.length}>
            <Text>{item.label}</Text>
          </ComboboxItem>) : <Text>No matches</Text>}
        </ComboboxContent> : null}
      </Combobox>
    </Box>}
    controls={[
      renderPlaygroundSelectControl("variant", variant, focus.focusedId),
      renderPlaygroundSelectControl("dropdown frame", frame, focus.focusedId),
      ...(frame.selectedId === "bordered"
        ? [renderPlaygroundSelectControl("border shape", borderShape, focus.focusedId)]
        : []),
      renderPlaygroundCheckboxControl("disabled", "component-combobox-disabled", disabled, focus.focusedId),
    ]} />;
};

export const CheckboxComponentDemo = () => {
  const [checked, setChecked] = useState(true);
  const [disabled, setDisabled] = useState(false);
  const focus = usePlaygroundFocus("component-checkbox-autosave", []);
  const dispatch = (command: WidgetCommand) => {
    focus.dispatch(command);
    if (command.type === "activate" && command.targetId === "component-checkbox-autosave") {
      if (!disabled) setChecked((current) => !current);
    }
    if (command.type === "activate" && command.targetId === "component-checkbox-disabled-control") {
      setDisabled((current) => !current);
    }
  };
  return <ComponentPlayground
    id="component-checkbox-playground"
    focusedId={focus.focusedId}
    onCommand={dispatch}
    label="Checkbox component"
    probeId="component-checkbox"
    previewMinColumns={14}
    controlsColumns={25}
    preview={renderGalleryCheckbox({
      id: "component-checkbox-autosave",
      label: "Autosave",
      checked,
      disabled,
      focusedId: focus.focusedId,
    })}
    controls={[
      renderPlaygroundCheckboxControl(
        "disabled",
        "component-checkbox-disabled-control",
        disabled,
        focus.focusedId,
      ),
    ]}
  />;
};

export const SliderComponentDemo = () => {
  const [value, setValue] = useState(50);
  const [rangeValues, setRangeValues] = useState<readonly [number, number]>([30, 70]);
  const [range, setRange] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const focus = usePlaygroundFocus("component-slider-volume", []);
  const dispatch = (command: WidgetCommand) => {
    focus.dispatch(command);
    if (
      command.type === "set-value"
      && command.targetId === "component-slider-volume"
      && !disabled
    ) {
      setValue(command.value);
    }
    if (command.type === "set-value" && command.targetId === "component-slider-start") {
      setRangeValues((current) => [command.value, current[1]]);
    }
    if (command.type === "set-value" && command.targetId === "component-slider-end") {
      setRangeValues((current) => [current[0], command.value]);
    }
    if (command.type === "activate" && command.targetId === "component-slider-range") {
      setRange((current) => !current);
    }
    if (command.type === "activate" && command.targetId === "component-slider-disabled") {
      setDisabled((current) => !current);
    }
  };
  return <ComponentPlayground
    id="component-slider-playground"
    focusedId={focus.focusedId}
    onCommand={dispatch}
    label="Slider component"
    probeId="component-slider"
    previewMinColumns={26}
    controlsColumns={25}
    preview={
      <Box id="component-slider-preview" variant="ghost" style={{ width: 26 }}>
        <Box id="component-slider-label" variant="ghost" style={{ direction: "row" }}>
          <Text style={{ width: range ? 20 : 23 }}>Volume</Text>
          <Text>{range ? `${rangeValues[0]}–${rangeValues[1]}` : value}</Text>
        </Box>
        {range
          ? <RangeSlider
              id="component-slider-range-control"
              label="Volume"
              min={0}
              max={100}
              step={1}
              disabled={disabled}
              style={{ width: 26 }}
            >
              <RangeSliderThumb
                id="component-slider-start"
                label="Minimum volume"
                value={rangeValues[0]}
                valueText={`${rangeValues[0]} percent`}
                focused={focus.focusedId === "component-slider-start"}
              />
              <RangeSliderThumb
                id="component-slider-end"
                label="Maximum volume"
                value={rangeValues[1]}
                valueText={`${rangeValues[1]} percent`}
                focused={focus.focusedId === "component-slider-end"}
              />
            </RangeSlider>
          : <Slider
              id="component-slider-volume"
              label="Volume"
              value={value}
              valueText={`${value} percent`}
              min={0}
              max={100}
              step={1}
              disabled={disabled}
              focused={focus.focusedId === "component-slider-volume"}
              style={{ width: 26 }}
            />}
      </Box>
    }
    controls={[
      renderPlaygroundCheckboxControl(
        "range",
        "component-slider-range",
        range,
        focus.focusedId,
      ),
      renderPlaygroundCheckboxControl(
        "disabled",
        "component-slider-disabled",
        disabled,
        focus.focusedId,
      ),
    ]}
  />;
};

export const InputComponentDemo = () => {
  const input = useCellTextState("component-input-field", {
    value: "notes.txt",
  });
  const [disabled, setDisabled] = useState(false);
  const variant = useCellSelectState("component-input-variant", surfaceVariantItems, {
    defaultSelectedId: "surface",
  });
  const focus = usePlaygroundFocus("component-input-field", [variant]);
  const dispatch = (command: WidgetCommand) => {
    focus.dispatch(command);
    input.dispatch(command);
    if (command.type === "activate" && command.targetId === "component-input-disabled") {
      setDisabled((current) => !current);
    }
  };
  return <ComponentPlayground
    id="component-input-playground"
    focusedId={focus.focusedId}
    onCommand={dispatch}
    label="Input component"
    probeId="component-input"
    previewMinColumns={30}
    controlsColumns={25}
    overlayRows={focus.activeSelect?.items.length ?? 0}
    preview={
      <Box id="component-input-frame" variant="ghost" style={{ width: 30 }}>
        <Text id="component-input-label">File name</Text>
        <TextInput
          id="component-input-field"
          label="File name"
          state={input.snapshot}
          focused={focus.focusedId === "component-input-field"}
          disabled={disabled}
          variant={variant.selectedId as SurfaceVariant}
          style={{ width: 30 }}
        />
      </Box>
    }
    controls={[
      renderPlaygroundSelectControl("variant", variant, focus.focusedId),
      renderPlaygroundCheckboxControl(
        "disabled",
        "component-input-disabled",
        disabled,
        focus.focusedId,
      ),
    ]}
  />;
};

const listItems = [
  { id: "component-list-alpha", label: "Alpha" },
  { id: "component-list-beta", label: "Beta" },
  { id: "component-list-disabled", label: "Disabled", disabled: true },
  { id: "component-list-gamma", label: "Gamma" },
] as const;

export const ListComponentDemo = () => {
  const list = useCellListState(listItems, {
    defaultFocusedId: "component-list-beta",
    defaultSelectedId: "component-list-beta",
  });
  return <GallerySurface
    viewport={{ width: 32, height: 6 }}
    focusedId={list.focusedId}
    onCommand={list.dispatch}
    label="List component"
    probeId="component-list"
  >
    <Root id="component-list-root">
      <Box id="component-list-frame" frame="bordered" style={{ height: 6 }}>
        <List id="component-list-items" label="Greek letters">
          {list.items.map((item) => (
            <ListItem
              id={item.id}
              key={item.id}
              disabled={item.disabled}
              focused={list.focusedId === item.id}
              selected={list.selectedId === item.id}
            ><Text>{item.label}</Text></ListItem>
          ))}
        </List>
      </Box>
    </Root>
  </GallerySurface>;
};

const scrollItems = Array.from({ length: 10 }, (_, index) => ({
  id: `component-scroll-row-${index + 1}`,
  label: `${String(index + 1).padStart(2, "0")}  Row ${index + 1}`,
}));
const scrollDemoViewportWidth = 26;
const scrollDemoViewportHeight = 4;
const scrollDemoBorderSize = 2;
export const ScrollAreaComponentDemo = () => {
  const [scrollY, setScrollY] = useState(0);
  const variant = useCellSelectState("component-scroll-variant", surfaceVariantItems, {
    defaultSelectedId: "ghost",
  });
  const frame = useCellSelectState("component-scroll-frame", frameItems, {
    defaultSelectedId: "none",
  });
  const borderShape = useCellSelectState("component-scroll-border-shape", borderShapeItems, {
    defaultSelectedId: "square",
  });
  const borderSize = frame.selectedId === "bordered" ? scrollDemoBorderSize : 0;
  const list = useCellListState(scrollItems, {
    defaultFocusedId: "component-scroll-row-1",
    defaultSelectedId: "component-scroll-row-1",
  });
  const focus = usePlaygroundFocus("component-scroll-row-1", [variant, frame, borderShape]);
  const dispatch = (command: WidgetCommand) => {
    focus.dispatch(command);
    list.dispatch(command);
    if (command.type === "scroll" && command.targetId === "component-scroll-area") {
      setScrollY(command.scrollY);
    }
    if (command.type === "focus" && command.reveal?.targetId === "component-scroll-area") {
      setScrollY(command.reveal.scrollY);
    }
  };
  return <ComponentPlayground
    id="component-scroll-playground"
    focusedId={focus.focusedId}
    onCommand={dispatch}
    label="ScrollArea component"
    probeId="component-scroll-area"
    previewMinColumns={28}
    controlsColumns={25}
    overlayRows={focus.activeSelect?.items.length ?? 0}
    preview={
      <ScrollArea
        id="component-scroll-area"
        scrollY={scrollY}
        variant={variant.selectedId as SurfaceVariant}
        frame={frame.selectedId as CellFrame}
        borderShape={frame.selectedId === "bordered" ? borderShape.selectedId as CellBorderShape : undefined}
        style={{
          width: scrollDemoViewportWidth + borderSize,
          height: scrollDemoViewportHeight + borderSize,
        }}
      >
        <List id="component-scroll-items" label="Scrollable rows">
          {list.items.map((item) => (
            <ListItem
              id={item.id}
              key={item.id}
              focused={focus.focusedId === item.id}
              selected={list.selectedId === item.id}
            ><Text>{item.label}</Text></ListItem>
          ))}
        </List>
      </ScrollArea>
    }
    controls={[
      renderPlaygroundSelectControl("variant", variant, focus.focusedId),
      renderPlaygroundSelectControl("frame", frame, focus.focusedId),
      ...(frame.selectedId === "bordered"
        ? [renderPlaygroundSelectControl("border shape", borderShape, focus.focusedId)]
        : []),
    ]}
  />;
};
