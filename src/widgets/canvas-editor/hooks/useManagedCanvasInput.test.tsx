import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyFreeformSnapshotToYMaps,
  redoCanvas,
  undoCanvas,
  useEditorStore,
} from "@/domains/canvas/testing";
import { ShortcutProvider } from "@/shared/shortcuts/dispatcher";
import { useManagedCanvasInput } from "./useManagedCanvasInput";

describe("useManagedCanvasInput", () => {
  const initialState = useEditorStore.getState();

  afterEach(() => {
    vi.restoreAllMocks();
    useEditorStore.setState(initialState, true);
    applyFreeformSnapshotToYMaps([]);
  });

  it("suppresses native copy when copy capability is unavailable", () => {
    const model = { ...useEditorStore.getState() };
    const { result } = renderHook(
      () => useManagedCanvasInput({
        canvasMode: "freeform",
        model,
        size: { width: 800, height: 600 },
        copyEnabled: false,
        mutateEnabled: false,
      }),
      { wrapper: ShortcutProvider },
    );
    const preventDefault = vi.fn();

    act(() => {
      result.current.textareaProps.onCopy?.({ preventDefault } as never);
    });

    expect(preventDefault).toHaveBeenCalledOnce();
  });

  it("does not fill a selection from a capture-prevented shortcut", () => {
    const fillSelectionsWithChar = vi.fn();
    const model = {
      ...useEditorStore.getState(),
      textCursor: null,
      selectedStructuredNodeIds: [],
      fillSelectionsWithChar,
    };
    const { result } = renderHook(
      () =>
        useManagedCanvasInput({
          canvasMode: "structured",
          model,
          size: { width: 800, height: 600 },
          onUndo: vi.fn(),
          onRedo: vi.fn(),
        }),
      { wrapper: ShortcutProvider }
    );
    const stopPropagation = vi.fn();

    act(() => {
      result.current.textareaProps.onKeyDown?.({
        defaultPrevented: true,
        stopPropagation,
      } as never);
    });

    expect(stopPropagation).not.toHaveBeenCalled();
    expect(fillSelectionsWithChar).not.toHaveBeenCalled();
  });

  it("keeps consecutive half-width input, including Space, on one advancing grid flow", () => {
    useEditorStore.setState({
      canvasMode: "freeform",
      grid: new Map(),
      textCursor: null,
      staticGridSelection: {
        mode: "cell",
        activeCell: { x: 4, y: 3 },
        anchorCell: { x: 4, y: 3 },
        primaryRange: { start: { x: 4, y: 3 }, end: { x: 4, y: 3 } },
        additionalRanges: [],
      },
      staticGridEditMode: "navigate",
      staticGridInputFlow: null,
    });
    const model = { ...useEditorStore.getState() };
    const { result } = renderHook(
      () =>
        useManagedCanvasInput({
          canvasMode: "freeform",
          model,
          size: { width: 800, height: 600 },
        }),
      { wrapper: ShortcutProvider }
    );

    act(() => {
      for (const [key, code] of [
        ["A", "KeyA"],
        [" ", "Space"],
        ["B", "KeyB"],
      ]) {
        const preventDefault = vi.fn();
        result.current.textareaProps.onKeyDown?.({
          defaultPrevented: false,
          key,
          code,
          preventDefault,
          ctrlKey: false,
          metaKey: false,
          altKey: false,
          shiftKey: false,
        } as never);
        expect(preventDefault).not.toHaveBeenCalled();
        result.current.textareaProps.onInput?.({
          currentTarget: { value: key },
        } as never);
      }
      result.current.textareaProps.onBlur?.();
    });

    expect(useEditorStore.getState().grid).toEqual(
      new Map([
        ["4,3", { char: "A", color: "#000000" }],
        ["5,3", { char: " ", color: "#000000" }],
        ["6,3", { char: "B", color: "#000000" }],
      ])
    );
    expect(useEditorStore.getState().textCursor).toEqual({ x: 7, y: 3 });
    expect(useEditorStore.getState().staticGridSelection.activeCell).toEqual({ x: 7, y: 3 });
    expect(undoCanvas()).toBe(true);
    expect(useEditorStore.getState().grid).toEqual(new Map());
    expect(redoCanvas()).toBe(true);
    expect([...useEditorStore.getState().grid.values()].map(({ char }) => char)).toEqual([
      "A",
      " ",
      "B",
    ]);
  });

  it("keeps printable keydown as direct fill for a freeform range", () => {
    useEditorStore.setState({
      canvasMode: "freeform",
      grid: new Map(),
      textCursor: null,
      staticGridSelection: {
        mode: "range",
        activeCell: { x: 5, y: 3 },
        anchorCell: { x: 4, y: 3 },
        primaryRange: { start: { x: 4, y: 3 }, end: { x: 5, y: 3 } },
        additionalRanges: [],
      },
      staticGridEditMode: "navigate",
      staticGridInputFlow: null,
    });
    const model = { ...useEditorStore.getState() };
    const { result } = renderHook(
      () =>
        useManagedCanvasInput({
          canvasMode: "freeform",
          model,
          size: { width: 800, height: 600 },
        }),
      { wrapper: ShortcutProvider }
    );
    const preventDefault = vi.fn();

    act(() => {
      result.current.textareaProps.onKeyDown?.({
        defaultPrevented: false,
        key: "X",
        code: "KeyX",
        preventDefault,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
      } as never);
    });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(useEditorStore.getState().grid).toEqual(
      new Map([
        ["4,3", { char: "X", color: "#000000" }],
        ["5,3", { char: "X", color: "#000000" }],
      ])
    );
    expect(useEditorStore.getState().staticGridEditMode).toBe("navigate");
    expect(useEditorStore.getState().staticGridInputFlow).toBeNull();
  });

  it("continues the same grid flow when composition is followed by half-width input", () => {
    useEditorStore.setState({
      canvasMode: "freeform",
      grid: new Map(),
      textCursor: null,
      staticGridSelection: {
        mode: "cell",
        activeCell: { x: 2, y: 1 },
        anchorCell: { x: 2, y: 1 },
        primaryRange: { start: { x: 2, y: 1 }, end: { x: 2, y: 1 } },
        additionalRanges: [],
      },
      staticGridEditMode: "navigate",
      staticGridInputFlow: null,
    });
    const model = { ...useEditorStore.getState() };
    const { result } = renderHook(
      () =>
        useManagedCanvasInput({
          canvasMode: "freeform",
          model,
          size: { width: 800, height: 600 },
        }),
      { wrapper: ShortcutProvider }
    );

    act(() => {
      result.current.textareaProps.onCompositionStart?.();
      result.current.textareaProps.onInput?.({
        currentTarget: { value: "你" },
      } as never);
    });
    expect(useEditorStore.getState().grid).toEqual(new Map());

    act(() => {
      result.current.textareaProps.onCompositionEnd?.({ data: "你" } as never);
      result.current.textareaProps.onInput?.({
        currentTarget: { value: "A" },
      } as never);
      result.current.textareaProps.onBlur?.();
    });

    expect(useEditorStore.getState().grid).toEqual(
      new Map([
        ["2,1", { char: "你", color: "#000000" }],
        ["4,1", { char: "A", color: "#000000" }],
      ])
    );
    expect(useEditorStore.getState().textCursor).toEqual({ x: 5, y: 1 });
  });

  it("suppresses a delayed terminal input after compositionend", async () => {
    useEditorStore.setState({
      canvasMode: "freeform",
      grid: new Map(),
      textCursor: null,
      staticGridSelection: {
        mode: "cell",
        activeCell: { x: 2, y: 1 },
        anchorCell: { x: 2, y: 1 },
        primaryRange: { start: { x: 2, y: 1 }, end: { x: 2, y: 1 } },
        additionalRanges: [],
      },
      staticGridEditMode: "navigate",
      staticGridInputFlow: null,
    });
    const { result } = renderHook(
      () => useManagedCanvasInput({
        canvasMode: "freeform",
        model: { ...useEditorStore.getState() },
        size: { width: 800, height: 600 },
      }),
      { wrapper: ShortcutProvider }
    );

    act(() => {
      result.current.textareaProps.onCompositionStart?.();
      result.current.textareaProps.onCompositionEnd?.({
        data: "你",
        currentTarget: { value: "你" },
      } as never);
    });
    await Promise.resolve();
    act(() => {
      result.current.textareaProps.onInput?.({
        currentTarget: { value: "你" },
        nativeEvent: {
          data: "你",
          isComposing: false,
          inputType: "insertFromComposition",
        },
      } as never);
    });

    expect(useEditorStore.getState().grid).toEqual(
      new Map([["2,1", { char: "你", color: "#000000" }]])
    );
    expect(useEditorStore.getState().textCursor).toEqual({ x: 4, y: 1 });
  });

  it("accepts the same text as a new input after a real keydown", () => {
    useEditorStore.setState({
      canvasMode: "freeform",
      grid: new Map(),
      textCursor: null,
      staticGridSelection: {
        mode: "cell",
        activeCell: { x: 2, y: 1 },
        anchorCell: { x: 2, y: 1 },
        primaryRange: { start: { x: 2, y: 1 }, end: { x: 2, y: 1 } },
        additionalRanges: [],
      },
      staticGridEditMode: "navigate",
      staticGridInputFlow: null,
    });
    const { result } = renderHook(
      () => useManagedCanvasInput({
        canvasMode: "freeform",
        model: { ...useEditorStore.getState() },
        size: { width: 800, height: 600 },
      }),
      { wrapper: ShortcutProvider }
    );

    act(() => {
      result.current.textareaProps.onCompositionStart?.();
      result.current.textareaProps.onCompositionEnd?.({
        data: "你",
        currentTarget: { value: "你" },
      } as never);
      result.current.textareaProps.onKeyDown?.({
        defaultPrevented: false,
        key: "Unidentified",
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
      } as never);
      result.current.textareaProps.onInput?.({
        currentTarget: { value: "你" },
        nativeEvent: {
          data: "你",
          isComposing: false,
          inputType: "insertText",
        },
      } as never);
      result.current.textareaProps.onBlur?.();
    });

    expect(useEditorStore.getState().grid).toEqual(new Map([
      ["2,1", { char: "你", color: "#000000" }],
      ["4,1", { char: "你", color: "#000000" }],
    ]));
    expect(useEditorStore.getState().textCursor).toEqual({ x: 6, y: 1 });
  });

  it("commits consecutive managed input once per animation frame", () => {
    let scheduled: FrameRequestCallback | undefined;
    const requestFrame = vi.spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        scheduled = callback;
        return 1;
      });
    const cancelFrame = vi.spyOn(window, "cancelAnimationFrame")
      .mockImplementation(() => undefined);
    const writeTextString = vi.fn();
    const { result } = renderHook(
      () => useManagedCanvasInput({
        canvasMode: "freeform",
        inputIdentity: "canvas-a",
        model: { ...useEditorStore.getState(), writeTextString },
        size: { width: 800, height: 600 },
      }),
      { wrapper: ShortcutProvider }
    );

    act(() => {
      for (const value of ["A", " ", "B"]) {
        result.current.textareaProps.onInput?.({
          currentTarget: { value },
          nativeEvent: { data: value, isComposing: false },
        } as never);
      }
    });
    expect(writeTextString).not.toHaveBeenCalled();
    expect(requestFrame).toHaveBeenCalledOnce();

    act(() => scheduled?.(performance.now()));
    expect(writeTextString).toHaveBeenCalledOnce();
    expect(writeTextString).toHaveBeenCalledWith("A B");
    expect(cancelFrame).not.toHaveBeenCalled();
  });

  it("flushes pending text before an ordering key command", () => {
    vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    const writeTextString = vi.fn();
    const backspaceText = vi.fn();
    const { result } = renderHook(
      () => useManagedCanvasInput({
        canvasMode: "structured",
        model: {
          ...useEditorStore.getState(),
          textCursor: { x: 1, y: 0 },
          writeTextString,
          backspaceText,
        },
        size: { width: 800, height: 600 },
      }),
      { wrapper: ShortcutProvider }
    );

    act(() => {
      result.current.textareaProps.onInput?.({
        currentTarget: { value: "A" },
        nativeEvent: { data: "A", isComposing: false },
      } as never);
      result.current.textareaProps.onKeyDown?.({
        defaultPrevented: false,
        key: "Backspace",
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        preventDefault: vi.fn(),
      } as never);
    });

    expect(writeTextString).toHaveBeenCalledWith("A");
    expect(backspaceText).toHaveBeenCalledOnce();
    expect(writeTextString.mock.invocationCallOrder[0]).toBeLessThan(
      backspaceText.mock.invocationCallOrder[0]!
    );
  });

  it("discards pending text when the input identity changes", () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callbacks.set(1, callback);
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
      callbacks.delete(id);
    });
    const writeTextString = vi.fn();
    let inputIdentity = "canvas-a";
    const { result, rerender } = renderHook(
      () => useManagedCanvasInput({
        canvasMode: "freeform",
        inputIdentity,
        model: { ...useEditorStore.getState(), writeTextString },
        size: { width: 800, height: 600 },
      }),
      { wrapper: ShortcutProvider }
    );

    act(() => {
      result.current.textareaProps.onInput?.({
        currentTarget: { value: "A" },
        nativeEvent: { data: "A", isComposing: false },
      } as never);
    });
    inputIdentity = "canvas-b";
    rerender();
    act(() => callbacks.forEach((callback) => callback(performance.now())));

    expect(writeTextString).not.toHaveBeenCalled();
  });
});
