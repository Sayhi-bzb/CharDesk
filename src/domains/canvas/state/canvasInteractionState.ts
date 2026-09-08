import type {
  GridEditMode,
  GridSelectionState,
  StaticGridInputFlow,
} from "@/domains/selection/public";
import { createStaticGridState } from "@/domains/selection/public";
import type {
  StructuredSplitBoxHandle,
  StructuredTextSelection,
} from "@/domains/structured-content/public";
import type { GridMap, Point } from "@/shared/types";
import type { CanvasDocumentAddress } from "./canvasDocumentModel";

export type CanvasColorPickerTarget = "auto" | "auto-to-background";

export type CanvasInteractionSnapshot = Readonly<{
  address: CanvasDocumentAddress;
  textCursor: Point | null;
  editingStructuredTextNodeId: string | null;
  structuredTextSelection: StructuredTextSelection | null;
  selectedStructuredNodeIds: string[];
  selectedStructuredBoxId: string | null;
  selectedStructuredSplitHandle: {
    nodeId: string;
    handle: StructuredSplitBoxHandle;
  } | null;
  structuredContextPoint: Point | null;
  structuredGridFocus: Point | null;
  staticGridSelection: GridSelectionState;
  staticGridEditMode: GridEditMode;
  staticGridInputFlow: StaticGridInputFlow | null;
  hoveredGrid: Point | null;
  scratchLayer: GridMap | null;
  canvasColorPickerTarget: CanvasColorPickerTarget | null;
}>;

export type CanvasInteractionUpdate = Partial<
  Omit<CanvasInteractionSnapshot, "address">
>;

export const createEmptyCanvasInteraction = (
  address: CanvasDocumentAddress
): CanvasInteractionSnapshot => {
  const staticGrid = createStaticGridState();
  return {
    address: { ...address },
    textCursor: null,
    editingStructuredTextNodeId: null,
    structuredTextSelection: null,
    selectedStructuredNodeIds: [],
    selectedStructuredBoxId: null,
    selectedStructuredSplitHandle: null,
    structuredContextPoint: null,
    structuredGridFocus: null,
    staticGridSelection: staticGrid.selection,
    staticGridEditMode: staticGrid.editMode,
    staticGridInputFlow: null,
    hoveredGrid: null,
    scratchLayer: null,
    canvasColorPickerTarget: null,
  };
};

export const updateCanvasInteraction = (
  current: CanvasInteractionSnapshot,
  update:
    | CanvasInteractionUpdate
    | ((current: CanvasInteractionSnapshot) => CanvasInteractionUpdate)
): CanvasInteractionSnapshot => ({
  ...current,
  ...(typeof update === "function" ? update(current) : update),
});

export const createCanvasInteractionPatch = (
  current: CanvasInteractionSnapshot,
  update:
    | CanvasInteractionUpdate
    | ((current: CanvasInteractionSnapshot) => CanvasInteractionUpdate)
) => ({ interaction: updateCanvasInteraction(current, update) });
