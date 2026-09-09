type ToolCanvasMode = "freeform" | "slide";

export type ToolType =
  | "select"
  | "pan"
  | "text"
  | "brush"
  | "eraser"
  | "fill"
  | "box"
  | "splitBox"
  | "line"
  | "arrowLine"
  | "bg"
  | "stepline"
  | "circle";

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
