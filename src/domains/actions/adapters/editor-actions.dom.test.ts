import { describe, expect, it, vi, afterEach } from "vitest";
import * as editorCommands from "@/domains/actions/adapters/editorCommands";
import {
  EDITOR_COMMAND_META,
  CANVAS_CONTEXT_MENU,
  STRUCTURED_CONTEXT_MENU,
} from "@/domains/actions/public";
import { editorCheckers, editorHandlers } from "@/domains/actions/core/handlers/editor";
import {
  applyFreeformSnapshotToYMaps,
  canvasCommands,
  testingCanvasRuntime,
  setCanvasTestState,
  useEditorStore,
} from "@/domains/canvas/testing";
import { clipboard } from "@/shared/services/effects";
import { createGridSelectionState, selectGridRange } from "@/domains/selection/public";

describe("editorHandlers clipboard sources", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("forwards clipboard-event source to runEditorCommand", () => {
    const runEditorCommandSpy = vi.spyOn(editorCommands, "runEditorCommand").mockReturnValue(true);

    const managedTextarea = document.createElement("textarea");
    const clipboardEvent = {
      clipboardData: null,
    } as unknown as ClipboardEvent;

    const result = editorHandlers.paste(
      {
        source: "clipboard-event",
        clipboardEvent,
        managedTextarea,
      },
      {
        state: useEditorStore.getState(),
        canvas: testingCanvasRuntime as never,
        setTool: vi.fn(),
        onUndo: vi.fn(),
        onRedo: vi.fn(),
      }
    );

    expect(result.status).toBe("succeeded");
    expect(runEditorCommandSpy).toHaveBeenCalledWith(
      testingCanvasRuntime,
      "paste",
      expect.objectContaining({
        source: "clipboard-event",
        clipboardEvent,
        managedTextarea,
      })
    );
  });

  it("forwards copy-ansi to runEditorCommand without a shortcut path", () => {
    const runEditorCommandSpy = vi.spyOn(editorCommands, "runEditorCommand").mockReturnValue(true);

    const state = {
      ...useEditorStore.getState(),
      canvasMode: "freeform" as const,
      interaction: {
        ...useEditorStore.getState().interaction,
        textCursor: { x: 0, y: 0 },
      },
    };

    const result = editorHandlers["copy-ansi"](
      {
        source: "context-menu",
      },
      {
        state,
        canvas: testingCanvasRuntime as never,
        setTool: vi.fn(),
        onUndo: vi.fn(),
        onRedo: vi.fn(),
      }
    );

    expect(result.status).toBe("succeeded");
    expect(runEditorCommandSpy).toHaveBeenCalledWith(
      testingCanvasRuntime,
      "copy-ansi",
      expect.objectContaining({
        source: "context-menu",
      })
    );
  });

  it("disables copy-ansi in structured mode", () => {
    const result = editorHandlers["copy-ansi"](
      { source: "context-menu" },
      {
        state: {
          ...useEditorStore.getState(),
          canvasMode: "structured" as const,
        },
        canvas: testingCanvasRuntime as never,
        setTool: vi.fn(),
        onUndo: vi.fn(),
        onRedo: vi.fn(),
      }
    );

    expect(result.status).toBe("rejected");
    expect("reason" in result ? result.reason : undefined).toBe("not-supported-in-structured");
  });

  it("reports structured text cut as pending until the clipboard write completes", async () => {
    const runEditorCommandSpy = vi
      .spyOn(editorCommands, "runEditorCommand")
      .mockReturnValue(Promise.resolve({ status: "applied", changed: true } as const));
    const state = {
      ...useEditorStore.getState(),
      canvasMode: "structured" as const,
      interaction: {
        ...useEditorStore.getState().interaction,
        structuredTextSelection: {
          nodeId: "text-1",
          anchor: 0,
          focus: 2,
        },
      },
    };

    const result = editorHandlers.cut(
      { source: "canvas-keydown" },
      {
        state,
        canvas: testingCanvasRuntime as never,
        setTool: vi.fn(),
        onUndo: vi.fn(),
        onRedo: vi.fn(),
      }
    );

    expect(result.status).toBe("pending");
    if (result.status !== "pending") return;
    await expect(result.completion).resolves.toEqual({
      succeeded: true,
      changed: true,
    });
    expect(runEditorCommandSpy).toHaveBeenCalledWith(
      testingCanvasRuntime,
      "cut",
      expect.objectContaining({ source: "canvas-keydown" })
    );
  });

  it("reports structured node cut as pending until the clipboard write completes", async () => {
    const runEditorCommandSpy = vi
      .spyOn(editorCommands, "runEditorCommand")
      .mockReturnValue(Promise.resolve({ status: "applied", changed: true } as const));
    const state = {
      ...useEditorStore.getState(),
      canvasMode: "structured" as const,
      interaction: {
        ...useEditorStore.getState().interaction,
        selectedStructuredNodeIds: ["box-1"],
        structuredTextSelection: null,
      },
    };

    const result = editorHandlers.cut(
      { source: "context-menu" },
      {
        state,
        canvas: testingCanvasRuntime as never,
        setTool: vi.fn(),
        onUndo: vi.fn(),
        onRedo: vi.fn(),
      }
    );

    expect(result.status).toBe("pending");
    if (result.status !== "pending") return;
    await expect(result.completion).resolves.toEqual({
      succeeded: true,
      changed: true,
    });
    expect(runEditorCommandSpy).toHaveBeenCalledWith(
      testingCanvasRuntime,
      "cut",
      expect.objectContaining({ source: "context-menu" })
    );
  });

  it("enables cut for selected structured nodes and rejects an unselected scene", () => {
    const selectedState = {
      ...useEditorStore.getState(),
      canvasMode: "structured" as const,
      interaction: {
        ...useEditorStore.getState().interaction,
        selectedStructuredNodeIds: ["box-1"],
        structuredTextSelection: null,
      },
    };
    expect(editorCheckers.cut?.(selectedState)).toBe(true);

    const runEditorCommandSpy = vi.spyOn(editorCommands, "runEditorCommand");
    const result = editorHandlers.cut(
      { source: "context-menu" },
      {
        state: {
          ...selectedState,
          interaction: {
            ...selectedState.interaction,
            selectedStructuredNodeIds: [],
          },
        },
        canvas: testingCanvasRuntime as never,
        setTool: vi.fn(),
        onUndo: vi.fn(),
        onRedo: vi.fn(),
      }
    );

    expect(result.status).toBe("rejected");
    expect("reason" in result ? result.reason : undefined).toBe("empty-selection");
    expect(runEditorCommandSpy).not.toHaveBeenCalled();
  });
});

