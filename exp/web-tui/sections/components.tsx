import { useState } from "react";
import {
  Box,
  Button,
  Checkbox,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  Text,
  TextInput,
  type ButtonSize,
  type ButtonVariant,
  type WidgetCommand,
} from "@chardesk/cell-ui";
import {
  useCellListState,
  useCellRadioState,
  useCellSelectState,
  useCellTextState,
} from "@chardesk/cell-ui/browser";
import { GallerySurface } from "../appearance";
import { ComponentPlayground } from "../component-playground";

const noCommand = () => undefined;

export const ToggleComponentDemo = () => {
  const [pressed, setPressed] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const focus = usePlaygroundFocus("component-toggle-bold", []);
  const dispatch = (command: WidgetCommand) => {
    focus.dispatch(command);
    if (command.type !== "activate") return;
    if (command.targetId === "component-toggle-bold" || command.targetId === "component-toggle-pressed") {
      setPressed((value) => !value);
    }
    if (command.targetId === "component-toggle-disabled") setDisabled((value) => !value);
  };
  return <ComponentPlayground id="component-toggle-playground" label="Toggle component" probeId="component-toggle"
    focusedId={focus.focusedId} onCommand={dispatch} previewMinColumns={10} controlsColumns={25}
    preview={<Toggle id="component-toggle-bold" label="Bold" pressed={pressed} disabled={disabled}
      focused={focus.focusedId === "component-toggle-bold"}><Text>B</Text></Toggle>}
    controls={[
      renderPlaygroundCheckboxControl("pressed", "component-toggle-pressed", pressed, focus.focusedId),
      renderPlaygroundCheckboxControl("disabled", "component-toggle-disabled", disabled, focus.focusedId),
    ]} />;
};

export const ProgressComponentDemo = () => {
  const [value, setValue] = useState(60);
  const focus = usePlaygroundFocus("component-progress-value", []);
  const dispatch = (command: WidgetCommand) => {
    focus.dispatch(command);
    if (command.type === "set-value" && command.targetId === "component-progress-value") setValue(command.value);
  };
  return <ComponentPlayground id="component-progress-playground" label="Progress component" probeId="component-progress"
    focusedId={focus.focusedId} onCommand={dispatch} previewMinColumns={20} controlsColumns={25}
    preview={<Progress id="component-progress-bar" label="Progress" value={value} />}
    controls={<Box style={{ direction: "row", height: 1 }}>
      <Text style={{ width: 10 }}>value</Text>
      <Slider id="component-progress-value" label="value" value={value} step={10} style={{ width: 10 }}
        focused={focus.focusedId === "component-progress-value"} />
      <Text style={{ width: 5 }}>{` ${value}`}</Text>
    </Box>} />;
};

const orientationItems = ["horizontal", "vertical"].map((value) => ({ id: value, label: value }));
export const SeparatorComponentDemo = () => {
  const orientation = useCellSelectState("component-separator-orientation", orientationItems, {
    defaultSelectedId: "horizontal",
  });
  const focus = usePlaygroundFocus(orientation.triggerId, [orientation]);
  const vertical = orientation.selectedId === "vertical";
  return <ComponentPlayground id="component-separator-playground" label="Separator component" probeId="component-separator"
    focusedId={focus.focusedId} onCommand={focus.dispatch} previewMinColumns={20} controlsColumns={25}
    overlayRows={focus.activeSelect ? 4 : 0}
    preview={<Separator id="component-separator-line" orientation={vertical ? "vertical" : "horizontal"}
      style={vertical ? { height: 5 } : { width: 20 }} />}
    controls={renderPlaygroundSelectControl("direction", orientation, focus.focusedId)} />;
};

