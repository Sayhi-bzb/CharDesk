import { CanvasDocumentRegistry as SharedRegistry } from "@chardesk/editor-core/CanvasDocumentRegistry";
import { migrateLegacyStructuredDocument } from "./migrateLegacyStructuredDocument";
export class CanvasDocumentRegistry extends SharedRegistry {
 constructor(initialId = "canvas-initial") { super(initialId, migrateLegacyStructuredDocument); }
}
export {
  type CanvasHistoryMode,
  type CanvasHistoryCheckpoint,
  type CanvasDocumentSeed,
} from "@chardesk/editor-core/CanvasDocumentRegistry";
