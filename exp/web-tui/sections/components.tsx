import { useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  List,
  ListItem,
  Root,
  ScrollArea,
  Slider,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  Text,
  TextInput,
  nextCellCheckboxState,
  type CellCheckboxState,
  type WidgetCommand,
} from "@chardesk/cell-ui";
import {
  useCellListState,
  useCellSelectState,
  useCellTextState,
} from "@chardesk/cell-ui/browser";
import { GallerySurface } from "../appearance";

const noCommand = () => undefined;

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

export const ButtonComponentDemo = () => {
  const [focusedId, setFocusedId] = useState("component-button-save");
  const [saved, setSaved] = useState(false);
  const dispatch = (command: WidgetCommand) => {
    if (command.type === "focus") setFocusedId(command.targetId);
    if (command.type === "activate" && command.targetId === "component-button-save") {
      setSaved(true);
    }
  };
  return <GallerySurface
    viewport={{ width: 36, height: 4 }}
    focusedId={focusedId}
    onCommand={dispatch}
    label="Button component"
    probeId="component-button"
  >
    <Root id="component-button-root">
      <Box id="component-button-frame" style={{ gap: 1 }}>
        <Text id="component-button-title">Document</Text>
        <Box id="component-button-row" style={{ direction: "row", gap: 1 }}>
          <Button
            id="component-button-save"
            label="Save document"
            focused={focusedId === "component-button-save"}
          ><Text>{saved ? "✓ Saved" : "Save"}</Text></Button>
          <Button id="component-button-disabled" disabled><Text>Disabled</Text></Button>
        </Box>
      </Box>
    </Root>
  </GallerySurface>;
};

const selectItems = [
  { id: "component-select-light", label: "Light" },
  { id: "component-select-dark", label: "Dark" },
  { id: "component-select-system", label: "System" },
] as const;

export const SelectComponentDemo = () => {
  const select = useCellSelectState("component-select", selectItems, {
    defaultSelectedId: "component-select-dark",
  });
  return <GallerySurface
    viewport={{ width: 36, height: 8 }}
    focusedId={select.focusedId}
    onCommand={select.dispatch}
    label="Select component"
    probeId="component-select"
  >
    <Root id="component-select-root">
      <Text id="component-select-label">Theme</Text>
      <Select id={select.id} label="Theme" style={{ width: 30 }}>
        <SelectTrigger
          id={select.triggerId}
          label="Theme"
          expanded={select.open}
          controlsId={select.open ? select.contentId : undefined}
        ><Text>{select.selectedItem?.label ?? "Select theme"}</Text></SelectTrigger>
        {select.open ? (
          <SelectContent id={select.contentId} label="Theme options">
            {select.items.map((item, index) => (
              <SelectItem
                id={item.id}
                key={item.id}
                disabled={item.disabled}
                selected={select.selectedId === item.id}
                positionInSet={index + 1}
                setSize={select.items.length}
              ><Text>{item.label}</Text></SelectItem>
            ))}
          </SelectContent>
        ) : null}
      </Select>
    </Root>
  </GallerySurface>;
};

type CheckboxDemoId =
  | "component-checkbox-autosave"
  | "component-checkbox-word-wrap"
  | "component-checkbox-select-all"
  | "component-checkbox-disabled";

const checkboxInitialState: Record<CheckboxDemoId, CellCheckboxState> = {
  "component-checkbox-autosave": true,
  "component-checkbox-word-wrap": false,
  "component-checkbox-select-all": "indeterminate",
  "component-checkbox-disabled": false,
};

const checkboxItems: readonly Readonly<{
  id: CheckboxDemoId;
  label: string;
  disabled?: boolean;
}>[] = [
  { id: "component-checkbox-autosave", label: "Autosave" },
  { id: "component-checkbox-word-wrap", label: "Word wrap" },
  { id: "component-checkbox-select-all", label: "Select all" },
  { id: "component-checkbox-disabled", label: "Disabled", disabled: true },
];

export const CheckboxComponentDemo = () => {
  const [focusedId, setFocusedId] = useState<CheckboxDemoId>("component-checkbox-autosave");
  const [checked, setChecked] = useState(checkboxInitialState);
  const dispatch = (command: WidgetCommand) => {
    if (command.type === "focus" && command.targetId in checkboxInitialState) {
      setFocusedId(command.targetId as CheckboxDemoId);
    }
    if (command.type === "activate" && command.targetId in checkboxInitialState) {
      const id = command.targetId as CheckboxDemoId;
      if (id === "component-checkbox-disabled") return;
      setChecked((current) => ({ ...current, [id]: nextCellCheckboxState(current[id]) }));
    }
  };
  return <GallerySurface
    viewport={{ width: 36, height: 5 }}
    focusedId={focusedId}
    onCommand={dispatch}
    label="Checkbox component"
    probeId="component-checkbox"
  >
    <Root id="component-checkbox-root">
      <Text id="component-checkbox-title">Editor</Text>
      {checkboxItems.map((item) => (
        <Checkbox
          id={item.id}
          key={item.id}
          label={item.label}
          checked={checked[item.id]}
          disabled={item.disabled}
          focused={focusedId === item.id}
        ><Text>{item.label}</Text></Checkbox>
      ))}
    </Root>
  </GallerySurface>;
};

