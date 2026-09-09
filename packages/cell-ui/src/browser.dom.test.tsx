import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Box,
  Checkbox,
  Grid,
  GridCell,
  GridRow,
  List,
  ListItem,
  Menu,
  MenuItem,
  Overlay,
  RangeSlider,
  RangeSliderThumb,
  Root,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  Slider,
  Tab,
  TabPanel,
  Tabs,
  Text,
  TextArea,
  TextInput,
  Tree,
  TreeItem,
  YogaLayoutEngine,
  createTestPilot,
  nextCellCheckboxState,
  type CellCheckboxState,
  type WidgetCommand,
} from "./index.js";
import {
  CellSurface,
  CELL_SURFACE_PROBE_PROPERTY,
  SemanticDom,
  readCellSurfaceProbe,
  useCellGridState,
  pxToCellPoint,
  useCellListState,
  useCellMenuState,
  useCellRangeState,
  useCellSelectState,
  useCellTextState,
  useCellTabsState,
  useCellTreeState,
  useCellVirtualListState,
  type CellListItem,
} from "./browser.js";
import type { CellRangeCommand } from "./range.js";
import type { SemanticAction } from "./types.js";
import type { CharDeskFontProfile } from "@chardesk/rendering/canvas";

const context = {
  setTransform: vi.fn(),
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  fill: vi.fn(),
  fillText: vi.fn(),
  getImageData: vi.fn((_x: number, _y: number, width: number, height: number) => ({
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4),
  })),
  putImageData: vi.fn(),
  measureText: vi.fn(() => ({ width: 0 })),
  save: vi.fn(),
  restore: vi.fn(),
  beginPath: vi.fn(),
  closePath: vi.fn(),
  rect: vi.fn(),
  clip: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  arc: vi.fn(),
  stroke: vi.fn(),
  scale: vi.fn(),
  translate: vi.fn(),
  getTransform: () => ({ a: 1, b: 0, c: 0, d: 1 }),
  fillStyle: "",
  strokeStyle: "",
  lineWidth: 1,
  font: "",
  textBaseline: "",
  textAlign: "",
};

