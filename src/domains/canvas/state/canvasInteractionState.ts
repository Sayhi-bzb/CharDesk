import type {
  GridEditMode,
  GridSelectionState,
  StaticGridInputSession,
} from "@/domains/selection/public";
import { createStaticGridState } from "@/domains/selection/public";
import type { GridMap, Point } from "@/shared/types";
import type { CanvasDocumentAddress } from "./canvasDocumentModel";

export type CanvasColorPickerTarget = "auto" | "auto-to-background";

export type CanvasInteractionSnapshot = Readonly<{
  address: CanvasDocumentAddress;
  textCursor: Point | null;
  staticGridSelection: GridSelectionState;
  staticGridEditMode: GridEditMode;
  staticGridInputSession: StaticGridInputSession | null;
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
    staticGridSelection: staticGrid.selection,
    staticGridEditMode: staticGrid.editMode,
    staticGridInputSession: null,
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
