import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Box,
  Grid,
  GridCell,
  GridRow,
  List,
  ListItem,
  Menu,
  MenuItem,
  Overlay,
  Root,
  ScrollArea,
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
  useCellTextState,
  useCellTabsState,
  useCellTreeState,
  useCellVirtualListState,
  type CellListItem,
} from "./browser.js";
import type { CellRangeCommand } from "./range.js";
import type { SemanticAction } from "./types.js";

const context = {
  setTransform: vi.fn(),
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  fillText: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  beginPath: vi.fn(),
  rect: vi.fn(),
  clip: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  getTransform: () => ({ a: 1, b: 0, c: 0, d: 1 }),
  fillStyle: "",
  strokeStyle: "",
  lineWidth: 1,
  font: "",
  textBaseline: "",
  textAlign: "",
};

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue(context as unknown as CanvasRenderingContext2D);
  Object.defineProperties(HTMLElement.prototype, {
    setPointerCapture: { configurable: true, value: vi.fn() },
    releasePointerCapture: { configurable: true, value: vi.fn() },
    hasPointerCapture: { configurable: true, value: vi.fn(() => true) },
  });
});

afterEach(() => cleanup());

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
    fireEvent.pointerUp(surface, pointer);
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

  it("uses the same focus style for keyboard, pointer, and semantic focus", () => {
    const { container } = render(<Product onAction={() => undefined} />);
    const surface = screen.getByLabelText("Cell interface");
    const canvas = container.querySelector("canvas")!;
    expect(canvas.dataset.cellText).not.toContain("▶");

    fireEvent.focus(surface);
    expect(surface).toHaveAttribute("data-cell-focus-visible", "true");
    const keyboard = readCellSurfaceProbe(surface)!.cells;
    expect(keyboard.find((cell) => cell.x === 29 && cell.y === 1)?.style)
      .toMatchObject({ bold: true, backgroundColor: "#1a1a1a" });

    fireEvent.pointerDown(canvas, {
      button: 0,
      pointerId: 29,
      clientX: 35,
      clientY: 30,
    });
    expect(surface).toHaveAttribute("data-cell-focus-visible", "true");
    expect(canvas.dataset.cellText).not.toContain("▶");
    expect(readCellSurfaceProbe(surface)!.cells).toEqual(keyboard);

    fireEvent.pointerUp(surface, {
      pointerId: 29,
      clientX: 35,
      clientY: 30,
    });
    fireEvent.blur(surface);
    const matches = vi.spyOn(surface, "matches")
      .mockImplementation((selector) => selector === ":focus-visible");
    fireEvent.focus(surface);
    expect(surface).toHaveAttribute("data-cell-focus-visible", "true");
    fireEvent.focus(screen.getByRole("option", { name: "Open file" }));
    expect(readCellSurfaceProbe(surface)!.cells).toEqual(keyboard);
    matches.mockRestore();
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
    expect(pageProbe.cells.filter((cell) => cell.style.bold).length).toBeGreaterThan(0);
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

  it("shares navigation and state across Menu, Tree, Tabs, and Grid semantics", () => {
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
    expect(status).toHaveTextContent("menu-save action");

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
      schemaVersion: 1,
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
