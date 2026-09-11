import { useState } from "react";
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
  Checkbox,
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  Toggle,
  Progress,
  Separator,
  type SeparatorVariant,
  RadioGroup,
  RadioItem,
  List,
  ListItem,
  RangeSlider,
  RangeSliderThumb,
  Root,
  ScrollArea,
  Slider,
  Text,
  TextInput,
  type CellBlockVariant,
  type CellBorderShape,
  type ButtonSize,
  type ButtonVariant,
  type WidgetCommand,
} from "@chardesk/cell-ui";
import {
  useCellListState,
  useCellComboboxState,
  useCellRadioState,
  useCellSelectState,
  useCellTextState,
} from "@chardesk/cell-ui/browser";
import { GallerySurface } from "../appearance";
import { ComponentPlayground } from "../component-playground";
import {
  renderGalleryCheckbox,
  renderGallerySelect,
} from "../gallery-component-recipes";

const noCommand = () => undefined;

export const DialogComponentDemo = () => {
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState(true);
  const [outside, setOutside] = useState(true);
  const focus = usePlaygroundFocus("dialog-open", []);
  const dispatch = (command: WidgetCommand) => {
    focus.dispatch(command);
    if (command.type === "dismiss" && command.targetId === "demo-dialog") setOpen(false);
    if (command.type !== "activate") return;
    if (command.targetId === "dialog-open") setOpen(true);
    if (command.targetId === "dialog-cancel" || command.targetId === "dialog-confirm") setOpen(false);
    if (command.targetId === "dialog-modal") setModal((value) => !value);
    if (command.targetId === "dialog-outside") setOutside((value) => !value);
  };
  return <ComponentPlayground id="component-dialog-playground" label="Dialog component" probeId="component-dialog"
    focusedId={focus.focusedId} onCommand={dispatch} previewMinColumns={36} controlsColumns={29} overlayRows={5}
    preview={<Box>
      <Button id="dialog-open"><Text>Open dialog</Text></Button>
      {open && <Dialog id="demo-dialog" modal={modal} closeOnOutsideClick={outside} initialFocusId="dialog-cancel">
        <DialogTitle>Continue?</DialogTitle>
        <DialogDescription>This is a preview confirmation.</DialogDescription>
        <DialogFooter>
          <Button id="dialog-cancel" variant="ghost"><Text>Cancel</Text></Button>
          <Button id="dialog-confirm"><Text>Continue</Text></Button>
        </DialogFooter>
      </Dialog>}
    </Box>}
    controls={[
      renderPlaygroundCheckboxControl("modal", "dialog-modal", modal, focus.focusedId),
      renderPlaygroundCheckboxControl(
        "closeOnOutsideClick",
        "dialog-outside",
        outside,
        focus.focusedId,
      ),
    ]} />;
};

export const AccordionComponentDemo = () => {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [disabled, setDisabled] = useState(false);
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
  };
  return <ComponentPlayground id="component-accordion-playground" label="Accordion component" probeId="component-accordion"
    focusedId={focus.focusedId} onCommand={dispatch} previewMinColumns={30} controlsColumns={25}
    overlayRows={theme.open ? theme.items.length : 0}
    preview={<Accordion id="accordion-settings" disabled={disabled} style={{ width: 30 }}>
      {["general", "appearance", "advanced"].map((name) => <AccordionItem key={name} id={`accordion-${name}`} expanded={expanded.has(`accordion-${name}`)}>
        <AccordionTrigger id={`accordion-${name}-trigger`}><Text>{name[0].toUpperCase() + name.slice(1)}</Text></AccordionTrigger>
        <AccordionContent style={{ paddingLeft: 4 }}>
          {name === "appearance" ? <Box>
            {renderPlaygroundSelectControl("Theme", theme, focus.focusedId)}
            <Checkbox id="accordion-sound" label="Sound" checked={sound}><Text>Sound</Text></Checkbox>
          </Box> : <Text>{name === "general" ? "Project settings" : "Advanced settings"}</Text>}
        </AccordionContent>
      </AccordionItem>)}
    </Accordion>}
    controls={[renderPlaygroundCheckboxControl("disabled", "accordion-disabled", disabled, focus.focusedId)]} />;
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

export const ProgressComponentDemo = () => (
  <GallerySurface label="Progress component" probeId="component-progress"
    viewport={{ width: 20, height: 7 }} onCommand={noCommand}>
    <Root id="component-progress-root" style={{ paddingTop: 3 }}>
      <Progress id="component-progress-bar" label="Progress" value={60} />
    </Root>
  </GallerySurface>
);