describe("editorHandlers text formatting", () => {
  const context = () => ({
    state: useEditorStore.getState(),
    canvas: testingCanvasRuntime,
    setTool: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
  });

  afterEach(() => {
    setCanvasTestState({ canvasMode: "structured" });
    canvasCommands.structured.applyScene([], false);
    setCanvasTestState({
      canvasMode: "freeform",
      selectedStructuredNodeIds: [],
      structuredTextSelection: null,
      staticGridSelection: createGridSelectionState(),
    });
    applyFreeformSnapshotToYMaps([]);
  });

  it("normalizes a mixed grid range on the first toggle and clears it on the second", () => {
    const selection = selectGridRange(
      createGridSelectionState({ x: 0, y: 0 }),
      { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } },
      { activeCell: "start" }
    );
    setCanvasTestState({ canvasMode: "freeform", staticGridSelection: selection });
    applyFreeformSnapshotToYMaps([
      ["0,0", { char: "A", color: "#fff", attrs: { bold: true } }],
      ["1,0", { char: "B", color: "#fff" }],
    ]);

    expect(editorCheckers["format-bold"]?.(useEditorStore.getState())).toBe(true);
    expect(editorHandlers["format-bold"]({}, context()).status).toBe("succeeded");
    expect(useEditorStore.getState().contentSurface.reader.materialize().get("0,0")?.attrs?.bold).toBe(true);
    expect(useEditorStore.getState().contentSurface.reader.materialize().get("1,0")?.attrs?.bold).toBe(true);

    editorHandlers["format-bold"]({}, context());
    expect(useEditorStore.getState().contentSurface.reader.materialize().get("0,0")?.attrs?.bold).toBeUndefined();
    expect(useEditorStore.getState().contentSurface.reader.materialize().get("1,0")?.attrs?.bold).toBeUndefined();
  });

  it("routes structured text formatting through the selected text range", () => {
    setCanvasTestState({ canvasMode: "structured" });
    canvasCommands.structured.applyScene(
      [
        {
          id: "text-1",
          type: "text",
          order: 1,
          position: { x: 0, y: 0 },
          text: "AB",
          style: { color: "#fff" },
        },
      ],
      false
    );
    setCanvasTestState({
      selectedStructuredNodeIds: ["text-1"],
      structuredTextSelection: { nodeId: "text-1", anchor: 0, focus: 2 },
    });

    expect(editorHandlers["format-italic"]({}, context()).status).toBe("succeeded");
    const node = useEditorStore.getState().structuredScene[0];
    expect(node.type === "text" ? node.styleRanges : []).toEqual([
      expect.objectContaining({ start: 0, end: 2, style: expect.objectContaining({ attrs: { italic: true } }) }),
    ]);
  });
});

