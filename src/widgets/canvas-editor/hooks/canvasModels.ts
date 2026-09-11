import type {
  CanvasRuntime,
  CanvasInteractionSnapshot,
  CanvasState,
  CanvasSurfaceReader,
  CanvasViewportState,
  PendingCanvasCameraPlacement,
} from "@/domains/canvas/public";

type CanvasCommands = CanvasRuntime["commands"];

export type CanvasRenderModel = Pick<CanvasState,
  | "activeCanvasId"
  | "showGrid"
  | "tool"
  | "canvasMode"
  | "slideDeck"
> & Pick<CanvasInteractionSnapshot,
  | "scratchLayer"
  | "textCursor"
  | "staticGridSelection"
  | "staticGridEditMode"
  | "hoveredGrid"
  | "canvasColorPickerTarget"
> & {
  offset: CanvasViewportState["offset"];
  zoom: number;
  contentReader: CanvasSurfaceReader;
  contentRevision: number;
};

export type CanvasEditorModel = Pick<CanvasState, "brushColor"> & {
  interaction: Pick<CanvasInteractionSnapshot,
    | "textCursor"
    | "staticGridSelection"
    | "staticGridEditMode"
    | "canvasColorPickerTarget"
  >;
  offset: CanvasViewportState["offset"];
  zoom: number;
  pendingCameraPlacement?: PendingCanvasCameraPlacement | null;
  contentReader: CanvasSurfaceReader;
  writeTextString: CanvasCommands["text"]["write"];
  deleteStaticGrid: CanvasCommands["staticGrid"]["delete"];
  newlineText: CanvasCommands["text"]["newline"];
  indentText: CanvasCommands["text"]["indent"];
  moveTextCursor: CanvasCommands["text"]["moveCursor"];
  moveStaticGridFocus: CanvasCommands["staticGrid"]["moveFocus"];
  moveStaticGridFocusToEdge: CanvasCommands["staticGrid"]["moveFocusToEdge"];
  moveStaticGridFocusToContentBoundary: CanvasCommands["staticGrid"]["moveFocusToContentBoundary"];
  selectStaticGridAll: CanvasCommands["staticGrid"]["selectAll"];
  selectStaticGridRow: CanvasCommands["staticGrid"]["selectRow"];
  selectStaticGridColumn: CanvasCommands["staticGrid"]["selectColumn"];
  enterStaticGridTextEdit: CanvasCommands["staticGrid"]["enterTextEdit"];
  exitStaticGridTextEdit: CanvasCommands["staticGrid"]["exitTextEdit"];
  setTextCursor: CanvasCommands["interaction"]["setTextCursor"];
  setOffset: CanvasCommands["viewport"]["setOffset"];
  consumePendingCameraPlacement?: CanvasCommands["viewport"]["consumePendingPlacement"];
  fillSelectionsWithChar: CanvasCommands["selection"]["fillWithChar"];
  moveStaticGridSelection: CanvasCommands["selection"]["moveStaticRange"];
  insertRows: CanvasCommands["grid"]["insertRows"];
  clearSelections: CanvasCommands["selection"]["clear"];
  setCanvasColorPickerTarget: CanvasCommands["interaction"]["setColorPickerTarget"];
  setHoveredGrid: CanvasCommands["interaction"]["setHoveredGrid"];
};