beforeEach(() => {
  context.measureText.mockReset().mockReturnValue({ width: 0 });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue(context as unknown as CanvasRenderingContext2D);
  Object.defineProperties(HTMLElement.prototype, {
    setPointerCapture: { configurable: true, value: vi.fn() },
    releasePointerCapture: { configurable: true, value: vi.fn() },
    hasPointerCapture: { configurable: true, value: vi.fn(() => true) },
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const Product = ({
  onAction,
  onCommand,
}: {
  onAction: (id: string) => void;
  onCommand?: (command: WidgetCommand) => void;
}) => {
  const actions = useCellListState([
    { id: "new", label: "New file" },
    { id: "open", label: "Open file" },
    { id: "save", label: "Save" },
  ], {
    defaultFocusedId: "open",
    defaultSelectedId: "open",
    onAction,
  });
  const files = useCellListState([
    { id: "file-index", label: "01  src/index.ts" },
    { id: "file-app", label: "02  src/app.ts" },
    { id: "file-layout", label: "03  src/layout.ts" },
    { id: "file-theme", label: "04  src/theme.ts", disabled: true },
  ]);
  const [scrollY, setScrollY] = useState(0);
  const focusedId = files.focusedId ?? actions.focusedId;
  const dispatch = (command: WidgetCommand) => {
    onCommand?.(command);
    actions.dispatch(command);
    files.dispatch(command);
    if (command.type === "scroll") setScrollY(command.scrollY);
  };
  return (
    <CellSurface
      probeId="product"
      viewport={{ width: 30, height: 7 }}
      focusedId={focusedId}
      onCommand={dispatch}
      metrics={{ cellWidth: 10, cellHeight: 20, fontSize: 15, fontFamily: "monospace" }}
    >
      <Root id="root">
        <List id="actions" label="Actions" style={{ height: 3 }}>
          {actions.items.map((item) => (
            <ListItem
              id={item.id}
              key={item.id}
              focused={actions.focusedId === item.id}
              selected={actions.selectedId === item.id}
            ><Text>{item.label}</Text></ListItem>
          ))}
        </List>
        <ScrollArea id="files" scrollY={scrollY} style={{ border: true, height: 4 }}>
          <List id="file-list" label="Files">
            {files.items.map((item) => (
              <ListItem
                id={item.id}
                key={item.id}
                focused={files.focusedId === item.id}
                selected={files.selectedId === item.id}
                disabled={item.disabled}
              ><Text>{item.label}</Text></ListItem>
            ))}
          </List>
        </ScrollArea>
      </Root>
    </CellSurface>
  );
};

const SelectProduct = ({
  onCommand,
  activationBlinkCount,
}: {
  onCommand?: (command: WidgetCommand) => void;
  activationBlinkCount?: 0 | 1 | 2 | 3;
}) => {
  const select = useCellSelectState("surface-theme", [
    { id: "surface-light", label: "Light" },
    { id: "surface-dark", label: "Dark" },
  ], { defaultSelectedId: "surface-dark" });
  const dispatch = (command: WidgetCommand) => {
    onCommand?.(command);
    select.dispatch(command);
  };
  return (
    <CellSurface
      viewport={{ width: 20, height: 5 }}
      focusedId={select.focusedId}
      onCommand={dispatch}
      feedback={activationBlinkCount === undefined ? undefined : { activationBlinkCount }}
      metrics={{ cellWidth: 10, cellHeight: 20, fontSize: 15, fontFamily: "monospace" }}
      label="Select surface"
      probeId="surface-select"
    >
      <Root id="surface-select-root">
        <Select id={select.id} label="Theme" style={{ width: 18 }}>
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
                  focused={select.focusedId === item.id}
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
};

const ConstrainedSelectProduct = ({ overlay = false }: { overlay?: boolean }) => {
  const items = Array.from({ length: 6 }, (_, index) => ({
    id: `surface-font-${index}`,
    label: `Font ${index}`,
  }));
  const select = useCellSelectState("surface-font", items, {
    defaultSelectedId: "surface-font-5",
  });
  return (
    <CellSurface
      viewport={{ width: 20, height: 5 }}
      overlayViewport={overlay ? { width: 20, height: 12 } : undefined}
      focusedId={select.focusedId}
      onCommand={select.dispatch}
      metrics={{ cellWidth: 10, cellHeight: 20, fontSize: 15, fontFamily: "monospace" }}
      label={overlay ? "Overlay Select surface" : "Constrained Select surface"}
      probeId="constrained-select"
    >
      <Root id="surface-font-root">
        <Select id={select.id} label="Font" style={{ width: 18 }}>
          <SelectTrigger
            id={select.triggerId}
            label="Font"
            expanded={select.open}
            controlsId={select.open ? select.contentId : undefined}
          ><Text>Font 5</Text></SelectTrigger>
          {select.open ? (
            <SelectContent
              id={select.contentId}
              label="Font options"
              scrollY={select.scrollY}
            >
              {select.items.map((item, index) => (
                <SelectItem
                  id={item.id}
                  key={item.id}
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
};

const EditorProduct = ({ onCommand }: { onCommand?: (command: WidgetCommand) => void }) => {
  const range = useCellRangeState();
  const name = useCellTextState("name", { viewport: { columns: 10, rows: 1 } });
  const body = useCellTextState("body", {
    value: "start",
    multiline: true,
    viewport: { columns: 12, rows: 3 },
  });
  const dispatch = (command: WidgetCommand) => {
    onCommand?.(command);
    name.dispatch(command);
    body.dispatch(command);
  };
  return (
    <CellSurface
      viewport={{ width: 18, height: 9 }}
      onCommand={dispatch}
      cellRange={range.snapshot}
      onCellRangeCommand={range.dispatch}
      metrics={{ cellWidth: 10, cellHeight: 20, fontSize: 15, fontFamily: "monospace" }}
    >
      <Root id="editor-root">
        <TextInput id="name" label="Name" state={name.snapshot} style={{ border: true, height: 3 }} />
        <TextArea id="body" label="Document" state={body.snapshot} style={{ border: true, height: 5 }} />
      </Root>
    </CellSurface>
  );
};

const CheckboxProduct = ({ onCommand }: { onCommand?: (command: WidgetCommand) => void }) => {
  const [checked, setChecked] = useState<CellCheckboxState>("indeterminate");
  const [focusedId, setFocusedId] = useState("autosave");
  const dispatch = (command: WidgetCommand) => {
    onCommand?.(command);
    if (command.type === "focus") setFocusedId(command.targetId);
    if (command.type === "activate" && command.targetId === "autosave") {
      setChecked(nextCellCheckboxState);
    }
  };
  return <CellSurface
    probeId="checkbox-product"
    viewport={{ width: 20, height: 1 }}
    focusedId={focusedId}
    onCommand={dispatch}
    label="Checkbox product"
  >
    <Root id="root">
      <Checkbox id="autosave" checked={checked} focused={focusedId === "autosave"}>
        <Text>Autosave</Text>
      </Checkbox>
    </Root>
  </CellSurface>;
};

const SliderProduct = ({ onCommand }: { onCommand?: (command: WidgetCommand) => void }) => {
  const [value, setValue] = useState(50);
  const [focusedId, setFocusedId] = useState("volume");
  const dispatch = (command: WidgetCommand) => {
    onCommand?.(command);
    if (command.type === "focus") setFocusedId(command.targetId);
    if (command.type === "set-value" && command.targetId === "volume") {
      setValue(command.value);
    }
  };
  return <CellSurface
    probeId="slider-product"
    viewport={{ width: 20, height: 1 }}
    focusedId={focusedId}
    onCommand={dispatch}
    label="Slider product"
  >
    <Root id="root" style={{ direction: "row" }}>
      <Slider
        id="volume"
        label="Volume"
        value={value}
        valueText={`${value} percent`}
        focused={focusedId === "volume"}
      />
    </Root>
  </CellSurface>;
};

const RangeSliderProduct = ({ onCommand }: { onCommand?: (command: WidgetCommand) => void }) => {
  const [values, setValues] = useState<readonly [number, number]>([30, 70]);
  const [focusedId, setFocusedId] = useState("volume-start");
  const dispatch = (command: WidgetCommand) => {
    onCommand?.(command);
    if (command.type === "focus") setFocusedId(command.targetId);
    if (command.type === "set-value") {
      setFocusedId(command.targetId);
      setValues((current) => command.targetId === "volume-start"
        ? [command.value, current[1]]
        : [current[0], command.value]);
    }
  };
  return <CellSurface
    probeId="range-slider-product"
    viewport={{ width: 20, height: 1 }}
    focusedId={focusedId}
    onCommand={dispatch}
    label="Range slider product"
  >
    <Root id="root">
      <RangeSlider id="volume-range" label="Volume" style={{ width: 20 }}>
        <RangeSliderThumb
          id="volume-start"
          label="Minimum volume"
          value={values[0]}
          valueText={`${values[0]} percent`}
          focused={focusedId === "volume-start"}
        />
        <RangeSliderThumb
          id="volume-end"
          label="Maximum volume"
          value={values[1]}
          valueText={`${values[1]} percent`}
          focused={focusedId === "volume-end"}
        />
      </RangeSlider>
    </Root>
  </CellSurface>;
};

const CursorProduct = ({
  shape,
  blink = false,
  blinkIntervalMs = 600,
}: {
  shape: "block" | "bar" | "underline";
  blink?: boolean;
  blinkIntervalMs?: number;
}) => {
  const editor = useCellTextState("cursor-editor", { value: "中A" });
  return (
    <CellSurface
      viewport={{ width: 8, height: 3 }}
      onCommand={editor.dispatch}
      theme={{
        cursorStyle: {
          shape,
          color: "rgb(255, 0, 255)",
          textColor: "rgb(0, 255, 255)",
          blink,
          blinkIntervalMs,
        },
      }}
      metrics={{ cellWidth: 10, cellHeight: 20, fontSize: 15, fontFamily: "monospace" }}
      label="Cursor surface"
      probeId="cursor"
    >
      <Root id="cursor-root">
        <TextInput
          id="cursor-editor"
          label="Cursor editor"
          state={editor.snapshot}
          style={{ border: true, height: 3 }}
        />
      </Root>
    </CellSurface>
  );
};

const RangeProduct = ({
  text = "AB",
  width = 8,
}: {
  text?: string;
  width?: number;
}) => {
  const range = useCellRangeState();
  return (
    <>
      <CellSurface
        viewport={{ width, height: 3 }}
        onCommand={() => undefined}
        cellRange={range.snapshot}
        onCellRangeCommand={range.dispatch}
        metrics={{ cellWidth: 10, cellHeight: 20, fontSize: 15, fontFamily: "monospace" }}
        label="Range surface"
      >
        <Root id="range-root">
          <Box id="range-panel" style={{ border: true, height: 3 }}>
            <Text>{text}</Text>
          </Box>
        </Root>
      </CellSurface>
      <output aria-label="Range text">{range.snapshot?.text ?? ""}</output>
    </>
  );
};

const DefaultRangeProduct = ({
  disabled = false,
  onRangeCommand,
}: {
  disabled?: boolean;
  onRangeCommand?: (command: CellRangeCommand) => void;
}) => (
  <CellSurface
    viewport={{ width: 8, height: 3 }}
    onCommand={() => undefined}
    cellRange={disabled ? null : undefined}
    onCellRangeCommand={onRangeCommand}
    metrics={{ cellWidth: 10, cellHeight: 20, fontSize: 15, fontFamily: "monospace" }}
    label="Default range surface"
  >
    <Root id="default-range-root">
      <Box id="default-range-panel" style={{ border: true, height: 3 }}>
        <Text>AB</Text>
      </Box>
    </Root>
  </CellSurface>
);

const ModalEditorProduct = ({ open }: { open: boolean }) => {
  const editor = useCellTextState("background-editor", {
    value: "background",
    viewport: { columns: 16, rows: 1 },
  });
  return (
    <CellSurface
      viewport={{ width: 24, height: 7 }}
      onCommand={editor.dispatch}
      metrics={{ cellWidth: 10, cellHeight: 20, fontSize: 15, fontFamily: "monospace" }}
      label="Modal editor surface"
    >
      <Root id="modal-root">
        <TextInput
          id="background-editor"
          label="Background editor"
          state={editor.snapshot}
          style={{ border: true, height: 3 }}
        />
        {open ? (
          <Overlay
            id="modal-overlay"
            label="Commands"
            position={{ x: 2, y: 1 }}
            style={{ border: true, width: 20, height: 4 }}
          >
            <List id="modal-commands" label="Commands">
              <ListItem id="modal-command" focused><Text>Open file</Text></ListItem>
            </List>
          </Overlay>
        ) : null}
      </Root>
    </CellSurface>
  );
};

const virtualItems: readonly CellListItem[] = Array.from({ length: 100_000 }, (_, index) => ({
  id: `virtual-${index}`,
  label: `${String(index).padStart(6, "0")}  row`,
}));

const VirtualListProduct = ({
  onAction,
  items = virtualItems,
}: {
  onAction: (id: string) => void;
  items?: readonly CellListItem[];
}) => {
  const virtual = useCellVirtualListState(items, {
    scrollId: "virtual-scroll",
    viewportRows: 4,
    overscanRows: 2,
    defaultFocusedId: "virtual-0",
    onAction,
  });
  return (
    <>
      <CellSurface
        viewport={{ width: 20, height: 6 }}
        focusedId={virtual.focusedId}
        onCommand={virtual.dispatch}
        metrics={{ cellWidth: 10, cellHeight: 20, fontSize: 15, fontFamily: "monospace" }}
        label="Virtual list surface"
        probeId="virtual-test"
      >
        <Root id="virtual-root">
          <ScrollArea
            id="virtual-scroll"
            scrollY={virtual.scrollY}
            style={{ border: true, height: 6 }}
          >
            <List
              id="virtual-list"
              label="Virtual rows"
              style={{ height: virtual.totalHeight, paddingTop: virtual.paddingTop }}
            >
              {virtual.rows.map(({ item, index }) => (
                <ListItem
                  id={item.id}
                  key={item.id}
                  focused={virtual.focusedId === item.id}
                  selected={virtual.selectedId === item.id}
                  disabled={item.disabled}
                  positionInSet={index + 1}
                  setSize={items.length}
                ><Text>{item.label}</Text></ListItem>
              ))}
            </List>
          </ScrollArea>
        </Root>
      </CellSurface>
      <output aria-label="Virtual mounted count">{virtual.mountedCount}</output>
      <output aria-label="Virtual scroll offset">{virtual.scrollY}</output>
      <output aria-label="Virtual selected item">{virtual.selectedId ?? "none"}</output>
    </>
  );
};

const ComplexWidgetProduct = () => {
  const [message, setMessage] = useState("Ready");
  const menu = useCellMenuState([
    { id: "menu-open", label: "Open" },
    { id: "menu-save", label: "Save" },
  ], {
    defaultFocusedId: "menu-open",
    onAction: (id) => setMessage(`${id} action`),
  });
  const tree = useCellTreeState([{
    id: "tree-src",
    label: "src",
    children: [
      { id: "tree-index", label: "index.ts" },
      { id: "tree-app", label: "app.ts" },
    ],
  }], {
    defaultExpandedIds: ["tree-src"],
    onAction: (id) => setMessage(`${id} selected`),
  });
  const tabs = useCellTabsState([
    { id: "tab-code", label: "Code", panelId: "panel-code" },
    { id: "tab-preview", label: "Preview", panelId: "panel-preview" },
  ], {
    defaultSelectedId: "tab-code",
    onSelectionChange: (id) => setMessage(`${id} selected`),
  });
  const grid = useCellGridState([
    {
      id: "property-row-1",
      cells: [
        { id: "property-name", label: "Name" },
        { id: "property-value", label: "Value" },
      ],
    },
    {
      id: "property-row-2",
      cells: [
        { id: "property-theme", label: "Theme" },
        { id: "property-dark", label: "Dark" },
      ],
    },
  ], {
    defaultSelectedId: "property-name",
    onAction: (id) => setMessage(`${id} activated`),
  });
  const focusedId = menu.focusedId ?? tree.focusedId ?? tabs.focusedId ?? grid.focusedId;
  const dispatch = (command: WidgetCommand) => {
    menu.dispatch(command);
    tree.dispatch(command);
    tabs.dispatch(command);
    grid.dispatch(command);
  };
  const selectedTab = tabs.items.find(({ id }) => id === tabs.selectedId);
  return (
    <>
      <CellSurface
        viewport={{ width: 44, height: 16 }}
        focusedId={focusedId}
        onCommand={dispatch}
        metrics={{ cellWidth: 10, cellHeight: 20, fontSize: 15, fontFamily: "monospace" }}
        label="Complex widget surface"
      >
        <Root id="complex-root">
          <Menu id="complex-menu" label="File menu" orientation="vertical">
            {menu.items.map((item) => (
              <MenuItem
                id={item.id}
                key={item.id}
                focused={focusedId === item.id}
              ><Text>{item.label}</Text></MenuItem>
            ))}
          </Menu>
          <Tree id="complex-tree" label="Files" orientation="vertical">
            {tree.rows.map((row) => (
              <TreeItem
                id={row.item.id}
                key={row.item.id}
                level={row.level}
                parentItemId={row.parentId ?? undefined}
                hasChildren={row.hasChildren}
                expanded={row.expanded}
                focused={focusedId === row.item.id}
                selected={tree.selectedId === row.item.id}
              >
                <Text>{row.item.label}</Text>
              </TreeItem>
            ))}
          </Tree>
          <Tabs id="complex-tabs" label="Views" orientation="horizontal" style={{ height: 2 }}>
            {tabs.items.map((item) => (
              <Tab
                id={item.id}
                key={item.id}
                controlsId={item.panelId}
                focused={focusedId === item.id}
                selected={tabs.selectedId === item.id}
                style={{ width: 12 }}
              ><Text>{item.label}</Text></Tab>
            ))}
          </Tabs>
          {selectedTab ? (
            <TabPanel
              id={selectedTab.panelId}
              label={`${selectedTab.label} panel`}
              labelledById={selectedTab.id}
              style={{ border: true, height: 3 }}
            ><Text>{`${selectedTab.label} content`}</Text></TabPanel>
          ) : null}
          <Grid
            id="property-grid"
            label="Properties"
            rowCount={grid.rowCount}
            columnCount={grid.columnCount}
          >
            {grid.rows.map((row, rowIndex) => (
              <GridRow id={row.id} key={row.id} rowIndex={rowIndex + 1}>
                {row.cells.map((cell, columnIndex) => (
                  <GridCell
                    id={cell.id}
                    key={cell.id}
                    rowIndex={rowIndex + 1}
                    columnIndex={columnIndex + 1}
                    focused={focusedId === cell.id}
                    selected={grid.selectedId === cell.id}
                    style={{ width: 18 }}
                  ><Text>{cell.label}</Text></GridCell>
                ))}
              </GridRow>
            ))}
          </Grid>
        </Root>
      </CellSurface>
      <output aria-label="Complex widget status">{message}</output>
    </>
  );
};

describe("CellSurface", () => {
  it("closes Select immediately when activation blinking is disabled", () => {
    render(<SelectProduct activationBlinkCount={0} />);
    fireEvent.click(screen.getByRole("button", { name: "Theme" }));
    const light = screen.getByRole("option", { name: "Light" });
    fireEvent.focus(light);
    fireEvent.click(light);

    expect(screen.queryByRole("listbox", { name: "Theme options" })).not.toBeInTheDocument();
    expect(readCellSurfaceProbe(screen.getByLabelText("Select surface"))!.text).toContain("Light");
  });

  it("settles an active Select confirmation when blinking is disabled at runtime", () => {
    vi.useFakeTimers();
    const product = render(<SelectProduct activationBlinkCount={2} />);
    const surface = screen.getByLabelText("Select surface");
    fireEvent.click(screen.getByRole("button", { name: "Theme" }));
    const light = screen.getByRole("option", { name: "Light" });
    fireEvent.focus(light);
    fireEvent.click(light);

    expect(surface).toHaveAttribute("data-cell-activation-flash", "surface-light");
    expect(screen.getByRole("listbox", { name: "Theme options" })).toBeInTheDocument();

    product.rerender(<SelectProduct activationBlinkCount={0} />);

    expect(surface).not.toHaveAttribute("data-cell-activation-flash");
    expect(screen.queryByRole("listbox", { name: "Theme options" })).not.toBeInTheDocument();
    expect(readCellSurfaceProbe(surface)!.text).toContain("Light");
  });

  it("commits Select values before flashing the chosen item and locks the closing phase", () => {
    vi.useFakeTimers();
    const commands = vi.fn();
    render(<SelectProduct onCommand={commands} />);
    const surface = screen.getByLabelText("Select surface");
    const trigger = screen.getByRole("button", { name: "Theme" });

    fireEvent.focus(trigger);
    fireEvent.click(trigger);
    expect(surface).not.toHaveAttribute("data-cell-activation-flash");
    expect(screen.getByRole("listbox", { name: "Theme options" })).toBeInTheDocument();

    const light = screen.getByRole("option", { name: "Light" });
    fireEvent.focus(light);
    fireEvent.click(light);
    expect(light).toHaveAttribute("aria-selected", "true");
    expect(surface).toHaveAttribute("data-cell-activation-flash", "surface-light");
    expect(screen.getByRole("listbox", { name: "Theme options" })).toBeInTheDocument();
    const flashedRow = readCellSurfaceProbe(surface)!.cells
      .filter((cell) => cell.ownerId === "surface-light");
    expect(flashedRow.length).toBeGreaterThan(0);
    expect(flashedRow.every((cell) => cell.style.backgroundColor === "#FFFFFF"))
      .toBe(true);

    act(() => vi.advanceTimersByTime(80));
    expect(surface).not.toHaveAttribute("data-cell-activation-flash");
    const dark = screen.getByRole("option", { name: "Dark" });
    fireEvent.focus(dark);
    fireEvent.click(dark);
    expect(light).toHaveAttribute("aria-selected", "true");
    expect(commands.mock.calls.filter(([command]) => (
      command.type === "activate" && command.targetId === "surface-dark"
    ))).toHaveLength(0);

    act(() => vi.advanceTimersByTime(80));
    expect(surface).toHaveAttribute("data-cell-activation-flash", "surface-light");
    act(() => vi.advanceTimersByTime(80));
    expect(screen.getByRole("listbox", { name: "Theme options" })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(80));
    expect(screen.queryByRole("listbox", { name: "Theme options" })).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(readCellSurfaceProbe(surface)!.text).toContain("Light");
    expect(surface).toHaveAttribute("data-cell-focused", "surface-theme-trigger");
  });

  it("lets Escape or an external press end settling without reverting the committed value", () => {
    vi.useFakeTimers();
    render(<SelectProduct />);
    const surface = screen.getByLabelText("Select surface");
    fireEvent.click(screen.getByRole("button", { name: "Theme" }));
    const light = screen.getByRole("option", { name: "Light" });
    fireEvent.focus(light);
    fireEvent.click(light);

    expect(surface).toHaveAttribute("data-cell-activation-flash", "surface-light");
    fireEvent.keyDown(surface, { key: "Escape" });
    expect(screen.queryByRole("listbox", { name: "Theme options" })).not.toBeInTheDocument();
    expect(readCellSurfaceProbe(surface)!.text).toContain("Light");
    act(() => vi.advanceTimersByTime(400));
    expect(screen.queryByRole("listbox", { name: "Theme options" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Theme" }));
    const dark = screen.getByRole("option", { name: "Dark" });
    fireEvent.focus(dark);
    fireEvent.click(dark);
    expect(dark).toHaveAttribute("aria-selected", "true");
    fireEvent.pointerDown(surface.querySelector("canvas")!, {
      button: 0,
      pointerId: 41,
      pointerType: "mouse",
      clientX: 195,
      clientY: 10,
    });
    expect(screen.queryByRole("listbox", { name: "Theme options" })).not.toBeInTheDocument();
    expect(readCellSurfaceProbe(surface)!.text).toContain("Dark");
  });

  it("reveals the selected option inside constrained SelectContent without hiding its Trigger", async () => {
    render(<ConstrainedSelectProduct />);
    const surface = screen.getByLabelText("Constrained Select surface");
    fireEvent.click(screen.getByRole("button", { name: "Font" }));

    await waitFor(() => {
      const probe = readCellSurfaceProbe(surface)!;
      const lines = probe.text.split("\n");
      expect(lines[0]).toContain("Font 5");
      expect(probe.cells).toContainEqual(expect.objectContaining({
        ownerId: "surface-font-5",
        text: "✓",
      }));
    });
  });

  it("presents SelectContent on an overlay plane without resizing its base canvas", async () => {
    render(<ConstrainedSelectProduct overlay />);
    const surface = screen.getByLabelText("Overlay Select surface");
    const baseCanvas = surface.querySelector("canvas")!;
    fireEvent.click(screen.getByRole("button", { name: "Font" }));

    await waitFor(() => expect(surface.querySelectorAll("canvas")).toHaveLength(2));
    const overlayCanvas = surface.querySelector<HTMLCanvasElement>(
      '[data-cell-overlay-root="surface-font-content"]'
    )!;
    const probe = readCellSurfaceProbe(surface)!;
    expect(probe.viewport).toEqual({ width: 20, height: 5 });
    expect(probe.overlayViewport).toEqual({ width: 20, height: 12 });
    expect(probe.overlays).toEqual([
      expect.objectContaining({
        rootId: "surface-font-content",
        text: expect.stringContaining("Font 5"),
      }),
    ]);
    expect(probe.overlays[0]!.cells.some((cell) => "█▀▄".includes(cell.text))).toBe(false);
    expect(baseCanvas.style.height).toBe("100px");
    expect(overlayCanvas.style.height).toBe("240px");
  });

  it("dismisses the active Select after confirmed external focus exit without stealing focus", async () => {
    const hasFocus = vi.spyOn(document, "hasFocus").mockReturnValue(true);
    const commands = vi.fn();
    const outsideAction = vi.fn();
    render(<><SelectProduct onCommand={commands} /><button onClick={outsideAction}>Outside Select</button></>);
    const trigger = screen.getByRole("button", { name: "Theme" });
    const outside = screen.getByRole("button", { name: "Outside Select" });

    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole("listbox", { name: "Theme options" })).toBeInTheDocument();
    const option = screen.getByRole("option", { name: "Light" });
    option.focus();
    expect(screen.getByRole("listbox", { name: "Theme options" })).toBeInTheDocument();

    outside.focus();
    await waitFor(() => expect(
      screen.queryByRole("listbox", { name: "Theme options" })
    ).not.toBeInTheDocument());
    expect(commands).toHaveBeenLastCalledWith({ type: "dismiss", targetId: "surface-theme-content" });
    expect(screen.getByRole("button", { name: "Theme" })).toHaveAttribute("aria-expanded", "false");
    expect(outside).toHaveFocus();
    fireEvent.click(outside);
    expect(outsideAction).toHaveBeenCalledTimes(1);
    hasFocus.mockRestore();
  });

  it("settles null-target focus exits before dismissing and preserves Select on window blur", async () => {
    const hasFocus = vi.spyOn(document, "hasFocus").mockReturnValue(true);
    render(<SelectProduct />);
    const openSelect = () => {
      const trigger = screen.getByRole("button", { name: "Theme" });
      trigger.focus();
      fireEvent.click(trigger);
      expect(screen.getByRole("listbox", { name: "Theme options" })).toBeInTheDocument();
    };

    openSelect();
    (document.activeElement as HTMLElement).blur();
    await waitFor(() => expect(
      screen.queryByRole("listbox", { name: "Theme options" })
    ).not.toBeInTheDocument());

    openSelect();
    hasFocus.mockReturnValue(false);
    fireEvent(window, new Event("blur"));
    (document.activeElement as HTMLElement).blur();
    await Promise.resolve();
    expect(screen.getByRole("listbox", { name: "Theme options" })).toBeInTheDocument();
    hasFocus.mockRestore();
  });

  it("paints terminal cursor shapes over a wide glyph and keeps browser pointers neutral", () => {
    const fills: { color: string; rect: number[] }[] = [];
    const glyphs: { color: string; text: string }[] = [];
    context.fillRect.mockImplementation((...rect: number[]) => {
      fills.push({ color: context.fillStyle, rect });
    });
    context.fillText.mockImplementation((text: string) => {
      glyphs.push({ color: context.fillStyle, text });
    });
    try {
      const mounted = render(<CursorProduct shape="block" />);
      const input = screen.getByRole("textbox", { name: "Cursor editor" });
      const canvas = mounted.container.querySelector("canvas")!;
      fireEvent.focus(input);
      expect(input).toHaveStyle({ cursor: "default" });
      expect(canvas).toHaveStyle({ cursor: "default" });
      expect(fills).toContainEqual({ color: "rgb(255, 0, 255)", rect: [10, 20, 20, 20] });
      expect(glyphs).toContainEqual({ color: "rgb(0, 255, 255)", text: "中" });

      fills.length = 0;
      fireEvent.pointerDown(canvas, {
        button: 0,
        pointerId: 30,
        pointerType: "mouse",
        clientX: 15,
        clientY: 30,
      });
      expect(screen.getByLabelText("Cursor surface")).not.toHaveAttribute("data-cell-focus-visible");
      expect(fills).toContainEqual({ color: "rgb(255, 0, 255)", rect: [10, 20, 20, 20] });
      fireEvent.pointerUp(screen.getByLabelText("Cursor surface"), {
        pointerId: 30,
        pointerType: "mouse",
        buttons: 0,
        clientX: 15,
        clientY: 30,
      });

      fills.length = 0;
      mounted.rerender(<CursorProduct shape="bar" />);
      expect(fills).toContainEqual({ color: "rgb(255, 0, 255)", rect: [10, 20, 1, 20] });

      fills.length = 0;
      mounted.rerender(<CursorProduct shape="underline" />);
      expect(fills).toContainEqual({ color: "rgb(255, 0, 255)", rect: [10, 39, 20, 1] });
    } finally {
      context.fillRect.mockReset();
      context.fillText.mockReset();
    }
  });

  it("blinks by restoring cached cursor pixels without committing another frame", () => {
    vi.useFakeTimers();
    try {
      const mounted = render(<CursorProduct shape="block" blink blinkIntervalMs={100} />);
      const input = screen.getByRole("textbox", { name: "Cursor editor" });
      fireEvent.focus(input);
      const surface = screen.getByLabelText("Cursor surface");
      const revision = readCellSurfaceProbe(surface)!.revision;
      context.putImageData.mockClear();

      vi.advanceTimersByTime(100);
      expect(context.putImageData).toHaveBeenCalledTimes(1);
      expect(readCellSurfaceProbe(surface)!.revision).toBe(revision);

      context.fillRect.mockClear();
      vi.advanceTimersByTime(100);
      expect(context.fillRect).toHaveBeenCalledWith(10, 20, 20, 20);
      expect(readCellSurfaceProbe(surface)!.revision).toBe(revision);
      mounted.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a blinking cursor visible when reduced motion is requested", () => {
    vi.useFakeTimers();
    const original = Object.getOwnPropertyDescriptor(window, "matchMedia");
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    try {
      const mounted = render(<CursorProduct shape="block" blink blinkIntervalMs={100} />);
      fireEvent.focus(screen.getByRole("textbox", { name: "Cursor editor" }));
      context.putImageData.mockClear();
      vi.advanceTimersByTime(1_000);
      expect(context.putImageData).not.toHaveBeenCalled();
      mounted.unmount();
    } finally {
      if (original) Object.defineProperty(window, "matchMedia", original);
      else Reflect.deleteProperty(window, "matchMedia");
      vi.useRealTimers();
    }
  });

  it("visible glyphs use full presentations; switching back restores clipping without changing Cells", () => {
    const metrics = { cellWidth: 10, cellHeight: 20, fontSize: 15, fontFamily: "monospace" };
    const children = <Root><Text>→</Text></Root>;
    const onCommand = () => undefined;
    const viewport = { width: 8, height: 2 };
    const view = (glyphOverflow?: "clip" | "visible", color = "red") => <CellSurface
      viewport={viewport} metrics={metrics} onCommand={onCommand} probeId="overflow"
      label="Overflow" glyphOverflow={glyphOverflow} palette={{ color, background: "white" }}>
      {children}
    </CellSurface>;
    context.clip.mockClear();
    const mounted = render(view());
    expect(context.clip).toHaveBeenCalled();
    const surface = screen.getByLabelText("Overflow");
    const before = readCellSurfaceProbe(surface)!;
    context.clip.mockClear(); context.fillRect.mockClear();
    mounted.rerender(view("visible"));
    expect(context.clip).not.toHaveBeenCalled();
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 80, 40);
    expect(readCellSurfaceProbe(surface)!.presentation?.glyphOverflowMode).toBe("visible");
    context.fillRect.mockClear();
    mounted.rerender(view("visible", "blue"));
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 80, 40);
    mounted.rerender(view("clip"));
    expect(context.clip).toHaveBeenCalled();
    const after = readCellSurfaceProbe(surface)!;
    expect(after.cells).toEqual(before.cells);
    expect(after.revision).toBe(before.revision);
    expect(after.presentation?.glyphOverflowMode).toBe("clip");
  });
  it("cancels a captured rectangle drag when metrics change and preserves its selection", () => {
    const children = <Root><Text>abcdefgh</Text></Root>;
    const onCommand = () => undefined;
    const viewport = { width: 8, height: 3 };
    const view = (cellWidth: number) => <CellSurface viewport={viewport} onCommand={onCommand}
      label="Measured range" probeId="measured-range"
      metrics={{ cellWidth, cellHeight: 20, fontSize: 15, fontFamily: "monospace", baseline: 15 }}>
      {children}
    </CellSurface>;
    const mounted = render(view(10));
    const surface = screen.getByLabelText("Measured range");
    const canvas = mounted.container.querySelector("canvas")!;
    fireEvent.pointerDown(canvas, { button: 0, altKey: true, pointerId: 7, clientX: 5, clientY: 10 });
    fireEvent.pointerMove(surface, { pointerId: 7, clientX: 25, clientY: 10 });
    const selection = surface.getAttribute("data-cell-range");
    const before = readCellSurfaceProbe(surface)!;
    mounted.rerender(view(12.5));
    expect(surface.releasePointerCapture).toHaveBeenCalledWith(7);
    fireEvent.pointerMove(surface, { pointerId: 7, clientX: 75, clientY: 50 });
    fireEvent.pointerUp(surface, { pointerId: 7 });
    expect(surface.getAttribute("data-cell-range")).toBe(selection);
    const after = readCellSurfaceProbe(surface)!;
    expect(after.text).toBe(before.text);
    expect(after.revision).toBe(before.revision);
    expect(after.presentation?.metrics.cellWidth).toBe(12.5);
    expect(canvas.width).toBe(100);
  });

  it("releases Yoga resources across a React StrictMode mount cycle", async () => {
    const baseline = YogaLayoutEngine.getResourceCounts();
    const mounted = render(
      <StrictMode><Product onAction={() => undefined} /></StrictMode>
    );
    expect(YogaLayoutEngine.getResourceCounts().configs).toBeGreaterThan(baseline.configs);
    mounted.unmount();
    await waitFor(() => expect(YogaLayoutEngine.getResourceCounts()).toEqual(baseline));
  });

  it("presents paint-only commits without clearing the full Canvas", () => {
    const view = (selectedId: string) => (
      <CellSurface
        viewport={{ width: 10, height: 3 }}
        onCommand={() => undefined}
        metrics={{ cellWidth: 10, cellHeight: 20, fontSize: 15, fontFamily: "monospace" }}
      >
        <Root id="paint-root">
          <List id="paint-list">
            {["a", "b", "c"].map((id) => (
              <ListItem id={id} key={id} selected={selectedId === id}><Text>{id}</Text></ListItem>
            ))}
          </List>
        </Root>
      </CellSurface>
    );
    const mounted = render(view("a"));
    context.clearRect.mockClear();
    context.fillRect.mockClear();
    mounted.rerender(view("b"));

    expect(context.clearRect).not.toHaveBeenCalled();
    expect(context.fillRect).not.toHaveBeenCalledWith(0, 0, 100, 60);
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 100, 20);
    expect(context.fillRect).toHaveBeenCalledWith(0, 20, 100, 20);
  });

  it("uses one font profile for loading and presentation, then reloads on profile change", async () => {
    const load = vi.fn().mockResolvedValue([{}]);
    const fonts = {
      load,
      ready: Promise.resolve(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: fonts,
    });
    const profile = (id: string, cjkFamily: string): CharDeskFontProfile => ({
      id,
      families: { text: "Display Face", emoji: "Emoji Face" },
      sources: [],
      resolveCapability: (grapheme) => grapheme === "中" ? "cjk" : "display",
      capabilities: {
        display: { families: { regular: "Display Face" } },
        cjk: { families: { regular: cjkFamily } },
        nerd: { families: { regular: "Nerd Face" } },
        symbol: { families: { regular: "Symbol Face" } },
        emoji: { families: { regular: "Emoji Face" } },
      },
    });
    const view = (fontProfile: CharDeskFontProfile) => (
      <CellSurface
        viewport={{ width: 4, height: 1 }}
        onCommand={() => undefined}
        fontProfile={fontProfile}
        metrics={{ cellWidth: 10, cellHeight: 20, fontSize: 15, fontFamily: "monospace" }}
      >
        <Root><Text>中</Text></Root>
      </CellSurface>
    );

    try {
      const mounted = render(view(profile("test/first", "First CJK")));
      await waitFor(() => expect(load.mock.calls.some(([font]) =>
        String(font).includes("First CJK"))).toBe(true));
      load.mockClear();
      context.clearRect.mockClear();
      mounted.rerender(view(profile("test/second", "Second CJK")));
      await waitFor(() => expect(load.mock.calls.some(([font]) =>
        String(font).includes("Second CJK"))).toBe(true));
      expect(context.clearRect).toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(document, "fonts");
    }
  });

  it("publishes resolved font routes and reports glyphs wider than their Cells", () => {
    context.measureText.mockImplementation((text: string) => ({
      width: text === "W" ? 12 : 6,
    }));
    const profile: CharDeskFontProfile = {
      id: "test/prop",
      families: { text: "Prop Face", emoji: "Emoji Face" },
      sources: [],
      resolveCapability: (grapheme) => grapheme === "界" ? "cjk" : "display",
      capabilities: {
        display: { families: { regular: "Prop Face" } },
        cjk: { families: { regular: "Prop CJK" } },
        nerd: { families: { regular: "Nerd Face" } },
        symbol: { families: { regular: "Symbol Face" } },
        emoji: { families: { regular: "Emoji Face" } },
      },
    };
    render(
      <CellSurface
        probeId="font-test"
        viewport={{ width: 4, height: 1 }}
        onCommand={() => undefined}
        fontProfile={profile}
        metrics={{ cellWidth: 9, cellHeight: 19, fontSize: 15, fontFamily: "monospace" }}
      >
        <Root><Text>W界</Text></Root>
      </CellSurface>
    );

    const snapshot = readCellSurfaceProbe(screen.getByLabelText("Cell interface"))!;
    expect(snapshot.presentation).toMatchObject({
      metrics: { cellWidth: 9, cellHeight: 19, fontSize: 15 },
      fontProfileId: "test/prop/cell-ui-graphics-v1",
      requestedFontRoutes: {
        display: { family: "Prop Face", fontSize: 15, scaleX: 1 },
        cjk: { family: "Prop CJK", fontSize: 15, scaleX: 1 },
      },
      glyphOverflow: [{
        text: "W", row: 0, col: 0, spanCells: 1, measuredWidth: 12, availableWidth: 9,
      }],
    });
  });

  it("paints the two backgrounds beneath a wide glyph independently", () => {
    const fills: { color: string; rect: number[] }[] = [];
    context.fillRect.mockImplementation((...rect: number[]) => {
      fills.push({ color: context.fillStyle, rect });
    });
    try {
      render(
        <CellSurface viewport={{ width: 2, height: 1 }} onCommand={() => undefined}
          metrics={{ cellWidth: 10, cellHeight: 20, fontSize: 15, fontFamily: "monospace" }}>
          <Root>
            <Box style={{ direction: "row" }}>
              <Box style={{ width: 1, height: 1 }} textStyle={{ backgroundColor: "red" }} />
              <Box style={{ width: 1, height: 1 }} textStyle={{ backgroundColor: "blue" }} />
            </Box>
            <Overlay position={{ x: 0, y: 0 }} style={{ width: 2, height: 1 }} textStyle={{ backgroundColor: undefined }}>
              <Text>中</Text>
            </Overlay>
          </Root>
        </CellSurface>
      );
      expect(fills).toContainEqual({ color: "red", rect: [0, 0, 10, 20] });
      expect(fills).toContainEqual({ color: "blue", rect: [10, 0, 10, 20] });
      expect(fills).not.toContainEqual({ color: "red", rect: [0, 0, 20, 20] });
    } finally {
      context.fillRect.mockReset();
    }
  });

  it("converts pointer pixels to cells", () => {
    expect(pxToCellPoint(
      { clientX: 29, clientY: 41 },
      { left: 9, top: 1 },
      { cellWidth: 10, cellHeight: 20 }
    )).toEqual({ x: 2, y: 2 });
  });

  it("fully repaints a palette change during a paint-only commit and preserves revision on resize", () => {
    const view = (selected: boolean, background: string, width = 10) => (
      <CellSurface probeId="palette-test" onCommand={() => undefined} viewport={{ width, height: 3 }}
        metrics={{ cellWidth: 10, cellHeight: 20, fontSize: 15, fontFamily: "monospace" }}
        palette={{ color: "#ffffff", background }}>
        <Root id="root"><List id="list"><ListItem id="item" selected={selected}><Text>item</Text></ListItem></List></Root>
      </CellSurface>
    );
    const mounted = render(view(false, "#000000"));
    const surface = screen.getByLabelText("Cell interface");
    const initial = readCellSurfaceProbe(surface)!;
    context.clearRect.mockClear();
    mounted.rerender(view(true, "#111111"));
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 100, 60);
    const changed = readCellSurfaceProbe(surface)!;
    expect(changed.revision).toBeGreaterThan(initial.revision);
    mounted.rerender(view(true, "#111111", 12));
    const resized = readCellSurfaceProbe(surface)!;
    expect(resized.revision).toBeGreaterThan(changed.revision);
    expect(resized.viewport.width).toBe(12);
  });

  it("shares one command path across keyboard and semantic activation", () => {
    const onAction = vi.fn();
    const onCommand = vi.fn();
    render(<Product onAction={onAction} onCommand={onCommand} />);
    const surface = screen.getByLabelText("Cell interface");

    fireEvent.keyDown(surface, { key: "Enter" });
    expect(onAction).toHaveBeenCalledOnce();
    expect(onAction).toHaveBeenLastCalledWith("open");
    expect(onCommand).toHaveBeenCalledOnce();

    const newFile = screen.getByRole("option", { name: "New file" });
    fireEvent.focus(newFile);
    expect(onCommand).toHaveBeenCalledTimes(2);
    expect(onCommand).toHaveBeenLastCalledWith({ type: "focus", targetId: "new" });

    fireEvent.click(newFile);
    expect(onAction).toHaveBeenCalledTimes(2);
    expect(onAction).toHaveBeenLastCalledWith("new");
    expect(onCommand).toHaveBeenCalledTimes(3);
  });

  it("keeps Checkbox mixed state, DOM focus, Space, and semantic click on one command path", async () => {
    const onCommand = vi.fn();
    render(<CheckboxProduct onCommand={onCommand} />);
    const surface = screen.getByLabelText("Checkbox product");
    fireEvent.focus(surface);
    const checkbox = await screen.findByRole("checkbox", { name: "Autosave" });

    await waitFor(() => expect(checkbox).toHaveFocus());
    expect(checkbox).toHaveAttribute("aria-checked", "mixed");
    fireEvent.keyDown(checkbox, { key: " ", code: "Space" });
    expect(onCommand).toHaveBeenLastCalledWith({ type: "activate", targetId: "autosave" });
    await waitFor(() => expect(checkbox).toHaveAttribute("aria-checked", "true"));
    fireEvent.click(checkbox);
    await waitFor(() => expect(checkbox).toHaveAttribute("aria-checked", "false"));
  });

  it("keeps Slider value, ARIA projection, and keyboard commands in one frame", async () => {
    const onCommand = vi.fn();
    render(<SliderProduct onCommand={onCommand} />);
    const surface = screen.getByLabelText("Slider product");
    fireEvent.focus(surface);
    const slider = await screen.findByRole("slider", { name: "Volume" });

    await waitFor(() => expect(slider).toHaveFocus());
    expect(slider).toHaveAttribute("aria-valuenow", "50");
    expect(slider).toHaveAttribute("aria-valuemin", "0");
    expect(slider).toHaveAttribute("aria-valuemax", "100");
    expect(slider).toHaveAttribute("aria-valuetext", "50 percent");
    expect(slider).toHaveAttribute("aria-orientation", "horizontal");

    fireEvent.keyDown(slider, { key: "ArrowRight", code: "ArrowRight" });
    expect(onCommand).toHaveBeenLastCalledWith({
      type: "set-value",
      targetId: "volume",
      value: 51,
    });
    await waitFor(() => expect(slider).toHaveAttribute("aria-valuenow", "51"));
    expect(slider).toHaveAttribute("aria-valuetext", "51 percent");
  });

  it("keeps the Slider thumb emphasized from hover through pointer capture", () => {
    const { container } = render(<SliderProduct />);
    const surface = screen.getByLabelText("Slider product");
    const canvas = container.querySelector("canvas")!;
    const pointer = {
      button: 0,
      pointerId: 41,
      pointerType: "mouse",
      clientX: 90,
      clientY: 10,
    };

    fireEvent.pointerMove(canvas, { ...pointer, buttons: 0 });
    expect(readCellSurfaceProbe(surface)!.text).toContain("█");

    fireEvent.pointerDown(canvas, pointer);
    expect(surface).not.toHaveAttribute("data-cell-hovered");
    expect(surface).toHaveAttribute("data-cell-manipulating", "true");
    expect(readCellSurfaceProbe(surface)!.text).toContain("█");

    fireEvent.pointerMove(surface, { ...pointer, buttons: 1, clientX: 135 });
    expect(surface).toHaveAttribute("data-cell-manipulating", "true");
    expect(readCellSurfaceProbe(surface)!.text).toContain("█");

    fireEvent.pointerUp(surface, { ...pointer, buttons: 0, clientX: 135 });
    expect(surface).not.toHaveAttribute("data-cell-manipulating");
    expect(readCellSurfaceProbe(surface)!.text).toContain("█");

    fireEvent.pointerLeave(surface, { pointerType: "mouse" });
    expect(readCellSurfaceProbe(surface)!.text).not.toContain("█");
  });

  it("clears Slider manipulation when pointer capture is cancelled", () => {
    const { container } = render(<SliderProduct />);
    const surface = screen.getByLabelText("Slider product");
    const canvas = container.querySelector("canvas")!;

    fireEvent.pointerDown(canvas, {
      button: 0,
      pointerId: 42,
      pointerType: "mouse",
      clientX: 90,
      clientY: 10,
    });
    expect(surface).toHaveAttribute("data-cell-manipulating", "true");
    fireEvent.pointerCancel(surface, { pointerId: 42, pointerType: "mouse" });
    expect(surface).not.toHaveAttribute("data-cell-manipulating");
    expect(readCellSurfaceProbe(surface)!.text).not.toContain("█");
  });

  it("projects RangeSlider as a named group with two native slider targets", async () => {
    const onCommand = vi.fn();
    render(<RangeSliderProduct onCommand={onCommand} />);
    const surface = screen.getByLabelText("Range slider product");
    fireEvent.focus(surface);
    const group = await screen.findByRole("group", { name: "Volume" });
    const start = screen.getByRole("slider", { name: "Minimum volume" });
    const end = screen.getByRole("slider", { name: "Maximum volume" });

    expect(group).toContainElement(start);
    expect(group).toContainElement(end);
    await waitFor(() => expect(start).toHaveFocus());
    expect(start).toHaveAttribute("aria-valuenow", "30");
    expect(start).toHaveAttribute("aria-valuemax", "70");
    expect(end).toHaveAttribute("aria-valuemin", "30");
    expect(end).toHaveAttribute("aria-valuenow", "70");

    fireEvent.keyDown(start, { key: "ArrowRight", code: "ArrowRight" });
    expect(onCommand).toHaveBeenLastCalledWith({
      type: "set-value",
      targetId: "volume-start",
      value: 31,
    });
    await waitFor(() => expect(start).toHaveAttribute("aria-valuenow", "31"));
    expect(end).toHaveAttribute("aria-valuemin", "31");

    fireEvent.keyDown(start, { key: "Tab", code: "Tab" });
    await waitFor(() => expect(end).toHaveFocus());
    expect(onCommand).toHaveBeenLastCalledWith({ type: "focus", targetId: "volume-end" });

    fireEvent.keyDown(end, { key: "Tab", code: "Tab", shiftKey: true });
    await waitFor(() => expect(start).toHaveFocus());
    expect(onCommand).toHaveBeenLastCalledWith({ type: "focus", targetId: "volume-start" });
  });

  it("keeps native keyboard phase, repeat, modifiers, and host claims distinct", () => {
    const onAction = vi.fn();
    const onCommand = vi.fn();
    render(<Product onAction={onAction} onCommand={onCommand} />);
    const surface = screen.getByLabelText("Cell interface");

    fireEvent.keyUp(surface, { key: "Enter", code: "Enter" });
    fireEvent.keyDown(surface, { key: "Enter", code: "Enter", repeat: true });
    fireEvent.keyDown(surface, { key: "ArrowDown", code: "ArrowDown", ctrlKey: true });
    expect(onCommand).not.toHaveBeenCalled();
    expect(surface).toHaveAttribute("data-cell-focused", "open");

    const claimed = new KeyboardEvent("keydown", {
      key: "Enter",
      code: "Enter",
      bubbles: true,
      cancelable: true,
    });
    claimed.preventDefault();
    surface.dispatchEvent(claimed);
    expect(onAction).not.toHaveBeenCalled();
    expect(onCommand).not.toHaveBeenCalled();
  });

  it.each(["cancel", "lost-capture", "move"])("releases a %s tap before the next click", (ending) => {
    const onAction = vi.fn();
    const { container } = render(<Product onAction={onAction} />);
    const surface = screen.getByLabelText("Cell interface");
    const canvas = container.querySelector("canvas")!;
    const pointer = { button: 0, pointerId: 21, clientX: 35, clientY: 30 };
    fireEvent.pointerDown(canvas, pointer);
    if (ending === "cancel") fireEvent.pointerCancel(surface, { pointerId: 21 });
    if (ending === "lost-capture") fireEvent.lostPointerCapture(surface, { pointerId: 21 });
    if (ending === "move") fireEvent.pointerMove(surface, { ...pointer, clientX: 75 });
    fireEvent.pointerUp(surface, ending === "move" ? { ...pointer, clientY: 300 } : pointer);
    expect(onAction).not.toHaveBeenCalled();
    fireEvent.pointerDown(canvas, { ...pointer, clientY: 10 });
    fireEvent.pointerUp(surface, { ...pointer, clientY: 10 });
    expect(onAction).toHaveBeenCalledExactlyOnceWith("new");
  });

  it("routes pointer tap and scroll drag through the gesture arena", () => {
    const onAction = vi.fn();
    const onCommand = vi.fn();
    const { container } = render(<Product onAction={onAction} onCommand={onCommand} />);
    const surface = screen.getByLabelText("Cell interface");
    const canvas = container.querySelector("canvas")!;

    fireEvent.pointerDown(canvas, {
      button: 0,
      pointerId: 21,
      clientX: 35,
      clientY: 30,
    });
    fireEvent.pointerUp(surface, {
      pointerId: 21,
      clientX: 35,
      clientY: 30,
    });
    expect(onAction).toHaveBeenCalledWith("open");

    fireEvent.pointerDown(canvas, {
      button: 0,
      pointerId: 22,
      clientX: 35,
      clientY: 90,
    });
    fireEvent.pointerMove(surface, {
      pointerId: 22,
      clientX: 35,
      clientY: 50,
    });
    fireEvent.pointerUp(surface, {
      pointerId: 22,
      clientX: 35,
      clientY: 50,
    });
    expect(onCommand).toHaveBeenCalledWith({
      type: "scroll",
      targetId: "files",
      scrollX: 0,
      scrollY: 2,
    });
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("keeps pointer focus logical while reserving visible focus emphasis for keyboard and semantics", () => {
    vi.useFakeTimers();
    const { container } = render(<CheckboxProduct />);
    const surface = screen.getByLabelText("Checkbox product");
    const canvas = container.querySelector("canvas")!;

    fireEvent.focus(surface);
    expect(surface).toHaveAttribute("data-cell-focus-visible", "true");
    expect(readCellSurfaceProbe(surface)!.cells.find((cell) => cell.x === 19 && cell.y === 0)?.style)
      .toMatchObject({ color: "#FFFFFF", backgroundColor: "#000000" });

    fireEvent.pointerDown(canvas, {
      button: 0,
      pointerId: 29,
      pointerType: "mouse",
      clientX: 5,
      clientY: 10,
    });
    expect(surface).not.toHaveAttribute("data-cell-focus-visible");
    expect(surface).toHaveAttribute("data-cell-focused", "autosave");
    expect(surface).toHaveAttribute("data-cell-press-active", "autosave");
    expect(readCellSurfaceProbe(surface)!.cells.find((cell) => cell.x === 19 && cell.y === 0)?.style)
      .toMatchObject({ color: "#FFFFFF", backgroundColor: "#000000" });

    fireEvent.pointerMove(surface, {
      pointerId: 29,
      pointerType: "mouse",
      buttons: 1,
      clientX: 5,
      clientY: 30,
    });
    expect(surface).not.toHaveAttribute("data-cell-press-active");
    fireEvent.pointerMove(surface, {
      pointerId: 29,
      pointerType: "mouse",
      buttons: 1,
      clientX: 5,
      clientY: 10,
    });
    expect(surface).toHaveAttribute("data-cell-press-active", "autosave");

    fireEvent.pointerUp(surface, {
      pointerId: 29,
      pointerType: "mouse",
      buttons: 0,
      clientX: 5,
      clientY: 10,
    });
    expect(surface).not.toHaveAttribute("data-cell-press-active");
    expect(surface).toHaveAttribute("data-cell-activation-flash", "autosave");
    expect(readCellSurfaceProbe(surface)!.cells.find((cell) => cell.x === 19 && cell.y === 0)?.style)
      .toMatchObject({ color: "#000000", backgroundColor: "#FFFFFF" });
    expect(readCellSurfaceProbe(surface)!.cells.find((cell) => cell.x === 19 && cell.y === 0)?.style.bold)
      .not.toBe(true);
    act(() => vi.advanceTimersByTime(80));
    expect(surface).not.toHaveAttribute("data-cell-activation-flash");
    expect(readCellSurfaceProbe(surface)!.cells.find((cell) => cell.x === 19 && cell.y === 0)?.style.backgroundColor)
      .toBe("#000000");
    act(() => vi.advanceTimersByTime(80));
    expect(surface).toHaveAttribute("data-cell-activation-flash", "autosave");
    act(() => vi.advanceTimersByTime(80));
    expect(surface).not.toHaveAttribute("data-cell-activation-flash");

    act(() => vi.advanceTimersByTime(80));
    fireEvent.pointerLeave(surface, { pointerType: "mouse" });
    expect(readCellSurfaceProbe(surface)!.cells.find((cell) => cell.x === 19 && cell.y === 0)?.style.backgroundColor)
      .toBeUndefined();
    expect(surface).toHaveAttribute("data-cell-focused", "autosave");

    fireEvent.keyDown(surface, { key: " " });
    expect(surface).toHaveAttribute("data-cell-focus-visible", "true");
    expect(surface).toHaveAttribute("data-cell-press-active", "autosave");
    expect(readCellSurfaceProbe(surface)!.cells.find((cell) => cell.x === 19 && cell.y === 0)?.style.bold)
      .not.toBe(true);
    fireEvent.keyUp(surface, { key: " " });
    expect(surface).not.toHaveAttribute("data-cell-press-active");
    expect(surface).toHaveAttribute("data-cell-activation-flash", "autosave");

    fireEvent.pointerDown(canvas, {
      button: 0,
      pointerId: 30,
      pointerType: "mouse",
      clientX: 5,
      clientY: 10,
    });
    expect(surface).not.toHaveAttribute("data-cell-focus-visible");
    fireEvent.pointerCancel(surface, { pointerId: 30, pointerType: "mouse" });
    fireEvent.focus(screen.getByRole("checkbox", { name: "Autosave" }));
    expect(surface).toHaveAttribute("data-cell-focus-visible", "true");
    vi.useRealTimers();
  });

  it("pages scrollbar tracks and drags owned Cell thumbs", () => {
    const onCommand = vi.fn();
    const { container } = render(<Product onAction={() => undefined} onCommand={onCommand} />);
    const surface = screen.getByLabelText("Cell interface");
    const canvas = container.querySelector("canvas")!;

    fireEvent.pointerDown(canvas, {
      button: 0,
      pointerId: 31,
      clientX: 285,
      clientY: 110,
    });
    fireEvent.pointerUp(surface, {
      pointerId: 31,
      clientX: 285,
      clientY: 110,
    });
    expect(onCommand).toHaveBeenCalledWith({
      type: "scroll",
      targetId: "files",
      scrollX: 0,
      scrollY: 2,
    });

    onCommand.mockClear();
    fireEvent.pointerDown(canvas, {
      button: 0,
      pointerId: 32,
      clientX: 285,
      clientY: 110,
    });
    fireEvent.pointerMove(surface, {
      pointerId: 32,
      clientX: 285,
      clientY: 90,
    });
    fireEvent.pointerUp(surface, {
      pointerId: 32,
      clientX: 285,
      clientY: 90,
    });
    expect(onCommand).toHaveBeenCalledWith({
      type: "scroll",
      targetId: "files",
      scrollX: 0,
      scrollY: 0,
    });
  });

  it("renders semantic widgets rather than a DOM node for every cell", () => {
    const { container } = render(<Product onAction={() => undefined} />);
    expect(screen.getAllByRole("listbox")).toHaveLength(2);
    expect(screen.getByRole("option", { name: "Open file" }))
      .toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: /04\s+src\/theme\.ts/ }))
      .toHaveAttribute("aria-disabled", "true");
    expect(container.querySelectorAll("[role]").length).toBeLessThan(12);
    expect(container.querySelectorAll("canvas")).toHaveLength(1);
  });

  it("removes background semantics and text input while a modal Overlay is open", () => {
    const { rerender } = render(<ModalEditorProduct open={false} />);
    expect(screen.getByRole("textbox", { name: "Background editor" })).toBeInTheDocument();

    rerender(<ModalEditorProduct open />);
    expect(screen.queryByRole("textbox", { name: "Background editor" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Commands" }))
      .toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("option", { name: "Open file" })).toBeInTheDocument();

    rerender(<ModalEditorProduct open={false} />);
    expect(screen.getByRole("textbox", { name: "Background editor" })).toBeInTheDocument();
  });

  it("keeps a 100k-row List bounded across keyboard reveal and pointer hit", () => {
    const onAction = vi.fn();
    const { container } = render(<VirtualListProduct onAction={onAction} />);
    const surface = screen.getByLabelText("Virtual list surface");
    const canvas = container.querySelector("canvas")!;
    expect(screen.getAllByRole("option")).toHaveLength(6);
    expect(screen.getByLabelText("Virtual mounted count")).toHaveTextContent("6");
    expect(screen.getByRole("option", { name: /000000\s+row/ }))
      .toHaveAttribute("aria-posinset", "1");
    expect(screen.getByRole("option", { name: /000000\s+row/ }))
      .toHaveAttribute("aria-setsize", "100000");

    fireEvent.focus(surface);
    fireEvent.keyDown(surface, { key: "PageDown" });
    expect(surface).toHaveAttribute("data-cell-focused", "virtual-4");
    expect(screen.getByLabelText("Virtual scroll offset")).toHaveTextContent("4");
    expect(screen.getByRole("option", { name: /000004\s+row/ })).toHaveFocus();
    const pageProbe = readCellSurfaceProbe(surface)!;
    expect(pageProbe.focusedId).toBe("virtual-4");
    expect(pageProbe.cells.filter((cell) => cell.style.bold)).toHaveLength(0);
    expect(pageProbe.cells.some((cell) => cell.ownerId === "virtual-4" && cell.style.backgroundColor)).toBe(true);
    expect(pageProbe.cells.some((cell) => cell.text === "▶")).toBe(false);
    expect(screen.getByLabelText("Virtual selected item")).toHaveTextContent("none");

    fireEvent.keyDown(surface, { key: "PageUp" });
    expect(surface).toHaveAttribute("data-cell-focused", "virtual-0");
    expect(screen.getByLabelText("Virtual scroll offset")).toHaveTextContent("0");

    fireEvent.wheel(canvas, { deltaY: 100, clientX: 35, clientY: 70 });
    expect(surface).toHaveAttribute("data-cell-focused", "virtual-1");
    expect(screen.getByLabelText("Virtual selected item")).toHaveTextContent("none");
    fireEvent.keyDown(surface, { key: "PageUp" });

    for (let index = 0; index < 5; index += 1) {
      fireEvent.keyDown(surface, { key: "ArrowDown" });
    }
    expect(surface).toHaveAttribute("data-cell-focused", "virtual-5");
    expect(screen.getByLabelText("Virtual scroll offset")).toHaveTextContent("2");
    expect(screen.getByRole("option", { name: /000005\s+row/ }))
      .toHaveAttribute("aria-posinset", "6");
    expect(Number(screen.getByLabelText("Virtual mounted count").textContent))
      .toBeLessThanOrEqual(8);

    fireEvent.pointerDown(canvas, {
      button: 0,
      pointerId: 31,
      clientX: 35,
      clientY: 70,
    });
    fireEvent.pointerUp(surface, {
      pointerId: 31,
      clientX: 35,
      clientY: 70,
    });
    expect(onAction).toHaveBeenCalledWith("virtual-4");
    expect(surface).toHaveAttribute("data-cell-focused", "virtual-4");
  });

  it("skips a disabled virtual row when paging focus", () => {
    const items = Array.from({ length: 12 }, (_, index) => ({
      id: `virtual-${index}`,
      label: `${String(index).padStart(6, "0")}  row`,
      disabled: index === 4,
    }));
    render(<VirtualListProduct items={items} onAction={() => undefined} />);
    const surface = screen.getByLabelText("Virtual list surface");
    fireEvent.focus(surface);
    fireEvent.keyDown(surface, { key: "PageDown" });
    expect(surface).toHaveAttribute("data-cell-focused", "virtual-5");
    expect(screen.getByRole("option", { name: /000004\s+row/ }))
      .toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("option", { name: /000005\s+row/ })).toHaveFocus();
  });

  it("shares navigation and state across Menu, Tree, Tabs, and Grid semantics", async () => {
    render(<ComplexWidgetProduct />);
    const surface = screen.getByLabelText("Complex widget surface");
    const status = screen.getByLabelText("Complex widget status");
    expect(screen.getByRole("menu", { name: "File menu" })).toBeInTheDocument();
    expect(screen.getByRole("tree", { name: "Files" })).toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: "Views" })).toBeInTheDocument();
    expect(screen.getByRole("grid", { name: "Properties" })).toBeInTheDocument();

    fireEvent.focus(screen.getByRole("menuitem", { name: "Open" }));
    fireEvent.keyDown(surface, { key: "ArrowDown" });
    fireEvent.keyDown(surface, { key: "Enter" });
    expect(status).not.toHaveTextContent("menu-save action");
    fireEvent.keyUp(surface, { key: "Enter" });
    await waitFor(() => expect(status).toHaveTextContent("menu-save action"));

    const source = screen.getByRole("treeitem", { name: /src/ });
    fireEvent.focus(source);
    fireEvent.click(source);
    expect(source).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("treeitem", { name: /index\.ts/ })).toBeNull();
    fireEvent.keyDown(surface, { key: "Enter" });
    expect(source).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("treeitem", { name: /index\.ts/ })).toBeInTheDocument();
    fireEvent.keyDown(surface, { key: "ArrowLeft" });
    expect(source).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("treeitem", { name: /index\.ts/ })).toBeNull();
    fireEvent.keyDown(surface, { key: "ArrowRight" });
    expect(source).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(surface, { key: "ArrowRight" });
    expect(surface).toHaveAttribute("data-cell-focused", "tree-index");

    fireEvent.focus(screen.getByRole("tab", { name: "Code" }));
    fireEvent.keyDown(surface, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Preview" }))
      .toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "Preview" })).toBeInTheDocument();

    fireEvent.focus(screen.getByRole("gridcell", { name: "Name" }));
    fireEvent.keyDown(surface, { key: "ArrowRight" });
    expect(surface).toHaveAttribute("data-cell-focused", "property-value");
    fireEvent.keyDown(surface, { key: "ArrowDown" });
    expect(surface).toHaveAttribute("data-cell-focused", "property-dark");
    fireEvent.keyDown(surface, { key: "Enter" });
    expect(status).toHaveTextContent("property-dark activated");
  });

  it("routes Unicode input, grapheme navigation, composition, and undo through real textareas", () => {
    const onCommand = vi.fn();
    const { container } = render(<EditorProduct onCommand={onCommand} />);
    const input = screen.getByRole("textbox", { name: "Name" }) as HTMLTextAreaElement;
    const canvas = container.querySelector("canvas")!;

    fireEvent.focus(input);
    fireEvent.input(input, { target: { value: "A中🙂" }, data: "🙂", inputType: "insertText" });
    expect(canvas.getAttribute("data-cell-text")).toMatch(/A中🙂/);

    fireEvent.keyDown(input, { key: "ArrowLeft" });
    expect(input.selectionStart).toBe(2);
    expect(input.selectionEnd).toBe(2);

    fireEvent.compositionStart(input);
    fireEvent.compositionUpdate(input, { data: "你" });
    expect(canvas.getAttribute("data-cell-text")).toMatch(/A中你/);
    fireEvent.compositionEnd(input, { data: "你" });
    fireEvent.keyDown(input, { key: "z", ctrlKey: true });
    expect(canvas.getAttribute("data-cell-text")).toMatch(/A中🙂/);
    fireEvent.paste(input, {
      clipboardData: { getData: () => " X\nY", setData: vi.fn() },
    });
    expect(canvas.getAttribute("data-cell-text")).toMatch(/A中 X Y🙂/);
    expect(onCommand.mock.calls.some(([command]) => command.type === "text")).toBe(true);
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
  });

  it("does not activate or navigate a text editor through composition or modified arrows", () => {
    const onCommand = vi.fn();
    render(<EditorProduct onCommand={onCommand} />);
    const input = screen.getByRole("textbox", { name: "Name" }) as HTMLTextAreaElement;

    fireEvent.focus(input);
    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: "Enter", code: "Enter", isComposing: true });
    expect(onCommand.mock.calls.some(([command]) => command.type === "activate")).toBe(false);
    fireEvent.compositionEnd(input, { data: "你" });

    onCommand.mockClear();
    fireEvent.keyDown(input, { key: "ArrowLeft", code: "ArrowLeft", metaKey: true });
    expect(onCommand).not.toHaveBeenCalled();
  });

  it("selects, copies, and clears a rendered Cell rectangle", () => {
    const { container, rerender } = render(<RangeProduct />);
    const surface = screen.getByLabelText("Range surface");
    const canvas = container.querySelector("canvas")!;

    fireEvent.pointerDown(canvas, {
      button: 0,
      altKey: true,
      pointerId: 7,
      clientX: 5,
      clientY: 10,
    });
    fireEvent.pointerMove(surface, { pointerId: 7, clientX: 75, clientY: 50 });
    fireEvent.pointerUp(surface, { pointerId: 7 });
    expect(surface).toHaveAttribute("data-cell-range", "0,0,8,3");
    expect(screen.getByLabelText("Range text").textContent)
      .toBe("┌──────┐\n│AB    │\n└──────┘");

    const setData = vi.fn();
    fireEvent.copy(surface, { clipboardData: { setData } });
    expect(setData).toHaveBeenCalledWith(
      "text/plain",
      "┌──────┐\n│AB    │\n└──────┘"
    );

    rerender(<RangeProduct text="CD" width={6} />);
    expect(surface).toHaveAttribute("data-cell-range", "0,0,6,3");
    expect(screen.getByLabelText("Range text").textContent)
      .toBe("┌────┐\n│CD  │\n└────┘");

    fireEvent.pointerDown(canvas, {
      button: 0,
      pointerId: 8,
      clientX: 5,
      clientY: 10,
    });
    expect(surface).not.toHaveAttribute("data-cell-range");

    fireEvent.pointerDown(canvas, {
      button: 0,
      altKey: true,
      pointerId: 9,
      clientX: 5,
      clientY: 10,
    });
    fireEvent.pointerUp(surface, { pointerId: 9 });
    expect(surface).toHaveAttribute("data-cell-range");
    fireEvent.keyDown(surface, { key: "Escape" });
    expect(surface).not.toHaveAttribute("data-cell-range");
  });

  it("uses Cell Range as the exclusive primary overlay", () => {
    const { container } = render(<EditorProduct />);
    const input = screen.getByRole("textbox", { name: "Name" });
    const canvas = container.querySelector("canvas")!;
    const surface = canvas.parentElement!;

    fireEvent.focus(input);
    expect(context.getImageData).toHaveBeenCalled();
    context.getImageData.mockClear();

    fireEvent.pointerDown(canvas, {
      button: 0,
      altKey: true,
      pointerId: 71,
      clientX: 5,
      clientY: 10,
    });
    expect(surface).toHaveAttribute("data-cell-range");
    expect(context.getImageData).not.toHaveBeenCalled();

    fireEvent.keyDown(surface, { key: "Escape" });
    expect(surface).not.toHaveAttribute("data-cell-range");
    expect(context.getImageData).toHaveBeenCalled();
  });

  it("clears controlled and default Cell Ranges only after confirmed external focus exit", async () => {
    const selectRange = (surface: HTMLElement, canvas: HTMLCanvasElement, pointerId: number) => {
      fireEvent.pointerDown(canvas, {
        button: 0,
        altKey: true,
        pointerId,
        clientX: 5,
        clientY: 10,
      });
      fireEvent.pointerMove(surface, { pointerId, clientX: 75, clientY: 50 });
      fireEvent.pointerUp(surface, { pointerId });
    };
    const controlled = render(<><RangeProduct /><button type="button">Outside</button></>);
    const surface = screen.getByLabelText("Range surface");
    const canvas = controlled.container.querySelector("canvas")!;
    const outside = screen.getByRole("button", { name: "Outside" });

    selectRange(surface, canvas, 30);
    expect(surface).toHaveAttribute("data-cell-range");
    fireEvent.blur(surface, { relatedTarget: outside });
    expect(surface).not.toHaveAttribute("data-cell-range");
    expect(screen.getByLabelText("Range text")).toHaveTextContent("");

    selectRange(surface, canvas, 31);
    const hasFocus = vi.spyOn(document, "hasFocus").mockReturnValue(false);
    fireEvent.blur(surface);
    await Promise.resolve();
    expect(surface).toHaveAttribute("data-cell-range");
    hasFocus.mockRestore();
    controlled.unmount();

    const onRangeCommand = vi.fn();
    const uncontrolled = render(<><DefaultRangeProduct onRangeCommand={onRangeCommand} /><button type="button">Next</button></>);
    const defaultSurface = screen.getByLabelText("Default range surface");
    const defaultCanvas = uncontrolled.container.querySelector("canvas")!;
    selectRange(defaultSurface, defaultCanvas, 32);
    fireEvent.blur(defaultSurface, { relatedTarget: screen.getByRole("button", { name: "Next" }) });
    expect(defaultSurface).not.toHaveAttribute("data-cell-range");
    expect(onRangeCommand).toHaveBeenLastCalledWith({ type: "clear" });
  });

  it("preserves a Cell Range while focus moves within its Surface", async () => {
    const { container } = render(<EditorProduct />);
    const surface = screen.getByLabelText("Cell interface");
    const canvas = container.querySelector("canvas")!;
    const input = screen.getByRole("textbox", { name: "Name" });
    fireEvent.pointerDown(canvas, {
      button: 0,
      altKey: true,
      pointerId: 33,
      clientX: 5,
      clientY: 10,
    });
    fireEvent.pointerUp(surface, { pointerId: 33 });
    expect(surface).toHaveAttribute("data-cell-range");
    fireEvent.blur(surface, { relatedTarget: input });
    expect(surface).toHaveAttribute("data-cell-range");
    input.focus();
    fireEvent.blur(surface);
    await Promise.resolve();
    expect(surface).toHaveAttribute("data-cell-range");
  });

  it("owns Cell Range state by default and requires Command on Apple platforms", () => {
    const platform = vi.spyOn(window.navigator, "platform", "get")
      .mockReturnValue("MacIntel");
    const onRangeCommand = vi.fn();
    const { container } = render(<DefaultRangeProduct onRangeCommand={onRangeCommand} />);
    const surface = screen.getByLabelText("Default range surface");
    const canvas = container.querySelector("canvas")!;

    fireEvent.pointerDown(canvas, {
      button: 0,
      altKey: true,
      pointerId: 20,
      clientX: 5,
      clientY: 10,
    });
    expect(surface).not.toHaveAttribute("data-cell-range");

    fireEvent.pointerDown(canvas, {
      button: 0,
      altKey: true,
      metaKey: true,
      pointerId: 21,
      clientX: 5,
      clientY: 10,
    });
    fireEvent.pointerMove(surface, { pointerId: 21, clientX: 75, clientY: 50 });
    fireEvent.pointerUp(surface, { pointerId: 21 });
    expect(surface).toHaveAttribute("data-cell-range", "0,0,8,3");
    expect(onRangeCommand).toHaveBeenCalledWith(expect.objectContaining({ type: "set" }));

    const setData = vi.fn();
    fireEvent.copy(surface, { clipboardData: { setData } });
    expect(setData).toHaveBeenCalledWith(
      "text/plain",
      "┌──────┐\n│AB    │\n└──────┘"
    );
    fireEvent.keyDown(surface, { key: "Escape" });
    expect(surface).not.toHaveAttribute("data-cell-range");
    platform.mockRestore();
  });

  it("uses Alt drag off Apple platforms and supports explicit disable", () => {
    const platform = vi.spyOn(window.navigator, "platform", "get")
      .mockReturnValue("Linux x86_64");
    const { container, rerender } = render(<DefaultRangeProduct />);
    const surface = screen.getByLabelText("Default range surface");
    const canvas = container.querySelector("canvas")!;

    fireEvent.pointerDown(canvas, {
      button: 0,
      altKey: true,
      pointerId: 22,
      clientX: 5,
      clientY: 10,
    });
    fireEvent.pointerUp(surface, { pointerId: 22 });
    expect(surface).toHaveAttribute("data-cell-range");

    rerender(<DefaultRangeProduct disabled />);
    expect(surface).not.toHaveAttribute("data-cell-range");
    fireEvent.pointerDown(canvas, {
      button: 0,
      altKey: true,
      pointerId: 23,
      clientX: 5,
      clientY: 10,
    });
    expect(surface).not.toHaveAttribute("data-cell-range");
    platform.mockRestore();
  });

  it("prefers a non-empty text selection over an existing Cell Range", () => {
    const { container } = render(<EditorProduct />);
    const surface = screen.getByLabelText("Cell interface");
    const canvas = container.querySelector("canvas")!;
    const input = screen.getByRole("textbox", { name: "Name" }) as HTMLTextAreaElement;

    fireEvent.pointerDown(canvas, {
      button: 0,
      altKey: true,
      pointerId: 9,
      clientX: 5,
      clientY: 10,
    });
    fireEvent.pointerMove(surface, { pointerId: 9, clientX: 35, clientY: 30 });
    fireEvent.pointerUp(surface, { pointerId: 9 });
    expect(surface).toHaveAttribute("data-cell-range");

    fireEvent.input(input, { target: { value: "field" }, data: "field", inputType: "insertText" });
    fireEvent.keyDown(input, { key: "a", ctrlKey: true });
    const setData = vi.fn();
    fireEvent.copy(input, { clipboardData: { setData } });
    expect(setData).toHaveBeenCalledTimes(1);
    expect(setData).toHaveBeenCalledWith("text/plain", "field");
  });

  it("focuses an editor border without moving its content selection", () => {
    const { container } = render(<EditorProduct />);
    const canvas = container.querySelector("canvas")!;
    const body = screen.getByRole("textbox", { name: "Document" }) as HTMLTextAreaElement;
    fireEvent.focus(body);
    fireEvent.keyDown(body, { key: "ArrowRight" });
    expect(body.selectionStart).toBe(1);

    fireEvent.pointerDown(canvas, {
      button: 0,
      pointerId: 11,
      clientX: 5,
      clientY: 70,
    });
    expect(body).toHaveFocus();
    expect(body.selectionStart).toBe(1);
    expect(body.selectionEnd).toBe(1);
  });

  it("projects the same role, name, state, focus, and action authority queried by TestPilot", () => {
    const pilot = createTestPilot({
      viewport: { width: 16, height: 3 },
      render: () => (
        <Root id="root">
          <List id="actions" label="Actions">
            <ListItem id="open" focused selected><Text>Open file</Text></ListItem>
            <ListItem id="save" disabled><Text>Save</Text></ListItem>
          </List>
        </Root>
      ),
    });
    class CountingMap<K, V> extends Map<K, V> {
      valuesCalls = 0;

      override values(): MapIterator<V> {
        this.valuesCalls += 1;
        return super.values();
      }
    }
    const semanticSnapshot = pilot.semantics();
    const semanticNodes = new CountingMap(semanticSnapshot.nodes);
    const actions: Array<{ targetId: string; action: SemanticAction }> = [];
    render(
      <SemanticDom
        snapshot={{ ...semanticSnapshot, nodes: semanticNodes }}
        onAction={(targetId, action) => actions.push({ targetId, action })}
      />
    );

    const headless = pilot.getByRole("option", { name: "Open file" });
    const browser = screen.getByRole("option", { name: headless.label });
    expect(browser).toHaveAttribute("id", `cell-semantic-${headless.id}`);
    expect(browser).toHaveAttribute("aria-selected", String(headless.selected));
    expect(browser).toHaveAttribute("data-focused", "true");
    expect(screen.getByRole("listbox", { name: "Actions" }))
      .toHaveAttribute("aria-activedescendant", "cell-semantic-open");
    expect(screen.getByRole("option", { name: "Save" })).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(browser);
    expect(actions).toEqual([{ targetId: "open", action: "activate" }]);
    expect(semanticNodes.valuesCalls).toBe(1);
    pilot.dispose();
  });

  it("exposes an opt-in serializable probe with headless text parity", async () => {
    const children = (
      <Root id="probe-root">
        <List id="probe-list" label="Probe list">
          <ListItem id="probe-open" focused selected><Text>{"Open 世界\u00a0\u3000"}</Text></ListItem>
        </List>
      </Root>
    );
    const pilot = createTestPilot({
      viewport: { width: 14, height: 2 },
      render: () => children,
    });
    const { rerender } = render(
      <CellSurface
        viewport={{ width: 14, height: 2 }}
        focusedId="probe-open"
        onCommand={() => undefined}
        label="Probe surface"
        probeId="browser-test"
      >
        {children}
      </CellSurface>
    );
    const surface = screen.getByLabelText("Probe surface");
    fireEvent.keyDown(surface, { key: "ArrowDown" });
    await waitFor(() => expect(readCellSurfaceProbe(surface)?.text).toContain("Open 世界"));
    const snapshot = readCellSurfaceProbe(surface)!;
    expect(surface).toHaveAttribute("data-cell-probe", "browser-test");
    expect(snapshot).toMatchObject({
      schemaVersion: 4,
      probeId: "browser-test",
      text: pilot.text(),
      focusedId: "probe-open",
    });
    expect(snapshot.text).toContain("世界\u00a0\u3000");
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
    expect(surface.querySelector("canvas")).toHaveAttribute("data-cell-text", snapshot.text);

    rerender(
      <CellSurface
        viewport={{ width: 14, height: 2 }}
        focusedId="probe-open"
        onCommand={() => undefined}
        label="Probe surface"
      >
        {children}
      </CellSurface>
    );
    expect((surface as HTMLElement & Record<string, unknown>)[CELL_SURFACE_PROBE_PROPERTY])
      .toBeUndefined();
    pilot.dispose();
  });
});
