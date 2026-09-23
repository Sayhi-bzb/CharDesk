import type { ComponentType } from "react";
import {
  DialogComponentDemo,
  AccordionComponentDemo,
  ButtonComponentDemo,
  BadgeComponentDemo,
  CheckboxComponentDemo,
  ComboboxComponentDemo,
  ToggleComponentDemo,
  ProgressComponentDemo,
  SeparatorComponentDemo,
  RadioComponentDemo,
  InputComponentDemo,
  ScrollAreaComponentDemo,
  SelectComponentDemo,
  SliderComponentDemo,
  TabsComponentDemo,
} from "./sections/components";

type ComponentApiRow = Readonly<{
  name: string;
  type: string;
  description: string;
}>;

export type ComponentDocument = Readonly<{
  slug: string;
  title: string;
  navigationOrder: number;
  description: string;
  probeId: string;
  Demo: ComponentType;
  usage: string;
  api: readonly ComponentApiRow[];
}>;

const componentSourceFiles: Readonly<Record<string, readonly string[]>> = {
  dialog: ["react.tsx", "interaction.ts"],
  accordion: ["react.tsx", "interaction.ts"],
  toggle: ["react.tsx", "press.ts"],
  progress: ["react.tsx", "progress.ts"],
  separator: ["react.tsx", "separator.ts"],
  radio: ["react.tsx", "browser-collections.tsx"],
  button: ["react.tsx", "button.ts"],
  badge: ["react.tsx", "badge.ts", "theme.ts"],
  select: ["react.tsx", "browser-collections.tsx"],
  combobox: ["react.tsx", "combobox.ts", "browser-combobox.tsx"],
  checkbox: ["react.tsx", "primitive-behavior.ts"],
  slider: ["react.tsx", "slider.ts"],
  input: ["react.tsx", "browser-input.tsx"],
  tabs: ["react.tsx", "browser-collections.tsx", "interaction.ts"],
  "scroll-area": ["react.tsx", "scroll.ts"],
};

export const sourceLinksForComponent = (slug: string) =>
  (componentSourceFiles[slug] ?? ["react.tsx"]).map((file) => ({
    label: file,
    href: `https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/${file}`,
  }));

