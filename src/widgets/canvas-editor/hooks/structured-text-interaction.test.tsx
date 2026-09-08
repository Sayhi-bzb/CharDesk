import { afterEach, describe, expect, it, vi } from "vitest";
import { TestCanvasContentSurface } from "@/domains/canvas/testing";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";

import { useCanvasInteraction } from "@/widgets/canvas-editor/hooks/useCanvasInteraction";
import { CanvasColorSourceChooser } from "@/widgets/canvas-editor/CanvasColorSourceChooser";
import type { StructuredMovePreview } from "@/widgets/canvas-editor/hooks/useCanvasRenderer";
import {
  canvasCommands,
  setCanvasTestState,
  testingCanvasRuntime,
  useEditorStore,
} from "@/domains/canvas/testing";
import { useShallow } from "zustand/react/shallow";
import type { ToolType } from "@/domains/canvas/testing";
import { ShortcutProvider } from "@/shared/shortcuts/dispatcher";
import { DEFAULT_DEMO_GRID } from "@/domains/canvas/public";
import { GridManager } from "@/shared/utils/grid";
import { CanvasEngineRuntime } from "@/widgets/canvas-editor/engine/CanvasEngineRuntime";

const gestureState = vi.hoisted(() => ({
  handlers: null as Record<string, (input: unknown) => void> | null,
  config: null as Record<string, unknown> | null,
}));

let interactionRuntime: CanvasEngineRuntime | undefined;

const getInteractionRuntime = () => {
  if (interactionRuntime) return interactionRuntime;
  interactionRuntime = new CanvasEngineRuntime({
    getViewport: testingCanvasRuntime.viewport.getSnapshot,
    setViewport: testingCanvasRuntime.commands.viewport.setViewport,
  });
  return interactionRuntime;
};

vi.mock("@use-gesture/react", () => ({
  useGesture: vi.fn((handlers, config) => {
    gestureState.handlers = handlers;
    gestureState.config = config;
    return {};
  }),
}));

function InteractionHarnessContent() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const structuredMovePreviewRef = useRef<StructuredMovePreview | null>(null);
  const requestRenderRef = useRef<(() => void) | null>(null);
  const store = useEditorStore(
    useShallow((state) => ({
      ...state.interaction,
      interaction: state.interaction,
      activeCanvasId: state.activeCanvasId,
      tool: state.tool,
      brushChar: state.brushChar,
      brushColor: state.brushColor,
      brushBackgroundColor: state.brushBackgroundColor,
      setBrushColor: canvasCommands.preferences.setBrushColor,
      setBrushBackgroundColor: canvasCommands.preferences.setBrushBackgroundColor,
      setCanvasColorPickerTarget: canvasCommands.interaction.setColorPickerTarget,
      setOffset: canvasCommands.viewport.setOffset,
      setZoom: canvasCommands.viewport.setZoom,
      setViewport: canvasCommands.viewport.setViewport,
      canvasMode: state.canvasMode,
      slideDeck: state.slideDeck,
      addScratchPoints: state.addScratchPoints,
      commitScratch: state.commitScratch,
      commitStructuredShape: state.commitStructuredShape,
      setTextCursor: canvasCommands.interaction.setTextCursor,
      setStaticGridActiveCell: state.setStaticGridActiveCell,
      enterStaticGridTextEdit: state.enterStaticGridTextEdit,
      setStaticGridSelectionRange: state.setStaticGridSelectionRange,
      appendStaticGridSelectionRange: state.appendStaticGridSelectionRange,
      clearSelections: state.clearSelections,
      clearInteractionState: state.clearInteractionState,
      moveStaticGridSelection: state.moveStaticGridSelection,
      erasePoints: state.erasePoints,
      ...testingCanvasRuntime.viewport.getSnapshot(),
      contentReader: state.contentSurface.reader,
      contentRevision: state.contentSurface.revision,
      updateScratchForShape: state.updateScratchForShape,
      setHoveredGrid: canvasCommands.interaction.setHoveredGrid,
      fillArea: state.fillArea,
      structuredScene: state.structuredScene,
      setStructuredGridFocus: canvasCommands.interaction.setStructuredGridFocus,
      setStructuredContextPoint: canvasCommands.interaction.setStructuredContextPoint,
      setSelectedStructuredNodeIds: canvasCommands.interaction.setSelectedStructuredNodeIds,
      setSelectedStructuredSplitHandle:
        canvasCommands.interaction.setSelectedStructuredSplitHandle,
      setEditingStructuredTextNodeId:
        canvasCommands.interaction.setEditingStructuredTextNodeId,
      setStructuredTextSelection: canvasCommands.interaction.setStructuredTextSelection,
      setStructuredTextColor: state.setStructuredTextColor,
      applyStructuredScene: state.applyStructuredScene,
      updateStructuredNode: state.updateStructuredNode,
    }))
  );
  const {
    cursor,
    draggingSelection,
    handleDoubleClick,
    colorSourceChoice,
    selectColorSource,
    cancelColorSourceChoice,
  } = useCanvasInteraction(
    store,
    containerRef,
    vi.fn(),
    structuredMovePreviewRef,
    requestRenderRef,
    getInteractionRuntime()
  );

  return (
    <>
      <div
        ref={containerRef}
        data-testid="canvas-root"
        style={{ cursor: cursor || undefined }}
        data-selection-preview={
          draggingSelection ? JSON.stringify(draggingSelection) : "none"
        }
        onDoubleClick={handleDoubleClick}
      />
      {colorSourceChoice && (
        <CanvasColorSourceChooser
          choice={colorSourceChoice}
          offset={store.offset}
          zoom={store.zoom}
          onSelect={selectColorSource}
          onCancel={cancelColorSourceChoice}
        />
      )}
    </>
  );
}

