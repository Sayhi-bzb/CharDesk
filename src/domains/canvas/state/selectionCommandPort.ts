import type { Point } from "@/shared/types";
import type { CanvasInteractionUpdate } from "./canvasInteractionState";
import type {
  CanvasState,
  ClipboardCommandResult,
} from "./interfaces";
import type {
  RichTextCell,
  RichTextRow,
  TextPasteOptions,
} from "./textCommandTypes";

export type SelectionMutationPort = {
  transact: <Result>(fn: () => Result) => Result;
  deleteSelection: () => void;
  erasePoints: (points: Point[], shouldSaveHistory?: boolean) => void;
  pasteRichData: (
    cells: RichTextCell[],
    startPos?: Point,
    options?: TextPasteOptions
  ) => void;
  pasteRichRows: (
    rows: readonly RichTextRow[],
    startPos?: Point,
    options?: TextPasteOptions
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