const orientationItems = ["horizontal", "vertical"].map((value) => ({ id: value, label: value }));
const separatorVariantItems = [
  { id: "line", label: "───────" },
  { id: "slash", label: "///////" },
  { id: "double", label: "═══════" },
  { id: "dots", label: "·······" },
] satisfies readonly Readonly<{ id: SeparatorVariant; label: string }>[];
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
      <Box id="component-text-frame" variant="bordered" style={{ height: 14, padding: 1 }}>
        <Text id="component-text-plain" textStyle={{ bold: true }}>◆ Plain text · READY</Text>
        <Text id="component-text-unicode">→ Unicode: 世界 👋</Text>
        <Text id="component-text-move">↔ Move: ← ↑ ↓ →</Text>
        <Text id="component-text-status">✓ Status: PASS · IDLE</Text>
        <Text id="component-text-math">∞ Math: ≠ ≤ ≥ ± × ÷</Text>
        <Text id="component-text-signal">▓ Signal: ░▒▓█</Text>
        <Text id="component-text-cell-graphics">⣿ Cell: {"\ue0b0 \uee03 \uf5ee"}</Text>
        <Text id="component-text-legacy">Legacy: {"\u{1fb95} \u{1fbb0} \u{1fbc5}"}</Text>
        <Text id="component-text-wrap" textStyle={{ dim: true }}>↳ Wraps on integer Cell boundaries.</Text>
      </Box>
    </Root>
  </GallerySurface>
);

const buttonVariantItems = (["default", "outline", "ghost"] as const).map((variant) => ({
  id: `component-button-variant-${variant}`,
  label: variant,
}));

const buttonSizeItems = (["sm", "default", "lg"] as const).map((size) => ({
  id: `component-button-size-${size}`,
  label: size,
}));

const blockVariantItems = (["plain", "raised", "bordered"] as const).map((variant) => ({
  id: variant,
  label: variant,
}));

const borderShapeItems = (["square", "rounded"] as const).map((shape) => ({
  id: shape,
  label: shape,
}));

type PlaygroundSelectState = ReturnType<typeof useCellSelectState>;

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
  width: 15,
  itemSemanticLabel,
});

const renderPlaygroundCheckboxControl = (
  label: string,
  id: string,
  checked: boolean,
  focusedId: string,
) => renderGalleryCheckbox({ id, label, checked, focusedId });

export const BoxComponentDemo = () => {
  const variant = useCellSelectState("component-box-variant", blockVariantItems, {
    defaultSelectedId: "plain",
  });
  const borderShape = useCellSelectState("component-box-border-shape", borderShapeItems, {
    defaultSelectedId: "square",
  });
  const focus = usePlaygroundFocus(variant.triggerId, [variant, borderShape]);
  const blockVariant = variant.selectedId as CellBlockVariant;
  const shape = borderShape.selectedId as CellBorderShape;
  return <ComponentPlayground
    id="component-box-playground"
    focusedId={focus.focusedId}
    onCommand={focus.dispatch}
    label="Box component"
    probeId="component-box"
    previewMinColumns={20}
    controlsColumns={25}
    overlayRows={focus.activeSelect ? focus.activeSelect.items.length : 0}
    preview={
      <Box
        id="component-box-preview"
        variant={blockVariant}
        borderShape={blockVariant === "bordered" ? shape : undefined}
        style={{ width: 20, height: 3, paddingLeft: 1 }}
      ><Text>Block</Text></Box>
    }
    controls={[
      renderPlaygroundSelectControl("variant", variant, focus.focusedId),
      ...(blockVariant === "bordered"
        ? [renderPlaygroundSelectControl("border shape", borderShape, focus.focusedId)]
        : []),
    ]}
  />;
};

