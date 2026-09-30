export {
  CHARDESK_TEXT_PROTOCOL_VERSION,
  parseCharDeskText,
  parseCharDeskTextRows,
  stripCharDeskAnsi,
} from "./parser.js";
export { layoutCharDeskTextRuns, layoutCharDeskTextRunsToRows } from "./runs.js";
export { materializeCharDeskTextRows } from "./row-spans.js";
export { decodeCharDeskTextRuns } from "./decode.js";
export { formatCharDeskStyleNotes } from "./style-notes.js";
export type { CharDeskStyleNoteCell } from "./style-notes.js";
export {
  getGraphemeCellWidth,
  getTextCellWidth,
  isEmojiGrapheme,
  iterateGraphemes,
  segmentGraphemes,
  splitGraphemes,
  UNICODE_DATA_VERSION,
} from "./graphemes.js";
export type { GraphemeSegment } from "./graphemes.js";
export {
  compareCharDeskGeometry,
  createCharDeskGeometrySnapshot,
} from "./geometry.js";
export type {
  CharDeskGeometryCell,
  CharDeskAnsiEvidence,
  CharDeskGeometryComparison,
  CharDeskGeometryMismatch,
  CharDeskGeometrySnapshot,
  CharDeskTextAttributes,
  CharDeskTextCell,
  CharDeskTextRow,
  CharDeskTextSpan,
  CharDeskTextDiagnostic,
  CharDeskTextDiagnosticCode,
  CharDeskTextStyle,
  CharDeskTextRun,
  CharDeskTextSyntax,
  CompareCharDeskGeometryOptions,
  LayoutCharDeskTextRunsOptions,
  ParseCharDeskTextOptions,
  ParsedCharDeskText,
  ParsedCharDeskTextRows,
  DecodedCharDeskTextRuns,
} from "./types.js";
