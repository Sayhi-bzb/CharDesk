import { createKeyInput, type KeyInputInit } from "@chardesk/keyboard";
import { describe, expect, it } from "vitest";
import {
  modifiedArrowEdgeFor,
  resolveManagedCanvasKeyIntent,
  type ManagedCanvasKeyboardContext,
} from "./managedCanvasKeyboard";

const context = (
  overrides: Partial<ManagedCanvasKeyboardContext> = {}
): ManagedCanvasKeyboardContext => ({
  mutateEnabled: true,
  staticGridMode: true,
  staticGridEditMode: "navigate",
  hasStaticGridSelection: false,
  hasTextCursor: false,
  hasActiveSelection: false,
  hasStructuredSelection: false,
  hasStructuredGridFocus: false,
  colorPickerOpen: false,
  pageRows: 12,
  ...overrides,
});

const decide = (
  input: KeyInputInit,
  overrides?: Partial<ManagedCanvasKeyboardContext>
) => resolveManagedCanvasKeyIntent(createKeyInput(input), context(overrides));

describe("managed Canvas keyboard rules", () => {
  it("maps grid navigation without DOM events", () => {
    expect(decide({ key: "ArrowRight", modifiers: { shift: true } })).toMatchObject({
      preventDefault: true,
      intent: { type: "move-grid-focus", dx: 1, dy: 0, extend: true },
    });
    expect(decide({ key: "Home", modifiers: { meta: true } }).intent).toEqual({
      type: "move-grid-edge",
      edge: "top-left",
      extend: false,
    });
    expect(decide({ key: "PageUp", modifiers: { shift: true } }).intent).toEqual({
      type: "move-grid-page",
      rows: -12,
      extend: true,
    });
    expect(decide({ key: "Enter", modifiers: { shift: true } }).intent).toEqual({
      type: "move-grid-focus",
      dx: 0,
      dy: -1,
      extend: false,
    });
  });

  it("keeps text and structured navigation as separate intents", () => {
    expect(decide({ key: "Backspace" }, {
      staticGridEditMode: "text-edit",
      hasTextCursor: true,
    }).intent).toEqual({ type: "delete-text", direction: "backward" });
    expect(decide({ key: "ArrowDown" }, {
      staticGridMode: false,
      hasTextCursor: true,
    }).intent).toEqual({ type: "move-text-cursor", dx: 0, dy: 1 });
    expect(decide({ key: "ArrowLeft" }, {
      staticGridMode: false,
      hasStructuredGridFocus: true,
    }).intent).toEqual({ type: "move-structured-grid-focus", dx: -1, dy: 0 });
  });

  it("resolves Escape by the existing ownership priority", () => {
    const cases: ReadonlyArray<[
      Partial<ManagedCanvasKeyboardContext>,
      string,
    ]> = [
      [{ colorPickerOpen: true }, "color-picker"],
      [{ staticGridEditMode: "text-edit" }, "grid-text-edit"],
      [{ hasTextCursor: true }, "text-cursor"],
      [{ hasStructuredSelection: true }, "structured-selection"],
      [{ hasStructuredGridFocus: true }, "structured-grid-focus"],
      [{ hasActiveSelection: true }, "selection"],
      [{}, "none"],
    ];
    for (const [overrides, target] of cases) {
      expect(decide({ key: "Escape" }, overrides).intent).toEqual({
        type: "escape",
        target,
      });
    }
  });

  it("routes printable selection fill and rejects ambiguous text keys", () => {
    expect(decide({ key: "界" }, { hasStaticGridSelection: true }).intent)
      .toEqual({ type: "fill-selection", char: "界" });
    expect(decide({ key: "Dead" }, { hasStaticGridSelection: true }).intent)
      .toBeNull();
    expect(decide({ key: "x", modifiers: { altGraph: true } }, {
      hasStaticGridSelection: true,
    })).toMatchObject({ preventDefault: false, intent: null });
    expect(decide({ key: "x", composing: true }, {
      hasStaticGridSelection: true,
    })).toMatchObject({ preventDefault: false, intent: null });
  });

  it("blocks destructive keys when mutation is disabled", () => {
    expect(decide({ key: "Delete" }, {
      mutateEnabled: false,
      hasActiveSelection: true,
    })).toMatchObject({ preventDefault: true, intent: null });
  });

  it("detects modified content-boundary arrows from normalized facts", () => {
    expect(modifiedArrowEdgeFor(createKeyInput({
      key: "ArrowUp",
      modifiers: { ctrl: true, shift: true },
    }))).toBe("top");
    expect(modifiedArrowEdgeFor(createKeyInput({ key: "ArrowUp" }))).toBeNull();
  });
});
