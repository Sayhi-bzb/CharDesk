import { afterEach, describe, expect, it, vi } from "vitest";
import { TestCanvasContentSurface } from "@/domains/canvas/testing";
import { act, createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { CanvasEditor as CanvasEditorUnderTest } from "@/widgets/canvas-editor";
import { useCanvasInteraction } from "@/widgets/canvas-editor/hooks/useCanvasInteraction";
import { useCanvasRenderer } from "@/widgets/canvas-editor/hooks/useCanvasRenderer";
import {
  setCanvasTestState,
  testingCanvasRuntime,
  canvasCommands,
  undoCanvas,
  useEditorStore,
} from "@/domains/canvas/testing";
import { replaceCanvasGrid as applyFreeformSnapshotToYMaps } from "@/domains/canvas/testing";
import {
  createGridSelectionState,
  getGridSelectionRanges,
  selectGridRange,
} from "@/domains/selection/public";
import type { Point } from "@/shared/types";
import {
  STRUCTURED_TEMPLATE_MIME,
  buildStructuredTemplateNodes,
  setActiveStructuredTemplateDragId,
} from "@/domains/structured-content/public";
import { normalizeScene } from "@/domains/structured-content/public";
import { clipboard } from "@/shared/services/effects";
import {
  SHORTCUT_PRIORITY,
  ShortcutProvider,
  useShortcutLayer,
} from "@/shared/shortcuts/dispatcher";
import { CanvasCameraManager } from "@/widgets/canvas-editor/engine/CanvasCameraManager";
import { DEFAULT_GRID_RENDER_METRICS } from "@/shared/metrics";
import type { SlideDeckSnapshot } from "@/domains/slides/public";

const useSizeMock = vi.hoisted(() => vi.fn());

vi.mock("ahooks", () => ({
  useSize: useSizeMock,
}));

vi.mock("@/widgets/canvas-editor/hooks/useCanvasRenderer", () => ({
  useCanvasRenderer: vi.fn(),
}));

const handleDoubleClickMock = vi.fn();
const activateInteractionOwnerMock = vi.fn(() => false);

const createRangeSelection = (start: Point, end: Point) =>
  selectGridRange(
    createGridSelectionState(start),
    { start, end },
    { activeCell: "start" }
  );

const stripNodeIds = <T extends { id: string; component?: { instanceId: string } }>(
  nodes: T[]
) =>
  nodes.map(({ id, ...node }) => {
    void id;
    return {
      ...node,
      component: node.component
        ? { ...node.component, instanceId: "<component-instance>" }
        : undefined,
    };
  });

const waitForAnimationFrame = () =>
  new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });

const focusCanvasInput = (container: HTMLElement) => {
  const surface = container.querySelector<HTMLElement>(
    '[data-testid="canvas-editor-surface"]'
  );
  expect(surface).not.toBeNull();
  fireEvent.pointerDown(surface!);
};

const fireDragOverAndFlush = async (
  root: HTMLElement,
  event: Event
) => {
  await act(async () => {
    fireEvent(root, event);
    await waitForAnimationFrame();
  });
};

vi.mock("@/widgets/canvas-editor/hooks/useCanvasInteraction", () => ({
  useCanvasInteraction: vi.fn(() => ({
    bind: {},
    activateInteractionOwner: activateInteractionOwnerMock,
    draggingSelection: null,
    handleDoubleClick: handleDoubleClickMock,
  })),
}));

vi.mock("@/widgets/canvas-editor/Minimap", () => ({
  Minimap: () => null,
}));

function CanvasEditor(props: ComponentProps<typeof CanvasEditorUnderTest>) {
  return (
    <ShortcutProvider>
      <CanvasEditorUnderTest {...props} />
    </ShortcutProvider>
  );
}

function ModifiedArrowHijacker({ onClaim }: { onClaim: () => void }) {
  useShortcutLayer({
    id: "modified-arrow-hijacker",
    priority: SHORTCUT_PRIORITY.globalAction,
    onKeyDown: (input) => {
      if (
        !(input.modifiers.ctrl || input.modifiers.meta) ||
        !input.key.startsWith("Arrow")
      ) {
        return;
      }
      onClaim();
      return { claimed: true, preventDefault: true };
    },
  });
  return null;
}

