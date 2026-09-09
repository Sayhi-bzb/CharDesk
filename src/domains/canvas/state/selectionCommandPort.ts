import type {
  StructuredComponentInstance,
  StructuredNode,
  StructuredTextStyleRange,
} from "@/domains/structured-content/public";
import type { Point } from "@/shared/types";
import type { CanvasHistoryMode } from "./CanvasDocumentRegistry";
import type { CanvasInteractionUpdate } from "./canvasInteractionState";
import type {
  CanvasState,
  ClipboardCommandResult,
  RichTextCell,
  RichTextRow,
} from "./interfaces";

export type SelectionMutationPort = {
  deleteSelection: () => void;
  erasePoints: (points: Point[], shouldSaveHistory?: boolean) => void;
  replaceStructuredTextRange: (
    nodeId: string,
    start: number,
    end: number,
    text: string,
    styleRanges?: StructuredTextStyleRange[]
  ) => void;
  applyStructuredScene: (
    scene: StructuredNode[],
    history?: CanvasHistoryMode | boolean,
    components?: StructuredComponentInstance[]
  ) => void;
  pasteRichData: (
    cells: RichTextCell[],
    startPos?: Point,
    options?: { selectResult?: boolean }
  ) => void;
  pasteRichRows: (
    rows: readonly RichTextRow[],
    startPos?: Point,
    options?: { selectResult?: boolean }
  ) => void;
  updateInteraction: (update: CanvasInteractionUpdate) => void;
};

export type SelectionCommands = {
  canCopyOrCut: () => boolean;
  copySelection: (options?: {
    rich?: boolean;
    ansi?: boolean;
    event?: ClipboardEvent;
  }) => Promise<ClipboardCommandResult>;
  cutSelection: (options?: {
    event?: ClipboardEvent;
  }) => Promise<ClipboardCommandResult>;
  pasteFromClipboard: (options?: {
    eventDataTransfer?: DataTransfer;
  }) => Promise<ClipboardCommandResult>;
  copySelectionAsPng: (withGrid: boolean) => Promise<void>;
};

export type SelectionCommandContext = {
  getState: () => CanvasState;
  mutations: SelectionMutationPort;
};

export type SelectionCommandFactory = (
  context: SelectionCommandContext
) => SelectionCommands;
