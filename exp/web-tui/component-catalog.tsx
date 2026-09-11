import type { ComponentType } from "react";
import {
  BoxComponentDemo,
  DialogComponentDemo,
  AccordionComponentDemo,
  ButtonComponentDemo,
  CheckboxComponentDemo,
  ComboboxComponentDemo,
  ToggleComponentDemo,
  ProgressComponentDemo,
  SeparatorComponentDemo,
  RadioComponentDemo,
  InputComponentDemo,
  ListComponentDemo,
  ScrollAreaComponentDemo,
  SelectComponentDemo,
  SliderComponentDemo,
  TextComponentDemo,
} from "./sections/components";

type ComponentApiRow = Readonly<{
  name: string;
  type: string;
  description: string;
}>;

export type ComponentGroupId = "components" | "primitives" | "collections";

export type ComponentDocument = Readonly<{
  slug: string;
  title: string;
  group: ComponentGroupId;
  navigationOrder: number;
  description: string;
  probeId: string;
  Demo: ComponentType;
  usage: string;
  api: readonly ComponentApiRow[];
}>;

export const componentDocuments: readonly ComponentDocument[] = [
  {
    slug: "dialog", title: "Dialog", group: "components", navigationOrder: 11,
    description: "A named Cell dialog with shared overlay placement and focus management.",
    probeId: "component-dialog", Demo: DialogComponentDemo,
    usage: `import { useState } from "react";
import { Root, Button, Text, Dialog, DialogTitle, DialogDescription, DialogFooter } from "@chardesk/cell-ui";
import { CellSurface } from "@chardesk/cell-ui/browser";

export function DialogExample() {
  const [open, setOpen] = useState(false);
  return <CellSurface viewport={{ width: 48, height: 14 }} onCommand={(command) => {
    if (command.type === "activate" && command.targetId === "open") setOpen(true);
    if ((command.type === "dismiss" && command.targetId === "dialog")
      || (command.type === "activate" && command.targetId === "close")) setOpen(false);
  }}><Root>
    <Button id="open"><Text>Open dialog</Text></Button>
    {open && <Dialog id="dialog">
      <DialogTitle>Continue?</DialogTitle>
      <DialogDescription>This is a preview confirmation.</DialogDescription>
      <DialogFooter><Button id="close"><Text>Close</Text></Button></DialogFooter>
    </Dialog>}
  </Root></CellSurface>;
}`,
    api: [
      { name: "id", type: "string", description: "Required stable dismiss-command target." },
      { name: "modal", type: "boolean", description: "Trap focus and exclude background semantics; default true." },
      { name: "closeOnOutsideClick", type: "boolean", description: "Request dismissal on outside pointer down; default true." },
      { name: "initialFocusId", type: "string", description: "Preferred available content control on opening." },
      { name: "children", type: "Cell primitives", description: "One direct Title, optional direct Description, and composable content/Footer." },
    ],
  },
  {
    slug: "accordion", title: "Accordion", group: "components", navigationOrder: 10,
    description: "Expand independent sections without losing their content state.",
    probeId: "component-accordion", Demo: AccordionComponentDemo,
    usage: `import { useState } from "react";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent, Root, Text } from "@chardesk/cell-ui";
import { CellSurface } from "@chardesk/cell-ui/browser";

export function AccordionExample() {
  const [expanded, setExpanded] = useState(false);
  return <CellSurface viewport={{ width: 30, height: 6 }} onCommand={(command) => {
    if (command.type === "set-expanded" && command.targetId === "general") setExpanded(command.expanded);
  }}>
    <Root><Accordion><AccordionItem id="general" expanded={expanded}>
      <AccordionTrigger><Text>General</Text></AccordionTrigger>
      <AccordionContent><Text>Project settings</Text></AccordionContent>
    </AccordionItem></Accordion></Root>
  </CellSurface>;
}`,
    api: [
      { name: "Accordion.disabled?", type: "boolean", description: "Disables all items and content controls." },
      { name: "AccordionItem.id", type: "string", description: "Stable item ID; target of set-expanded commands." },
      { name: "AccordionItem.expanded?", type: "boolean", description: "Controlled expansion; defaults to false. Items expand independently." },
      { name: "AccordionItem.disabled?", type: "boolean", description: "Disables this item and its content controls." },
      { name: "children", type: "Trigger + Content", description: "One Trigger followed by one Content per Item. Relations are automatic; collapsed content retains state." },
    ],
  },
  {
    slug: "toggle", title: "Toggle", group: "components", navigationOrder: 7,
    description: "Show a persistent mode with a status light, separate from interaction feedback.",
    probeId: "component-toggle", Demo: ToggleComponentDemo,
    usage: `import { useState } from "react";
import { Root, Toggle, Text } from "@chardesk/cell-ui";
import { CellSurface } from "@chardesk/cell-ui/browser";

export function ToggleExample() {
  const [pressed, setPressed] = useState(false);
  return <CellSurface viewport={{ width: 12, height: 1 }} onCommand={(command) => {
    if (command.type === "activate" && command.targetId === "bold") setPressed((value) => !value);
  }}>
    <Root><Toggle id="bold" label="Bold" pressed={pressed}><Text>Bold</Text></Toggle></Root>
  </CellSurface>;
}`,
    api: [
      { name: "pressed?", type: "boolean", description: "Persistent pressed state; defaults to false." },
      { name: "disabled?", type: "boolean", description: "Prevents focus and activation." },
      { name: "children / label", type: "ReactNode / string", description: "Cell content and accessible name." },
    ],
  },
  {
    slug: "progress", title: "Progress", group: "components", navigationOrder: 8,
    description: "Display determinate progress in copyable block Cells.",
    probeId: "component-progress", Demo: ProgressComponentDemo,
    usage: `import { Progress, Root } from "@chardesk/cell-ui";
import { CellSurface } from "@chardesk/cell-ui/browser";

export function ProgressExample() {
  return <CellSurface viewport={{ width: 20, height: 1 }} onCommand={() => {}}>
    <Root><Progress label="Upload" value={60} /></Root>
  </CellSurface>;
}`,
    api: [
      { name: "value", type: "number", description: "Clamped to 0…max; non-finite values display 0." },
      { name: "max?", type: "number", description: "Positive finite maximum; defaults to 100." },
      { name: "label / valueText?", type: "string", description: "Accessible name and optional value description." },
    ],
  },
  {
    slug: "separator", title: "Separator", group: "primitives", navigationOrder: 2,
    description: "Separate Cell content with one row or column.",
    probeId: "component-separator", Demo: SeparatorComponentDemo,
    usage: `import { Root, Separator, Text } from "@chardesk/cell-ui";
import { CellSurface } from "@chardesk/cell-ui/browser";

export function SeparatorExample() {
  return <CellSurface viewport={{ width: 20, height: 3 }} onCommand={() => {}}>
    <Root><Text>Files</Text><Separator /><Text>Settings</Text></Root>
  </CellSurface>;
}`,
    api: [
      { name: "variant?", type: '"line" | "slash" | "double" | "dots"', description: "Line by default; glyphs come from the global Cell UI theme." },
      { name: "orientation?", type: '"horizontal" | "vertical"', description: "Horizontal by default; vertical fills its container height." },
      { name: "style?", type: "CellLayoutStyle", description: "Cell length and layout constraints." },
    ],
  },
  {
    slug: "radio", title: "Radio", group: "components", navigationOrder: 9,
    description: "Choose one value with a shared group and arrow-key navigation.",
    probeId: "component-radio", Demo: RadioComponentDemo,
    usage: `import { RadioGroup, RadioItem, Root, Text } from "@chardesk/cell-ui";
import { CellSurface, useCellRadioState } from "@chardesk/cell-ui/browser";

const items = [
  { id: "light", value: "light", label: "Light" },
  { id: "dark", value: "dark", label: "Dark" },
];
export function RadioExample() {
  const radio = useCellRadioState(items, { defaultValue: "light" });
  return <CellSurface viewport={{ width: 16, height: 2 }} focusedId={radio.focusedId} onCommand={radio.dispatch}>
    <Root><RadioGroup label="Appearance" value={radio.value}>
      {radio.items.map((item) => <RadioItem key={item.id} id={item.id} value={item.value}>
        <Text>{item.label}</Text>
      </RadioItem>)}
    </RadioGroup></Root>
  </CellSurface>;
}`,
    api: [
      { name: "RadioGroup.value?", type: "string | null", description: "Controlled selection; items have unique non-empty values." },
      { name: "RadioGroup.orientation?", type: '"vertical" | "horizontal"', description: "Vertical by default." },
      { name: "disabled?", type: "boolean", description: "Disable a group or individual item." },
      { name: "useCellRadioState", type: "(items, options) => state", description: "Owns controlled/uncontrolled selection and command dispatch." },
    ],
  },
  {
    slug: "text",
    title: "Text",
    group: "primitives",
    navigationOrder: 0,
    description: "Render text, Unicode, and Cell-native wrapping.",
    probeId: "component-text",
    Demo: TextComponentDemo,
    usage: `import { Box, Root, Text } from "@chardesk/cell-ui";
import { CellSurface } from "@chardesk/cell-ui/browser";

export function TextExample() {
  return (
    <CellSurface viewport={{ width: 36, height: 14 }} onCommand={() => {}}>
      <Root id="root">
        <Box variant="bordered" style={{ height: 14, padding: 1 }}>
          <Text textStyle={{ bold: true }}>◆ Plain text · READY</Text>
          <Text>→ Unicode: 世界 👋</Text>
          <Text>↔ Move: ← ↑ ↓ →</Text>
          <Text>✓ Status: PASS · IDLE</Text>
          <Text>∞ Math: ≠ ≤ ≥ ± × ÷</Text>
          <Text>▓ Signal: ░▒▓█</Text>
          <Text>⣿ Cell: {"\ue0b0 \uee03 \uf5ee"}</Text>
          <Text>Legacy: {"\u{1fb95} \u{1fbb0} \u{1fbc5}"}</Text>
          <Text textStyle={{ dim: true }}>↳ Wraps on integer Cell boundaries.</Text>
        </Box>
      </Root>
    </CellSurface>
  );
}`,
    api: [
      { name: "id?", type: "string", description: "Stable widget identity." },
      { name: "children", type: "string | number", description: "Text rendered into Cells." },
      { name: "style?", type: "CellLayoutStyle", description: "Integer Cell layout." },
      { name: "textStyle?", type: "CellTextStyle", description: "Foreground, background, and emphasis." },
    ],
  },
  {
    slug: "box",
    title: "Box",
    group: "primitives",
    navigationOrder: 1,
    description: "Compose nested Cell layout, spacing, and block boundaries.",
    probeId: "component-box",
    Demo: BoxComponentDemo,
    usage: `import { Box, Root, Text } from "@chardesk/cell-ui";
import { CellSurface } from "@chardesk/cell-ui/browser";

export function BoxExample() {
  return (
    <CellSurface viewport={{ width: 36, height: 8 }} onCommand={() => {}}>
      <Root id="root">
        <Box style={{ height: 8 }}>
          <Text>Block variants</Text>
          <Box style={{ direction: "row", gap: 1 }}>
            <Box variant="plain" style={{ width: 10 }}><Text>plain</Text></Box>
            <Box variant="raised" style={{ width: 10 }}><Text>raised</Text></Box>
            <Box variant="bordered" style={{ width: 12 }}><Text>bordered</Text></Box>
          </Box>
        </Box>
      </Root>
    </CellSurface>
  );
}`,
    api: [
      { name: "id?", type: "string", description: "Stable widget identity." },
      { name: "label?", type: "string", description: "Accessible name when the Box owns meaning." },
      { name: "disabled?", type: "boolean", description: "Marks the widget disabled." },
      { name: "children?", type: "ReactNode", description: "Nested Cell descriptors." },
      { name: "variant?", type: '"plain" | "raised" | "bordered"', description: "Mutually exclusive block boundary; plain by default." },
      { name: "borderShape?", type: '"square" | "rounded"', description: "Border glyphs when variant is bordered." },
      { name: "style?", type: "CellLayoutStyle", description: "Cell size, direction, gap, and padding." },
    ],
  },
  {
    slug: "button",
    title: "Button",
    group: "components",
    navigationOrder: 0,
    description: "Trigger one action through keyboard, pointer, or assistive input.",
    probeId: "component-button",
    Demo: ButtonComponentDemo,
    usage: `import { useState } from "react";
import { Button, Root, Text, type WidgetCommand } from "@chardesk/cell-ui";
import { CellSurface } from "@chardesk/cell-ui/browser";

export function ButtonExample() {
  const [focusedId, setFocusedId] = useState("save");
  const dispatch = (command: WidgetCommand) => {
    if (command.type === "focus") setFocusedId(command.targetId);
  };
  return (
    <CellSurface viewport={{ width: 24, height: 3 }} focusedId={focusedId} onCommand={dispatch}>
      <Root id="root">
        <Button
          id="save"
          label="Save document"
          variant="default"
          size="default"
          focused={focusedId === "save"}
        >
          <Text>Save</Text>
        </Button>
      </Root>
    </CellSurface>
  );
}`,
    api: [
      { name: "id?", type: "string", description: "Stable focus and activate command target." },
      { name: "label?", type: "string", description: "Accessible name; descendant text is the fallback." },
      { name: "variant?", type: '"default" | "outline" | "ghost"', description: "Semantic surface treatment; defaults to default." },
      { name: "size?", type: '"sm" | "default" | "lg"', description: "Horizontal Cell density; defaults to default." },
      { name: "disabled?", type: "boolean", description: "Prevents focus, hover, and activation." },
      { name: "focused?", type: "boolean", description: "Controlled logical focus state." },
      { name: "children?", type: "ReactNode", description: "Cell-native button content." },
      { name: "style?", type: "CellLayoutStyle", description: "Cell size and layout overrides." },
      { name: "textStyle?", type: "CellTextStyle", description: "Base foreground, background, and emphasis." },
    ],
  },
  {
    slug: "select",
    title: "Select",
    group: "components",
    navigationOrder: 1,
    description: "Choose one value from a Cell-anchored listbox.",
    probeId: "component-select",
    Demo: SelectComponentDemo,
    usage: `import {
  Root,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  Text,
} from "@chardesk/cell-ui";
import { CellSurface, useCellSelectState } from "@chardesk/cell-ui/browser";

const themes = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" },
];

export function SelectExample() {
  const select = useCellSelectState("theme", themes, {
    defaultSelectedId: "dark",
  });
  return (
    <CellSurface focusedId={select.focusedId} onCommand={select.dispatch} viewport={{ width: 32, height: 7 }}>
      <Root id="root">
        <Select id={select.id} label="Theme" style={{ width: 30 }}>
          <SelectTrigger
            id={select.triggerId}
            label="Theme"
            expanded={select.open}
            controlsId={select.open ? select.contentId : undefined}
          ><Text>{select.selectedItem?.label ?? "Select theme"}</Text></SelectTrigger>
          {select.open ? (
            <SelectContent
              id={select.contentId}
              label="Theme options"
              scrollY={select.scrollY}
            >
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
    </CellSurface>
  );
}`,
    api: [
      { name: "Select.style", type: "CellLayoutStyle", description: "Sets the shared Trigger and Content width." },
      { name: "SelectTrigger.expanded", type: "boolean", description: "Controls disclosure state and chrome." },
      { name: "SelectTrigger.controlsId?", type: "string", description: "Relates the open Trigger to its listbox." },
      { name: "SelectContent", type: "Cell primitive", description: "Portaled listbox anchored to the Trigger." },
      { name: "SelectContent.variant?", type: '"plain" | "raised" | "bordered"', description: "Raised by default; bordered reserves a one-Cell frame." },
      { name: "SelectContent.borderShape?", type: '"square" | "rounded"', description: "Border glyphs when Content is bordered." },
      { name: "SelectContent.scrollY?", type: "number", description: "Controlled offset for a constrained listbox." },
      { name: "SelectItem.selected?", type: "boolean", description: "Persistent committed selection." },
      { name: "useCellSelectState", type: "CellSelectState", description: "Owns open, provisional focus, selection, listbox scroll, and commands." },
    ],
  },
  {
    slug: "combobox",
    title: "Combobox",
    group: "components",
    navigationOrder: 2,
    description: "Filter local options in one Cell input, then commit one value.",
    probeId: "component-combobox",
    Demo: ComboboxComponentDemo,
    usage: `import { Combobox, ComboboxContent, ComboboxInput, ComboboxItem, Root, Text } from "@chardesk/cell-ui";
import { CellSurface, useCellComboboxState } from "@chardesk/cell-ui/browser";

const fonts = [
  { id: "maple", label: "Maple Mono" },
  { id: "fusion", label: "Fusion Pixel 12px Mono" },
];

export function ComboboxExample() {
  const combo = useCellComboboxState("font", fonts, { defaultSelectedId: "maple" });
  return <CellSurface viewport={{ width: 32, height: 8 }} focusedId={combo.focusedId}
    onCommand={combo.dispatch}><Root>
    <Combobox id={combo.id} label="Font" style={{ width: 30 }}>
      <ComboboxInput id={combo.inputId} label="Font" state={combo.inputSnapshot}
        expanded={combo.open} activeDescendantId={combo.activeId ?? undefined} />
      {combo.open && <ComboboxContent id={combo.contentId} label="Font options" scrollY={combo.scrollY}>
        {combo.filteredItems.map((item, index) => <ComboboxItem id={item.id} key={item.id}
          active={combo.activeId === item.id} selected={combo.selectedId === item.id}
          positionInSet={index + 1} setSize={combo.filteredItems.length}>
          <Text>{item.label}</Text>
        </ComboboxItem>)}
      </ComboboxContent>}
    </Combobox>
  </Root></CellSurface>;
}`,
    api: [
      { name: "Combobox.disabled?", type: "boolean", description: "Disables the input and every candidate." },
      { name: "ComboboxInput.state", type: "CellTextSnapshot", description: "Controlled editor state; the input remains the only focus owner." },
      { name: "ComboboxInput.style?", type: "CellSingleLineInputStyle", description: "Width constraints and flex behavior; height, padding, and border belong to the component." },
      { name: "ComboboxInput.activeDescendantId?", type: "string", description: "Relates keyboard navigation to one active option without moving focus." },
      { name: "ComboboxContent", type: "Cell primitive", description: "Portaled listbox anchored to the input." },
      { name: "ComboboxItem.active?", type: "boolean", description: "Provisional keyboard or pointer candidate, separate from committed selection." },
      { name: "useCellComboboxState", type: "CellComboboxState", description: "Owns local filtering, editor state, active candidate, selection, opening, and scroll." },
    ],
  },
  {
    slug: "checkbox",
    title: "Checkbox",
    group: "components",
    navigationOrder: 4,
    description: "Toggle boolean or indeterminate state through one Cell command path.",
    probeId: "component-checkbox",
    Demo: CheckboxComponentDemo,
    usage: `import { useState } from "react";
import {
  Checkbox,
  Root,
  Text,
  nextCellCheckboxState,
  type CellCheckboxState,
  type WidgetCommand,
} from "@chardesk/cell-ui";
import { CellSurface } from "@chardesk/cell-ui/browser";

export function CheckboxExample() {
  const [checked, setChecked] = useState<CellCheckboxState>("indeterminate");
  const [focusedId, setFocusedId] = useState("autosave");
  const dispatch = (command: WidgetCommand) => {
    if (command.type === "focus") setFocusedId(command.targetId);
    if (command.type === "activate" && command.targetId === "autosave") {
      setChecked(nextCellCheckboxState);
    }
  };
  return (
    <CellSurface focusedId={focusedId} onCommand={dispatch} viewport={{ width: 24, height: 1 }}>
      <Root id="root">
        <Checkbox
          id="autosave"
          label="Autosave"
          checked={checked}
          focused={focusedId === "autosave"}
        ><Text>Autosave</Text></Checkbox>
      </Root>
    </CellSurface>
  );
}`,
    api: [
      { name: "checked?", type: "boolean | \"indeterminate\"", description: "Controls [ ], [x], or [-]." },
      { name: "id?", type: "string", description: "Stable focus and activate command target." },
      { name: "label?", type: "string", description: "Accessible name; descendant text is the fallback." },
      { name: "disabled?", type: "boolean", description: "Prevents focus, hover, and activation." },
      { name: "focused?", type: "boolean", description: "Controlled logical focus state." },
      { name: "children?", type: "ReactNode", description: "Cell-native label content." },
      { name: "nextCellCheckboxState", type: "(CellCheckboxState) => CellCheckboxState", description: "Maps mixed to checked, then toggles the binary cycle." },
    ],
  },
  {
    slug: "slider",
    title: "Slider",
    group: "components",
    navigationOrder: 3,
    description: "Select one stepped value or a bounded interval on a Cell-native track.",
    probeId: "component-slider",
    Demo: SliderComponentDemo,
    usage: `import { useState } from "react";
import { Root, Slider, type WidgetCommand } from "@chardesk/cell-ui";
import { CellSurface } from "@chardesk/cell-ui/browser";

export function SliderExample() {
  const [value, setValue] = useState(50);
  const dispatch = (command: WidgetCommand) => {
    if (command.type === "set-value" && command.targetId === "volume") {
      setValue(command.value);
    }
  };
  return (
    <CellSurface focusedId="volume" onCommand={dispatch} viewport={{ width: 26, height: 1 }}>
      <Root id="root" style={{ direction: "row" }}>
        <Slider
          id="volume"
          label="Volume"
          value={value}
          valueText={String(value) + " percent"}
          min={0}
          max={100}
          step={1}
          focused
          style={{ width: 26 }}
        />
      </Root>
    </CellSurface>
  );
}`,
    api: [
      { name: "value", type: "number", description: "Controlled numeric value projected onto the track." },
      { name: "min? / max?", type: "number", description: "Allowed range; defaults to 0–100." },
      { name: "step?", type: "number", description: "Keyboard and pointer increment; defaults to 1." },
      { name: "valueText?", type: "string", description: "Human-readable aria-valuetext without visible UI." },
      { name: "disabled?", type: "boolean", description: "Prevents focus, hover, keyboard, tap, and drag." },
      { name: "focused?", type: "boolean", description: "Controlled logical focus state." },
      { name: "RangeSlider", type: "compound", description: "Owns one shared track and exactly two direct thumbs." },
      { name: "RangeSliderThumb", type: "id + label + value", description: "Owns one independently focused interval endpoint." },
      { name: "WidgetCommand", type: "set-value", description: "Unifies keyboard, track tap, drag, and assistive input." },
    ],
  },
  {
    slug: "input",
    title: "Input",
    group: "components",
    navigationOrder: 5,
    description: "Edit a single line of Unicode text on the Cell grid.",
    probeId: "component-input",
    Demo: InputComponentDemo,
    usage: `import { Box, Root, Text, TextInput } from "@chardesk/cell-ui";
import { CellSurface, useCellTextState } from "@chardesk/cell-ui/browser";

export function InputExample() {
  const input = useCellTextState("file-name", { value: "notes.txt" });
  return (
    <CellSurface viewport={{ width: 36, height: 2 }} onCommand={input.dispatch}>
      <Root id="root">
        <Box>
          <Text>File name</Text>
          <TextInput
            id="file-name"
            label="File name"
            state={input.snapshot}
            style={{ width: 36 }}
          />
        </Box>
      </Root>
    </CellSurface>
  );
}`,
    api: [
      { name: "id?", type: "string", description: "Stable text command target identity." },
      { name: "state", type: "CellTextSnapshot", description: "Controlled value, selection, cursor, and scroll state." },
      { name: "label?", type: "string", description: "Accessible textbox name." },
      { name: "disabled?", type: "boolean", description: "Prevents focus and editing." },
      { name: "readOnly?", type: "boolean", description: "Allows focus and selection without editing." },
      { name: "style?", type: "CellSingleLineInputStyle", description: "Width constraints and flex behavior; height, padding, and border belong to the component." },
      { name: "textStyle?", type: "CellTextStyle", description: "Foreground, background, and emphasis." },
    ],
  },
  {
    slug: "list",
    title: "List",
    group: "collections",
    navigationOrder: 0,
    description: "Move focus and confirm a selection through one command path.",
    probeId: "component-list",
    Demo: ListComponentDemo,
    usage: `import { List, ListItem, Root, Text } from "@chardesk/cell-ui";
import { CellSurface, useCellListState } from "@chardesk/cell-ui/browser";

const items = [
  { id: "alpha", label: "Alpha" },
  { id: "beta", label: "Beta" },
];

export function ListExample() {
  const list = useCellListState(items, { defaultFocusedId: "alpha" });
  return (
    <CellSurface
      viewport={{ width: 32, height: 6 }}
      focusedId={list.focusedId}
      onCommand={list.dispatch}
    >
      <Root id="root">
        <List label="Greek letters">
          {list.items.map((item) => (
            <ListItem
              id={item.id}
              key={item.id}
              focused={list.focusedId === item.id}
              selected={list.selectedId === item.id}
            >
              <Text>{item.label}</Text>
            </ListItem>
          ))}
        </List>
      </Root>
    </CellSurface>
  );
}`,
    api: [
      { name: "List.label?", type: "string", description: "Accessible collection name." },
      { name: "List.style?", type: "CellLayoutStyle", description: "Collection layout." },
      { name: "ListItem.focused?", type: "boolean", description: "Logical focus state." },
      { name: "ListItem.selected?", type: "boolean", description: "Logical selection state." },
      { name: "ListItem.disabled?", type: "boolean", description: "Prevents activation and focus." },
      { name: "ListItem.positionInSet?", type: "number", description: "Logical position for virtual collections." },
      { name: "ListItem.setSize?", type: "number", description: "Logical collection size." },
    ],
  },
  {
    slug: "scroll-area",
    title: "ScrollArea",
    group: "components",
    navigationOrder: 6,
    description: "Scroll overflowing Cell content with keys, wheel, track, or thumb.",
    probeId: "component-scroll-area",
    Demo: ScrollAreaComponentDemo,
    usage: `import { useState } from "react";
import { Root, ScrollArea, Text, type WidgetCommand } from "@chardesk/cell-ui";
import { CellSurface } from "@chardesk/cell-ui/browser";

export function ScrollAreaExample() {
  const [scrollY, setScrollY] = useState(0);
  const dispatch = (command: WidgetCommand) => {
    if (command.type === "scroll") setScrollY(command.scrollY);
  };
  return (
    <CellSurface viewport={{ width: 32, height: 6 }} onCommand={dispatch}>
      <Root id="root">
        <ScrollArea variant="bordered" scrollY={scrollY} style={{ height: 6 }}>
          {Array.from({ length: 10 }, (_, index) => (
            <Text key={index}>Row {index + 1}</Text>
          ))}
        </ScrollArea>
      </Root>
    </CellSurface>
  );
}`,
    api: [
      { name: "id?", type: "string", description: "Stable scroll target identity." },
      { name: "label?", type: "string", description: "Accessible viewport name." },
      { name: "scrollX?", type: "number", description: "Controlled horizontal Cell offset." },
      { name: "scrollY?", type: "number", description: "Controlled vertical Cell offset." },
      { name: "variant?", type: '"plain" | "raised" | "bordered"', description: "Plain by default; bordered reserves a one-Cell frame." },
      { name: "borderShape?", type: '"square" | "rounded"', description: "Border glyphs when the viewport is bordered." },
      { name: "style?", type: "CellLayoutStyle", description: "Viewport size and padding." },
    ],
  },
];

export const componentDocumentBySlug = new Map(
  componentDocuments.map((document) => [document.slug, document] as const),
);

export const defaultComponentSlug = "button";

const navigationGroupDefinitions: ReadonlyArray<Readonly<{
  id: ComponentGroupId;
  title: string;
}>> = [
  { id: "components", title: "Components" },
  { id: "primitives", title: "Primitives" },
  { id: "collections", title: "Collections" },
];

export const componentNavigationGroups = navigationGroupDefinitions.map((group) => ({
  ...group,
  documents: componentDocuments
    .filter((document) => document.group === group.id)
    .toSorted((left, right) => left.navigationOrder - right.navigationOrder),
}));
