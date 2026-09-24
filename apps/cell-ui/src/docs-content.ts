type ComponentApiRow = Readonly<{ name: string; type: string; description: string }>;
export type ComponentContent = Readonly<{ slug: string; title: string; description: string; usage: string; api: readonly ComponentApiRow[] }>;
export const publicUsage = (usage: string) => usage.replaceAll("\"@chardesk/cell-ui/browser\"", "\"@/lib/cell-ui/browser\"").replaceAll("\"@chardesk/cell-ui\"", "\"@/lib/cell-ui\"");
export const installationCommands = {
  pnpm: "pnpm dlx shadcn@latest add @chardesk/cell-ui",
  npm: "npx shadcn@latest add @chardesk/cell-ui",
  yarn: "yarn dlx shadcn@latest add @chardesk/cell-ui",
  bun: "bunx shadcn@latest add @chardesk/cell-ui",
} as const;

const componentSourceFiles: Readonly<Record<string, readonly string[]>> = {
  alert: ["react.tsx", "alert.ts", "semantics.ts"],
  text: ["react.tsx", "layout.ts"],
  overlay: ["react.tsx", "anchored-overlay.ts", "interaction.ts"],
  "range-slider": ["react.tsx", "slider.ts"],
  "text-area": ["react.tsx", "browser-input.tsx"],
  list: ["react.tsx", "browser-collections.tsx"],
  menu: ["react.tsx", "browser-collections.tsx"],
  tree: ["react.tsx", "browser-collections.tsx"],
  table: ["react.tsx", "table.ts", "paint.ts", "semantics.ts"],
  dialog: ["react.tsx", "interaction.ts"],
  accordion: ["react.tsx", "interaction.ts"],
  toggle: ["react.tsx", "press.ts"],
  progress: ["react.tsx", "progress.ts"],
  spinner: ["react.tsx", "spinner.ts"],
  tooltip: ["react.tsx", "tooltip.ts", "anchored-overlay.ts"],
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

export const componentContent: readonly ComponentContent[] = [
  {
    slug: "alert", title: "Alert",
    description: "Keep a status or warning visible beside the work it describes.",
    usage: `import {
  Alert,
  AlertTitle,
  AlertDescription,
  Button,
  Root,
  Text,
} from "@chardesk/cell-ui";

export function AlertExample() {
  return (
    <Root>
      <Alert tone="warning">
        <AlertTitle>Unsaved changes</AlertTitle>
        <AlertDescription>Changes are stored locally.</AlertDescription>
        <Button id="save">
          <Text>Save now</Text>
        </Button>
      </Alert>
    </Root>
  );
}`,
    api: [
      { name: "tone?", type: '"info" | "success" | "warning" | "error"', description: "Status meaning; info by default. Warning and error announce as alerts." },
      { name: "variant?", type: '"surface" | "ghost"', description: "Status-colored surface by default; ghost keeps tone text, icon, and border without a fill." },
      { name: "border?", type: '"none" | "square" | "rounded"', description: "None by default; framed borders use the tone's foreground color." },
      { name: "style?", type: "CellLayoutStyle", description: "Width and layout overrides; default maximum width is 44 Cells." },
      { name: "children", type: "Cell primitives", description: "One AlertTitle, optional AlertDescription, and optional Button in order." },
    ],
  },
  {
    slug: "dialog", title: "Dialog",
    description: "A named Cell dialog with shared overlay placement and focus management.",
    usage: `import { useState } from "react";
import {
  Root,
  Button,
  Text,
  Dialog,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@chardesk/cell-ui";
import { CellSurface } from "@chardesk/cell-ui/browser";

export function DialogExample() {
  const [open, setOpen] = useState(false);
  return (
    <CellSurface
      viewport={{ width: 48, height: 14 }}
      onCommand={(command) => {
        if (command.type === "activate" && command.targetId === "open") setOpen(true);
        if (
          (command.type === "dismiss" && command.targetId === "dialog") ||
          (command.type === "activate" && command.targetId === "close")
        )
          setOpen(false);
      }}
    >
      <Root>
        <Button id="open">
          <Text>Open dialog</Text>
        </Button>
        {open && (
          <Dialog id="dialog">
            <DialogTitle>Continue?</DialogTitle>
            <DialogDescription>This is a preview confirmation.</DialogDescription>
            <DialogFooter>
              <Button id="close">
                <Text>Close</Text>
              </Button>
            </DialogFooter>
          </Dialog>
        )}
      </Root>
    </CellSurface>
  );
}`,
    api: [
      { name: "id", type: "string", description: "Required stable dismiss-command target." },
      { name: "variant?", type: '"surface" | "ghost"', description: "Both are opaque: surface uses the elevated surface token; ghost uses the base surface token." },
      { name: "border?", type: '"none" | "square" | "rounded"', description: "Independent Cell border; omitted uses the theme border shape." },
      { name: "modal", type: "boolean", description: "Trap focus and exclude background semantics; default true." },
      { name: "closeOnOutsideClick", type: "boolean", description: "Request dismissal on outside pointer down; default true." },
      { name: "initialFocusId", type: "string", description: "Preferred available content control on opening." },
      { name: "children", type: "Cell primitives", description: "One direct Title, optional direct Description, and composable content/Footer." },
    ],
  },
  {
    slug: "accordion", title: "Accordion",
    description: "Expand independent sections without losing their content state.",
    usage: `import { useState } from "react";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
  Root,
  Separator,
  Text,
} from "@chardesk/cell-ui";
import { CellSurface } from "@chardesk/cell-ui/browser";

export function AccordionExample() {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  return (
    <CellSurface
      viewport={{ width: 30, height: 6 }}
      onCommand={(command) => {
        if (command.type === "set-expanded")
          setExpanded((current) => {
            const next = new Set(current);
            if (command.expanded) next.add(command.targetId);
            else next.delete(command.targetId);
            return next;
          });
      }}
    >
      <Root>
        <Accordion>
          <AccordionItem id="general" expanded={expanded.has("general")}>
            <AccordionTrigger>
              <Text>General</Text>
            </AccordionTrigger>
            <AccordionContent>
              <Text>Project settings</Text>
            </AccordionContent>
          </AccordionItem>
          <Separator />
          <AccordionItem id="advanced" expanded={expanded.has("advanced")}>
            <AccordionTrigger>
              <Text>Advanced</Text>
            </AccordionTrigger>
            <AccordionContent>
              <Text>Advanced settings</Text>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Root>
    </CellSurface>
  );
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
    slug: "toggle", title: "Toggle",
    description: "Show a persistent mode with a status light, separate from interaction feedback.",
    usage: `import { useState } from "react";
import { Root, Toggle, Text } from "@chardesk/cell-ui";
import { CellSurface } from "@chardesk/cell-ui/browser";

export function ToggleExample() {
  const [pressed, setPressed] = useState(false);
  return (
    <CellSurface
      viewport={{ width: 12, height: 1 }}
      onCommand={(command) => {
        if (command.type === "activate" && command.targetId === "bold")
          setPressed((value) => !value);
      }}
    >
      <Root>
        <Toggle id="bold" label="Bold" pressed={pressed}>
          <Text>Bold</Text>
        </Toggle>
      </Root>
    </CellSurface>
  );
}`,
    api: [
      { name: "pressed?", type: "boolean", description: "Persistent pressed state; defaults to false." },
      { name: "disabled?", type: "boolean", description: "Prevents focus and activation." },
      { name: "children / label", type: "ReactNode / string", description: "Cell content and accessible name." },
    ],
  },
  {
    slug: "progress", title: "Progress",
    description: "Display determinate or indeterminate progress as a solid or outlined track, with an optional percentage.",
    usage: `import { Progress, Root } from "@chardesk/cell-ui";
import { CellSurface } from "@chardesk/cell-ui/browser";

export function ProgressExample() {
  return (
    <CellSurface viewport={{ width: 20, height: 1 }} onCommand={() => {}}>
      <Root>
        <Progress label="Upload" value={60} variant="outline" number />
      </Root>
    </CellSurface>
  );
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
    slug: "spinner", title: "Spinner",
    description: "Show indeterminate activity in a single Unicode Cell, using a wheel or dots.",
    usage: `import { Box, Root, Spinner, Text } from "@chardesk/cell-ui";
import { CellSurface } from "@chardesk/cell-ui/browser";

export function SpinnerExample() {
  return (
    <CellSurface viewport={{ width: 20, height: 1 }} onCommand={() => {}}>
      <Root>
        <Box style={{ direction: "row", gap: 1 }}>
          <Spinner label="Loading" variant="wheel" />
          <Text>Loading…</Text>
        </Box>
      </Root>
    </CellSurface>
  );
}`,
    api: [
      { name: "label", type: "string", description: "Required accessible name; visible text is composed separately." },
      { name: "variant?", type: '"wheel" | "dots"', description: "Wheel by default; both variants occupy one Cell." },
      { name: "id?", type: "string", description: "Stable Cell owner and probe identifier." },
    ],
  },
  {
    slug: "tooltip", title: "Tooltip",
    description: "Explain a Cell control on delayed hover or keyboard focus without changing its layout.",
    usage: `import { Button, Root, Text, Tooltip } from "@chardesk/cell-ui";
import { CellSurface } from "@chardesk/cell-ui/browser";

export function TooltipExample() {
  return (
    <CellSurface viewport={{ width: 28, height: 7 }} onCommand={() => {}}>
      <Root>
        <Button id="save" label="Save document">
          <Text>Save</Text>
        </Button>
        <Tooltip targetId="save" text="Save current document" />
      </Root>
    </CellSurface>
  );
}`,
    api: [
      { name: "targetId", type: "string", description: "Stable id of an existing focusable Cell control." },
      { name: "text", type: "string", description: "Non-empty, single-line supplementary text; clipped to the viewport." },
      { name: "id?", type: "string", description: "Optional stable tooltip owner and semantic identifier." },
      { name: "variant?", type: '"surface" | "ghost"', description: "Opaque elevated or base surface; surface by default." },
      { name: "border?", type: '"none" | "square" | "rounded"', description: "Independent Cell border; omitted uses the theme border shape." },
    ],
  },
  {
    slug: "separator", title: "Separator",
    description: "Separate Cell content with one row or column.",
    usage: `import { Root, Separator, Text } from "@chardesk/cell-ui";
import { CellSurface } from "@chardesk/cell-ui/browser";

export function SeparatorExample() {
  return (
    <CellSurface viewport={{ width: 20, height: 3 }} onCommand={() => {}}>
      <Root>
        <Text>Files</Text>
        <Separator />
        <Text>Settings</Text>
      </Root>
    </CellSurface>
  );
}`,
    api: [
      { name: "variant?", type: '"line" | "slash" | "double" | "dots"', description: "Line by default; glyphs come from the global Cell UI theme." },
      { name: "orientation?", type: '"horizontal" | "vertical"', description: "Horizontal by default; vertical fills its container height." },
      { name: "style?", type: "CellLayoutStyle", description: "Cell length and layout constraints." },
    ],
  },
  {
    slug: "radio", title: "Radio",
    description: "Choose one value with a shared group and arrow-key navigation.",
    usage: `import { RadioGroup, RadioItem, Root, Text } from "@chardesk/cell-ui";
import { CellSurface, useCellRadioState } from "@chardesk/cell-ui/browser";

const items = [
  { id: "light", value: "light", label: "Light" },
  { id: "dark", value: "dark", label: "Dark" },
];

export function RadioExample() {
  const radio = useCellRadioState(items, { defaultValue: "light" });
  return (
    <CellSurface
      viewport={{ width: 16, height: 2 }}
      focusedId={radio.focusedId}
      onCommand={radio.dispatch}
    >
      <Root>
        <RadioGroup label="Appearance" value={radio.value}>
          {radio.items.map((item) => (
            <RadioItem key={item.id} id={item.id} value={item.value}>
              <Text>{item.label}</Text>
            </RadioItem>
          ))}
        </RadioGroup>
      </Root>
    </CellSurface>
  );
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
    description: "Trigger one action through keyboard, pointer, or assistive input.",
    usage: `import { useState } from "react";
import { Button, Root, Text, type WidgetCommand } from "@chardesk/cell-ui";
import { CellSurface } from "@chardesk/cell-ui/browser";

export function ButtonExample() {
  const [focusedId, setFocusedId] = useState("save");
  const dispatch = (command: WidgetCommand) => {
    if (command.type === "focus") setFocusedId(command.targetId);
  };
  return (
    <CellSurface
      viewport={{ width: 24, height: 3 }}
      focusedId={focusedId}
      onCommand={dispatch}
    >
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
    description: "Show a compact state label, optionally acting as a command target.",
    usage: `import { Badge, Root, Text } from "@chardesk/cell-ui";
import { CellSurface } from "@chardesk/cell-ui/browser";

export function BadgeExample() {
  return (
    <CellSurface viewport={{ width: 22, height: 1 }} onCommand={() => {}}>
      <Root style={{ direction: "row", gap: 1 }}>
        <Badge tone="success">
          <Text>Done</Text>
        </Badge>
        <Badge id="retry" tone="error" interactive>
          <Text>Retry</Text>
        </Badge>
      </Root>
    </CellSurface>
  );
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
    description: "Choose one value from a Cell-anchored listbox.",
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
    <CellSurface
      focusedId={select.focusedId}
      onCommand={select.dispatch}
      viewport={{ width: 32, height: 7 }}
    >
      <Root id="root">
        <Select id={select.id} style={{ width: 30 }}>
          <SelectTrigger
            id={select.triggerId}
            label="Theme"
            expanded={select.open}
            controlsId={select.open ? select.contentId : undefined}
          >
            <Text>{select.selectedItem?.label ?? "Select theme"}</Text>
          </SelectTrigger>
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
                >
                  <Text>{item.label}</Text>
                </SelectItem>
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
    description: "Click the input row to open local options, filter, then commit one value.",
    usage: `import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  Root,
  Text,
} from "@chardesk/cell-ui";
import { CellSurface, useCellComboboxState } from "@chardesk/cell-ui/browser";

const fonts = [
  { id: "maple", label: "Maple Mono" },
  { id: "fusion", label: "Fusion Pixel 12px Mono" },
];

export function ComboboxExample() {
  const combo = useCellComboboxState("font", fonts, { defaultSelectedId: "maple" });
  return (
    <CellSurface
      viewport={{ width: 32, height: 8 }}
      focusedId={combo.focusedId}
      onCommand={combo.dispatch}
    >
      <Root>
        <Combobox id={combo.id} style={{ width: 30 }}>
          <ComboboxInput
            id={combo.inputId}
            label="Font"
            state={combo.inputSnapshot}
            expanded={combo.open}
            activeDescendantId={combo.activeId ?? undefined}
          />
          {combo.open && (
            <ComboboxContent
              id={combo.contentId}
              label="Font options"
              scrollY={combo.scrollY}
            >
              {combo.filteredItems.map((item, index) => (
                <ComboboxItem
                  id={item.id}
                  key={item.id}
                  active={combo.activeId === item.id}
                  selected={combo.selectedId === item.id}
                  positionInSet={index + 1}
                  setSize={combo.filteredItems.length}
                >
                  <Text>{item.label}</Text>
                </ComboboxItem>
              ))}
            </ComboboxContent>
          )}
        </Combobox>
      </Root>
    </CellSurface>
  );
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
    description: "Toggle boolean or indeterminate state through one Cell command path.",
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
    <CellSurface
      focusedId={focusedId}
      onCommand={dispatch}
      viewport={{ width: 24, height: 1 }}
    >
      <Root id="root">
        <Checkbox
          id="autosave"
          label="Autosave"
          checked={checked}
          focused={focusedId === "autosave"}
        >
          <Text>Autosave</Text>
        </Checkbox>
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
    description: "Select one stepped value or a bounded interval on a Cell-native track.",
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
    <CellSurface
      focusedId="volume"
      onCommand={dispatch}
      viewport={{ width: 26, height: 1 }}
    >
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
}

// Two endpoints use the same Slider; handle set-value by thumb id.
<Slider
  id="range"
  label="Volume range"
  value={[25, 75]}
  thumbs={[
    { id: "start", label: "Minimum" },
    { id: "end", label: "Maximum" },
  ]}
/>;`,
    api: [
      { name: "value", type: "number | readonly [number, number]", description: "Controlled single value or bounded interval." },
      { name: "id / label", type: "string", description: "Required for an interval; names its group and command target." },
      { name: "min? / max?", type: "number", description: "Allowed range; defaults to 0–100." },
      { name: "step?", type: "number", description: "Keyboard and pointer increment; defaults to 1." },
      { name: "valueText?", type: "string", description: "Single-value aria-valuetext without visible UI." },
      { name: "thumbs", type: "readonly [SliderThumb, SliderThumb]", description: "Required for an interval; each endpoint has an id and label, with optional valueText and focused state." },
      { name: "disabled?", type: "boolean", description: "Prevents focus, hover, keyboard, tap, and drag." },
      { name: "focused?", type: "boolean", description: "Single-value logical focus; interval focus belongs to each thumb." },
      { name: "WidgetCommand", type: "set-value", description: "Targets the Slider id for one value or the endpoint id for an interval." },
    ],
  },
  {
    slug: "input",
    title: "Input",
    description: "Edit a single line of Unicode text on the Cell grid.",
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
    description: "Switch between related Cell panels with one selected tab.",
    usage: `import { Root, Tab, TabPanel, Tabs, Text } from "@chardesk/cell-ui";
import { CellSurface, useCellTabsState } from "@chardesk/cell-ui/browser";

const items = [
  { id: "code", label: "Code", panelId: "code-panel" },
  { id: "preview", label: "Preview", panelId: "preview-panel" },
];

export function TabsExample() {
  const tabs = useCellTabsState(items, { defaultSelectedId: "code" });
  const selected = tabs.items.find((item) => item.id === tabs.selectedId);
  return (
    <CellSurface
      viewport={{ width: 28, height: 5 }}
      focusedId={tabs.focusedId}
      onCommand={tabs.dispatch}
    >
      <Root>
        <Tabs label="Views" orientation="horizontal">
          {tabs.items.map((item) => (
            <Tab
              key={item.id}
              id={item.id}
              controlsId={item.panelId}
              focused={tabs.focusedId === item.id}
              selected={tabs.selectedId === item.id}
            >
              <Text>{item.label}</Text>
            </Tab>
          ))}
        </Tabs>
        {selected && (
          <TabPanel
            id={selected.panelId}
            label={selected.label}
            labelledById={selected.id}
          >
            <Text>{selected.label} content</Text>
          </TabPanel>
        )}
      </Root>
    </CellSurface>
  );
}`,
    api: [
      { name: "Tabs.label?", type: "string", description: "Accessible tab-list name." },
      { name: "Tabs.orientation?", type: '"horizontal" | "vertical"', description: "Collection orientation; this example uses horizontal navigation." },
      { name: "Tabs.variant?", type: '"underline" | "solid"', description: "Underline by default; solid keeps the one-row inverse selection." },
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
    description: "Scroll overflowing Cell content with keys, wheel, track, or thumb.",
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
  {
    slug: "text", title: "Text", description: "Render Unicode text in the Cell layout without browser text nodes.",
    usage: `import { Root, Text } from "@chardesk/cell-ui";

<Root>
  <Text textStyle={{ bold: true }}>Hello, 世界</Text>
</Root>;`,
    api: [
      { name: "children", type: "string | number", description: "Text to lay out on integer Cells." },
      { name: "textStyle?", type: "CellTextStyle", description: "Cell foreground and text emphasis." },
      { name: "style?", type: "CellLayoutStyle", description: "Cell geometry and wrapping." },
    ],
  },
  {
    slug: "text-area", title: "TextArea", description: "Edit multiline Cell text with retained selection and scrolling.",
    usage: `import { Root, TextArea } from "@chardesk/cell-ui";
import { useCellTextState } from "@chardesk/cell-ui/browser";

const editor = useCellTextState("notes", { value: "Hello", multiline: true });
<Root>
  <TextArea id="notes" label="Notes" state={editor.snapshot} style={{ height: 6 }} />
</Root>;`,
    api: [
      { name: "state", type: "CellTextSnapshot", description: "Controlled text, caret, selection, and scroll state." },
      { name: "label?", type: "string", description: "Accessible editor name." },
      { name: "variant? / frame?", type: "SurfaceVariant / CellFrame", description: "Independent background and Cell border; defaults to a frameless surface in Rich and a square border in Text." },
      { name: "borderShape?", type: "CellBorderShape", description: "Rich bordered frame shape; Text always uses a square character border." },
      { name: "style?", type: "CellLayoutStyle", description: "Editor viewport dimensions and padding; Rich frameless surface defaults to one content Cell on each horizontal side." },
    ],
  },
  {
    slug: "table", title: "Table", description: "Display read-only rows on a Cell grid with lines or alternating backgrounds.",
    usage: `import { Root, Table, TableRow, TableCell } from "@chardesk/cell-ui";

<Root>
  <Table
    label="Files"
    variant="outline"
    columns={[
      { label: "Name", width: 12 },
      { label: "Status", width: 10 },
      { label: "Size", width: 7, align: "right" },
    ]}
  >
    <TableRow>
      <TableCell>Notes.txt</TableCell>
      <TableCell>Synced</TableCell>
      <TableCell>12 KB</TableCell>
    </TableRow>
    <TableRow>
      <TableCell>Draft.md</TableCell>
      <TableCell>Editing</TableCell>
      <TableCell>3 KB</TableCell>
    </TableRow>
  </Table>
</Root>;`,
    api: [
      { name: "label", type: "string", description: "Accessible table name." },
      { name: "columns", type: "TableColumn[]", description: "Ordered headers and integer Cell widths; optional right alignment." },
      { name: "variant?", type: '"plain" | "outline" | "surface"', description: "Gap-separated, square boxed, or alternating row backgrounds." },
      { name: "TableRow / TableCell", type: "children", description: "One read-only text cell per column, in order." },
    ],
  },

];

type GuideSection = Readonly<{
  id: string;
  title: string;
  tocLabel?: string;
  body?: string;
  code?: string;
  demo?: "settings" | "progress" | "notes" | "macintosh" | "markdown";
  probeId?: string;
  installation?: boolean;
  api?: readonly ComponentApiRow[];
  codeLanguage?: "tsx" | "text";
  link?: Readonly<{ label: string; href: string }>;
  links?: readonly Readonly<{ label: string; href: string }>[];
}>;
export type GuideContent = Readonly<{ slug: string; title: string; description: string; sections: readonly GuideSection[] }>;

export const guideContent: readonly GuideContent[] = [
  {
    slug: "introduction", title: "Introduction",
    description: "Build React interfaces from editable Unicode Cells. Own the source, compose a few good defaults, and let one frame serve people and agents.",
    sections: [
      { id: "philosophy", title: "Why Cells?", body: "A border, a space, a label, and a cursor all occupy integer Cells. The same committed frame drives the visible Canvas, accessible controls, copyable Unicode, and headless tests. Cell UI ships as source you can change, with fewer built-in knobs to work around. Try Cell Range: hold Option (⌥) + Command (⌘) and drag on macOS, or Alt and drag on Windows/Linux. Copy preserves the selected Unicode, including border glyphs.", link: { label: "Read the philosophy", href: "#/guides/philosophy" } },
      { id: "settings", title: "Compose a settings panel", body: "Theme and Sound are ordinary app state. Select and Checkbox share the same Cell grid and input model; try the menu and the checkbox with pointer or keyboard.", demo: "settings", code: `const themeItems = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];
const theme = useCellSelectState("theme", themeItems, { defaultSelectedId: "dark" });
const [sound, setSound] = useState(true);

// Pass app-owned state into Select and Checkbox inside one Root.`, link: { label: "Select component", href: "#/components/select" } },
      { id: "progress", title: "Show progress in text", body: "The outline, fill, and empty track are Unicode Cells, not a painted approximation. Start an upload and watch it advance in uneven steps.", demo: "progress", code: `const [progress, setProgress] = useState(0); // Your task updates this value.

<Root>
  <Text>Uploading files</Text>
  <Progress
    id="upload"
    label="Upload"
    value={progress}
    variant="outline"
    style={{ width: 26 }}
  />
  <Button id="start">
    <Text>Start</Text>
  </Button>
</Root>;`, link: { label: "Progress component", href: "#/components/progress" } },
      { id: "notes", title: "Edit Unicode in place", body: "Type into the note. Text editing uses the browser's native input path while the committed frame keeps the same Cell geometry and Unicode source.", demo: "notes", code: `const note = useCellTextState("note", { value: "Hello, 世界 👋", multiline: true });

<CellSurface viewport={{ width: 32, height: 7 }} onCommand={note.dispatch}>
  <Root>
    <TextArea id="note" label="Notes" state={note.snapshot} />
  </Root>
</CellSurface>;`, link: { label: "TextArea component", href: "#/components/text-area" } },
      { id: "start", title: "Make it yours", body: "Install the complete library into your project, then edit the source directly. Use the component pages for full wiring and public props; keep product-specific choices in your own code.", link: { label: "Installation", href: "#/guides/installation" } },
    ],
  },
  {
    slug: "philosophy", title: "Philosophy",
    description: "UI as Text is the goal: structure, meaningful state, and available actions should be understandable from text without relying on color or source code. Three Cell-native principles support it.",
    sections: [
      { id: "everything-is-cell", title: "Everything is Cell", body: "Layout, paint, hit targets, scrolling, selection, and copy use integer Cells. Visible characters remain Unicode in Cell.text, whether painted by a font or Cell graphics; backgrounds are metadata, not characters. Every visible Cell belongs to a Widget or its chrome, so an outlined Table's borders can be copied and traced to their owner.", link: { label: "Cell-native design contract", href: "https://github.com/Sayhi-bzb/CharDesk/blob/main/apps/docs/content/docs/development/cell-ui/design.mdx" } },
      { id: "every-input-becomes-a-command", title: "Every Input becomes a Command", tocLabel: "Input Becomes Command", body: "Keyboard, pointer, wheel, native text input, and assistive actions reach Widget commands. Keyboard operation is complete; a pointer acts directly on the visible Cell target. Enter and a complete tap on a Button reach the same action, and hover is never required to finish it.", link: { label: "Explore the visual philosophy", href: "#/guides/classic-macintosh" } },
      { id: "one-state-many-projections", title: "One State, Many Projections", tocLabel: "State & Projections", body: "Applications own business values. Focus, selection, press, expansion, disabled, and editing state that affect the interface appear in the committed Cell Scene. Canvas, Semantic DOM, Unicode clipboard, and headless tests consume that Widget commit; a Table can truncate a filename visually while its semantic label keeps the full name. Today, ordinary Cell Range copy preserves visible Unicode, not every color-only state or semantic detail. A complete UI-as-text export is a future projection of the same commit, not a change to ordinary copy.", link: { label: "See Markdown", href: "#/guides/markdown" } },
    ],
  },
  {
    slug: "classic-macintosh", title: "Classic Macintosh",
    description: "A clear visual hierarchy and direct, forgiving interaction—translated into Cell UI rather than copied as a retro skin.",
    sections: [
      { id: "direct-manipulation", title: "Direct manipulation", body: "The visible Cell is the target. Toggle Sound, then Apply or Reset in this small preferences window; pointer and keyboard act on the same controls.", demo: "macintosh" },
      { id: "immediate-feedback", title: "Immediate feedback", body: "A checkbox changes its mark when activated. Apply changes the status to Saved. The result appears in the same committed Cell frame as the control." },
      { id: "perceptual-stability", title: "Perceptual stability", body: "A control keeps its place as state changes. Sound, actions, and status stay in fixed rows, so a changing label never makes the next target jump." },
      { id: "user-control", title: "Forgiving and in control", body: "Reset restores the initial preference. Actions have visible consequences and a clear way back; no hover-only path is needed." },
      { id: "few-modes", title: "Few modes", body: "The same window contains the setting and its actions. Avoid hidden editing modes when a direct control can express the state." },
      { id: "black-and-white", title: "Black-and-white first", body: "Borders, spacing, text, and marks distinguish controls before color does. Solid and ghost Buttons show action hierarchy without depending on hue." },
      { id: "consistent-grammar", title: "Consistent grammar", body: "Square borders frame the window; a marked checkbox means on, and the primary action remains solid. These meanings should hold across Cell UI components." },
      { id: "modern-translation", title: "Cell-native, modern host", body: "Light is the canonical Macintosh-inspired palette; Dark inverts the hierarchy without changing layout or behavior. Semantic DOM, keyboard and touch input, Unicode, and accessibility remain modern Cell UI contracts—not claims of historical pixel accuracy.", link: { label: "Macintosh design standard", href: "https://github.com/Sayhi-bzb/CharDesk/blob/main/apps/docs/content/docs/development/cell-ui/macintosh.mdx" } },
    ],
  },
  {
    slug: "markdown", title: "Markdown",
    description: "One source for people and LLMs: Markdown syntax stays visible, with color and alignment added for reading.",
    sections: [
      { id: "preview", title: "Preview", demo: "markdown", probeId: "markdown-example" },
      { id: "installation", title: "Installation", installation: true,
        body: "Install the editable Cell UI source with the shared registry setup.",
        link: { label: "Installation guide", href: "#/guides/installation" } },
      { id: "usage", title: "Usage", code: `import { Markdown, Root } from "@/lib/cell-ui";
import { CellSurface } from "@/lib/cell-ui/browser";

const source = "# Field Notes\\n\\n**Bold** and *italic* remain source text.";

export function MarkdownExample() {
  return (
    <CellSurface viewport={{ width: 40, height: 12 }}>
      <Root>
        <Markdown source={source} />
      </Root>
    </CellSurface>
  );
}` },
      { id: "source", title: "View source", links: [
        { label: "markdown.ts", href: "https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/markdown.ts" },
        { label: "react.tsx", href: "https://github.com/Sayhi-bzb/CharDesk/blob/main/packages/cell-ui/src/react.tsx" },
      ] },
      { id: "api", title: "API", body: "Source markers remain visible. Markdown colors come from the Cell theme; tables align and short rules center without changing Cell Range copy. Paragraphs may wrap. Safe links remain interactive; raw HTML stays inert.", link: { label: "Theming", href: "#/guides/theming" }, api: [
        { name: "source", type: "string", description: "Markdown source to render." },
        { name: "id?", type: "string", description: "Stable identity for the document root." },
        { name: "style?", type: "CellLayoutStyle", description: "Document layout overrides." },
      ] },
    ],
  },
  {
    slug: "installation", title: "Installation",
    description: "Install the complete editable Cell UI source through the shadcn registry.",
    sections: [
      { id: "configure", title: "Configure", body: "In your React project's components.json, add or merge these fields:", code: `{
  "aliases": { "lib": "@/lib" },
  "registries": {
    "@chardesk": "https://sayhi-bzb.github.io/CharDesk/{name}.json"
  }
}` },
      { id: "command", title: "Command", body: "Install the full cell-ui item. The registry copies source to your lib alias and declares npm dependencies.", code: installationCommands.npm },
      { id: "github", title: "Without configuration", body: "To install without a registries entry, use the GitHub address:", code: "npx shadcn@latest add Sayhi-bzb/CharDesk/cell-ui" },
      { id: "manual", title: "Manual", body: "The published item JSON is the authoritative file and dependency list. Install its dependencies; copy each files[].content to files[].target, resolving @lib through components.json aliases.lib. Keep relative paths, including the keyboard adapter. Do not install the private workspace package.", link: { label: "Published item JSON", href: "https://sayhi-bzb.github.io/CharDesk/cell-ui.json" } },
      { id: "update", title: "Update", body: "The installed files are yours to edit. Before a later shadcn add overwrites them, review its diff against your local changes. The repository verifies fresh installation with npm run cell-ui:registry:smoke." },
    ],
  },
  {
    slug: "integration", title: "Integration",
    description: "Connect Cell descriptors, browser projection, and application-owned state.",
    sections: [
      { id: "surface", title: "Surface", body: "Import descriptors and CellUiRuntime from @/lib/cell-ui; import CellSurface and state adapters from @/lib/cell-ui/browser. Root is the top-level structural descriptor. CellSurface retains the runtime across viewport, theme, and presentation changes. Presentation defaults to rich; text is an equally interactive Unicode rendering of the same state and commands.", code: `import { Root, Text } from "@/lib/cell-ui";
import { CellSurface } from "@/lib/cell-ui/browser";

<CellSurface
  viewport={{ width: 30, height: 4 }}
  presentation="text"
  onCommand={dispatch}
>
  <Root>
    <Text>Hello, Cells</Text>
  </Root>
</CellSurface>;` },
      { id: "state", title: "State and commands", body: "Application state remains outside the renderer. Pass controlled values and focused IDs into descriptors, then handle CellSurface onCommand or use the matching /browser state adapter. Direct adapter dispatch has no presentation lifecycle." },
      { id: "headless", title: "Headless hosts", body: "CellUiRuntime commits a dense Cell buffer and Scene without a browser. Headless hosts supply viewport, state, focus, and animationTimeMs explicitly. The browser adapter supplies font loading, pointer, input, and semantic focus." },
    ],
  },
  {
    slug: "theming", title: "Theming",
    description: "Resolve one Cell theme into a browser palette and component recipes.",
    sections: [
      { id: "defaults", title: "Defaults", body: "CLASSIC_MAC_LIGHT_THEME is the package default; CLASSIC_MAC_DARK_THEME inverts its hierarchy. semanticColors gives info, success, warning, and danger each a text color, surface, and surface foreground. Markdown and Badge/Alert derive their defaults from it; Badge/Alert error maps to danger. resolveCellUiTheme(partial) accepts semanticColors, markdownColors, and badgeStyles overrides. Surface backgrounds do not alter copied Cell text." },
      { id: "css", title: "CSS tokens", body: "The /browser entry exports readCellCssTheme(element) and useCellCssTheme(ref, revision). Shared --cell-tone-{info,success,warning,danger} tokens have optional -surface and -surface-foreground partners. Markdown's --cell-markdown-* and Badge's --cell-badge-* tokens override the matching shared role; otherwise the shared token, then the light or dark default, wins. Apply CSS changes before the hook's layout effect; bump revision after external stylesheet changes." },
      { id: "surface", title: "Surface and frame", body: "Box, ScrollArea, and TextArea separate variant (ghost or surface) from frame (none or bordered). Dialog and Tooltip use their own opaque variant and border recipe. Geometry belongs to CellLayoutStyle, not the theme." },
    ],
  },
  {
    slug: "testing", title: "Testing",
    description: "Inspect the committed Cell frame instead of inferring behavior from pixels.",
    sections: [
      { id: "probe", title: "Cell probe", body: "Set probeId only on development or test surfaces. readCellSurfaceProbe(element) returns the latest structured frame, including exact glyphs, styles, owners, geometry, and overlays. Without probeId no structured snapshot is created; data-cell-text remains the lightweight projection.", code: `const snapshot = readCellSurfaceProbe(
  document.querySelector('[data-cell-probe="example"]')!,
);
console.log(snapshot?.text);` },
      { id: "audit", title: "Font audit", body: "Set fontAudit explicitly to verify font measurements against Cell metrics. A ready font is measurable, not necessarily fitting every Cell. Use screenshots for rasterization, color, and DPR; use probes for text, borders, clipping, scrollbars, and interaction results." },
      { id: "pilots", title: "Headless and browser tests", body: "TestPilot consumes the same interaction controller as the browser. Verify command/state contracts headlessly and use browser E2E for focus, native input, font loading, and Canvas presentation." },
    ],
  },
];
