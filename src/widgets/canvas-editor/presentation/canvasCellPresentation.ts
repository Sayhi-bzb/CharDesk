import type { CharDeskCellCursorShape } from "@chardesk/rendering";
import type {
  GridEditMode,
  GridSelectionGeometry,
} from "@/domains/selection/public";
import type { Point } from "@/shared/types";

export type CanvasCellPresentation = Readonly<{
  selectionGeometry: GridSelectionGeometry | null;
  cursor: Readonly<{
    point: Point;
    shape: CharDeskCellCursorShape;
    blink: boolean;
  }> | null;
}>;

export const resolveCanvasCellPresentation = (input: Readonly<{
  viewActive: boolean;
  inputFocused: boolean;
  editMode: GridEditMode;
  activeCell: Point;
  textCursor: Point | null;
  hasRangeSelection: boolean;
  selectionGeometry: GridSelectionGeometry;
  cursorPreference: Readonly<{
    shape: CharDeskCellCursorShape;
    blink: boolean;
  }>;
}>): CanvasCellPresentation => {
  if (!input.viewActive) return { selectionGeometry: null, cursor: null };
  if (input.hasRangeSelection) {
    return { selectionGeometry: input.selectionGeometry, cursor: null };
  }
  const editing = input.editMode === "text-edit";
  return {
    selectionGeometry: null,
    cursor: {
      point: editing && input.textCursor ? input.textCursor : input.activeCell,
      shape: input.cursorPreference.shape,
      blink: editing && input.inputFocused && input.cursorPreference.blink,
    },
  };
};
