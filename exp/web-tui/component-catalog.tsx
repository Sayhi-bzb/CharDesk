import type { ComponentType } from "react";
import {
  BoxComponentDemo,
  InputComponentDemo,
  ListComponentDemo,
  ScrollAreaComponentDemo,
  TextComponentDemo,
} from "./sections/components";

type ComponentApiRow = Readonly<{
  name: string;
  type: string;
  description: string;
}>;

export type ComponentDocument = Readonly<{
  slug: string;
  title: string;
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
    slug: "input",
    title: "Input",
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
