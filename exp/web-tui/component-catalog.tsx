import type { ComponentType } from "react";
import {
  BoxComponentDemo,
  ButtonComponentDemo,
  CheckboxComponentDemo,
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
        <Box style={{ border: true, height: 14, padding: 1 }}>
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
    description: "Compose nested Cell layout, spacing, and borders.",
    probeId: "component-box",
    Demo: BoxComponentDemo,
    usage: `import { Box, Root, Text } from "@chardesk/cell-ui";
import { CellSurface } from "@chardesk/cell-ui/browser";

export function BoxExample() {
  return (
    <CellSurface viewport={{ width: 36, height: 8 }} onCommand={() => {}}>
      <Root id="root">
        <Box style={{ border: true, height: 8, padding: 1 }}>
          <Text>Nested boxes</Text>
          <Box style={{ direction: "row", gap: 1 }}>
            <Box style={{ border: true, width: 14 }}><Text>Left</Text></Box>
            <Box style={{ border: true, width: 14 }}><Text>Right</Text></Box>
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
      { name: "style?", type: "CellLayoutStyle", description: "Cell size, direction, gap, padding, and border." },
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
  const [saved, setSaved] = useState(false);
  const dispatch = (command: WidgetCommand) => {
    if (command.type === "focus") setFocusedId(command.targetId);
    if (command.type === "activate" && command.targetId === "save") setSaved(true);
  };
  return (
    <CellSurface viewport={{ width: 24, height: 3 }} focusedId={focusedId} onCommand={dispatch}>
      <Root id="root">
        <Button id="save" label="Save document" focused={focusedId === "save"}>
          <Text>{saved ? "✓ Saved" : "Save"}</Text>
        </Button>
      </Root>
    </CellSurface>
  );
}`,
    api: [
      { name: "id?", type: "string", description: "Stable focus and activate command target." },
      { name: "label?", type: "string", description: "Accessible name; descendant text is the fallback." },
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
    </CellSurface>
  );
}`,
    api: [
      { name: "Select.style", type: "CellLayoutStyle", description: "Sets the shared Trigger and Content width." },
      { name: "SelectTrigger.expanded", type: "boolean", description: "Controls disclosure state and chrome." },
      { name: "SelectTrigger.controlsId?", type: "string", description: "Relates the open Trigger to its listbox." },
      { name: "SelectContent", type: "Cell primitive", description: "Portaled listbox anchored to the Trigger." },
      { name: "SelectItem.selected?", type: "boolean", description: "Persistent committed selection." },
      { name: "useCellSelectState", type: "CellSelectState", description: "Owns open, provisional focus, selection, and commands." },
    ],
  },
  {
    slug: "checkbox",
    title: "Checkbox",
    group: "components",
    navigationOrder: 3,
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
    navigationOrder: 2,
    description: "Select one stepped numeric value on a Cell-native track.",
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
      { name: "WidgetCommand", type: "set-value", description: "Unifies keyboard, track tap, drag, and assistive input." },
    ],
  },
  {
    slug: "input",
    title: "Input",
    group: "components",
    navigationOrder: 4,
    description: "Edit a single line of Unicode text on the Cell grid.",
    probeId: "component-input",
    Demo: InputComponentDemo,
    usage: `import { Box, Root, Text, TextInput } from "@chardesk/cell-ui";
import { CellSurface, useCellTextState } from "@chardesk/cell-ui/browser";

export function InputExample() {
  const input = useCellTextState("file-name", { value: "notes.txt" });
  return (
    <CellSurface viewport={{ width: 36, height: 4 }} onCommand={input.dispatch}>
      <Root id="root">
        <Box>
          <Text>File name</Text>
          <TextInput
            id="file-name"
            label="File name"
            state={input.snapshot}
            style={{ border: true, height: 3 }}
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
      { name: "style?", type: "CellLayoutStyle", description: "Cell size, padding, and border." },
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
    navigationOrder: 5,
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
        <ScrollArea scrollY={scrollY} style={{ border: true, height: 6 }}>
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
      { name: "style?", type: "CellLayoutStyle", description: "Viewport size, padding, and border." },
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
