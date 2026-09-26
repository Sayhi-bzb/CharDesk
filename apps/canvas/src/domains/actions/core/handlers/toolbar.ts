import type { ToolType } from "@/domains/canvas/public";
import type { ToolbarActionId } from "../types";

// Resolve active toolbar action
export const resolveActiveToolbarAction = (
  tool: ToolType,
  isShapeGroupActive: boolean
): ToolbarActionId => {
  if (isShapeGroupActive) return "shape-group";
  if (
    tool === "select" ||
    tool === "pan" ||
    tool === "text" ||
    tool === "brush" ||
    tool === "eraser" ||
    tool === "bg" ||
    tool === "fill"
  ) {
    return tool;
  }
  return "brush";
};
