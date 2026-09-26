import { describe, expect, it } from "vitest";
import { CANVAS_CONTEXT_MENU } from "@/domains/actions/public";
import {
  canUseCanvasEditorAction,
  canUseCanvasEditorShortcutTarget,
  filterCanvasContextMenuEntries,
  type CanvasEditorCapabilities,
} from "./canvasEditorCapabilities";

const blackboardCapabilities: CanvasEditorCapabilities = {
  navigate: true,
  select: true,
  copy: true,
  mutateContent: false,
};

describe("Canvas editor capability policy", () => {
  it("separates observation, copy, and mutation actions", () => {
    expect(canUseCanvasEditorAction(blackboardCapabilities, "copy")).toBe(true);
    expect(canUseCanvasEditorAction(blackboardCapabilities, "copy-ansi")).toBe(true);
    expect(canUseCanvasEditorAction(blackboardCapabilities, "snapshot-png")).toBe(true);
    expect(canUseCanvasEditorAction(blackboardCapabilities, "paste")).toBe(false);
    expect(canUseCanvasEditorAction(blackboardCapabilities, "delete-selection")).toBe(false);
    expect(canUseCanvasEditorShortcutTarget(
      blackboardCapabilities,
      { type: "tool", id: "pan" },
    )).toBe(true);
    expect(canUseCanvasEditorShortcutTarget(
      blackboardCapabilities,
      { type: "tool", id: "select" },
    )).toBe(true);
    expect(canUseCanvasEditorShortcutTarget(
      blackboardCapabilities,
      { type: "tool", id: "brush" },
    )).toBe(false);
  });

  it("builds a separator-safe read-only context menu", () => {
    expect(filterCanvasContextMenuEntries(
      CANVAS_CONTEXT_MENU,
      blackboardCapabilities,
    )).toEqual([
      { type: "action", id: "copy" },
      { type: "action", id: "copy-ansi" },
      { type: "action", id: "snapshot-png" },
    ]);
  });
});
