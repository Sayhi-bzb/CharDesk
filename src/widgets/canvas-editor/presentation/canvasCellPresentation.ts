import type { CharDeskCanvasCursorShape } from "@chardesk/rendering/canvas";
import type {
  GridEditMode,
  GridSelectionGeometry,
} from "@/domains/selection/public";
import type { Point } from "@/shared/types";

export type CanvasCellPresentation = Readonly<{
  selectionGeometry: GridSelectionGeometry | null;
  cursor: Readonly<{
    point: Point;
    shape: CharDeskCanvasCursorShape;
    mode: "active" | "editing";
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
    shape: CharDeskCanvasCursorShape;
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
      mode: editing ? "editing" : "active",
      blink: editing && input.inputFocused && input.cursorPreference.blink,
    },
  };
};