export const componentDocuments: readonly ComponentDocument[] = [
  {
    slug: "dialog", title: "Dialog", navigationOrder: 11,
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
      { name: "variant?", type: '"surface" | "ghost"', description: "Both are opaque: surface uses the elevated surface token; ghost uses the base surface token." },
      { name: "frame?", type: '"none" | "bordered"', description: "Independent Cell border; bordered by default." },
      { name: "borderShape?", type: '"square" | "rounded"', description: "Border glyphs when framed." },
      { name: "modal", type: "boolean", description: "Trap focus and exclude background semantics; default true." },
      { name: "closeOnOutsideClick", type: "boolean", description: "Request dismissal on outside pointer down; default true." },
      { name: "initialFocusId", type: "string", description: "Preferred available content control on opening." },
      { name: "children", type: "Cell primitives", description: "One direct Title, optional direct Description, and composable content/Footer." },
    ],
  },
  {
    slug: "accordion", title: "Accordion", navigationOrder: 10,
    description: "Expand independent sections without losing their content state.",
    probeId: "component-accordion", Demo: AccordionComponentDemo,
    usage: `import { useState } from "react";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent, Root, Separator, Text } from "@chardesk/cell-ui";
import { CellSurface } from "@chardesk/cell-ui/browser";

export function AccordionExample() {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  return <CellSurface viewport={{ width: 30, height: 6 }} onCommand={(command) => {
    if (command.type === "set-expanded") setExpanded((current) => {
      const next = new Set(current);
      if (command.expanded) next.add(command.targetId);
      else next.delete(command.targetId);
      return next;
    });
  }}>
    <Root><Accordion><AccordionItem id="general" expanded={expanded.has("general")}>
      <AccordionTrigger><Text>General</Text></AccordionTrigger>
      <AccordionContent><Text>Project settings</Text></AccordionContent>
    </AccordionItem>
    <Separator />
    <AccordionItem id="advanced" expanded={expanded.has("advanced")}>
      <AccordionTrigger><Text>Advanced</Text></AccordionTrigger>
      <AccordionContent><Text>Advanced settings</Text></AccordionContent>
    </AccordionItem></Accordion></Root>
  </CellSurface>;
}`,
    api: [
      { name: "Accordion.disabled?", type: "boolean", description: "Disables all items and content controls." },
      { name: "AccordionItem.id", type: "string", description: "Stable item ID; target of set-expanded commands." },
      { name: "AccordionItem.expanded?", type: "boolean", description: "Controlled expansion; defaults to false. Items expand independently." },
      { name: "AccordionItem.disabled?", type: "boolean", description: "Disables this item and its content controls." },
      { name: "children", type: "AccordionItem | Separator", description: "Each Item has one Trigger then one Content; optional Separators sit only between Items. Collapsed content retains state." },
    ],
  },
  {
    slug: "toggle", title: "Toggle", navigationOrder: 7,
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
    slug: "progress", title: "Progress", navigationOrder: 8,
    description: "Display determinate or indeterminate progress as a solid or outlined track, with an optional percentage.",
    probeId: "component-progress", Demo: ProgressComponentDemo,
    usage: `import { Progress, Root } from "@chardesk/cell-ui";
import { CellSurface } from "@chardesk/cell-ui/browser";

export function ProgressExample() {
  return <CellSurface viewport={{ width: 20, height: 1 }} onCommand={() => {}}>
    <Root><Progress label="Upload" value={60} variant="outline" number /></Root>
  </CellSurface>;
}`,
    api: [
      { name: "value", type: "number | null", description: "Numbers are clamped to 0…max; null is indeterminate." },
      { name: "max?", type: "number", description: "Positive finite maximum; defaults to 100." },
      { name: "number?", type: "boolean", description: "Show a calculated percentage beside the track within the declared width; hidden for indeterminate progress." },
      { name: "variant?", type: '"solid" | "outline"', description: "Solid by default; outline reserves bracket Cells inside the declared width." },
      { name: "label / valueText?", type: "string", description: "Accessible name and optional value description." },
    ],
  },
  {
    slug: "separator", title: "Separator", navigationOrder: 14,
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
    slug: "radio", title: "Radio", navigationOrder: 9,
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
    slug: "button",
    title: "Button",
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
          variant="solid"
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
      { name: "variant?", type: '"solid" | "surface" | "outline" | "ghost"', description: "Local visual recipe; overrides the global recipe and otherwise defaults to solid." },
      { name: "disabled?", type: "boolean", description: "Prevents focus, hover, and activation." },
      { name: "focused?", type: "boolean", description: "Controlled logical focus state." },
      { name: "children?", type: "ReactNode", description: "Cell-native button content." },
      { name: "style?", type: "CellLayoutStyle", description: "Layout and horizontal padding; defaults to one content Cell per side." },
      { name: "textStyle?", type: "CellTextStyle", description: "Base foreground, background, and emphasis." },
    ],
  },
  {
    slug: "badge",
    title: "Badge",
    navigationOrder: 0.5,
    description: "Show a compact state label, optionally acting as a command target.",
    probeId: "component-badge",
    Demo: BadgeComponentDemo,
    usage: `import { Badge, Root, Text } from "@chardesk/cell-ui";
import { CellSurface } from "@chardesk/cell-ui/browser";

export function BadgeExample() {
  return <CellSurface viewport={{ width: 22, height: 1 }} onCommand={() => {}}>
    <Root style={{ direction: "row", gap: 1 }}>
      <Badge tone="success"><Text>Done</Text></Badge>
      <Badge id="retry" tone="error" interactive><Text>Retry</Text></Badge>
    </Root>
  </CellSurface>;
}`,
    api: [
      { name: "tone?", type: '"neutral" | "info" | "success" | "warning" | "error"', description: "Semantic color pair; neutral by default." },
      { name: "interactive?", type: "boolean", description: "Opt in to focus, pointer, keyboard, and assistive activation; false by default." },
      { name: "id?", type: "string", description: "Required non-empty command target when interactive." },
      { name: "label?", type: "string", description: "Accessible name override; descendant text is the fallback." },
      { name: "disabled?", type: "boolean", description: "Disables an interactive Badge." },
      { name: "style?", type: "CellLayoutStyle", description: "Cell layout; one content Cell is reserved on each side by default." },
    ],
  },
  {
    slug: "select",
    title: "Select",
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
        <Select id={select.id} style={{ width: 30 }}>
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
      { name: "Select.variant?", type: '"surface" | "ghost"', description: "Shared surface recipe; the local value overrides the global recipe." },
      { name: "SelectTrigger.expanded", type: "boolean", description: "Controls disclosure state and chrome." },
      { name: "SelectTrigger.controlsId?", type: "string", description: "Relates the open Trigger to its listbox." },
      { name: "SelectContent", type: "Cell primitive", description: "Portaled listbox anchored to the Trigger." },
      { name: "SelectContent.frame?", type: '"none" | "bordered"', description: "Optional one-Cell dropdown frame; none by default." },
      { name: "SelectContent.borderShape?", type: '"square" | "rounded"', description: "Border glyphs when Content is bordered." },
      { name: "SelectContent.scrollY?", type: "number", description: "Controlled offset for a constrained listbox." },
      { name: "SelectItem.selected?", type: "boolean", description: "Persistent committed selection." },
      { name: "useCellSelectState", type: "CellSelectState", description: "Owns open, provisional focus, selection, listbox scroll, and commands." },
    ],
  },
  {
    slug: "combobox",
    title: "Combobox",
    navigationOrder: 2,
    description: "Click the input row to open local options, filter, then commit one value.",
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
    <Combobox id={combo.id} style={{ width: 30 }}>
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
      { name: "ComboboxInput.state", type: "CellTextSnapshot", description: "Controlled editor state; selection underlines while editing and only the Cell Cursor inverts." },
      { name: "ComboboxInput.style?", type: "CellSingleLineInputStyle", description: "Width constraints and flex behavior; height, padding, and border belong to the component." },
      { name: "ComboboxInput.activeDescendantId?", type: "string", description: "Relates keyboard navigation to one active option without moving focus." },
      { name: "ComboboxContent", type: "Cell primitive", description: "Portaled listbox anchored to the input." },
      { name: "Combobox.variant?", type: '"surface" | "ghost"', description: "Shared surface recipe; the local value overrides the global recipe." },
      { name: "ComboboxContent.frame?", type: '"none" | "bordered"', description: "Optional one-Cell dropdown frame; none by default." },
      { name: "ComboboxItem.active?", type: "boolean", description: "Provisional keyboard or pointer candidate, separate from committed selection." },
      { name: "useCellComboboxState", type: "CellComboboxState", description: "Owns local filtering, editor state, active candidate, selection, opening, and scroll." },
    ],
  },
  {
    slug: "checkbox",
    title: "Checkbox",
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
      { name: "variant?", type: '"surface" | "ghost"', description: "Local surface recipe; overrides the global recipe and otherwise defaults to surface." },
      { name: "style?", type: "CellSingleLineInputStyle", description: "Width constraints and flex behavior; height, padding, and border belong to the component." },
      { name: "textStyle?", type: "CellTextStyle", description: "Foreground, background, and emphasis." },
    ],
  },
  {
    slug: "tabs",
    title: "Tabs",
    navigationOrder: 13,
    description: "Switch between related Cell panels with one selected tab.",
    probeId: "component-tabs",
    Demo: TabsComponentDemo,
    usage: `import { Root, Tab, TabPanel, Tabs, Text } from "@chardesk/cell-ui";
import { CellSurface, useCellTabsState } from "@chardesk/cell-ui/browser";

const items = [
  { id: "code", label: "Code", panelId: "code-panel" },
  { id: "preview", label: "Preview", panelId: "preview-panel" },
];

export function TabsExample() {
  const tabs = useCellTabsState(items, { defaultSelectedId: "code" });
  const selected = tabs.items.find((item) => item.id === tabs.selectedId);
  return <CellSurface viewport={{ width: 28, height: 5 }}
    focusedId={tabs.focusedId} onCommand={tabs.dispatch}>
    <Root>
      <Tabs label="Views" orientation="horizontal">
        {tabs.items.map((item) => <Tab key={item.id} id={item.id}
          controlsId={item.panelId}
          focused={tabs.focusedId === item.id}
          selected={tabs.selectedId === item.id}><Text>{item.label}</Text></Tab>)}
      </Tabs>
      {selected && <TabPanel id={selected.panelId} label={selected.label}
        labelledById={selected.id}><Text>{selected.label} content</Text></TabPanel>}
    </Root>
  </CellSurface>;
}`,
    api: [
      { name: "Tabs.label?", type: "string", description: "Accessible tab-list name." },
      { name: "Tabs.orientation?", type: '"horizontal" | "vertical"', description: "Collection orientation; this example uses horizontal navigation." },
      { name: "Tab.id", type: "string", description: "Stable focus and activation target." },
      { name: "Tab.controlsId?", type: "string", description: "ID of the associated TabPanel." },
      { name: "Tab.focused?", type: "boolean", description: "Controlled logical focus state." },
      { name: "Tab.selected?", type: "boolean", description: "Controlled selected state." },
      { name: "Tab.disabled?", type: "boolean", description: "Prevents focus and selection." },
      { name: "TabPanel.labelledById?", type: "string", description: "ID of the tab naming this panel." },
      { name: "useCellTabsState", type: "items, options", description: "Keeps focus and selection outside the renderer; dispatches Cell commands." },
    ],
  },
  {
    slug: "scroll-area",
    title: "ScrollArea",
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
        <ScrollArea frame="bordered" scrollY={scrollY} style={{ height: 6 }}>
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
      { name: "scrollX?", type: "number", description: "Controlled horizontal Cell offset." },
      { name: "scrollY?", type: "number", description: "Controlled vertical Cell offset." },
      { name: "variant?", type: '"surface" | "ghost"', description: "Local surface recipe; overrides the global recipe and otherwise defaults to ghost." },
      { name: "frame?", type: '"none" | "bordered"', description: "Optional one-Cell border, independent of background." },
      { name: "borderShape?", type: '"square" | "rounded"', description: "Border glyphs when the viewport is bordered." },
      { name: "style?", type: "CellLayoutStyle", description: "Viewport size and padding." },
    ],
  },
];

export const componentDocumentBySlug = new Map(
  componentDocuments.map((document) => [document.slug, document] as const),
);

export const defaultComponentSlug = "button";

export const componentNavigationDocuments = componentDocuments
  .toSorted((left, right) => left.navigationOrder - right.navigationOrder);