function InteractionHarness() {
  return (
    <ShortcutProvider>
      <InteractionHarnessContent />
    </ShortcutProvider>
  );
}

describe("structured text interaction", () => {
  const initialState = useEditorStore.getState();

  afterEach(() => {
    interactionRuntime?.dispose();
    interactionRuntime = undefined;
    gestureState.handlers = null;
    gestureState.config = null;
    useEditorStore.setState(initialState, true);
  });

  const setStructuredTextScene = (options?: { editing?: boolean }) => {
    setCanvasTestState({
      canvasMode: "structured",
      tool: "select",
      offset: { x: 0, y: 0 },
      zoom: 1,
      contentSurface: new TestCanvasContentSurface(),
      textCursor: options?.editing ? { x: 0, y: 0 } : null,
      editingStructuredTextNodeId: options?.editing ? "text-1" : null,
      selectedStructuredNodeIds: options?.editing ? ["text-1"] : [],
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
    useEditorStore.getState().applyStructuredScene(
      useEditorStore.getState().structuredScene,
      false
    );
  };

  const setStructuredMixedScene = () => {
    setCanvasTestState({
      canvasMode: "structured",
      tool: "select",
      offset: { x: 0, y: 0 },
      zoom: 1,
      contentSurface: new TestCanvasContentSurface(),
      textCursor: null,
      editingStructuredTextNodeId: null,
      selectedStructuredNodeIds: ["box-1", "text-1"],
      structuredScene: [
        {
          id: "box-1",
          type: "box",
          order: 1,
          start: { x: 0, y: 0 },
          end: { x: 2, y: 2 },
          style: { color: "#ffffff" },
        },
        {
          id: "text-1",
          type: "text",
          order: 2,
          position: { x: 5, y: 0 },
          text: "Node",
          style: { color: "#ffffff" },
        },
      ],
    });
  };

  const setStructuredMixedSceneWithHistory = () => {
    const scene = [
      {
        id: "box-1",
        type: "box" as const,
        order: 1,
        start: { x: 0, y: 0 },
        end: { x: 2, y: 2 },
        style: { color: "#ffffff" },
      },
      {
        id: "text-1",
        type: "text" as const,
        order: 2,
        position: { x: 5, y: 0 },
        text: "Node",
        style: { color: "#ffffff" },
      },
    ];
    setCanvasTestState({
      canvasMode: "structured",
      tool: "select",
      offset: { x: 0, y: 0 },
      zoom: 1,
      contentSurface: new TestCanvasContentSurface(),
      textCursor: null,
      editingStructuredTextNodeId: null,
      selectedStructuredNodeIds: ["box-1", "text-1"],
    });
    useEditorStore.getState().applyStructuredScene(scene, "reset");
    setCanvasTestState({
      selectedStructuredNodeIds: ["box-1", "text-1"],
    });
  };

  const setStructuredBgScene = (selected = false) => {
    setCanvasTestState({
      canvasMode: "structured",
      tool: "select",
      offset: { x: 0, y: 0 },
      zoom: 1,
      contentSurface: new TestCanvasContentSurface(),
      textCursor: null,
      editingStructuredTextNodeId: null,
      selectedStructuredNodeIds: selected ? ["bg-1"] : [],
      structuredScene: [
        {
          id: "bg-1",
          type: "bg",
          order: 1,
          start: { x: 0, y: 0 },
          end: { x: 4, y: 0 },
          style: { color: "#ffffff", bgColor: "#dbeafe" },
        },
      ],
    });
  };

  const setStructuredLineScene = (selected = false) => {
    setCanvasTestState({
      canvasMode: "structured",
      tool: "select",
      offset: { x: 0, y: 0 },
      zoom: 1,
      contentSurface: new TestCanvasContentSurface(),
      textCursor: null,
      editingStructuredTextNodeId: null,
      selectedStructuredNodeIds: selected ? ["line-1"] : [],
      structuredScene: [
        {
          id: "line-1",
          type: "line",
          order: 1,
          start: { x: 0, y: 0 },
          end: { x: 4, y: 0 },
          axis: "horizontal",
          style: { color: "#ffffff" },
        },
      ],
    });
  };

  const setStructuredSplitBoxScene = () => {
    setCanvasTestState({
      canvasMode: "structured",
      tool: "select",
      offset: { x: 0, y: 0 },
      zoom: 1,
      contentSurface: new TestCanvasContentSurface(),
      textCursor: null,
      editingStructuredTextNodeId: null,
      selectedStructuredNodeIds: [],
      selectedStructuredSplitHandle: null,
      structuredContextPoint: null,
      structuredScene: [
        {
          id: "split-1",
          type: "splitBox",
          order: 1,
          start: { x: 0, y: 0 },
          end: { x: 9, y: 9 },
          verticalSplitRatio: 0.5,
          topSplitRatio: 0.25,
          bottomSplitRatio: 0.75,
          root: { type: "leaf", id: "root-leaf" },
          style: { color: "#ffffff" },
        },
      ],
    });
  };

  const dragEvent = (detail = 1) =>
    new MouseEvent("mousedown", {
      button: 0,
      bubbles: true,
      cancelable: true,
      detail,
    });

  const dragEventFrom = (target: Element) => {
    const event = dragEvent();
    Object.defineProperties(event, {
      target: { value: target },
      composedPath: { value: () => [target] },
    });
    return event;
  };

  it("uses pointer capture for canvas drags", () => {
    setStructuredTextScene();
    render(<InteractionHarness />);

    expect(gestureState.config).toMatchObject({
      drag: { pointer: { capture: true } },
    });
  });

  it("commits and clears structured marquee selection across repeated drags", () => {
    setStructuredMixedScene();
    setCanvasTestState({ selectedStructuredNodeIds: [] });
    const { getByTestId } = render(<InteractionHarness />);

    for (let index = 0; index < 20; index += 1) {
      act(() => {
        gestureState.handlers?.onDragStart?.({
          xy: [100, 80],
          event: dragEvent(),
        });
        gestureState.handlers?.onDrag?.({
          xy: [1, 1],
          delta: [-99, -79],
          event: dragEvent(),
        });
        gestureState.handlers?.onDragEnd?.({
          xy: [1, 1],
          event: dragEvent(),
        });
      });

      expect(useEditorStore.getState().interaction.selectedStructuredNodeIds).toEqual([
        "box-1",
        "text-1",
      ]);
      expect(getByTestId("canvas-root")).toHaveAttribute(
        "data-selection-preview",
        "none"
      );
    }
  });

  it("finishes an active selection when drag end is retargeted to canvas UI", () => {
    setStructuredMixedScene();
    setCanvasTestState({ selectedStructuredNodeIds: [] });
    const { getByTestId } = render(<InteractionHarness />);
    const canvasUi = document.createElement("button");
    canvasUi.dataset.canvasUi = "true";

    act(() => {
      gestureState.handlers?.onDragStart?.({
        xy: [100, 80],
        event: dragEvent(),
      });
      gestureState.handlers?.onDrag?.({
        xy: [1, 1],
        delta: [-99, -79],
        event: dragEvent(),
      });
      gestureState.handlers?.onDragEnd?.({
        xy: [1, 1],
        event: dragEventFrom(canvasUi),
      });
    });

    expect(useEditorStore.getState().interaction.selectedStructuredNodeIds).toEqual([
      "box-1",
      "text-1",
    ]);
    expect(getByTestId("canvas-root")).toHaveAttribute(
      "data-selection-preview",
      "none"
    );
  });

  it("clears an interrupted marquee without committing it", () => {
    setStructuredMixedScene();
    setCanvasTestState({ selectedStructuredNodeIds: [] });
    const { getByTestId } = render(<InteractionHarness />);

    act(() => {
      gestureState.handlers?.onDragStart?.({
        xy: [100, 80],
        event: dragEvent(),
      });
      gestureState.handlers?.onDrag?.({
        xy: [1, 1],
        delta: [-99, -79],
        event: dragEvent(),
      });
      gestureState.handlers?.onDragEnd?.({
        xy: [1, 1],
        event: new Event("pointercancel"),
      });
    });

    expect(useEditorStore.getState().interaction.selectedStructuredNodeIds).toEqual([]);
    expect(getByTestId("canvas-root")).toHaveAttribute(
      "data-selection-preview",
      "none"
    );
  });

  it("enters text editing when double-clicking selected-mode structured text", () => {
    setStructuredTextScene();

    const { getByTestId } = render(<InteractionHarness />);

    fireEvent.doubleClick(getByTestId("canvas-root"), {
      clientX: 1,
      clientY: 1,
    });

    expect(useEditorStore.getState().interaction.selectedStructuredNodeIds).toEqual([
      "text-1",
    ]);
    expect(useEditorStore.getState().interaction.textCursor).toEqual({ x: 0, y: 0 });
    expect(useEditorStore.getState().interaction.editingStructuredTextNodeId).toBe(
      "text-1"
    );
    expect(useEditorStore.getState().interaction.structuredTextSelection).toBeNull();
  });

  it("enters static-grid text editing at a wide character anchor on double-click", () => {
    setCanvasTestState({
      canvasMode: "freeform",
      tool: "select",
      offset: { x: 0, y: 0 },
      zoom: 1,
      contentSurface: new TestCanvasContentSurface([["1,0", { char: "你", color: "#ffffff" }]]),
      staticGridEditMode: "navigate",
      textCursor: null,
    });
    const { getByTestId } = render(<InteractionHarness />);

    fireEvent.doubleClick(getByTestId("canvas-root"), {
      clientX: 19,
      clientY: 1,
    });

    expect(useEditorStore.getState().interaction.staticGridEditMode).toBe("text-edit");
    expect(useEditorStore.getState().interaction.textCursor).toEqual({ x: 1, y: 0 });
    expect(useEditorStore.getState().interaction.staticGridSelection.activeCell).toEqual({
      x: 1,
      y: 0,
    });
  });

  it("places the caret at the text end when double-clicking just after structured text", () => {
    setStructuredTextScene();

    const { getByTestId } = render(<InteractionHarness />);

    fireEvent.doubleClick(getByTestId("canvas-root"), {
      clientX: 45,
      clientY: 1,
    });
    useEditorStore.getState().writeTextString("!");

    expect(useEditorStore.getState().structuredScene[0]).toMatchObject({
      id: "text-1",
      text: "Edit!",
    });
    expect(useEditorStore.getState().interaction.textCursor).toEqual({ x: 5, y: 0 });
  });

  it("inserts text at the clicked middle offset while structured text is editing", () => {
    setStructuredTextScene({ editing: true });
    render(<InteractionHarness />);

    act(() => {
      gestureState.handlers?.onDragStart?.({
        xy: [18, 1],
        event: dragEvent(),
      });
    });
    useEditorStore.getState().writeTextString("!");

    expect(useEditorStore.getState().structuredScene[0]).toMatchObject({
      id: "text-1",
      text: "Ed!it",
    });
    expect(useEditorStore.getState().interaction.textCursor).toEqual({ x: 3, y: 0 });
  });

  it("keeps active text caret targeting above overlapping background nodes", () => {
    setStructuredTextScene({ editing: true });
    setCanvasTestState({
      structuredScene: [
        {
          id: "text-1",
          type: "text",
          order: 1,
          position: { x: 0, y: 0 },
          text: "Edit",
          style: { color: "#ffffff" },
        },
        {
          id: "bg-1",
          type: "bg",
          order: 2,
          start: { x: 0, y: 0 },
          end: { x: 6, y: 0 },
          style: { color: "#ffffff", bgColor: "#dbeafe" },
        },
      ],
    });
    render(<InteractionHarness />);

    act(() => {
      gestureState.handlers?.onDragStart?.({
        xy: [18, 1],
        event: dragEvent(),
      });
    });
    useEditorStore.getState().writeTextString("!");

    expect(useEditorStore.getState().interaction.editingStructuredTextNodeId).toBe("text-1");
    expect(useEditorStore.getState().structuredScene[0]).toMatchObject({
      id: "text-1",
      text: "Ed!it",
    });
    expect(useEditorStore.getState().structuredScene[1]).toMatchObject({
      id: "bg-1",
      start: { x: 0, y: 0 },
    });
  });

  it("keeps structured text editing when clicking just after the text end", () => {
    setStructuredTextScene({ editing: true });
    render(<InteractionHarness />);

    act(() => {
      gestureState.handlers?.onDragStart?.({
        xy: [45, 1],
        event: dragEvent(),
      });
    });
    useEditorStore.getState().writeTextString("!");

    expect(useEditorStore.getState().interaction.editingStructuredTextNodeId).toBe("text-1");
    expect(useEditorStore.getState().structuredScene[0]).toMatchObject({
      id: "text-1",
      text: "Edit!",
    });
  });

  it("keeps active structured text editing from turning into a text-node drag", () => {
    setStructuredTextScene({ editing: true });
    render(<InteractionHarness />);

    act(() => {
      gestureState.handlers?.onDragStart?.({
        xy: [1, 1],
        event: dragEvent(),
      });
      gestureState.handlers?.onDrag?.({
        xy: [20, 1],
        delta: [19, 0],
        event: dragEvent(),
      });
      gestureState.handlers?.onDragEnd?.({
        xy: [20, 1],
        event: dragEvent(),
      });
      gestureState.handlers?.onDragEnd?.({
        xy: [20, 1],
        event: dragEvent(),
      });
    });

    expect(useEditorStore.getState().interaction.textCursor).toEqual({ x: 2, y: 0 });
    expect(useEditorStore.getState().interaction.editingStructuredTextNodeId).toBe(
      "text-1"
    );
    expect(useEditorStore.getState().interaction.structuredTextSelection).toEqual({
      nodeId: "text-1",
      anchor: 0,
      focus: 2,
    });
    expect(useEditorStore.getState().structuredScene[0]).toMatchObject({
      id: "text-1",
      position: { x: 0, y: 0 },
    });
  });

  it("uses a text cursor when hovering the actively edited structured text", () => {
    setStructuredTextScene({ editing: true });
    const { getByTestId } = render(<InteractionHarness />);

    act(() => {
      gestureState.handlers?.onMove?.({
        xy: [1, 1],
        event: new MouseEvent("mousemove", {
          bubbles: true,
          cancelable: true,
        }),
      });
    });

    expect(getByTestId("canvas-root").style.cursor).toBe("text");
  });

  it("uses a pointer cursor over the real Welcome canvas links", () => {
    const linkedEntry = DEFAULT_DEMO_GRID.find(([, cell]) => !!cell.href);
    expect(linkedEntry).toBeDefined();
    const linkedPoint = GridManager.fromKey(linkedEntry![0]);
    setCanvasTestState({
      canvasMode: "freeform",
      tool: "select",
      offset: { x: 0, y: 0 },
      zoom: 1,
      contentSurface: new TestCanvasContentSurface(DEFAULT_DEMO_GRID),
      structuredScene: [],
    });
    const runtime = new CanvasEngineRuntime({
      getViewport: testingCanvasRuntime.viewport.getSnapshot,
      setViewport: testingCanvasRuntime.commands.viewport.setViewport,
    });
    const unregisterManager = vi.spyOn(runtime, "unregisterManager");
    interactionRuntime = runtime;
    const { getByTestId, unmount } = render(<InteractionHarness />);
    const screenPoint = GridManager.gridToScreen(
      linkedPoint.x,
      linkedPoint.y,
      0,
      0,
      1
    );

    act(() => {
      gestureState.handlers?.onMove?.({
        xy: [screenPoint.x + 1, screenPoint.y + 1],
        event: new MouseEvent("mousemove", {
          bubbles: true,
          cancelable: true,
        }),
      });
    });

    expect(getByTestId("canvas-root").style.cursor).toBe("pointer");
    expect(unregisterManager).not.toHaveBeenCalled();

    act(() => {
      gestureState.handlers?.onMove?.({
        xy: [-100, -100],
        event: new MouseEvent("mousemove", {
          bubbles: true,
          cancelable: true,
        }),
      });
    });

    expect(getByTestId("canvas-root").style.cursor).toBe("");

    unmount();
    expect(unregisterManager).toHaveBeenCalledTimes(1);
    interactionRuntime = undefined;
    runtime.dispose();
  });

  it("uses a drawing cursor when hovering with structured shape tools", () => {
    setCanvasTestState({
      canvasMode: "structured",
      tool: "box",
      offset: { x: 0, y: 0 },
      zoom: 1,
      hoveredGrid: null,
    });
    const { getByTestId } = render(<InteractionHarness />);

    act(() => {
      gestureState.handlers?.onMove?.({
        xy: [18, 60],
        event: new MouseEvent("mousemove", {
          bubbles: true,
          cancelable: true,
        }),
      });
    });

    expect(useEditorStore.getState().interaction.hoveredGrid).toEqual({ x: 2, y: 3 });
    expect(getByTestId("canvas-root").style.cursor).toBe("crosshair");
  });

  it.each([
    ["box", "box"],
    ["splitBox", "splitBox"],
    ["line", "line"],
    ["bg", "bg"],
  ] as const)("creates a structured %s node by dragging", (tool, expectedType) => {
    setCanvasTestState({
      canvasMode: "structured",
      tool: tool as ToolType,
      offset: { x: 0, y: 0 },
      zoom: 1,
      brushColor: "#112233",
      contentSurface: new TestCanvasContentSurface(),
      structuredScene: [],
      selectedStructuredNodeIds: [],
      selectedStructuredSplitHandle: null,
      structuredContextPoint: null,
    });
    render(<InteractionHarness />);

    act(() => {
      gestureState.handlers?.onDragStart?.({
        xy: [9, 20],
        event: dragEvent(),
      });
      gestureState.handlers?.onDrag?.({
        xy: [45, 60],
        delta: [36, 40],
        event: dragEvent(),
      });
      gestureState.handlers?.onDragEnd?.({
        xy: [45, 60],
        event: dragEvent(),
      });
    });

    const state = useEditorStore.getState();
    expect(state.structuredScene).toHaveLength(1);
    expect(state.structuredScene[0]).toMatchObject({
      type: expectedType,
      start: { x: 1, y: 1 },
      end: { x: 5, y: 3 },
    });
    expect(state.interaction.selectedStructuredNodeIds).toEqual([
      state.structuredScene[0].id,
    ]);
  });

  it("anchors the hovered cell while canvas color picking is active", () => {
    setCanvasTestState({
      canvasMode: "freeform",
      tool: "select",
      offset: { x: 0, y: 0 },
      zoom: 1,
      canvasColorPickerTarget: "auto",
      hoveredGrid: null,
    });
    const { getByTestId } = render(<InteractionHarness />);

    act(() => {
      gestureState.handlers?.onMove?.({
        xy: [18, 60],
        event: new MouseEvent("mousemove", {
          bubbles: true,
          cancelable: true,
        }),
      });
    });

    expect(useEditorStore.getState().interaction.hoveredGrid).toEqual({ x: 2, y: 3 });
    expect(getByTestId("canvas-root").style.cursor).toBe("crosshair");
  });

  it("picks char color from a visible canvas cell", () => {
    setCanvasTestState({
      canvasMode: "freeform",
      tool: "select",
      offset: { x: 0, y: 0 },
      zoom: 1,
      brushColor: "#000000",
      canvasColorPickerTarget: "auto",
      hoveredGrid: { x: 2, y: 3 },
      contentSurface: new TestCanvasContentSurface([
        ["2,3", { char: "A", color: "#112233" }],
      ]),
    });
    render(<InteractionHarness />);

    act(() => {
      gestureState.handlers?.onDragStart?.({
        xy: [18, 60],
        event: dragEvent(),
      });
    });

    const state = useEditorStore.getState();
    expect(state.brushColor).toBe("#112233");
    expect(state.interaction.canvasColorPickerTarget).toBeNull();
    expect(state.interaction.hoveredGrid).toBeNull();
  });

  it("keeps automatic color picking active after an empty cell click", () => {
    setCanvasTestState({
      canvasMode: "freeform",
      tool: "select",
      offset: { x: 0, y: 0 },
      zoom: 1,
      brushColor: "#000000",
      canvasColorPickerTarget: "auto",
      hoveredGrid: { x: 2, y: 3 },
      contentSurface: new TestCanvasContentSurface(),
    });
    const { getByTestId } = render(<InteractionHarness />);

    act(() => {
      gestureState.handlers?.onMove?.({
        xy: [18, 60],
        event: new MouseEvent("mousemove", {
          bubbles: true,
          cancelable: true,
        }),
      });
    });
    act(() => {
      gestureState.handlers?.onDragStart?.({
        xy: [18, 60],
        event: dragEvent(),
      });
    });

    const state = useEditorStore.getState();
    expect(state.brushColor).toBe("#000000");
    expect(state.interaction.canvasColorPickerTarget).toBe("auto");
    expect(state.interaction.hoveredGrid).toEqual({ x: 2, y: 3 });
    expect(getByTestId("canvas-root").style.cursor).toBe("crosshair");
  });

  it("picks background color from a blank canvas cell", () => {
    setCanvasTestState({
      canvasMode: "freeform",
      tool: "select",
      offset: { x: 0, y: 0 },
      zoom: 1,
      brushColor: "#000000",
      canvasColorPickerTarget: "auto",
      hoveredGrid: { x: 2, y: 3 },
      contentSurface: new TestCanvasContentSurface([
        ["2,3", { char: " ", color: "#112233", bgColor: "#445566" }],
      ]),
    });
    render(<InteractionHarness />);

    act(() => {
      gestureState.handlers?.onDragStart?.({
        xy: [18, 60],
        event: dragEvent(),
      });
    });

    const state = useEditorStore.getState();
    expect(state.brushColor).toBe("#445566");
    expect(state.interaction.canvasColorPickerTarget).toBeNull();
    expect(state.interaction.hoveredGrid).toBeNull();
  });

  it("asks which source to use when a cell has different foreground and background colors", async () => {
    setCanvasTestState({
      canvasMode: "freeform",
      tool: "select",
      offset: { x: 0, y: 0 },
      zoom: 1,
      brushColor: "#000000",
      canvasColorPickerTarget: "auto",
      hoveredGrid: { x: 2, y: 3 },
      contentSurface: new TestCanvasContentSurface([
        ["2,3", { char: "A", color: "#112233", bgColor: "#445566" }],
      ]),
    });
    render(<InteractionHarness />);

    act(() => {
      gestureState.handlers?.onDragStart?.({
        xy: [18, 60],
        event: dragEvent(),
      });
    });

    expect(useEditorStore.getState().brushColor).toBe("#000000");
    expect(useEditorStore.getState().interaction.canvasColorPickerTarget).toBeNull();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Use cell background color #445566",
      })
    );
    expect(useEditorStore.getState().brushColor).toBe("#445566");
    expect(
      screen.queryByRole("toolbar", { name: "Choose a color from this cell" })
    ).not.toBeInTheDocument();
  });

  it("activates a split box leaf focus from a left click", () => {
    setStructuredSplitBoxScene();
    render(<InteractionHarness />);

    act(() => {
      gestureState.handlers?.onDragStart?.({
        xy: [18, 40],
        event: dragEvent(),
      });
    });

    const state = useEditorStore.getState();
    expect(state.interaction.selectedStructuredNodeIds).toEqual(["split-1"]);
    expect(state.interaction.structuredContextPoint).toEqual({ x: 2, y: 2 });
  });

  it("selects a split divider handle from a left click", () => {
    setStructuredSplitBoxScene();
    setCanvasTestState({
      structuredScene: [
        {
          id: "split-1",
          type: "splitBox",
          order: 1,
          start: { x: 0, y: 0 },
          end: { x: 9, y: 9 },
          verticalSplitRatio: 0.5,
          topSplitRatio: 0.25,
          bottomSplitRatio: 0.75,
          root: {
            type: "split",
            id: "split-existing",
            axis: "vertical",
            ratio: 0.5,
            first: { type: "leaf", id: "left" },
            second: { type: "leaf", id: "right" },
          },
          style: { color: "#ffffff" },
        },
      ],
    });
    render(<InteractionHarness />);

    act(() => {
      gestureState.handlers?.onDragStart?.({
        xy: [50, 39],
        event: dragEvent(),
      });
    });

    const state = useEditorStore.getState();
    expect(state.interaction.selectedStructuredNodeIds).toEqual(["split-1"]);
    expect(state.interaction.selectedStructuredSplitHandle).toEqual({
      nodeId: "split-1",
      handle: "split:split-existing",
    });
    expect(state.structuredScene[0]).toMatchObject({
      type: "splitBox",
      root: { type: "split", id: "split-existing", ratio: 0.5 },
    });
  });

  it("resizes a split divider only after dragging away from the clicked cell", () => {
    setStructuredSplitBoxScene();
    setCanvasTestState({
      selectedStructuredNodeIds: ["split-1"],
      structuredScene: [
        {
          id: "split-1",
          type: "splitBox",
          order: 1,
          start: { x: 0, y: 0 },
          end: { x: 9, y: 9 },
          verticalSplitRatio: 0.5,
          topSplitRatio: 0.25,
          bottomSplitRatio: 0.75,
          root: {
            type: "split",
            id: "split-existing",
            axis: "vertical",
            ratio: 0.5,
            first: { type: "leaf", id: "left" },
            second: { type: "leaf", id: "right" },
          },
          style: { color: "#ffffff" },
        },
      ],
    });
    render(<InteractionHarness />);

    act(() => {
      gestureState.handlers?.onDragStart?.({
        xy: [50, 39],
        event: dragEvent(),
      });
      gestureState.handlers?.onDrag?.({
        xy: [50, 39],
        delta: [0, 0],
        event: dragEvent(),
      });
      gestureState.handlers?.onDragEnd?.({
        xy: [50, 39],
        event: dragEvent(),
      });
    });

    expect(useEditorStore.getState().structuredScene[0]).toMatchObject({
      type: "splitBox",
      root: { type: "split", id: "split-existing", ratio: 0.5 },
    });

    act(() => {
      gestureState.handlers?.onDragStart?.({
        xy: [50, 39],
        event: dragEvent(),
      });
      gestureState.handlers?.onDrag?.({
        xy: [68, 39],
        delta: [18, 0],
        event: dragEvent(),
      });
    });

    expect(useEditorStore.getState().structuredScene[0]).toMatchObject({
      type: "splitBox",
      root: { type: "split", id: "split-existing", ratio: 0.5 },
    });

    act(() => {
      gestureState.handlers?.onDragEnd?.({
        xy: [68, 39],
        event: dragEvent(),
      });
    });

    const node = useEditorStore.getState().structuredScene[0];
    expect(node).toMatchObject({
      type: "splitBox",
      root: { type: "split", id: "split-existing" },
    });
    expect(node.type === "splitBox" && node.root?.type === "split" && node.root.ratio)
      .toBeGreaterThan(0.5);
    expect(useEditorStore.getState().interaction.selectedStructuredSplitHandle).toEqual({
      nodeId: "split-1",
      handle: "split:split-existing",
    });
  });

  it("clears stale split box focus when left-clicking another structured node", () => {
    setStructuredMixedScene();
    setCanvasTestState({
      selectedStructuredNodeIds: [],
      structuredContextPoint: { x: 2, y: 2 },
    });
    render(<InteractionHarness />);

    act(() => {
      gestureState.handlers?.onDragStart?.({
        xy: [1, 1],
        event: dragEvent(),
      });
    });

    expect(useEditorStore.getState().interaction.selectedStructuredNodeIds).toEqual([
      "box-1",
    ]);
    expect(useEditorStore.getState().interaction.structuredContextPoint).toBeNull();
  });

  it("focuses an empty structured cell after a blank select click", () => {
    setStructuredTextScene();
    setCanvasTestState({
      selectedStructuredNodeIds: ["text-1"],
      structuredGridFocus: null,
    });
    render(<InteractionHarness />);

    act(() => {
      gestureState.handlers?.onDragStart?.({
        xy: [50, 40],
        event: dragEvent(),
      });
    });
    act(() => {
      gestureState.handlers?.onDragEnd?.({
        xy: [50, 40],
        event: dragEvent(),
      });
    });

    expect(useEditorStore.getState().interaction.selectedStructuredNodeIds).toEqual([]);
    expect(useEditorStore.getState().interaction.textCursor).toBeNull();
    expect(useEditorStore.getState().interaction.structuredGridFocus).toEqual({ x: 5, y: 2 });
  });

  it("does not start moving text on the second press of a double-click", () => {
    setStructuredTextScene();
    render(<InteractionHarness />);

    act(() => {
      gestureState.handlers?.onDragStart?.({
        xy: [1, 1],
        event: dragEvent(2),
      });
      gestureState.handlers?.onDrag?.({
        xy: [20, 1],
        delta: [19, 0],
        event: dragEvent(2),
      });
    });

    expect(useEditorStore.getState().interaction.selectedStructuredNodeIds).toEqual([
      "text-1",
    ]);
    expect(useEditorStore.getState().interaction.editingStructuredTextNodeId).toBeNull();
    expect(useEditorStore.getState().structuredScene[0]).toMatchObject({
      id: "text-1",
      position: { x: 0, y: 0 },
    });
  });

  it("still drags structured text when it is not in text edit mode", () => {
    setStructuredTextScene();
    render(<InteractionHarness />);

    act(() => {
      gestureState.handlers?.onDragStart?.({
        xy: [1, 1],
        event: dragEvent(),
      });
      gestureState.handlers?.onDrag?.({
        xy: [20, 1],
        delta: [19, 0],
        event: dragEvent(),
      });
      gestureState.handlers?.onDragEnd?.({
        xy: [20, 1],
        event: dragEvent(),
      });
    });

    expect(useEditorStore.getState().interaction.textCursor).toBeNull();
    expect(useEditorStore.getState().interaction.editingStructuredTextNodeId).toBeNull();
    expect(useEditorStore.getState().structuredScene[0]).toMatchObject({
      id: "text-1",
      position: { x: 2, y: 0 },
    });
  });

  it("moves every selected structured node when dragging inside the selection", () => {
    setStructuredMixedScene();
    render(<InteractionHarness />);

    act(() => {
      gestureState.handlers?.onDragStart?.({
        xy: [11, 21],
        event: dragEvent(),
      });
      gestureState.handlers?.onDrag?.({
        xy: [31, 21],
        delta: [20, 0],
        event: dragEvent(),
      });
      gestureState.handlers?.onDragEnd?.({
        xy: [31, 21],
        event: dragEvent(),
      });
      gestureState.handlers?.onDragEnd?.({
        xy: [31, 21],
        event: dragEvent(),
      });
      gestureState.handlers?.onDragEnd?.({
        xy: [31, 21],
        event: dragEvent(),
      });
    });

    expect(useEditorStore.getState().interaction.selectedStructuredNodeIds).toEqual([
      "box-1",
      "text-1",
    ]);
    expect(useEditorStore.getState().structuredScene).toMatchObject([
      {
        id: "box-1",
        start: { x: 2, y: 0 },
        end: { x: 4, y: 2 },
      },
      {
        id: "text-1",
        position: { x: 7, y: 0 },
      },
    ]);
  });

  it("undoes a structured multi-node drag as a single history step", () => {
    setStructuredMixedSceneWithHistory();
    render(<InteractionHarness />);

    act(() => {
      gestureState.handlers?.onDragStart?.({
        xy: [11, 21],
        event: dragEvent(),
      });
      gestureState.handlers?.onDrag?.({
        xy: [31, 21],
        delta: [20, 0],
        event: dragEvent(),
      });
      gestureState.handlers?.onDrag?.({
        xy: [41, 21],
        delta: [10, 0],
        event: dragEvent(),
      });
      gestureState.handlers?.onDragEnd?.({
        xy: [41, 21],
        event: dragEvent(),
      });
    });

    expect(useEditorStore.getState().structuredScene).toMatchObject([
      {
        id: "box-1",
        start: { x: 3, y: 0 },
        end: { x: 5, y: 2 },
      },
      {
        id: "text-1",
        position: { x: 8, y: 0 },
      },
    ]);

    act(() => {
    canvasCommands.history.undo();
    });

    expect(useEditorStore.getState().structuredScene).toMatchObject([
      {
        id: "box-1",
        start: { x: 0, y: 0 },
        end: { x: 2, y: 2 },
      },
      {
        id: "text-1",
        position: { x: 5, y: 0 },
      },
    ]);
  });

  it("switches to single-node movement when dragging an unselected structured node", () => {
    setStructuredMixedScene();
    setCanvasTestState({ selectedStructuredNodeIds: ["text-1"] });
    render(<InteractionHarness />);

    act(() => {
      gestureState.handlers?.onDragStart?.({
        xy: [11, 21],
        event: dragEvent(),
      });
      gestureState.handlers?.onDrag?.({
        xy: [31, 21],
        delta: [20, 0],
        event: dragEvent(),
      });
      gestureState.handlers?.onDragEnd?.({
        xy: [31, 21],
        event: dragEvent(),
      });
    });

    expect(useEditorStore.getState().interaction.selectedStructuredNodeIds).toEqual([
      "box-1",
    ]);
    expect(useEditorStore.getState().structuredScene).toMatchObject([
      {
        id: "box-1",
        start: { x: 2, y: 0 },
        end: { x: 4, y: 2 },
      },
      {
        id: "text-1",
        position: { x: 5, y: 0 },
      },
    ]);
  });

  it("moves an unselected single-row background from its endpoint", () => {
    setStructuredBgScene(false);
    render(<InteractionHarness />);

    act(() => {
      gestureState.handlers?.onDragStart?.({
        xy: [1, 1],
        event: dragEvent(),
      });
      gestureState.handlers?.onDrag?.({
        xy: [31, 1],
        delta: [30, 0],
        event: dragEvent(),
      });
      gestureState.handlers?.onDragEnd?.({
        xy: [31, 1],
        event: dragEvent(),
      });
    });

    expect(useEditorStore.getState().interaction.selectedStructuredNodeIds).toEqual([
      "bg-1",
    ]);
    expect(useEditorStore.getState().structuredScene[0]).toMatchObject({
      id: "bg-1",
      start: { x: 3, y: 0 },
      end: { x: 7, y: 0 },
    });
  });

  it("resizes a selected single-row background from its endpoint", () => {
    setStructuredBgScene(true);
    render(<InteractionHarness />);

    act(() => {
      gestureState.handlers?.onDragStart?.({
        xy: [45, 10],
        event: dragEvent(),
      });
      gestureState.handlers?.onDrag?.({
        xy: [61, 10],
        delta: [18, 0],
        event: dragEvent(),
      });
    });

    expect(useEditorStore.getState().interaction.selectedStructuredNodeIds).toEqual([
      "bg-1",
    ]);
    expect(useEditorStore.getState().structuredScene[0]).toMatchObject({
      id: "bg-1",
      start: { x: 0, y: 0 },
      end: { x: 6, y: 0 },
    });
  });

  it("expands a selected single-row background vertically from its visible handle", () => {
    setStructuredBgScene(true);
    render(<InteractionHarness />);

    act(() => {
      gestureState.handlers?.onDragStart?.({
        xy: [23, 19],
        event: dragEvent(),
      });
      gestureState.handlers?.onDrag?.({
        xy: [23, 41],
        delta: [0, 22],
        event: dragEvent(),
      });
    });

    expect(useEditorStore.getState().structuredScene[0]).toMatchObject({
      id: "bg-1",
      start: { x: 0, y: 0 },
      end: { x: 4, y: 2 },
    });
  });

  it("moves a selected single-row background from its body safe area", () => {
    setStructuredBgScene(true);
    render(<InteractionHarness />);

    act(() => {
      gestureState.handlers?.onDragStart?.({
        xy: [23, 10],
        event: dragEvent(),
      });
      gestureState.handlers?.onDrag?.({
        xy: [41, 10],
        delta: [18, 0],
        event: dragEvent(),
      });
      gestureState.handlers?.onDragEnd?.({
        xy: [41, 10],
        event: dragEvent(),
      });
    });

    expect(useEditorStore.getState().structuredScene[0]).toMatchObject({
      id: "bg-1",
      start: { x: 2, y: 0 },
      end: { x: 6, y: 0 },
    });
  });

  it("resizes a selected structured line from its visible endpoint handle", () => {
    setStructuredLineScene(true);
    render(<InteractionHarness />);

    act(() => {
      gestureState.handlers?.onDragStart?.({
        xy: [41, 10],
        event: dragEvent(),
      });
      gestureState.handlers?.onDrag?.({
        xy: [41, 48],
        delta: [0, 38],
        event: dragEvent(),
      });
    });

    expect(useEditorStore.getState().structuredScene[0]).toMatchObject({
      id: "line-1",
      start: { x: 0, y: 0 },
      end: { x: 4, y: 2 },
      axis: "horizontal",
    });
  });

  it("moves a selected structured line from its body safe area", () => {
    setStructuredLineScene(true);
    render(<InteractionHarness />);

    act(() => {
      gestureState.handlers?.onDragStart?.({
        xy: [23, 10],
        event: dragEvent(),
      });
      gestureState.handlers?.onDrag?.({
        xy: [41, 10],
        delta: [18, 0],
        event: dragEvent(),
      });
      gestureState.handlers?.onDragEnd?.({
        xy: [41, 10],
        event: dragEvent(),
      });
    });

    expect(useEditorStore.getState().structuredScene[0]).toMatchObject({
      id: "line-1",
      start: { x: 2, y: 0 },
      end: { x: 6, y: 0 },
    });
  });

  it("resizes the hit rectangle instead of moving every selected node", () => {
    setStructuredMixedScene();
    setCanvasTestState({ selectedStructuredNodeIds: ["box-1"] });
    render(<InteractionHarness />);

    act(() => {
      gestureState.handlers?.onDragStart?.({
        xy: [1, 1],
        event: dragEvent(),
      });
      gestureState.handlers?.onDrag?.({
        xy: [31, 1],
        delta: [30, 0],
        event: dragEvent(),
      });
    });

    expect(useEditorStore.getState().interaction.selectedStructuredNodeIds).toEqual([
      "box-1",
    ]);
    expect(useEditorStore.getState().structuredScene).toMatchObject([
      {
        id: "box-1",
        start: { x: 2, y: 0 },
        end: { x: 3, y: 2 },
      },
      {
        id: "text-1",
        position: { x: 5, y: 0 },
      },
    ]);
  });
});