describe("editor history commands", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("forwards managed canvas focus context for undo and redo", () => {
    const runEditorCommandSpy = vi.spyOn(editorCommands, "runEditorCommand").mockReturnValue(true);
    const managedTextarea = document.createElement("textarea");
    const context = {
      state: { ...useEditorStore.getState(), canUndo: true, canRedo: true },
      canvas: testingCanvasRuntime as never,
      setTool: vi.fn(),
      onUndo: vi.fn(),
      onRedo: vi.fn(),
    };

    editorHandlers.undo(
      {
        source: "canvas-keydown",
        managedTextarea,
      },
      context
    );
    editorHandlers.redo(
      {
        source: "canvas-keydown",
        managedTextarea,
      },
      context
    );

    expect(runEditorCommandSpy).toHaveBeenNthCalledWith(
      1,
      testingCanvasRuntime,
      "undo",
      expect.objectContaining({
        source: "canvas-keydown",
        managedTextarea,
      })
    );
    expect(runEditorCommandSpy).toHaveBeenNthCalledWith(
      2,
      testingCanvasRuntime,
      "redo",
      expect.objectContaining({
        source: "canvas-keydown",
        managedTextarea,
      })
    );
  });
});

describe("editor context menu catalog", () => {
  it("keeps free canvas copy and delete actions focused", () => {
    expect(CANVAS_CONTEXT_MENU).toEqual([
      { type: "action", id: "copy" },
      { type: "action", id: "copy-ansi" },
      { type: "action", id: "snapshot-png" },
      { type: "action", id: "paste" },
      { type: "separator" },
      { type: "action", id: "delete-selection" },
    ]);
  });

  it("offers cut for structured node selections", () => {
    expect(STRUCTURED_CONTEXT_MENU).toContainEqual({ type: "action", id: "cut" });
  });

  it("labels delete plainly in context menus", () => {
    expect(EDITOR_COMMAND_META["delete-selection"].label).toBe("Delete");
  });
});

