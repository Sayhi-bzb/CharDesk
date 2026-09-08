import type { ToolType } from "@/domains/canvas/public";
import type { CanvasMode } from "@/domains/sessions/public";
import {
  forEachGridSelectionSpan,
  getGridSelectionRanges,
  hasGridRangeSelection,
  type GridSelectionState,
} from "@/domains/selection/public";
import type {
  StructuredNode,
  StructuredTextSelection,
} from "@/domains/structured-content/public";
import type { GridCell, GridCellSource } from "@/shared/types";
import { deriveStructuredInspectorModel } from "./structured-model";
import {
  deriveTextFormattingModel,
  type TextFormattingModel,
} from "./text-format-model";

type StructuredInspectorModel = ReturnType<
  typeof deriveStructuredInspectorModel
>;

type CanvasInspectorModel =
  | {
      mode: "grid";
      canvasMode: Exclude<CanvasMode, "structured">;
      activeColor: string;
      canvasPickDestination: "foreground" | "background";
      hasSelection: boolean;
      textFormatting: TextFormattingModel | null;
    }
  | {
      mode: "structured";
      activeColor: string;
      canvasPickDestination: "foreground";
      structured: StructuredInspectorModel;
    };

export const deriveCanvasInspectorModel = ({
  canvasMode,
  tool,
  brushColor,
  brushBackgroundColor,
  grid,
  staticGridSelection,
  structuredScene,
  selectedStructuredNodeIds,
  structuredTextSelection,
}: {
  canvasMode: CanvasMode;
  tool: ToolType;
  brushColor: string;
  brushBackgroundColor: string;
  grid: GridCellSource;
  staticGridSelection: GridSelectionState;
  structuredScene: StructuredNode[];
  selectedStructuredNodeIds: string[];
  structuredTextSelection: StructuredTextSelection | null;
}): CanvasInspectorModel => {
  if (canvasMode !== "structured") {
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
  }

  const structured = deriveStructuredInspectorModel({
    brushColor,
    scene: structuredScene,
    selectedIds: selectedStructuredNodeIds,
    textSelection: structuredTextSelection,
  });
  return {
    mode: "structured",
    activeColor:
      structured.primaryColor.kind === "value" &&
      structured.primaryColor.value
        ? structured.primaryColor.value
        : brushColor,
    canvasPickDestination: "foreground",
    structured,
  };
};
