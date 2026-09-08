import type {
  CanvasRuntime,
  CanvasState,
  CanvasSurfaceReader,
} from "@/domains/canvas/public";

type CanvasCommands = CanvasRuntime["commands"];
type CanvasQueries = CanvasRuntime["queries"];

export type CanvasRenderModel = Pick<CanvasState,
  | "activeCanvasId"
  | "offset"
  | "zoom"
  | "scratchLayer"
  | "textCursor"
  | "staticGridSelection"
  | "staticGridEditMode"
  | "showGrid"
  | "hoveredGrid"
  | "tool"
  | "canvasMode"
  | "slideDeck"
  | "structuredScene"
  | "selectedStructuredNodeIds"
  | "selectedStructuredBoxId"
  | "structuredContextPoint"
  | "structuredGridFocus"
  | "editingStructuredTextNodeId"
  | "structuredTextSelection"
  | "canvasColorPickerTarget"
> & {
  contentReader: CanvasSurfaceReader;
  contentRevision: number;
};

export type CanvasEditorModel = Pick<CanvasState,
  | "textCursor"
  | "staticGridSelection"
  | "staticGridEditMode"
  | "offset"
  | "zoom"
  | "structuredGridFocus"
  | "selectedStructuredNodeIds"
  | "structuredScene"
  | "structuredComponents"
  | "brushColor"
  | "canvasColorPickerTarget"
  | "pendingCameraPlacement"
> & {
  contentReader: CanvasSurfaceReader;
  writeTextString: CanvasCommands["text"]["write"];
  backspaceText: CanvasCommands["text"]["backspace"];
  deleteTextForward: CanvasCommands["text"]["deleteForward"];
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
  moveStructuredGridFocus: CanvasCommands["interaction"]["moveStructuredGridFocus"];
  setTextCursor: CanvasCommands["interaction"]["setTextCursor"];
  setOffset: CanvasCommands["viewport"]["setOffset"];
  consumePendingCameraPlacement: CanvasCommands["viewport"]["consumePendingPlacement"];
  fillSelectionsWithChar: CanvasCommands["selection"]["fillWithChar"];
  moveStaticGridSelection: CanvasCommands["selection"]["moveStaticRange"];
  clearSelections: CanvasCommands["selection"]["clear"];
  setStructuredGridFocus: CanvasCommands["interaction"]["setStructuredGridFocus"];
  setSelectedStructuredNodeIds: CanvasCommands["interaction"]["setSelectedStructuredNodeIds"];
  setSelectedStructuredSplitHandle: CanvasCommands["interaction"]["setSelectedStructuredSplitHandle"];
  setEditingStructuredTextNodeId: CanvasCommands["interaction"]["setEditingStructuredTextNodeId"];
  setStructuredTextSelection: CanvasCommands["interaction"]["setStructuredTextSelection"];
  setCanvasColorPickerTarget: CanvasCommands["interaction"]["setColorPickerTarget"];
  setHoveredGrid: CanvasCommands["interaction"]["setHoveredGrid"];
  getNextStructuredOrder: CanvasQueries["getNextStructuredOrder"];
  applyStructuredScene: CanvasCommands["structured"]["applyScene"];
  setStructuredContextPoint: CanvasCommands["interaction"]["setStructuredContextPoint"];
};