export const ButtonComponentDemo = () => {
  const [variant, setVariant] = useState<ButtonVariant>("default");
  const [size, setSize] = useState<ButtonSize>("default");
  const [disabled, setDisabled] = useState(false);
  const variantSelect = useCellSelectState("component-button-variant", buttonVariantItems, {
    defaultSelectedId: "component-button-variant-default",
    onSelectionChange: (id) => setVariant(id.slice("component-button-variant-".length) as ButtonVariant),
  });
  const sizeSelect = useCellSelectState("component-button-size", buttonSizeItems, {
    defaultSelectedId: "component-button-size-default",
    onSelectionChange: (id) => setSize(id.slice("component-button-size-".length) as ButtonSize),
  });
  const focus = usePlaygroundFocus(
    "component-button-save",
    [variantSelect, sizeSelect],
  );
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
    overlayRows={focus.activeSelect ? focus.activeSelect.items.length : 0}
    preview={
      <Button
        id="component-button-save"
        label="Save document"
        variant={variant}
        size={size}
        disabled={disabled}
        focused={focus.focusedId === "component-button-save"}
      ><Text>Save</Text></Button>
    }
    controls={[
      renderPlaygroundSelectControl("variant", variantSelect, focus.focusedId),
      renderPlaygroundSelectControl("size", sizeSelect, focus.focusedId),
      renderPlaygroundCheckboxControl(
        "disabled",
        "component-button-disabled",
        disabled,
        focus.focusedId,
      ),
    ]}
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
  const contentVariant = useCellSelectState("component-select-content-variant", blockVariantItems, {
    defaultSelectedId: "raised",
  });
  const contentBorderShape = useCellSelectState("component-select-content-border-shape", borderShapeItems, {
    defaultSelectedId: "square",
  });
  const focus = usePlaygroundFocus(select.triggerId, [select, contentVariant, contentBorderShape]);
  const blockVariant = contentVariant.selectedId as CellBlockVariant;
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
      ? focus.activeSelect.items.length + (focus.activeSelect === select && blockVariant === "bordered" ? 2 : 0)
      : 0}
    preview={renderGallerySelect({
      fieldId: "component-select-preview",
      labelId: "component-select-label",
      label: "Theme",
      select,
      focusedId: focus.focusedId,
      width: 30,
      disabled,
      contentVariant: blockVariant,
      contentBorderShape: blockVariant === "bordered"
        ? contentBorderShape.selectedId as CellBorderShape
        : undefined,
      emptyLabel: "Select theme",
    })}
    controls={[
      renderPlaygroundSelectControl("content variant", contentVariant, focus.focusedId),
      ...(blockVariant === "bordered"
        ? [renderPlaygroundSelectControl("border shape", contentBorderShape, focus.focusedId)]
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
const comboboxValueItems = comboboxFonts.map(({ id, label }) => ({
  id: id.replace("component-combobox-", "component-combobox-value-"),
  label,
}));

export const ComboboxComponentDemo = () => {
  const [value, setValue] = useState("component-combobox-maple");
  const [disabled, setDisabled] = useState(false);
  const combo = useCellComboboxState("component-combobox", comboboxFonts, {
    selectedId: value,
    onSelectionChange: setValue,
  });
  const valueSelect = useCellSelectState("component-combobox-value", comboboxValueItems, {
    selectedId: value.replace("component-combobox-", "component-combobox-value-"),
    onSelectionChange: (id) => setValue(id.replace("component-combobox-value-", "component-combobox-")),
  });
  const focus = usePlaygroundFocus(combo.inputId, [valueSelect]);
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
    overlayRows={combo.open ? Math.min(combo.filteredItems.length, 3) + 2 : focus.activeSelect ? focus.activeSelect.items.length : 0}
    preview={<Box id="component-combobox-preview" style={{ width: 30 }}>
      <Text>Font</Text>
      <Combobox id={combo.id} label="Font" disabled={disabled} style={{ width: 30 }}>
        <ComboboxInput id={combo.inputId} label="Font" state={combo.inputSnapshot} expanded={combo.open}
          activeDescendantId={combo.activeId ?? undefined} />
        {combo.open ? <ComboboxContent id={combo.contentId} label="Font options" scrollY={combo.scrollY}
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
      renderPlaygroundSelectControl("value", valueSelect, focus.focusedId),
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
      <Box id="component-slider-preview" style={{ width: 26 }}>
        <Box id="component-slider-label" style={{ direction: "row" }}>
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
  const focus = usePlaygroundFocus("component-input-field", []);
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
    preview={
      <Box id="component-input-frame" style={{ width: 30 }}>
        <Text id="component-input-label">File name</Text>
        <TextInput
          id="component-input-field"
          label="File name"
          state={input.snapshot}
          focused={focus.focusedId === "component-input-field"}
          disabled={disabled}
          style={{ width: 30 }}
        />
      </Box>
    }
    controls={[
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
      <Box id="component-list-frame" variant="bordered" style={{ height: 6, paddingLeft: 1 }}>
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
  const variant = useCellSelectState("component-scroll-variant", blockVariantItems, {
    defaultSelectedId: "plain",
  });
  const borderShape = useCellSelectState("component-scroll-border-shape", borderShapeItems, {
    defaultSelectedId: "square",
  });
  const blockVariant = variant.selectedId as CellBlockVariant;
  const borderSize = blockVariant === "bordered" ? scrollDemoBorderSize : 0;
  const list = useCellListState(scrollItems, {
    defaultFocusedId: "component-scroll-row-1",
    defaultSelectedId: "component-scroll-row-1",
  });
  const focus = usePlaygroundFocus("component-scroll-row-1", [variant, borderShape]);
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
    overlayRows={focus.activeSelect ? focus.activeSelect.items.length : 0}
    preview={
      <ScrollArea
        id="component-scroll-area"
        scrollY={scrollY}
        variant={blockVariant}
        borderShape={blockVariant === "bordered"
          ? borderShape.selectedId as CellBorderShape
          : undefined}
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
      ...(blockVariant === "bordered"
        ? [renderPlaygroundSelectControl("border shape", borderShape, focus.focusedId)]
        : []),
    ]}
  />;
};
