import type { ToolType } from "@/domains/canvas/public";
import type { CanvasMode } from "@/domains/sessions/public";
import {
  forEachGridSelectionSpan,
  getGridSelectionRanges,
  hasGridRangeSelection,
  type GridSelectionState,
} from "@/domains/selection/public";
import type { GridCell, GridCellSource } from "@/shared/types";
import {
  deriveTextFormattingModel,
  type TextFormattingModel,
} from "./text-format-model";

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
  const selectedCells: GridCell[] = [];
  forEachGridSelectionSpan(
    getGridSelectionRanges(staticGridSelection),
    ({ y, minX, maxX }) => {
      for (let x = minX; x <= maxX; x++) {
        const cell = grid.get({ x, y });
        if (cell) selectedCells.push(cell);
      }
    },
    grid
  );
  return {
    mode: "grid",
    canvasMode,
    activeColor: isBackgroundTool ? brushBackgroundColor : brushColor,
    canvasPickDestination: isBackgroundTool ? "background" : "foreground",
    hasSelection: hasGridRangeSelection(staticGridSelection),
    textFormatting: deriveTextFormattingModel(selectedCells),
  };
};