describe("editorHandlers structured rename", () => {
  const baseState = useEditorStore.getState();

  it("puts the cursor at the selected box name end", () => {
    const setTextCursor = vi
      .spyOn(canvasCommands.interaction, "setTextCursor")
      .mockImplementation(() => undefined);
    const state = {
      ...baseState,
      canvasMode: "structured" as const,
      interaction: {
        ...baseState.interaction,
        selectedStructuredBoxId: "box-1",
        selectedStructuredNodeIds: ["box-1"],
      },
      structuredScene: [
        {
          id: "box-1",
          type: "box" as const,
          order: 1,
          start: { x: 2, y: 3 },
          end: { x: 10, y: 7 },
          name: "API",
          style: { color: "#ffffff" },
        },
      ],
    };

    const result = editorHandlers["structured-rename"](
      { source: "context-menu" },
      {
        state,
        canvas: testingCanvasRuntime as never,
        setTool: vi.fn(),
        onUndo: vi.fn(),
        onRedo: vi.fn(),
      }
    );

    expect(result.status).toBe("succeeded");
    expect(setTextCursor).toHaveBeenCalledWith({ x: 8, y: 3 });
  });

  it("fails when the selected structured node is a line", () => {
    const state = {
      ...baseState,
      canvasMode: "structured" as const,
      interaction: {
        ...baseState.interaction,
        selectedStructuredBoxId: null,
        selectedStructuredNodeIds: ["line-1"],
      },
      structuredScene: [
        {
          id: "line-1",
          type: "line" as const,
          order: 1,
          start: { x: 0, y: 0 },
          end: { x: 4, y: 0 },
          axis: "horizontal" as const,
          style: { color: "#ffffff" },
        },
      ],
    };

    const result = editorHandlers["structured-rename"](
      { source: "context-menu" },
      {
        state,
        canvas: testingCanvasRuntime as never,
        setTool: vi.fn(),
        onUndo: vi.fn(),
        onRedo: vi.fn(),
      }
    );

    expect(result.status).toBe("rejected");
    expect(editorCheckers["structured-rename"]?.(state)).toBe(false);
  });

  it("puts the cursor at the selected text end", () => {
    const setTextCursor = vi
      .spyOn(canvasCommands.interaction, "setTextCursor")
      .mockImplementation(() => undefined);
    const state = {
      ...baseState,
      canvasMode: "structured" as const,
      interaction: {
        ...baseState.interaction,
        selectedStructuredBoxId: null,
        selectedStructuredNodeIds: ["text-1"],
      },
      structuredScene: [
        {
          id: "text-1",
          type: "text" as const,
          order: 1,
          position: { x: 4, y: 5 },
          text: "接口",
          style: { color: "#ffffff" },
        },
      ],
    };

    const result = editorHandlers["structured-rename"](
      { source: "context-menu" },
      {
        state,
        canvas: testingCanvasRuntime as never,
        setTool: vi.fn(),
        onUndo: vi.fn(),
        onRedo: vi.fn(),
      }
    );

    expect(result.status).toBe("succeeded");
    expect(setTextCursor).toHaveBeenCalledWith({ x: 8, y: 5 });
    expect(editorCheckers["structured-rename"]?.(state)).toBe(true);
  });
  it("is disabled for boxes too narrow to hold a name", () => {
    const state = {
      ...baseState,
      canvasMode: "structured" as const,
      interaction: {
        ...baseState.interaction,
        selectedStructuredBoxId: "box-1",
        selectedStructuredNodeIds: ["box-1"],
      },
      structuredScene: [
        {
          id: "box-1",
          type: "box" as const,
          order: 1,
          start: { x: 0, y: 0 },
          end: { x: 3, y: 2 },
          style: { color: "#ffffff" },
        },
      ],
    };

    expect(editorCheckers["structured-rename"]?.(state)).toBe(false);
  });

  it("shows Rename at the top of the structured context menu", () => {
    expect(STRUCTURED_CONTEXT_MENU[0]).toEqual({
      type: "action",
      id: "structured-rename",
    });
  });

  it("groups structured layer actions under a Layer submenu", () => {
    const layerEntry = STRUCTURED_CONTEXT_MENU.find(
      (entry) => entry.type === "submenu" && entry.label === "Layer"
    );
    expect(layerEntry).toMatchObject({
      type: "submenu",
      label: "Layer",
      children: [
        { type: "action", id: "structured-bring-forward" },
        { type: "action", id: "structured-send-backward" },
        { type: "action", id: "structured-bring-to-front" },
        { type: "action", id: "structured-send-to-back" },
      ],
    });

    const topLevelActionIds = STRUCTURED_CONTEXT_MENU.flatMap((entry) =>
      entry.type === "action" ? [entry.id] : []
    );
    expect(topLevelActionIds).not.toContain("structured-bring-forward");
    expect(topLevelActionIds).not.toContain("structured-send-backward");
    expect(topLevelActionIds).not.toContain("structured-bring-to-front");
    expect(topLevelActionIds).not.toContain("structured-send-to-back");
  });

  it("copies simplified structured hierarchy from the context menu action", () => {
    const writeTextSpy = vi.spyOn(clipboard, "writeText").mockResolvedValue(true);
    const state = {
      ...baseState,
      canvasMode: "structured" as const,
      interaction: {
        ...baseState.interaction,
        selectedStructuredBoxId: "box-1",
        selectedStructuredNodeIds: ["box-1"],
      },
      structuredScene: [
        {
          id: "box-1",
          type: "box" as const,
          order: 1,
          start: { x: 0, y: 0 },
          end: { x: 8, y: 4 },
          name: "API",
          style: { color: "#ffffff" },
        },
        {
          id: "text-1",
          type: "text" as const,
          order: 2,
          position: { x: 1, y: 1 },
          text: "Hello",
          style: { color: "#ffffff" },
        },
      ],
    };

    const result = editorHandlers["structured-copy-hierarchy"](
      { source: "context-menu" },
      {
        state,
        canvas: testingCanvasRuntime as never,
        setTool: vi.fn(),
        onUndo: vi.fn(),
        onRedo: vi.fn(),
      }
    );

    expect(result.status).toBe("succeeded");
    expect(writeTextSpy).toHaveBeenCalledWith(
      [
        "<canvas",
        '  mode="structured"',
        ">",
        "  <box",
        '    name="API"',
        "  >",
        "    <text",
        '      value="Hello"',
        "    />",
        "  </box>",
        "</canvas>",
      ].join("\n")
    );
    expect(editorCheckers["structured-copy-hierarchy"]?.(state)).toBe(true);
  });

  it("shows Copy Structure in the structured context menu", () => {
    expect(STRUCTURED_CONTEXT_MENU).toContainEqual({
      type: "action",
      id: "structured-copy-hierarchy",
    });
  });
});