const radioItems = ["Light", "Dark", "System"].map((label) => ({
  id: `component-radio-${label.toLowerCase()}`, value: label.toLowerCase(), label,
}));
export const RadioComponentDemo = () => {
  const [value, setValue] = useState("light");
  const [disabled, setDisabled] = useState(false);
  const radio = useCellRadioState(radioItems, { value, disabled, onValueChange: setValue });
  const valueSelect = useCellSelectState("component-radio-value", radioItems.map((item) => ({ ...item, id: `${item.id}-option` })), {
    selectedId: `${radioItems.find((item) => item.value === value)!.id}-option`,
    onSelectionChange: (id) => setValue(radioItems.find((item) => `${item.id}-option` === id)!.value),
  });
  const focus = usePlaygroundFocus(radio.focusedId ?? "component-radio-disabled", [valueSelect]);
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
    overlayRows={focus.activeSelect ? 5 : 0}
    preview={<RadioGroup id="component-radio-group" label="Appearance" value={value} disabled={disabled}>
      {radio.items.map((item) => <RadioItem key={item.id} id={item.id} value={item.value}
        focused={focus.focusedId === item.id}><Text>{item.label}</Text></RadioItem>)}
    </RadioGroup>}
    controls={[
      renderPlaygroundSelectControl("value", valueSelect, focus.focusedId),
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
      <Box id="component-text-frame" style={{ border: true, height: 14, padding: 1 }}>
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

export const BoxComponentDemo = () => (
  <GallerySurface
    viewport={{ width: 36, height: 8 }}
    onCommand={noCommand}
    label="Box component"
    probeId="component-box"
  >
    <Root id="component-box-root">
      <Box id="component-box-outer" style={{ border: true, height: 8, padding: 1 }}>
        <Text id="component-box-title">Nested boxes</Text>
        <Box id="component-box-row" style={{ direction: "row", gap: 1, height: 3 }}>
          <Box id="component-box-left" style={{ border: true, width: 14, height: 3, paddingLeft: 1 }}>
            <Text>Left</Text>
          </Box>
          <Box id="component-box-right" style={{ border: true, width: 14, height: 3, paddingLeft: 1 }}>
            <Text>Right</Text>
          </Box>
        </Box>
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
) => (
  <Box id={`${select.id}-field`} key={select.id} style={{ direction: "row", height: 1 }}>
    <Text style={{ width: 10 }}>{label}</Text>
    <Select id={select.id} label={label} style={{ width: 15 }}>
      <SelectTrigger
        id={select.triggerId}
        label={label}
        expanded={select.open}
        controlsId={select.open ? select.contentId : undefined}
        focused={focusedId === select.triggerId}
        style={{ width: 15 }}
      ><Text>{select.selectedItem?.label ?? "default"}</Text></SelectTrigger>
      {select.open ? (
        <SelectContent
          id={select.contentId}
          label={`${label} options`}
          scrollY={select.scrollY}
          style={{ width: 15 }}
        >
          {select.items.map((item, index) => (
            <SelectItem
              id={item.id}
              key={item.id}
              focused={focusedId === item.id}
              selected={select.selectedId === item.id}
              positionInSet={index + 1}
              setSize={select.items.length}
            ><Text>{item.label}</Text></SelectItem>
          ))}
        </SelectContent>
      ) : null}
    </Select>
  </Box>
);

const renderPlaygroundCheckboxControl = (
  label: string,
  id: string,
  checked: boolean,
  focusedId: string,
) => (
  <Box id={`${id}-field`} key={id} style={{ direction: "row", height: 1 }}>
    <Text style={{ width: 10 }}>{label}</Text>
    <Checkbox
      id={id}
      label={label}
      checked={checked}
      focused={focusedId === id}
    />
  </Box>
);

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
    overlayRows={focus.activeSelect ? focus.activeSelect.items.length + 2 : 0}
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
  const [border, setBorder] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [rounded, setRounded] = useState(false);
  const select = useCellSelectState("component-select", selectItems, {
    selectedId: `component-select-${value}`,
    onSelectionChange: (id) => {
      setValue(id.slice("component-select-".length) as SelectDemoValue);
    },
  });
  const focus = usePlaygroundFocus(select.triggerId, [select]);
  const dispatch = (command: WidgetCommand) => {
    focus.dispatch(command);
    if (command.type === "activate" && command.targetId === "component-select-border") {
      setBorder((current) => !current);
    }
    if (command.type === "activate" && command.targetId === "component-select-disabled") {
      setDisabled((current) => !current);
    }
    if (command.type === "activate" && command.targetId === "component-select-rounded") {
      setRounded((current) => !current);
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
    overlayRows={select.open ? select.items.length + (border ? 2 : 0) : 0}
    preview={
      <Box id="component-select-preview" style={{ width: 30 }}>
      <Text id="component-select-label">Theme</Text>
      <Select id={select.id} label="Theme" style={{ width: 30 }}>
        <SelectTrigger
          id={select.triggerId}
          label="Theme"
          expanded={select.open}
          controlsId={select.open ? select.contentId : undefined}
          disabled={disabled}
          focused={focus.focusedId === select.triggerId}
        ><Text>{select.selectedItem?.label ?? "Select theme"}</Text></SelectTrigger>
        {select.open ? (
          <SelectContent
            id={select.contentId}
            label="Theme options"
            scrollY={select.scrollY}
            style={{
              border,
              borderShape: rounded ? "rounded" : "square",
            }}
          >
            {select.items.map((item, index) => (
              <SelectItem
                id={item.id}
                key={item.id}
                disabled={item.disabled}
                focused={focus.focusedId === item.id}
                selected={select.selectedId === item.id}
                positionInSet={index + 1}
                setSize={select.items.length}
              ><Text>{item.label}</Text></SelectItem>
            ))}
          </SelectContent>
        ) : null}
      </Select>
      </Box>
    }
    controls={[
      renderPlaygroundCheckboxControl(
        "border",
        "component-select-border",
        border,
        focus.focusedId,
      ),
      renderPlaygroundCheckboxControl(
        "disabled",
        "component-select-disabled",
        disabled,
        focus.focusedId,
      ),
      renderPlaygroundCheckboxControl(
        "rounded",
        "component-select-rounded",
        rounded,
        focus.focusedId,
      ),
    ]}
  />;
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
    preview={
      <Checkbox
        id="component-checkbox-autosave"
        label="Autosave"
        checked={checked}
        disabled={disabled}
        focused={focus.focusedId === "component-checkbox-autosave"}
      ><Text>Autosave</Text></Checkbox>
    }
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
  const [rounded, setRounded] = useState(false);
  const focus = usePlaygroundFocus("component-input-field", []);
  const dispatch = (command: WidgetCommand) => {
    focus.dispatch(command);
    input.dispatch(command);
    if (command.type === "activate" && command.targetId === "component-input-disabled") {
      setDisabled((current) => !current);
    }
    if (command.type === "activate" && command.targetId === "component-input-rounded") {
      setRounded((current) => !current);
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
          style={{
            border: true,
            borderShape: rounded ? "rounded" : "square",
            width: 30,
            height: 3,
          }}
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
      renderPlaygroundCheckboxControl(
        "rounded",
        "component-input-rounded",
        rounded,
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
      <Box id="component-list-frame" style={{ border: true, height: 6, paddingLeft: 1 }}>
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
  const [border, setBorder] = useState(true);
  const [rounded, setRounded] = useState(false);
  const borderSize = border ? scrollDemoBorderSize : 0;
  const list = useCellListState(scrollItems, {
    defaultFocusedId: "component-scroll-row-1",
    defaultSelectedId: "component-scroll-row-1",
  });
  const focus = usePlaygroundFocus("component-scroll-row-1", []);
  const dispatch = (command: WidgetCommand) => {
    focus.dispatch(command);
    list.dispatch(command);
    if (command.type === "scroll" && command.targetId === "component-scroll-area") {
      setScrollY(command.scrollY);
    }
    if (command.type === "focus" && command.reveal?.targetId === "component-scroll-area") {
      setScrollY(command.reveal.scrollY);
    }
    if (command.type === "activate" && command.targetId === "component-scroll-border") {
      setBorder((current) => !current);
    }
    if (command.type === "activate" && command.targetId === "component-scroll-rounded") {
      setRounded((current) => !current);
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
    preview={
      <ScrollArea
        id="component-scroll-area"
        scrollY={scrollY}
        style={{
          border,
          borderShape: rounded ? "rounded" : "square",
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
      renderPlaygroundCheckboxControl(
        "border",
        "component-scroll-border",
        border,
        focus.focusedId,
      ),
      renderPlaygroundCheckboxControl(
        "rounded",
        "component-scroll-rounded",
        rounded,
        focus.focusedId,
      ),
    ]}
  />;
};
