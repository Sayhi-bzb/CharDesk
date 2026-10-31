import { CanvasToolStateNode as SharedNode } from '@chardesk/editor-core/interaction/canvasToolRuntime';
import type { CanvasState } from '@/domains/canvas/public';
export class CanvasToolStateNode extends SharedNode<CanvasState> {}
export {
  type CanvasInteractionState,
  getInteractionStart,
  isPrimaryDragState,
  type CanvasToolInputEvent,
  type CanvasEditorInputEvent,
  type CanvasInteractionPort,
  CanvasInteractionPortBinding,
} from '@chardesk/editor-core/interaction/canvasToolRuntime';
