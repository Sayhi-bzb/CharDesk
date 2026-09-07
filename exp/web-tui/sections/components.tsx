import { useState } from "react";
import {
  Box,
  List,
  ListItem,
  Root,
  ScrollArea,
  Text,
  TextInput,
  type WidgetCommand,
} from "@chardesk/cell-ui";
import { useCellListState, useCellTextState } from "@chardesk/cell-ui/browser";
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
