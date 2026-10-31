type ToolCanvasMode = "freeform" | "slide";

import type { ToolType } from "@chardesk/editor-core/interaction/tool";
export type { ToolType } from "@chardesk/editor-core/interaction/tool";
const CELL_PLANE_TOOLS = [
  "select",
  "pan",
  "brush",
  "eraser",
  "fill",
  "box",
  "splitBox",
  "line",
  "bg",
  "stepline",
  "circle",
] as const satisfies readonly ToolType[];

const TOOLS_BY_MODE = {
  freeform: CELL_PLANE_TOOLS,
  slide: CELL_PLANE_TOOLS,
} as const satisfies Record<ToolCanvasMode, readonly ToolType[]>;

export const isToolAllowedForMode = (
  tool: ToolType,
  mode: ToolCanvasMode
): boolean => TOOLS_BY_MODE[mode].some((allowedTool) => allowedTool === tool);
