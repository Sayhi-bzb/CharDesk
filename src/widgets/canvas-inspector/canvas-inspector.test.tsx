import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  canvasCommands,
  defaultCanvasDocuments,
  replaceCanvasGrid,
  setCanvasTestState,
  useEditorStore,
} from "@/domains/canvas/testing";
import { ShortcutProvider } from "@/shared/shortcuts/dispatcher";
import { createGridSelectionState, selectGridRange } from "@/domains/selection/public";
import { CanvasInspectorControl } from "./canvas-inspector";
import { useEditorShortcutLayer } from "@/domains/editor/public";

const initialState = useEditorStore.getState();
const selectedCell = selectGridRange(
  createGridSelectionState({ x: 0, y: 0 }),
  { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } },
  { activeCell: "start" }
);

function Inspector({
  available = true,
  formFactor = "desktop",
  readOnly = false,
}: Partial<React.ComponentProps<typeof CanvasInspectorControl>>) {
  return (
    <ShortcutProvider>
      <EditorShortcutTestLayer />
      <CanvasInspectorControl
        available={available}
        formFactor={formFactor}
        readOnly={readOnly}
      />
    </ShortcutProvider>
  );
}

function EditorShortcutTestLayer() {
  useEditorShortcutLayer();
  return null;
}

describe("CanvasInspectorControl", () => {
  afterEach(() => {
    act(() => {
      replaceCanvasGrid([]);
      useEditorStore.setState(initialState, true);
    });
  });

  it("removes the surface and shortcut registration while preserving its open state", () => {
    setCanvasTestState({ canvasMode: "freeform", tool: "select" });
    const { rerender } = render(<Inspector />);

    fireEvent.click(screen.getByRole("button", { name: "Toggle inspector" }));
    expect(screen.queryByTestId("canvas-inspector-panel")).not.toBeInTheDocument();

    rerender(<Inspector available={false} />);
    expect(
      screen.queryByRole("button", { name: "Toggle inspector" })
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("canvas-inspector-panel")).not.toBeInTheDocument();

    rerender(<Inspector available />);
    expect(screen.getByRole("button", { name: "Toggle inspector" })).toBeInTheDocument();
    expect(screen.queryByTestId("canvas-inspector-panel")).not.toBeInTheDocument();
  });

  it("uses one persistent swatch trigger and one global open state", () => {
    replaceCanvasGrid([]);
    setCanvasTestState({
      canvasMode: "freeform",
      tool: "select",
      brushColor: "#123456",
      staticGridSelection: createGridSelectionState({ x: 0, y: 0 }),
    });
    render(<Inspector />);

    const toggle = screen.getByRole("button", { name: "Toggle inspector" });
    const swatch = screen.getByTestId("canvas-inspector-swatch");
    expect(toggle.querySelector("svg")).not.toBeInTheDocument();
    expect(swatch).toHaveClass("rounded-[3px]");
    expect(swatch).toHaveStyle({ backgroundColor: "#123456" });
    const panel = screen.getByTestId("canvas-inspector-panel");
    const content = screen.getByTestId("canvas-inspector-content");
    const colorPicker = screen.getByTestId("color-picker-header").parentElement;
    expect(panel).toHaveClass(
      "w-[min(10rem,calc(100vw-2rem))]",
      "overflow-hidden"
    );
    expect(content).toHaveClass("gap-2", "p-2.5");
    expect(content).not.toHaveClass("gap-0");
    expect(content).not.toHaveClass("px-1", "py-2");
    expect(colorPicker).toHaveClass("w-full", "p-0");
    expect(colorPicker).not.toHaveClass("px-1", "py-1.5");
    expect(
      screen.getByRole("toolbar", { name: "Selection text formatting" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Toggle bold" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Toggle bold" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    expect(screen.getAllByTestId("canvas-inspector-panel")).toHaveLength(1);

    fireEvent.click(toggle);
    expect(screen.queryByTestId("canvas-inspector-panel")).not.toBeInTheDocument();

    act(() => setCanvasTestState({ canvasMode: "structured" }));
    expect(screen.queryByTestId("canvas-inspector-panel")).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.getByTestId("canvas-inspector-panel")).toBeVisible();
    expect(screen.getByRole("toolbar", { name: "Arrange" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bring Forward" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Toggle bold" })
    ).not.toBeInTheDocument();
    act(() => setCanvasTestState({ canvasMode: "freeform" }));
    expect(screen.getByTestId("canvas-inspector-panel")).toBeVisible();
  });

  it("starts expanded on desktop and collapsed on phone by product policy", () => {
    setCanvasTestState({ canvasMode: "structured", tool: "select" });
    const view = render(<Inspector formFactor="desktop" />);
    expect(screen.getByTestId("canvas-inspector-panel")).toBeVisible();

    view.rerender(<Inspector formFactor="phone" />);
    expect(screen.queryByTestId("canvas-inspector-panel")).not.toBeInTheDocument();
  });

  it("automatically closes for Hand in every canvas mode without reopening on tool exit", () => {
    setCanvasTestState({ canvasMode: "freeform", tool: "select" });
    render(<Inspector />);
    expect(screen.getByTestId("canvas-inspector-panel")).toBeVisible();

    act(() => canvasCommands.tools.set("pan"));
    expect(useEditorStore.getState().tool).toBe("pan");
    expect(screen.queryByTestId("canvas-inspector-panel")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Toggle inspector" })).toBeDisabled();

    act(() => canvasCommands.tools.set("select"));
    expect(screen.queryByTestId("canvas-inspector-panel")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Toggle inspector" }));
    expect(screen.getByTestId("canvas-inspector-panel")).toBeVisible();

    act(() => setCanvasTestState({ canvasMode: "structured", tool: "select" }));
    act(() => canvasCommands.tools.set("pan"));
    expect(useEditorStore.getState().tool).toBe("pan");
    expect(screen.queryByTestId("canvas-inspector-panel")).not.toBeInTheDocument();

    act(() => {
      useEditorStore.getState().createCanvasSession("slide");
      canvasCommands.tools.set("select");
    });
    fireEvent.click(screen.getByRole("button", { name: "Toggle inspector" }));
    expect(screen.getByTestId("canvas-inspector-panel")).toBeVisible();
    act(() => canvasCommands.tools.set("pan"));
    expect(screen.queryByTestId("canvas-inspector-panel")).not.toBeInTheDocument();
  });

  it("owns the inspector chord and Escape across canvas modes", () => {
    setCanvasTestState({ canvasMode: "freeform", tool: "select" });
    render(<Inspector />);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("canvas-inspector-panel")).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    fireEvent.keyDown(window, { key: "p" });
    expect(screen.getByTestId("canvas-inspector-panel")).toBeVisible();

    act(() => setCanvasTestState({ canvasMode: "structured" }));
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    fireEvent.keyDown(window, { key: "p" });
    expect(screen.queryByTestId("canvas-inspector-panel")).not.toBeInTheDocument();
  });

  it("preserves a structured text range when opening on phone", () => {
    setCanvasTestState({
      canvasMode: "structured",
      tool: "select",
      selectedStructuredNodeIds: ["text-1"],
      editingStructuredTextNodeId: "text-1",
      structuredTextSelection: { nodeId: "text-1", anchor: 0, focus: 2 },
      structuredScene: [
        {
          id: "text-1",
          type: "text",
          order: 1,
          position: { x: 0, y: 0 },
          text: "AB",
          style: { color: "#ffffff", attrs: { bold: true } },
        },
      ],
    });
    render(<Inspector formFactor="phone" />);

    fireEvent.click(screen.getByRole("button", { name: "Toggle inspector" }));

    expect(useEditorStore.getState().interaction.structuredTextSelection).toEqual({
      nodeId: "text-1",
      anchor: 0,
      focus: 2,
    });
    expect(screen.getByRole("toolbar", { name: "Arrange" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bring Forward" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Toggle bold" })
    ).not.toBeInTheDocument();
  });

  it("closes the hex editor with Escape without closing the inspector", () => {
    setCanvasTestState({ canvasMode: "structured", tool: "select" });
    render(<Inspector />);

    fireEvent.click(screen.getByRole("button", { name: /^Hex:/ }));
    const input = screen.getByRole("textbox", { name: "Hex" });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryByRole("textbox", { name: "Hex" })).not.toBeInTheDocument();
    expect(screen.getByTestId("canvas-inspector-panel")).toBeVisible();
  });

  it("applies freeform foreground and background colors to defaults and selections", () => {
    act(() => {
      replaceCanvasGrid([["0,0", { char: "A", color: "#111111" }]]);
      setCanvasTestState({
        canvasMode: "freeform",
        tool: "select",
        brushColor: "#111111",
        brushBackgroundColor: "#222222",
        staticGridSelection: selectedCell,
      });
    });
    render(<Inspector />);

    fireEvent.click(screen.getByRole("button", { name: "Pick ANSI color #ff0000" }));
    expect(useEditorStore.getState().brushColor).toBe("#ff0000");
    expect(useEditorStore.getState().contentSurface.reader.materialize().get("0,0")?.color).toBe("#ff0000");
    fireEvent.click(screen.getByRole("button", { name: "Restore default color" }));
    expect(useEditorStore.getState().brushColor).toBe("#000000");
    expect(useEditorStore.getState().contentSurface.reader.materialize().get("0,0")?.color).toBe("#000000");

    act(() => setCanvasTestState({ tool: "bg" }));
    expect(screen.getByTestId("canvas-inspector-swatch")).toHaveStyle({
      backgroundColor: "#222222",
    });
    fireEvent.click(screen.getByRole("button", { name: "Pick ANSI color #0000ff" }));
    expect(useEditorStore.getState().brushBackgroundColor).toBe("#0000ff");
    expect(useEditorStore.getState().contentSurface.reader.materialize().get("0,0")?.bgColor).toBe("#0000ff");
    fireEvent.click(screen.getByRole("button", { name: "Restore default color" }));
    expect(useEditorStore.getState().brushBackgroundColor).toBe("#000000");
    expect(useEditorStore.getState().contentSurface.reader.materialize().get("0,0")?.bgColor).toBe("#000000");
  });

  it("toggles grid text attributes independently and exposes mixed state", () => {
    const selectedRow = selectGridRange(
      createGridSelectionState({ x: 0, y: 0 }),
      { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } },
      { activeCell: "start" }
    );
    act(() => {
      replaceCanvasGrid([
        [
          "0,0",
          {
            char: "A",
            color: "#ffffff",
            attrs: { bold: true, strike: true },
          },
        ],
        [
          "1,0",
          { char: "B", color: "#ffffff", attrs: { inverse: true } },
        ],
      ]);
      setCanvasTestState({
        canvasMode: "freeform",
        tool: "select",
        staticGridSelection: selectedRow,
      });
    });
    render(<Inspector />);

    const bold = screen.getByRole("button", { name: "Toggle bold" });
    const italic = screen.getByRole("button", { name: "Toggle italic" });
    const strike = screen.getByRole("button", { name: "Toggle strikethrough" });
    const inverse = screen.getByRole("button", { name: "Toggle inverse" });
    const footer = screen.getByTestId("canvas-inspector-footer");
    const toolbar = screen.getByRole("toolbar", {
      name: "Selection text formatting",
    });
    expect(footer).toHaveClass(
      "flex",
      "items-center",
      "justify-between",
      "gap-0.5"
    );
    expect(footer).not.toHaveClass("pt-1.5", "pb-1.5");
    expect(footer).not.toHaveClass("px-1", "mx-1");
    expect(toolbar).toHaveAttribute("data-surface-kind", "embedded");
    expect(toolbar).toHaveClass(
      "flex",
      "w-full",
      "items-center",
      "justify-between",
      "gap-0.5",
      "p-px"
    );
    expect(bold).toHaveAttribute("data-size", "xs");
    expect(bold).toHaveAttribute("aria-pressed", "mixed");
    expect(italic).toHaveAttribute("aria-pressed", "false");
    expect(strike).toHaveAttribute("aria-pressed", "mixed");
    expect(inverse).toHaveAttribute("aria-pressed", "mixed");
    expect(toolbar.querySelectorAll('button[data-size="xs"]')).toHaveLength(5);

    fireEvent.click(strike);
    expect(useEditorStore.getState().contentSurface.reader.materialize().get("0,0")?.attrs?.strike).toBe(true);
    expect(useEditorStore.getState().contentSurface.reader.materialize().get("1,0")?.attrs).toMatchObject({
      strike: true,
      inverse: true,
    });

    fireEvent.click(inverse);
    expect(useEditorStore.getState().contentSurface.reader.materialize().get("0,0")?.attrs).toMatchObject({
      bold: true,
      strike: true,
      inverse: true,
    });
    expect(useEditorStore.getState().contentSurface.reader.materialize().get("1,0")?.attrs?.inverse).toBe(true);

    fireEvent.click(italic);
    expect(useEditorStore.getState().contentSurface.reader.materialize().get("0,0")?.attrs).toMatchObject({
      bold: true,
      italic: true,
    });
    expect(useEditorStore.getState().contentSurface.reader.materialize().get("1,0")?.attrs).toMatchObject({
      italic: true,
    });
    expect(useEditorStore.getState().contentSurface.reader.materialize().get("1,0")?.attrs?.bold).toBeUndefined();

    fireEvent.click(bold);
    expect(useEditorStore.getState().contentSurface.reader.materialize().get("0,0")?.attrs?.bold).toBe(true);
    expect(useEditorStore.getState().contentSurface.reader.materialize().get("1,0")?.attrs?.bold).toBe(true);
  });

  it("applies structured semantic colors and exposes layer arrangement", () => {
    setCanvasTestState({ canvasMode: "structured", tool: "select" });
    canvasCommands.structured.applyScene(
      [
        {
          id: "box-1",
          type: "box",
          order: 1,
          start: { x: 2, y: 3 },
          end: { x: 6, y: 5 },
          style: { color: "#ffffff", bgColor: "#eeeeee" },
        },
        {
          id: "bg-1",
          type: "bg",
          order: 2,
          start: { x: 0, y: 0 },
          end: { x: 8, y: 6 },
          style: { color: "#000000", bgColor: "#111111" },
        },
      ],
      "reset"
    );
    setCanvasTestState({
      selectedStructuredNodeIds: ["box-1", "bg-1"],
    });
    render(<Inspector />);

    fireEvent.click(screen.getByRole("button", { name: "Pick ANSI color #ff0000" }));
    const [box, bg] = useEditorStore.getState().structuredScene;
    expect(box.style).toMatchObject({
      color: "#ff0000",
      bgColor: "#eeeeee",
    });
    expect(bg.style).toMatchObject({
      color: "#000000",
      bgColor: "#ff0000",
    });
    fireEvent.click(screen.getByRole("button", { name: "Restore default color" }));
    const [resetBox, resetBg] = useEditorStore.getState().structuredScene;
    expect(useEditorStore.getState().brushColor).toBe("#000000");
    expect(resetBox.style).toMatchObject({
      color: "#000000",
      bgColor: "#eeeeee",
    });
    expect(resetBg.style).toMatchObject({
      color: "#000000",
      bgColor: "#000000",
    });
    expect(screen.getByRole("toolbar", { name: "Arrange" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send to Back" })).toBeInTheDocument();
    expect(screen.queryByText("Geometry")).not.toBeInTheDocument();
  });

  it("restores a structured text range and the creation default together", () => {
    setCanvasTestState({
      canvasMode: "structured",
      tool: "select",
      brushColor: "#ff0000",
      selectedStructuredNodeIds: ["text-1"],
      editingStructuredTextNodeId: "text-1",
      structuredTextSelection: { nodeId: "text-1", anchor: 1, focus: 4 },
      structuredScene: [
        {
          id: "text-1",
          type: "text",
          order: 1,
          position: { x: 2, y: 3 },
          text: "Label",
          style: { color: "#ffffff" },
        },
      ],
    });
    render(<Inspector />);

    fireEvent.click(screen.getByRole("button", { name: "Restore default color" }));

    expect(useEditorStore.getState().brushColor).toBe("#000000");
    expect(useEditorStore.getState().structuredScene[0]).toMatchObject({
      style: { color: "#ffffff" },
      styleRanges: [
        {
          start: 1,
          end: 4,
          style: { color: "#000000" },
        },
      ],
    });
  });

  it("remains inspectable but immutable in read-only sessions", () => {
    setCanvasTestState({
      canvasMode: "structured",
      tool: "select",
      selectedStructuredNodeIds: ["box-1"],
      structuredScene: [
        {
          id: "box-1",
          type: "box",
          order: 1,
          start: { x: 0, y: 0 },
          end: { x: 2, y: 2 },
          style: { color: "#ffffff" },
        },
      ],
    });
    render(<Inspector readOnly />);

    expect(screen.getByTestId("canvas-inspector-panel")).toBeVisible();
    expect(
      screen.getByTestId("canvas-inspector-panel").querySelector('[aria-disabled="true"]')
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bring Forward" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Restore default color" }));
    expect(useEditorStore.getState().structuredScene[0]?.style.color).toBe("#ffffff");
  });

  it("reuses grid appearance controls for the active slide", () => {
    act(() => {
      useEditorStore.getState().createCanvasSession("slide", {
        slideSize: { columns: 4, rows: 2 },
      });
      replaceCanvasGrid([["0,0", { char: "A", color: "#111111" }]]);
      setCanvasTestState({
        tool: "select",
        brushColor: "#111111",
        brushBackgroundColor: "#222222",
        staticGridSelection: selectedCell,
      });
    });
    const firstSlideId = useEditorStore.getState().slideDeck!.activeSlideId;
    render(<Inspector />);

    expect(screen.getByRole("button", { name: "Toggle inspector" })).toBeVisible();
    expect(screen.getByTestId("canvas-inspector-panel")).toBeVisible();
    expect(
      screen.getByRole("toolbar", { name: "Selection text formatting" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("toolbar", { name: "Arrange" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Pick ANSI color #ff0000" }));
    expect(useEditorStore.getState().brushColor).toBe("#ff0000");
    expect(useEditorStore.getState().contentSurface.reader.materialize().get("0,0")?.color).toBe("#ff0000");
    expect(useEditorStore.getState().slideDeck?.slides[0]).not.toHaveProperty("grid");
    expect(
      defaultCanvasDocuments
        .getContentReader(
          useEditorStore.getState().activeCanvasId,
          firstSlideId
        )
        ?.getCell({ x: 0, y: 0 })?.color
    ).toBe("#ff0000");

    act(() => {
      useEditorStore.getState().addSlide();
      replaceCanvasGrid([["0,0", { char: "B", color: "#222222" }]]);
      setCanvasTestState({
        staticGridSelection: selectedCell,
      });
    });
    const secondSlideId = useEditorStore.getState().slideDeck!.activeSlideId;
    fireEvent.click(screen.getByRole("button", { name: "Pick ANSI color #00ff00" }));
    expect(
      defaultCanvasDocuments
        .getContentReader(useEditorStore.getState().activeCanvasId, firstSlideId)
        ?.getCell({ x: 0, y: 0 })?.color
    ).toBe("#ff0000");
    expect(
      defaultCanvasDocuments
        .getContentReader(useEditorStore.getState().activeCanvasId, secondSlideId)
        ?.getCell({ x: 0, y: 0 })?.color
    ).toBe("#00ff00");

    act(() => canvasCommands.tools.set("bg"));
    fireEvent.click(screen.getByRole("button", { name: "Pick ANSI color #0000ff" }));
    expect(useEditorStore.getState().brushBackgroundColor).toBe("#0000ff");
    expect(useEditorStore.getState().contentSurface.reader.materialize().get("0,0")?.bgColor).toBe("#0000ff");

    fireEvent.click(screen.getByRole("button", { name: "Restore default color" }));
    expect(useEditorStore.getState().brushBackgroundColor).toBe("#000000");
    expect(useEditorStore.getState().contentSurface.reader.materialize().get("0,0")?.bgColor).toBe("#000000");
  });

  it("keeps the Slides formatting row visible without a selection", () => {
    act(() => {
      useEditorStore.getState().createCanvasSession("slide", {
        slideSize: { columns: 4, rows: 2 },
      });
      setCanvasTestState({
        tool: "select",
        staticGridSelection: createGridSelectionState({ x: 0, y: 0 }),
      });
    });
    render(<Inspector />);

    expect(
      screen.getByRole("toolbar", { name: "Selection text formatting" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Toggle bold" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Toggle italic" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Toggle underline" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Toggle strikethrough" })
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Toggle inverse" })).toBeDisabled();
  });

  it("keeps the Slides inspector immutable in read-only sessions", () => {
    act(() => {
      useEditorStore.getState().createCanvasSession("slide", {
        slideSize: { columns: 4, rows: 2 },
      });
      replaceCanvasGrid([["0,0", { char: "A", color: "#111111" }]]);
      setCanvasTestState({
        tool: "select",
        brushColor: "#111111",
        staticGridSelection: selectedCell,
      });
    });
    render(<Inspector readOnly />);

    expect(screen.getByTestId("canvas-inspector-panel")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Pick ANSI color #ff0000" }));
    expect(useEditorStore.getState().brushColor).toBe("#111111");
    expect(useEditorStore.getState().contentSurface.reader.materialize().get("0,0")?.color).toBe("#111111");
  });
});