describe("CanvasEditor focus management", () => {
  const initialState = useEditorStore.getState();

  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(useCanvasInteraction).mockClear();
    vi.mocked(useCanvasRenderer).mockClear();
    handleDoubleClickMock.mockClear();
    activateInteractionOwnerMock.mockClear();
    useSizeMock.mockReset();
    setActiveStructuredTemplateDragId(null);
    useEditorStore.setState(initialState, true);
    applyFreeformSnapshotToYMaps([]);
  });

  it("applies the interaction cursor to the canvas surface", () => {
    vi.mocked(useCanvasInteraction).mockReturnValueOnce({
      bind: {},
      activateInteractionOwner: activateInteractionOwnerMock,
      cursor: "pointer",
      draggingSelection: null,
      handleDoubleClick: handleDoubleClickMock,
      colorSourceChoice: null,
      selectColorSource: vi.fn(),
      cancelColorSourceChoice: vi.fn(),
    } as unknown as ReturnType<typeof useCanvasInteraction>);

    render(<CanvasEditor onUndo={vi.fn()} onRedo={vi.fn()} />);

    expect(screen.getByTestId("canvas-editor-surface")).toHaveStyle({
      cursor: "pointer",
    });
  });

  it("keeps canvas layers stable and passes active canvas identity to the renderer", () => {
    const { rerender } = render(
      <CanvasEditor onUndo={vi.fn()} onRedo={vi.fn()} />
    );
    const initialCall = vi.mocked(useCanvasRenderer).mock.calls.at(-1);
    const initialLayers = initialCall?.[0];

    expect(initialLayers).toBeDefined();
    expect(initialCall?.[3].activeCanvasId).toBe(
      useEditorStore.getState().activeCanvasId
    );

    rerender(<CanvasEditor onUndo={vi.fn()} onRedo={vi.fn()} />);
    expect(vi.mocked(useCanvasRenderer).mock.calls.at(-1)?.[0]).toBe(
      initialLayers
    );

    act(() => {
      setCanvasTestState({ activeCanvasId: "renderer-target-canvas" });
    });

    const switchedCall = vi.mocked(useCanvasRenderer).mock.calls.at(-1);
    expect(switchedCall?.[0]).toBe(initialLayers);
    expect(switchedCall?.[3].activeCanvasId).toBe("renderer-target-canvas");
  });

  it("fits the active slide on first render even when the session restored a viewport", async () => {
    useSizeMock.mockReturnValue({ width: 1000, height: 700 });
    const fitBounds = vi
      .spyOn(CanvasCameraManager.prototype, "fitBounds")
      .mockImplementation(() => undefined);
    const slideDeck: SlideDeckSnapshot = {
      activeSlideId: "slide-2",
      slides: [
        {
          id: "slide-1",
          name: "Intro",
          size: { columns: 80, rows: 24 },
          grid: [],
        },
        {
          id: "slide-2",
          name: "Active",
          size: { columns: 100, rows: 30 },
          grid: [["0,0", { char: "A", color: "#000000" }]],
        },
      ],
    };
    setCanvasTestState({
      activeCanvasId: "slides-restored",
      canvasMode: "slide",
      slideDeck,
      offset: { x: -100_000, y: -100_000 },
      zoom: 5,
      contentSurface: new TestCanvasContentSurface(slideDeck.slides[1].grid),
      canvasSessions: [
        {
          id: "slides-restored",
          name: "Slides",
          mode: "slide",
          viewport: { offset: { x: -100_000, y: -100_000 }, zoom: 5 },
        },
      ],
    });

    render(<CanvasEditor onUndo={vi.fn()} onRedo={vi.fn()} />);

    await waitFor(() =>
      expect(fitBounds).toHaveBeenCalledWith(
        {
          x: 0,
          y: 0,
          width: 100 * DEFAULT_GRID_RENDER_METRICS.cellWidth,
          height: 30 * DEFAULT_GRID_RENDER_METRICS.cellHeight,
        },
        { width: 1000, height: 700 },
        { padding: 48, insets: undefined }
      )
    );

    fitBounds.mockClear();
    act(() => setCanvasTestState({ brushColor: "#123456" }));
    expect(fitBounds).not.toHaveBeenCalled();
  });

  it("claims input focus on pointerdown before selection state changes", () => {
    setCanvasTestState({
      textCursor: null,
      canvasMode: "freeform",
    });

    const { container, getByTestId } = render(
      <CanvasEditor onUndo={vi.fn()} onRedo={vi.fn()} />
    );

    const textarea = container.querySelector("textarea");

    expect(textarea).not.toBeNull();
    expect(document.activeElement).not.toBe(textarea);

    const pointerDown = createEvent.pointerDown(
      getByTestId("canvas-editor-surface")
    );
    fireEvent(getByTestId("canvas-editor-surface"), pointerDown);

    expect(pointerDown.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(textarea);
    expect(textarea).toHaveValue("\u00a0");
    expect(textarea?.selectionStart).toBe(0);
    expect(textarea?.selectionEnd).toBe(1);
  });

  it("recreates managed input on session change without losing canvas focus", () => {
    const { container, getByTestId } = render(
      <CanvasEditor onUndo={vi.fn()} onRedo={vi.fn()} />
    );
    fireEvent.pointerDown(getByTestId("canvas-editor-surface"));
    const previous = container.querySelector("textarea");
    expect(document.activeElement).toBe(previous);

    act(() => {
      setCanvasTestState({ activeCanvasId: "managed-input-next-canvas" });
    });

    const next = container.querySelector("textarea");
    expect(next).not.toBe(previous);
    expect(document.activeElement).toBe(next);
    expect(next).toHaveValue("\u00a0");
  });

  it("activates the pane interaction owner before switching its session", () => {
    const order: string[] = [];
    activateInteractionOwnerMock.mockImplementation(() => {
      order.push("port");
      return true;
    });
    const onActivate = vi.fn(() => order.push("session"));
    const { getByTestId } = render(
      <CanvasEditor
        active={false}
        onActivate={onActivate}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
      />
    );

    fireEvent.pointerDown(getByTestId("canvas-editor-surface"));

    expect(order.slice(0, 2)).toEqual(["port", "session"]);
    expect(activateInteractionOwnerMock).toHaveBeenCalledTimes(2);
    expect(onActivate).toHaveBeenCalledTimes(2);
  });

  it("uses Space as a temporary pan override in navigate mode without changing a range", () => {
    const selection = createRangeSelection({ x: 1, y: 1 }, { x: 4, y: 2 });
    setCanvasTestState({
      canvasMode: "freeform",
      tool: "select",
      staticGridSelection: selection,
      staticGridEditMode: "navigate",
      textCursor: null,
    });
    const { container, getByTestId } = render(
      <CanvasEditor onUndo={vi.fn()} onRedo={vi.fn()} />
    );
    fireEvent.pointerDown(getByTestId("canvas-editor-surface"));
    const textarea = container.querySelector("textarea")!;
    const keydown = createEvent.keyDown(textarea, {
      key: " ",
      code: "Space",
    });

    fireEvent(textarea, keydown);

    expect(keydown.defaultPrevented).toBe(true);
    expect(vi.mocked(useCanvasInteraction).mock.calls.at(-1)?.[0].tool).toBe("pan");
    expect(useEditorStore.getState().interaction.staticGridSelection).toEqual(selection);

    fireEvent.keyDown(textarea, { key: " ", code: "Space", repeat: true });
    expect(vi.mocked(useCanvasInteraction).mock.calls.at(-1)?.[0].tool).toBe("pan");

    fireEvent.keyUp(textarea, { key: " ", code: "Space" });
    expect(vi.mocked(useCanvasInteraction).mock.calls.at(-1)?.[0].tool).toBe("select");
    expect(useEditorStore.getState().interaction.staticGridSelection).toEqual(selection);
  });

  it("handles an ordinary character immediately after selecting the canvas", () => {
    setCanvasTestState({
      canvasMode: "freeform",
      textCursor: null,
      staticGridSelection: {
        mode: "range",
        activeCell: { x: 1, y: 0 },
        anchorCell: { x: 0, y: 0 },
        primaryRange: { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } },
        additionalRanges: [],
      },
      staticGridEditMode: "navigate",
    });
    applyFreeformSnapshotToYMaps([
      ["0,0", { char: "X", color: "#ffffff" }],
      ["1,0", { char: "Y", color: "#ffffff" }],
    ]);

    const { container, getByTestId } = render(
      <CanvasEditor onUndo={vi.fn()} onRedo={vi.fn()} />
    );
    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();

    fireEvent.pointerDown(getByTestId("canvas-editor-surface"));
    const keyDown = createEvent.keyDown(textarea!, { key: "A" });
    fireEvent(textarea!, keyDown);

    expect(keyDown.defaultPrevented).toBe(true);
    expect(useEditorStore.getState().contentSurface.reader.materialize().get("0,0")?.char).toBe("A");
    expect(useEditorStore.getState().contentSurface.reader.materialize().get("1,0")?.char).toBe("A");
  });

  it("runs redo shortcuts from the managed textarea", () => {
    setCanvasTestState({
      textCursor: { x: 0, y: 0 },
      canvasMode: "freeform",
    });
    useEditorStore.getState().writeTextString("A");
    expect(undoCanvas()).toBe(true);
    expect(useEditorStore.getState().canRedo).toBe(true);

    setCanvasTestState({
      staticGridSelection: createRangeSelection({ x: 0, y: 0 }, { x: 1, y: 1 }),
      textCursor: null,
      canvasMode: "freeform",
    });
    const onRedo = vi.fn();
    const { container } = render(
      <CanvasEditor onUndo={vi.fn()} onRedo={onRedo} />
    );
    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();
    focusCanvasInput(container);

    const ctrlY = createEvent.keyDown(textarea!, {
      key: "y",
      ctrlKey: true,
    });
    fireEvent(textarea!, ctrlY);

    expect(ctrlY.defaultPrevented).toBe(true);
    expect(onRedo).toHaveBeenCalledTimes(1);

    const ctrlShiftZ = createEvent.keyDown(textarea!, {
      key: "z",
      ctrlKey: true,
      shiftKey: true,
    });
    fireEvent(textarea!, ctrlShiftZ);

    expect(ctrlShiftZ.defaultPrevented).toBe(true);
    expect(onRedo).toHaveBeenCalledTimes(2);
  });

  it("restores Canvas undo after the application regains focus", () => {
    setCanvasTestState({
      textCursor: { x: 0, y: 0 },
      canvasMode: "freeform",
    });
    useEditorStore.getState().writeTextString("A");
    expect(useEditorStore.getState().canUndo).toBe(true);

    const onUndo = vi.fn();
    const { container } = render(
      <CanvasEditor onUndo={onUndo} onRedo={vi.fn()} />
    );
    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();
    focusCanvasInput(container);

    act(() => {
      window.dispatchEvent(new Event("blur"));
      window.dispatchEvent(new Event("focus"));
    });
    expect(useEditorStore.getState().canUndo).toBe(true);
    expect(document.activeElement).toBe(textarea);

    const metaZ = createEvent.keyDown(textarea!, {
      key: "z",
      metaKey: true,
    });
    fireEvent(textarea!, metaZ);

    expect(metaZ.defaultPrevented).toBe(true);
    expect(onUndo).toHaveBeenCalledOnce();
  });

  it("cuts selected structured nodes from the managed textarea shortcut", async () => {
    useEditorStore.getState().createCanvasSession("structured");
    useEditorStore.getState().applyStructuredScene(
      [
        {
          id: "shortcut-box",
          type: "box",
          order: 1,
          start: { x: 0, y: 0 },
          end: { x: 4, y: 3 },
          style: { color: "#ffffff" },
        },
      ],
      false
    );
    canvasCommands.interaction.setSelectedStructuredNodeIds(["shortcut-box"]);
    const writeText = vi.spyOn(clipboard, "writeText").mockResolvedValue(true);
    const { container } = render(
      <CanvasEditor onUndo={vi.fn()} onRedo={vi.fn()} />
    );
    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();
    focusCanvasInput(container);

    fireEvent.keyDown(textarea!, { key: "x", metaKey: true });

    await vi.waitFor(() => {
      expect(useEditorStore.getState().structuredScene).toEqual([]);
    });
    expect(writeText).toHaveBeenCalledTimes(1);
  });

  it("falls back to the Clipboard API when Meta+X produces no cut event", async () => {
    setCanvasTestState({
      canvasMode: "freeform",
      textCursor: null,
      staticGridSelection: createRangeSelection({ x: 0, y: 0 }, { x: 1, y: 0 }),
    });
    applyFreeformSnapshotToYMaps([
      ["0,0", { char: "A", color: "#ffffff" }],
      ["1,0", { char: "B", color: "#ffffff" }],
    ]);
    const writeText = vi.spyOn(clipboard, "writeText").mockResolvedValue(true);
    const { container } = render(
      <CanvasEditor onUndo={vi.fn()} onRedo={vi.fn()} />
    );
    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();
    focusCanvasInput(container);

    fireEvent.keyDown(textarea!, { key: "x", metaKey: true });

    await vi.waitFor(() => {
      expect(useEditorStore.getState().contentSurface.reader.materialize().has("0,0")).toBe(false);
      expect(useEditorStore.getState().contentSurface.reader.materialize().has("1,0")).toBe(false);
    });
    expect(writeText).toHaveBeenCalledWith("AB");
  });

  it("copies a range while the managed textarea is reconciling a transient blur", async () => {
    setCanvasTestState({
      canvasMode: "freeform",
      textCursor: null,
      staticGridSelection: createRangeSelection({ x: 0, y: 0 }, { x: 1, y: 0 }),
    });
    applyFreeformSnapshotToYMaps([
      ["0,0", { char: "A", color: "#ffffff" }],
      ["1,0", { char: "B", color: "#ffffff" }],
    ]);
    const writeText = vi.spyOn(clipboard, "writeText").mockResolvedValue(true);
    const { container } = render(
      <CanvasEditor onUndo={vi.fn()} onRedo={vi.fn()} />
    );
    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();
    focusCanvasInput(container);

    act(() => {
      textarea!.blur();
      fireEvent.keyDown(document.body, { key: "c", metaKey: true });
    });

    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith("AB"));
    expect(document.activeElement).toBe(textarea);
  });

  it("copies a Blackboard range without granting mutation capability", async () => {
    setCanvasTestState({
      canvasMode: "freeform",
      textCursor: null,
      contentSurface: new TestCanvasContentSurface([
        ["0,0", { char: "A", color: "#ffffff" }],
        ["1,0", { char: "B", color: "#ffffff" }],
      ]),
      staticGridSelection: createRangeSelection({ x: 0, y: 0 }, { x: 1, y: 0 }),
    });
    const writeText = vi.spyOn(clipboard, "writeText").mockResolvedValue(true);
    const { container } = render(
      <CanvasEditor
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        capabilities={{ navigate: true, select: true, copy: true, mutateContent: false }}
      />
    );
    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();
    focusCanvasInput(container);

    fireEvent.keyDown(textarea!, { key: "c", metaKey: true });

    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith("AB"));
    expect(useEditorStore.getState().contentSurface.reader.materialize().size).toBe(2);
  });

  it("releases Canvas input ownership when focus moves to an external control", async () => {
    setCanvasTestState({
      canvasMode: "freeform",
      textCursor: null,
      staticGridSelection: createRangeSelection({ x: 0, y: 0 }, { x: 1, y: 0 }),
    });
    applyFreeformSnapshotToYMaps([
      ["0,0", { char: "A", color: "#ffffff" }],
      ["1,0", { char: "B", color: "#ffffff" }],
    ]);
    const writeText = vi.spyOn(clipboard, "writeText").mockResolvedValue(true);
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    const { container } = render(
      <CanvasEditor onUndo={vi.fn()} onRedo={vi.fn()} />
    );
    focusCanvasInput(container);

    outside.focus();
    await act(async () => Promise.resolve());
    act(() => {
      window.dispatchEvent(new Event("blur"));
      window.dispatchEvent(new Event("focus"));
    });
    fireEvent.keyDown(outside, { key: "c", metaKey: true });

    await new Promise((resolve) => setTimeout(resolve, 180));
    expect(document.activeElement).toBe(outside);
    expect(writeText).not.toHaveBeenCalled();
    outside.remove();
  });

  it("lets a native cut event cancel the keyboard fallback", async () => {
    setCanvasTestState({
      canvasMode: "freeform",
      textCursor: null,
      staticGridSelection: createRangeSelection({ x: 0, y: 0 }, { x: 1, y: 0 }),
    });
    applyFreeformSnapshotToYMaps([
      ["0,0", { char: "A", color: "#ffffff" }],
      ["1,0", { char: "B", color: "#ffffff" }],
    ]);
    const cutSelection = vi.spyOn(useEditorStore.getState(), "cutSelection");
    const { container } = render(
      <CanvasEditor onUndo={vi.fn()} onRedo={vi.fn()} />
    );
    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();
    focusCanvasInput(container);

    fireEvent.keyDown(textarea!, { key: "x", metaKey: true });
    fireEvent.cut(textarea!, {
      clipboardData: { setData: vi.fn() },
    });

    await vi.waitFor(() => {
      expect(useEditorStore.getState().contentSurface.reader.materialize().has("0,0")).toBe(false);
      expect(useEditorStore.getState().contentSurface.reader.materialize().has("1,0")).toBe(false);
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(cutSelection).toHaveBeenCalledTimes(1);
  });

  it("keeps the selection when the fallback clipboard write fails", async () => {
    setCanvasTestState({
      canvasMode: "freeform",
      textCursor: null,
      staticGridSelection: createRangeSelection({ x: 0, y: 0 }, { x: 1, y: 0 }),
    });
    applyFreeformSnapshotToYMaps([
      ["0,0", { char: "A", color: "#ffffff" }],
      ["1,0", { char: "B", color: "#ffffff" }],
    ]);
    const writeText = vi.spyOn(clipboard, "writeText").mockResolvedValue(false);
    const { container } = render(
      <CanvasEditor onUndo={vi.fn()} onRedo={vi.fn()} />
    );
    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();
    focusCanvasInput(container);

    fireEvent.keyDown(textarea!, { key: "x", metaKey: true });
    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledOnce();
    });

    expect(useEditorStore.getState().contentSurface.reader.materialize().get("0,0")?.char).toBe("A");
    expect(useEditorStore.getState().contentSurface.reader.materialize().get("1,0")?.char).toBe("B");
    expect(
      getGridSelectionRanges(useEditorStore.getState().interaction.staticGridSelection)
    ).toHaveLength(1);
  });

  it("falls back to the Clipboard API when Meta+V produces no paste event", async () => {
    setCanvasTestState({
      canvasMode: "freeform",
      textCursor: { x: 0, y: 0 },
    });
    applyFreeformSnapshotToYMaps([]);
    vi.spyOn(clipboard, "readItems").mockResolvedValue(null);
    const readText = vi.spyOn(clipboard, "readText").mockResolvedValue("AB");
    const { container } = render(
      <CanvasEditor onUndo={vi.fn()} onRedo={vi.fn()} />
    );
    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();
    focusCanvasInput(container);

    fireEvent.keyDown(textarea!, { key: "v", metaKey: true });

    await vi.waitFor(() => {
      expect(useEditorStore.getState().contentSurface.reader.materialize().get("0,0")?.char).toBe("A");
      expect(useEditorStore.getState().contentSurface.reader.materialize().get("1,0")?.char).toBe("B");
    });
    expect(readText).toHaveBeenCalledTimes(1);
  });

  it("suppresses a native paste event that arrives after the fallback", async () => {
    setCanvasTestState({
      canvasMode: "freeform",
      textCursor: { x: 0, y: 0 },
    });
    applyFreeformSnapshotToYMaps([]);
    vi.spyOn(clipboard, "readItems").mockResolvedValue(null);
    const readText = vi
      .spyOn(clipboard, "readText")
      .mockResolvedValue("AB\nCD");
    readText.mockClear();
    const { container } = render(
      <CanvasEditor onUndo={vi.fn()} onRedo={vi.fn()} />
    );
    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();
    focusCanvasInput(container);

    fireEvent.keyDown(textarea!, { key: "v", metaKey: true });

    await vi.waitFor(() => {
      expect(useEditorStore.getState().contentSurface.reader.materialize().get("0,0")?.char).toBe("A");
      expect(useEditorStore.getState().contentSurface.reader.materialize().get("1,0")?.char).toBe("B");
      expect(useEditorStore.getState().contentSurface.reader.materialize().get("0,1")?.char).toBe("C");
      expect(useEditorStore.getState().contentSurface.reader.materialize().get("1,1")?.char).toBe("D");
    });

    const getData = vi.fn((type: string) =>
      type === "text/plain" ? "AB\nCD" : ""
    );
    const latePaste = createEvent.paste(textarea!, {
      clipboardData: { getData },
    });
    fireEvent(textarea!, latePaste);

    expect(latePaste.defaultPrevented).toBe(true);
    expect(readText).toHaveBeenCalledOnce();
    expect(getData).not.toHaveBeenCalled();
  });

  it("focuses the managed textarea for a freeform active cell and writes input there", async () => {
    setCanvasTestState({
      canvasMode: "freeform",
      textCursor: null,
      contentSurface: new TestCanvasContentSurface(),
      staticGridSelection: {
        mode: "cell",
        activeCell: { x: 4, y: 3 },
        anchorCell: { x: 4, y: 3 },
        primaryRange: { start: { x: 4, y: 3 }, end: { x: 4, y: 3 } },
        additionalRanges: [],
      },
      staticGridEditMode: "navigate",
    });

    const { container, getByTestId } = render(
      <CanvasEditor onUndo={vi.fn()} onRedo={vi.fn()} />
    );

    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();
    fireEvent.pointerDown(getByTestId("canvas-editor-surface"));
    expect(document.activeElement).toBe(textarea);

    fireEvent.input(textarea!, { target: { value: "A" } });

    await waitFor(() => {
      expect(useEditorStore.getState().contentSurface.reader.materialize().get("4,3")).toMatchObject({
        char: "A",
      });
    });
    expect(useEditorStore.getState().interaction.textCursor).toEqual({ x: 5, y: 3 });
  });

  it("does not steal focus from an external text input", () => {
    setCanvasTestState({
      canvasMode: "freeform",
      textCursor: null,
      staticGridSelection: {
        mode: "cell",
        activeCell: { x: 2, y: 2 },
        anchorCell: { x: 2, y: 2 },
        primaryRange: { start: { x: 2, y: 2 }, end: { x: 2, y: 2 } },
        additionalRanges: [],
      },
      staticGridEditMode: "navigate",
    });
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    render(<CanvasEditor onUndo={vi.fn()} onRedo={vi.fn()} />);

    expect(document.activeElement).toBe(input);
    input.remove();
  });

  it("preserves the same focused proxy across selection changes", () => {
    setCanvasTestState({
      canvasMode: "freeform",
      textCursor: null,
      staticGridSelection: {
        mode: "cell",
        activeCell: { x: 2, y: 2 },
        anchorCell: { x: 2, y: 2 },
        primaryRange: { start: { x: 2, y: 2 }, end: { x: 2, y: 2 } },
        additionalRanges: [],
      },
      staticGridEditMode: "navigate",
    });

    const { container, getByTestId } = render(
      <CanvasEditor onUndo={vi.fn()} onRedo={vi.fn()} />
    );
    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();
    fireEvent.pointerDown(getByTestId("canvas-editor-surface"));
    expect(document.activeElement).toBe(textarea);

    act(() => {
      setCanvasTestState({
        staticGridSelection: createRangeSelection({ x: 1, y: 1 }, { x: 3, y: 2 }),
      });
    });

    expect(document.activeElement).toBe(textarea);
    expect(container.querySelector("textarea")).toBe(textarea);
    expect(textarea).toHaveValue("\u00a0");
  });

  it("claims structured text focus on pointerdown without pointerup refocus", () => {
    setCanvasTestState({
      canvasMode: "structured",
      textCursor: { x: 2, y: 0 },
      editingStructuredTextNodeId: "text-1",
      selectedStructuredNodeIds: ["text-1"],
      structuredScene: [
        {
          id: "text-1",
          type: "text",
          order: 1,
          position: { x: 0, y: 0 },
          text: "Edit",
          style: { color: "#ffffff" },
        },
      ],
    });
    const { container, getByTestId } = render(
      <CanvasEditor onUndo={vi.fn()} onRedo={vi.fn()} />
    );
    const textarea = container.querySelector("textarea");
    const focusSink = document.createElement("button");
    document.body.appendChild(focusSink);
    focusSink.focus();

    fireEvent.pointerUp(getByTestId("canvas-editor-surface"));
    expect(document.activeElement).toBe(focusSink);

    fireEvent.pointerDown(getByTestId("canvas-editor-surface"));
    expect(document.activeElement).toBe(textarea);
    focusSink.remove();
  });

  it("does not reclaim focus from canvas UI controls", () => {
    setCanvasTestState({
      canvasMode: "structured",
      textCursor: { x: 2, y: 0 },
      editingStructuredTextNodeId: "text-1",
      selectedStructuredNodeIds: ["text-1"],
    });
    const { getByTestId } = render(
      <CanvasEditor onUndo={vi.fn()} onRedo={vi.fn()} />
    );
    const canvasSurface = getByTestId("canvas-editor-surface");
    const uiButton = document.createElement("button");
    uiButton.setAttribute("data-canvas-ui", "true");
    canvasSurface.appendChild(uiButton);
    uiButton.focus();

    fireEvent.pointerDown(uiButton);

    expect(document.activeElement).toBe(uiButton);
  });

  it("forwards root double clicks to the canvas interaction hook", () => {
    const { container } = render(
      <CanvasEditor onUndo={vi.fn()} onRedo={vi.fn()} />
    );

    const root = container.firstElementChild;
    expect(root).toBeInstanceOf(HTMLDivElement);

    fireEvent.doubleClick(root!);

    expect(handleDoubleClickMock).toHaveBeenCalledTimes(1);
  });

  it("keeps a selected structured box when Delete edits its active name", () => {
    setCanvasTestState({
      canvasMode: "structured",
      textCursor: { x: 6, y: 2 },
      selectedStructuredNodeIds: ["box-1"],
      selectedStructuredBoxId: "box-1",
      structuredScene: [
        {
          id: "box-1",
          type: "box",
          order: 1,
          start: { x: 2, y: 2 },
          end: { x: 12, y: 6 },
          name: "API",
          style: { color: "#ffffff" },
        },
      ],
    });

    const { container } = render(
      <CanvasEditor onUndo={vi.fn()} onRedo={vi.fn()} />
    );

    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();

    fireEvent.keyDown(textarea!, { key: "Delete" });

    expect(useEditorStore.getState().structuredScene).toMatchObject([
      { id: "box-1", name: "AI" },
    ]);
    expect(useEditorStore.getState().interaction.selectedStructuredNodeIds).toEqual(["box-1"]);
  });

  it("renders structured layer actions behind a Layer context submenu", async () => {
    setCanvasTestState({
      canvasMode: "structured",
      textCursor: null,
      selectedStructuredNodeIds: ["box-1"],
      selectedStructuredBoxId: "box-1",
      structuredScene: [
        {
          id: "box-1",
          type: "box",
          order: 1,
          start: { x: 0, y: 0 },
          end: { x: 4, y: 4 },
          style: { color: "#ffffff" },
        },
      ],
    });

    const { container } = render(
      <CanvasEditor onUndo={vi.fn()} onRedo={vi.fn()} />
    );
    const root = container.firstElementChild as HTMLDivElement;

    fireEvent.contextMenu(root);

    expect(await screen.findByText("Layer")).toBeInTheDocument();
    expect(screen.queryByText("Bring Forward")).not.toBeInTheDocument();
    expect(screen.queryByText("Send Backward")).not.toBeInTheDocument();
  });

  it("shows only copy actions in a read-only Blackboard context menu", async () => {
    setCanvasTestState({
      canvasMode: "freeform",
      textCursor: null,
      contentSurface: new TestCanvasContentSurface([
        ["0,0", { char: "A", color: "#ffffff" }],
        ["1,0", { char: "B", color: "#ffffff" }],
      ]),
      staticGridSelection: createRangeSelection({ x: 0, y: 0 }, { x: 1, y: 0 }),
    });
    const { container } = render(
      <CanvasEditor
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        capabilities={{ navigate: true, select: true, copy: true, mutateContent: false }}
      />
    );

    fireEvent.contextMenu(container.firstElementChild as HTMLDivElement);

    expect(await screen.findByText("Copy as Text")).toBeInTheDocument();
    expect(screen.getByText("Copy as ANSI")).toBeInTheDocument();
    expect(screen.getByText("Snapshot (PNG)")).toBeInTheDocument();
    expect(screen.queryByText("Paste Lot")).not.toBeInTheDocument();
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
  });
  it("uses ctrl or command arrow keys for static-grid content navigation", () => {
    setCanvasTestState({
      canvasMode: "freeform",
      offset: { x: 0, y: 0 },
      contentSurface: new TestCanvasContentSurface([
        ["1,5", { char: "A", color: "#fff" }],
        ["2,5", { char: "B", color: "#fff" }],
        ["4,5", { char: " ", color: "#fff", bgColor: "#333" }],
        ["5,5", { char: "C", color: "#fff" }],
      ]),
      textCursor: { x: 1, y: 5 },
      staticGridSelection: {
        mode: "cell",
        activeCell: { x: 1, y: 5 },
        anchorCell: { x: 1, y: 5 },
        primaryRange: { start: { x: 1, y: 5 }, end: { x: 1, y: 5 } },
        additionalRanges: [],
      },
      staticGridEditMode: "text-edit",
    });

    const { container } = render(
      <CanvasEditor onUndo={vi.fn()} onRedo={vi.fn()} />
    );

    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();
    focusCanvasInput(container);

    fireEvent.keyDown(textarea!, { key: "ArrowRight", ctrlKey: true });
    expect(useEditorStore.getState().interaction.staticGridSelection.activeCell).toEqual({
      x: 2,
      y: 5,
    });
    expect(useEditorStore.getState().interaction.staticGridEditMode).toBe("navigate");
    expect(testingCanvasRuntime.viewport.getSnapshot().offset).toEqual({ x: 0, y: 0 });

    fireEvent.keyDown(textarea!, { key: "ArrowRight", metaKey: true });
    expect(useEditorStore.getState().interaction.staticGridSelection.activeCell).toEqual({
      x: 5,
      y: 5,
    });
    expect(testingCanvasRuntime.viewport.getSnapshot().offset).toEqual({ x: 0, y: 0 });

    fireEvent.keyDown(textarea!, {
      key: "ArrowLeft",
      ctrlKey: true,
      shiftKey: true,
    });
    expect(useEditorStore.getState().interaction.staticGridSelection).toEqual({
      mode: "range",
      activeCell: { x: 5, y: 5 },
      anchorCell: { x: 5, y: 5 },
      primaryRange: { start: { x: 2, y: 5 }, end: { x: 5, y: 5 } },
      additionalRanges: [],
    });
  });

  it("claims modified arrows before lower-priority shortcut layers", () => {
    const hijacker = vi.fn();
    const targetHandler = vi.fn();
    setCanvasTestState({
      canvasMode: "freeform",
      offset: { x: 0, y: 0 },
      contentSurface: new TestCanvasContentSurface([
        ["1,2", { char: "A", color: "#fff" }],
        ["4,2", { char: "B", color: "#fff" }],
      ]),
      textCursor: { x: 1, y: 2 },
      staticGridSelection: {
        mode: "cell",
        activeCell: { x: 1, y: 2 },
        anchorCell: { x: 1, y: 2 },
        primaryRange: { start: { x: 1, y: 2 }, end: { x: 1, y: 2 } },
        additionalRanges: [],
      },
      staticGridEditMode: "navigate",
    });

    const { container, getByTestId } = render(
      <ShortcutProvider>
        <ModifiedArrowHijacker onClaim={hijacker} />
        <CanvasEditorUnderTest onUndo={vi.fn()} onRedo={vi.fn()} />
      </ShortcutProvider>
    );
    fireEvent.pointerDown(getByTestId("canvas-editor-surface"));
    const textarea = container.querySelector("textarea")!;
    textarea.addEventListener("keydown", targetHandler);
    const event = createEvent.keyDown(textarea, {
      key: "ArrowRight",
      metaKey: true,
    });

    fireEvent(textarea, event);

    expect(event.defaultPrevented).toBe(true);
    expect(hijacker).not.toHaveBeenCalled();
    expect(targetHandler).not.toHaveBeenCalled();
    expect(useEditorStore.getState().interaction.staticGridSelection.activeCell).toEqual({
      x: 4,
      y: 2,
    });
    expect(testingCanvasRuntime.viewport.getSnapshot().offset).toEqual({ x: 0, y: 0 });
  });

  it("does not claim modified arrows while canvas input is unfocused", () => {
    setCanvasTestState({
      canvasMode: "freeform",
      staticGridSelection: {
        mode: "cell",
        activeCell: { x: 2, y: 2 },
        anchorCell: { x: 2, y: 2 },
        primaryRange: { start: { x: 2, y: 2 }, end: { x: 2, y: 2 } },
        additionalRanges: [],
      },
      staticGridEditMode: "navigate",
    });

    const { getByRole } = render(
      <ShortcutProvider>
        <button type="button">Outside canvas</button>
        <CanvasEditorUnderTest onUndo={vi.fn()} onRedo={vi.fn()} />
      </ShortcutProvider>
    );
    const outside = getByRole("button", { name: "Outside canvas" });
    outside.focus();
    const event = createEvent.keyDown(outside, {
      key: "ArrowRight",
      metaKey: true,
    });

    fireEvent(outside, event);

    expect(event.defaultPrevented).toBe(false);
    expect(useEditorStore.getState().interaction.staticGridSelection.activeCell).toEqual({
      x: 2,
      y: 2,
    });
  });

  it("uses static-grid keyboard navigation and range extension in slides", () => {
    setCanvasTestState({
      canvasMode: "slide",
      slideDeck: {
        activeSlideId: "slide-1",
        slides: [
          {
            id: "slide-1",
            name: "Slide 1",
            size: { columns: 3, rows: 2 },
          },
        ],
      },
      textCursor: { x: 1, y: 1 },
      staticGridSelection: {
        mode: "cell",
        activeCell: { x: 1, y: 1 },
        anchorCell: { x: 1, y: 1 },
        primaryRange: { start: { x: 1, y: 1 }, end: { x: 1, y: 1 } },
        additionalRanges: [],
      },
      staticGridEditMode: "navigate",
      structuredGridFocus: null,
      selectedStructuredNodeIds: [],
    });

    const { container, getByTestId } = render(
      <CanvasEditor onUndo={vi.fn()} onRedo={vi.fn()} />
    );
    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();
    fireEvent.pointerDown(getByTestId("canvas-editor-surface"));

    fireEvent.keyDown(textarea!, { key: "ArrowRight" });
    expect(useEditorStore.getState().interaction.staticGridSelection.activeCell).toEqual({
      x: 2,
      y: 1,
    });
    expect(useEditorStore.getState().interaction.textCursor).toBeNull();

    fireEvent.keyDown(textarea!, { key: "ArrowUp", shiftKey: true });
    expect(useEditorStore.getState().interaction.staticGridSelection).toEqual({
      mode: "range",
      activeCell: { x: 2, y: 1 },
      anchorCell: { x: 2, y: 1 },
      primaryRange: { start: { x: 2, y: 0 }, end: { x: 2, y: 1 } },
      additionalRanges: [],
    });
    expect(useEditorStore.getState().interaction.textCursor).toBeNull();
    expect(useEditorStore.getState().interaction.structuredGridFocus).toBeNull();
  });

  it("uses Excel-style navigation keys only in static-grid navigate mode", () => {
    applyFreeformSnapshotToYMaps([
      ["0,0", { char: "A", color: "#fff" }],
      ["4,3", { char: "B", color: "#fff" }],
    ]);
    setCanvasTestState({
      canvasMode: "freeform",
      contentSurface: new TestCanvasContentSurface([
        ["0,0", { char: "A", color: "#fff" }],
        ["4,3", { char: "B", color: "#fff" }],
      ]),
      textCursor: { x: 2, y: 1 },
      staticGridSelection: {
        mode: "cell",
        activeCell: { x: 2, y: 1 },
        anchorCell: { x: 2, y: 1 },
        primaryRange: { start: { x: 2, y: 1 }, end: { x: 2, y: 1 } },
        additionalRanges: [],
      },
      staticGridEditMode: "navigate",
    });

    const { container, getByTestId } = render(
      <CanvasEditor onUndo={vi.fn()} onRedo={vi.fn()} />
    );
    const textarea = container.querySelector("textarea")!;
    fireEvent.pointerDown(getByTestId("canvas-editor-surface"));

    fireEvent.keyDown(textarea, { key: "Home" });
    expect(useEditorStore.getState().interaction.staticGridSelection.activeCell).toEqual({ x: 0, y: 1 });
    fireEvent.keyDown(textarea, { key: "End", ctrlKey: true });
    expect(useEditorStore.getState().interaction.staticGridSelection.activeCell).toEqual({ x: 4, y: 3 });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(useEditorStore.getState().interaction.staticGridSelection.activeCell).toEqual({ x: 4, y: 2 });
    fireEvent.keyDown(textarea, { key: "Tab", shiftKey: true });
    expect(useEditorStore.getState().interaction.staticGridSelection.activeCell).toEqual({ x: 3, y: 2 });
  });

  it("selects bounded rows, columns, and two-stage content with keyboard shortcuts", () => {
    applyFreeformSnapshotToYMaps([
      ["1,1", { char: "A", color: "#fff" }],
      ["2,1", { char: "B", color: "#fff" }],
      ["5,4", { char: "C", color: "#fff" }],
    ]);
    setCanvasTestState({
      canvasMode: "freeform",
      contentSurface: new TestCanvasContentSurface([
        ["1,1", { char: "A", color: "#fff" }],
        ["2,1", { char: "B", color: "#fff" }],
        ["5,4", { char: "C", color: "#fff" }],
      ]),
      textCursor: { x: 1, y: 1 },
      staticGridSelection: {
        mode: "cell",
        activeCell: { x: 1, y: 1 },
        anchorCell: { x: 1, y: 1 },
        primaryRange: { start: { x: 1, y: 1 }, end: { x: 1, y: 1 } },
        additionalRanges: [],
      },
      staticGridEditMode: "navigate",
    });

    const { container, getByTestId } = render(
      <CanvasEditor onUndo={vi.fn()} onRedo={vi.fn()} />
    );
    const textarea = container.querySelector("textarea")!;
    fireEvent.pointerDown(getByTestId("canvas-editor-surface"));

    fireEvent.keyDown(textarea, { key: " ", code: "Space", shiftKey: true });
    expect(getGridSelectionRanges(useEditorStore.getState().interaction.staticGridSelection)).toEqual([
      { start: { x: 1, y: 1 }, end: { x: 5, y: 1 } },
    ]);
    useEditorStore.getState().clearStaticGridSelection();
    fireEvent.keyDown(textarea, { key: " ", code: "Space", ctrlKey: true });
    expect(getGridSelectionRanges(useEditorStore.getState().interaction.staticGridSelection)).toEqual([
      { start: { x: 1, y: 1 }, end: { x: 1, y: 4 } },
    ]);
    useEditorStore.getState().clearStaticGridSelection();
    fireEvent.keyDown(textarea, { key: "a", ctrlKey: true });
    expect(getGridSelectionRanges(useEditorStore.getState().interaction.staticGridSelection)).toEqual([
      { start: { x: 1, y: 1 }, end: { x: 2, y: 1 } },
    ]);
    fireEvent.keyDown(textarea, { key: "a", ctrlKey: true });
    expect(getGridSelectionRanges(useEditorStore.getState().interaction.staticGridSelection)).toEqual([
      { start: { x: 1, y: 1 }, end: { x: 5, y: 4 } },
    ]);
  });

  it("keeps Space selection shortcuts out of static-grid text edit", async () => {
    setCanvasTestState({
      canvasMode: "freeform",
      contentSurface: new TestCanvasContentSurface(),
      textCursor: { x: 2, y: 1 },
      staticGridSelection: createGridSelectionState({ x: 2, y: 1 }),
      staticGridEditMode: "text-edit",
    });
    const { container, getByTestId } = render(
      <CanvasEditor onUndo={vi.fn()} onRedo={vi.fn()} />
    );
    fireEvent.pointerDown(getByTestId("canvas-editor-surface"));
    const textarea = container.querySelector("textarea")!;
    const rowShortcut = createEvent.keyDown(textarea, {
      key: " ",
      code: "Space",
      shiftKey: true,
    });
    const columnShortcut = createEvent.keyDown(textarea, {
      key: " ",
      code: "Space",
      ctrlKey: true,
    });

    fireEvent(textarea, rowShortcut);
    fireEvent(textarea, columnShortcut);

    expect(rowShortcut.defaultPrevented).toBe(false);
    expect(columnShortcut.defaultPrevented).toBe(false);
    expect(useEditorStore.getState().interaction.staticGridSelection.mode).toBe("cell");

    fireEvent.input(textarea, { target: { value: " " } });
    await waitFor(() => {
      expect(useEditorStore.getState().contentSurface.reader.materialize().get("2,1")?.char).toBe(" ");
    });
    expect(useEditorStore.getState().interaction.staticGridSelection.mode).toBe("cell");
  });

  it("moves and clears structured grid focus from the managed textarea", () => {
    setCanvasTestState({
      canvasMode: "structured",
      textCursor: null,
      selectedStructuredNodeIds: [],
      structuredGridFocus: { x: 2, y: 3 },
    });

    const { container, getByTestId } = render(
      <CanvasEditor onUndo={vi.fn()} onRedo={vi.fn()} />
    );

    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();
    fireEvent.pointerDown(getByTestId("canvas-editor-surface"));
    expect(document.activeElement).toBe(textarea);

    fireEvent.keyDown(textarea!, { key: "ArrowRight" });
    expect(useEditorStore.getState().interaction.structuredGridFocus).toEqual({ x: 3, y: 3 });

    fireEvent.keyDown(textarea!, { key: "ArrowDown" });
    expect(useEditorStore.getState().interaction.structuredGridFocus).toEqual({ x: 3, y: 4 });

    fireEvent.keyDown(textarea!, { key: "Escape" });
    expect(useEditorStore.getState().interaction.structuredGridFocus).toBeNull();
  });

  it("cancels canvas color picking with Escape outside the managed textarea", () => {
    setCanvasTestState({
      canvasColorPickerTarget: "auto",
      hoveredGrid: { x: 4, y: 6 },
    });

    render(
      <>
        <button type="button">Toolbar control</button>
        <CanvasEditor onUndo={vi.fn()} onRedo={vi.fn()} />
      </>
    );

    const toolbarControl = screen.getByRole("button", {
      name: "Toolbar control",
    });
    toolbarControl.focus();
    fireEvent.keyDown(toolbarControl, { key: "Escape" });

    expect(useEditorStore.getState().interaction.canvasColorPickerTarget).toBeNull();
    expect(useEditorStore.getState().interaction.hoveredGrid).toBeNull();
  });

  it("creates structured text from managed textarea input at structured grid focus", async () => {
    setCanvasTestState({
      canvasMode: "structured",
      textCursor: null,
      selectedStructuredNodeIds: [],
      structuredScene: [],
      structuredGridFocus: { x: 3, y: 4 },
      brushColor: "#123456",
    });

    const { container, getByTestId } = render(
      <CanvasEditor onUndo={vi.fn()} onRedo={vi.fn()} />
    );

    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();

    fireEvent.pointerDown(getByTestId("canvas-editor-surface"));
    expect(document.activeElement).toBe(textarea);
    fireEvent.input(textarea!, { target: { value: "Go" } });

    await waitFor(() => {
      expect(useEditorStore.getState().structuredScene).toHaveLength(1);
    });
    const state = useEditorStore.getState();
    expect(state.structuredScene[0]).toMatchObject({
      type: "text",
      position: { x: 3, y: 4 },
      text: "Go",
      style: { color: "#123456" },
    });
    expect(state.interaction.structuredGridFocus).toBeNull();
    expect(state.interaction.textCursor).toEqual({ x: 5, y: 4 });
  });

  it("drops a structured button template onto the canvas", async () => {
    setCanvasTestState({
      canvasMode: "structured",
      offset: { x: 0, y: 0 },
      zoom: 1,
      brushColor: "#334155",
      structuredScene: [],
      selectedStructuredNodeIds: [],
      structuredGridFocus: { x: 1, y: 1 },
    });

    const dataTransfer = {
      types: [STRUCTURED_TEMPLATE_MIME],
      dropEffect: "none",
      getData: vi.fn((type: string) =>
        type === STRUCTURED_TEMPLATE_MIME ? "button" : ""
      ),
    };
    const { container } = render(
      <CanvasEditor onUndo={vi.fn()} onRedo={vi.fn()} />
    );
    const root = container.firstElementChild as HTMLDivElement;
    const dragOverEvent = createEvent.dragOver(root);
    Object.defineProperties(dragOverEvent, {
      dataTransfer: { value: dataTransfer },
      clientX: { value: 18 },
      clientY: { value: 40 },
    });
    const dropEvent = createEvent.drop(root);
    Object.defineProperties(dropEvent, {
      dataTransfer: { value: dataTransfer },
      clientX: { value: 18 },
      clientY: { value: 40 },
    });

    await fireDragOverAndFlush(root, dragOverEvent);

    const preview = screen.getByTestId("structured-template-preview");
    expect(preview).toHaveStyle({
      left: "18px",
      top: "40px",
      width: "72px",
      height: "20px",
    });
    expect(preview.style.backgroundColor).toBe("");
    const previewGrid = preview.querySelector(
      '[data-testid="structured-template-preview-grid"]'
    );
    expect(previewGrid?.tagName).toBe("CANVAS");
    expect(previewGrid).toHaveAttribute("data-preview-mode", "characters");
    expect(previewGrid).toHaveStyle({ width: "72px", height: "20px" });

    act(() => {
      fireEvent(root, dropEvent);
    });

    const state = useEditorStore.getState();
    expect(dataTransfer.dropEffect).toBe("copy");
    expect(screen.queryByTestId("structured-template-preview")).not.toBeInTheDocument();
    expect(state.structuredScene).toHaveLength(2);
    expect(state.structuredScene[0]).toMatchObject({
      type: "bg",
      start: { x: 2, y: 2 },
      end: { x: 9, y: 2 },
      style: { color: "#000000", bgColor: "#dbeafe" },
    });
    expect(state.structuredScene[1]).toMatchObject({
      type: "text",
      position: { x: 2, y: 2 },
      text: "[BUTTON]",
      style: { color: "#000000" },
    });
    expect(state.interaction.selectedStructuredNodeIds).toEqual(
      state.structuredScene.map((node) => node.id)
    );
    expect(state.interaction.structuredGridFocus).toBeNull();
  });

  it("drops a structured badge template onto the canvas", async () => {
    setCanvasTestState({
      canvasMode: "structured",
      offset: { x: 0, y: 0 },
      zoom: 1,
      brushColor: "#334155",
      structuredScene: [],
      selectedStructuredNodeIds: [],
    });

    const dataTransfer = {
      types: [STRUCTURED_TEMPLATE_MIME],
      dropEffect: "none",
      getData: vi.fn((type: string) =>
        type === STRUCTURED_TEMPLATE_MIME ? "badge" : ""
      ),
    };
    const { container } = render(
      <CanvasEditor onUndo={vi.fn()} onRedo={vi.fn()} />
    );
    const root = container.firstElementChild as HTMLDivElement;
    const dragOverEvent = createEvent.dragOver(root);
    Object.defineProperties(dragOverEvent, {
      dataTransfer: { value: dataTransfer },
      clientX: { value: 27 },
      clientY: { value: 60 },
    });
    const dropEvent = createEvent.drop(root);
    Object.defineProperties(dropEvent, {
      dataTransfer: { value: dataTransfer },
      clientX: { value: 27 },
      clientY: { value: 60 },
    });

    await fireDragOverAndFlush(root, dragOverEvent);

    const preview = screen.getByTestId("structured-template-preview");
    expect(preview).toHaveStyle({
      left: "27px",
      top: "60px",
    });
    expect(preview.style.backgroundColor).toBe("");
    const previewGrid = preview.querySelector(
      '[data-testid="structured-template-preview-grid"]'
    );
    expect(previewGrid?.tagName).toBe("CANVAS");

    act(() => {
      fireEvent(root, dropEvent);
    });

    const state = useEditorStore.getState();
    const expectedNodes = buildStructuredTemplateNodes(
      "badge",
      { x: 3, y: 3 },
      { brushColor: "#334155", startOrder: 1 }
    );
    expect(dataTransfer.dropEffect).toBe("copy");
    expect(screen.queryByTestId("structured-template-preview")).not.toBeInTheDocument();
    expect(stripNodeIds(state.structuredScene)).toEqual(
      stripNodeIds(expectedNodes)
    );
    expect(state.interaction.selectedStructuredNodeIds).toEqual(
      state.structuredScene.map((node) => node.id)
    );
  });

  it("drops a structured textarea template onto the canvas", async () => {
    setCanvasTestState({
      canvasMode: "structured",
      offset: { x: 0, y: 0 },
      zoom: 1,
      brushColor: "#334155",
      structuredScene: [],
      selectedStructuredNodeIds: [],
    });

    const dataTransfer = {
      types: [STRUCTURED_TEMPLATE_MIME],
      dropEffect: "none",
      getData: vi.fn((type: string) =>
        type === STRUCTURED_TEMPLATE_MIME ? "textarea" : ""
      ),
    };
    const { container } = render(
      <CanvasEditor onUndo={vi.fn()} onRedo={vi.fn()} />
    );
    const root = container.firstElementChild as HTMLDivElement;
    const dragOverEvent = createEvent.dragOver(root);
    Object.defineProperties(dragOverEvent, {
      dataTransfer: { value: dataTransfer },
      clientX: { value: 18 },
      clientY: { value: 40 },
    });
    const dropEvent = createEvent.drop(root);
    Object.defineProperties(dropEvent, {
      dataTransfer: { value: dataTransfer },
      clientX: { value: 18 },
      clientY: { value: 40 },
    });

    await fireDragOverAndFlush(root, dragOverEvent);

    const preview = screen.getByTestId("structured-template-preview");
    expect(preview).toHaveStyle({
      left: "18px",
      top: "40px",
      width: "234px",
      height: "80px",
    });
    const previewGrid = preview.querySelector(
      '[data-testid="structured-template-preview-grid"]'
    );
    expect(previewGrid?.tagName).toBe("CANVAS");
    expect(previewGrid).toHaveStyle({ width: "234px", height: "80px" });

    act(() => {
      fireEvent(root, dropEvent);
    });

    const state = useEditorStore.getState();
    const expectedNodes = normalizeScene(
      buildStructuredTemplateNodes(
        "textarea",
        { x: 2, y: 2 },
        { brushColor: "#000000", startOrder: 1 }
      )
    );
    expect(dataTransfer.dropEffect).toBe("copy");
    expect(stripNodeIds(state.structuredScene)).toEqual(
      stripNodeIds(expectedNodes)
    );
    expect(state.interaction.selectedStructuredNodeIds).toEqual(
      state.structuredScene.map((node) => node.id)
    );
  });

  it("uses the active dragged template when dragover cannot read custom data", async () => {
    setCanvasTestState({
      canvasMode: "structured",
      offset: { x: 0, y: 0 },
      zoom: 1,
      structuredScene: [],
      selectedStructuredNodeIds: [],
    });
    setActiveStructuredTemplateDragId("badge");

    const dataTransfer = {
      types: [STRUCTURED_TEMPLATE_MIME],
      dropEffect: "none",
      getData: vi.fn(() => ""),
    };
    const { container } = render(
      <CanvasEditor onUndo={vi.fn()} onRedo={vi.fn()} />
    );
    const root = container.firstElementChild as HTMLDivElement;
    const dragOverEvent = createEvent.dragOver(root);
    Object.defineProperties(dragOverEvent, {
      dataTransfer: { value: dataTransfer },
      clientX: { value: 36 },
      clientY: { value: 80 },
    });

    await fireDragOverAndFlush(root, dragOverEvent);

    const preview = screen.getByTestId("structured-template-preview");
    expect(preview).toHaveStyle({
      left: "36px",
      top: "80px",
      width: "81px",
      height: "20px",
    });
    expect(preview.style.backgroundColor).toBe("");
    const previewGrid = preview.querySelector(
      '[data-testid="structured-template-preview-grid"]'
    );
    expect(previewGrid?.tagName).toBe("CANVAS");
    expect(previewGrid).toHaveStyle({ width: "81px", height: "20px" });
  });

  it("coalesces structured template dragover previews to the latest frame position", async () => {
    setCanvasTestState({
      canvasMode: "structured",
      offset: { x: 0, y: 0 },
      zoom: 1,
      structuredScene: [],
      selectedStructuredNodeIds: [],
    });

    const dataTransfer = {
      types: [STRUCTURED_TEMPLATE_MIME],
      dropEffect: "none",
      getData: vi.fn((type: string) =>
        type === STRUCTURED_TEMPLATE_MIME ? "button" : ""
      ),
    };
    const { container } = render(
      <CanvasEditor onUndo={vi.fn()} onRedo={vi.fn()} />
    );
    const root = container.firstElementChild as HTMLDivElement;
    const firstDragOver = createEvent.dragOver(root);
    Object.defineProperties(firstDragOver, {
      dataTransfer: { value: dataTransfer },
      clientX: { value: 18 },
      clientY: { value: 40 },
    });
    const secondDragOver = createEvent.dragOver(root);
    Object.defineProperties(secondDragOver, {
      dataTransfer: { value: dataTransfer },
      clientX: { value: 54 },
      clientY: { value: 80 },
    });

    act(() => {
      fireEvent(root, firstDragOver);
      fireEvent(root, secondDragOver);
    });
    expect(screen.queryByTestId("structured-template-preview")).not.toBeInTheDocument();

    await act(async () => {
      await waitForAnimationFrame();
    });

    expect(screen.getByTestId("structured-template-preview")).toHaveStyle({
      left: "54px",
      top: "80px",
    });
  });

  it("drops at the latest dragover point even before the preview frame flushes", () => {
    setCanvasTestState({
      canvasMode: "structured",
      offset: { x: 0, y: 0 },
      zoom: 1,
      brushColor: "#334155",
      structuredScene: [],
      selectedStructuredNodeIds: [],
    });

    const dataTransfer = {
      types: [STRUCTURED_TEMPLATE_MIME],
      dropEffect: "none",
      getData: vi.fn((type: string) =>
        type === STRUCTURED_TEMPLATE_MIME ? "badge" : ""
      ),
    };
    const { container } = render(
      <CanvasEditor onUndo={vi.fn()} onRedo={vi.fn()} />
    );
    const root = container.firstElementChild as HTMLDivElement;
    const dragOverEvent = createEvent.dragOver(root);
    Object.defineProperties(dragOverEvent, {
      dataTransfer: { value: dataTransfer },
      clientX: { value: 54 },
      clientY: { value: 80 },
    });
    const dropEvent = createEvent.drop(root);
    Object.defineProperties(dropEvent, {
      dataTransfer: { value: dataTransfer },
      clientX: { value: 18 },
      clientY: { value: 40 },
    });

    act(() => {
      fireEvent(root, dragOverEvent);
      fireEvent(root, dropEvent);
    });

    const state = useEditorStore.getState();
    const expectedNodes = buildStructuredTemplateNodes(
      "badge",
      { x: 6, y: 4 },
      { brushColor: "#334155", startOrder: 1 }
    );
    expect(screen.queryByTestId("structured-template-preview")).not.toBeInTheDocument();
    expect(stripNodeIds(state.structuredScene)).toEqual(
      stripNodeIds(expectedNodes)
    );
  });
});
