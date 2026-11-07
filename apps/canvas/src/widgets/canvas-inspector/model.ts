import type { ToolType } from "@/domains/canvas/public";
import type { CanvasMode } from "@/domains/sessions/public";
import {
  getGridSelectionRanges,
  hasGridRangeSelection,
  type GridSelectionState,
} from "@/domains/selection/public";
import type { GridCellSource } from "@/shared/types";
import {
  readSelectionStyle,
  type TextFormattingModel,
} from "@chardesk/editor-core/selection/style";

type CanvasInspectorModel = {
  mode: "grid";
  canvasMode: CanvasMode;
  activeColor: string;
  canvasPickDestination: "foreground" | "background";
  hasSelection: boolean;
  textFormatting: TextFormattingModel | null;
};

export const deriveCanvasInspectorModel = ({
  canvasMode,
  tool,
  brushColor,
  brushBackgroundColor,
  grid,
  staticGridSelection,
}: {
  canvasMode: CanvasMode;
  tool: ToolType;
  brushColor: string;
  brushBackgroundColor: string;
  grid: GridCellSource;
  staticGridSelection: GridSelectionState;
}): CanvasInspectorModel => {
  const isBackgroundTool = tool === "bg";
  const style = readSelectionStyle(grid, getGridSelectionRanges(staticGridSelection));
  return {
    mode: "grid",
    canvasMode,
    activeColor: isBackgroundTool ? brushBackgroundColor : brushColor,
    canvasPickDestination: isBackgroundTool ? "background" : "foreground",
    hasSelection: hasGridRangeSelection(staticGridSelection),
    textFormatting: style.attributes,
  };
};