type SliderDemoId =
  | "component-slider-volume"
  | "component-slider-brightness"
  | "component-slider-minimum"
  | "component-slider-maximum"
  | "component-slider-disabled";

const sliderItems: readonly Readonly<{
  id: SliderDemoId;
  label: string;
  disabled?: boolean;
}>[] = [
  { id: "component-slider-volume", label: "Volume" },
  { id: "component-slider-brightness", label: "Brightness" },
  { id: "component-slider-minimum", label: "Minimum" },
  { id: "component-slider-maximum", label: "Maximum" },
  { id: "component-slider-disabled", label: "Disabled", disabled: true },
];

const sliderInitialValues: Record<SliderDemoId, number> = {
  "component-slider-volume": 50,
  "component-slider-brightness": 25,
  "component-slider-minimum": 0,
  "component-slider-maximum": 100,
  "component-slider-disabled": 40,
};

export const SliderComponentDemo = () => {
  const [focusedId, setFocusedId] = useState<SliderDemoId>("component-slider-volume");
  const [values, setValues] = useState(sliderInitialValues);
  const dispatch = (command: WidgetCommand) => {
    if (command.type === "focus" && command.targetId in sliderInitialValues) {
      setFocusedId(command.targetId as SliderDemoId);
    }
    if (command.type === "set-value" && command.targetId in sliderInitialValues) {
      const id = command.targetId as SliderDemoId;
      if (id === "component-slider-disabled") return;
      setValues((current) => ({ ...current, [id]: command.value }));
    }
  };
  return <GallerySurface
    viewport={{ width: 36, height: 10 }}
    focusedId={focusedId}
    onCommand={dispatch}
    label="Slider component"
    probeId="component-slider"
  >
    <Root id="component-slider-root">
      {sliderItems.map((item) => (
        <Box id={`${item.id}-field`} key={item.id}>
          <Box id={`${item.id}-label`} style={{ direction: "row" }}>
            <Text style={{ width: 24 }}>{item.label}</Text>
            <Text>{values[item.id]}</Text>
          </Box>
          <Slider
            id={item.id}
            label={item.label}
            value={values[item.id]}
            valueText={`${values[item.id]} percent`}
            disabled={item.disabled}
            focused={focusedId === item.id}
            style={{ width: 26 }}
          />
        </Box>
      ))}
    </Root>
  </GallerySurface>;
};

export const InputComponentDemo = () => {
  const input = useCellTextState("component-input-field", {
    value: "notes.txt",
  });
  return <GallerySurface
    viewport={{ width: 36, height: 4 }}
    onCommand={input.dispatch}
    label="Input component"
    probeId="component-input"
  >
    <Root id="component-input-root">
      <Box id="component-input-frame">
        <Text id="component-input-label">File name</Text>
        <TextInput
          id="component-input-field"
          label="File name"
          state={input.snapshot}
          style={{ border: true, height: 3 }}
        />
      </Box>
    </Root>
  </GallerySurface>;
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

export const ScrollAreaComponentDemo = () => {
  const [scrollY, setScrollY] = useState(0);
  const list = useCellListState(scrollItems, {
    defaultFocusedId: "component-scroll-row-1",
    defaultSelectedId: "component-scroll-row-1",
  });
  const dispatch = (command: WidgetCommand) => {
    list.dispatch(command);
    if (command.type === "scroll") setScrollY(command.scrollY);
    if (command.type === "focus" && command.reveal) setScrollY(command.reveal.scrollY);
  };
  return <GallerySurface
    viewport={{ width: 32, height: 6 }}
    focusedId={list.focusedId}
    onCommand={dispatch}
    label="ScrollArea component"
    probeId="component-scroll-area"
  >
    <Root id="component-scroll-root">
      <ScrollArea
        id="component-scroll-area"
        scrollY={scrollY}
        style={{ border: true, height: 6 }}
      >
        <List id="component-scroll-items" label="Scrollable rows">
          {list.items.map((item) => (
            <ListItem
              id={item.id}
              key={item.id}
              focused={list.focusedId === item.id}
              selected={list.selectedId === item.id}
            ><Text>{item.label}</Text></ListItem>
          ))}
        </List>
      </ScrollArea>
    </Root>
  </GallerySurface>;
};
