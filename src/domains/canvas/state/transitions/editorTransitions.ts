import type { CanvasSessionDescriptor } from "@/domains/sessions/public";
import type { SlideDeckDescriptor } from "@/domains/slides/public";
import type { EditorState } from "../interfaces";
import type { CanvasDocumentAddress } from "../canvasDocumentModel";
import { createEmptyCanvasInteraction } from "../canvasInteractionState";
import type { resolveSessionDescriptorRuntime } from "../helpers/storeUtils";
import { createCanvasContentSurface } from "../helpers/gridHelpers";
import type { CanvasSurfaceReader } from "../../cell-plane/model";

type SessionRuntime = ReturnType<typeof resolveSessionDescriptorRuntime> & {
  nextSlideDeck: SlideDeckDescriptor | null;
};

type DocumentInteractionResetPatch = Pick<EditorState, "interaction">;

type SessionActivationPatch = Pick<
  EditorState,
  | "canvasSessions"
  | "activeCanvasId"
  | "canvasMode"
  | "slideDeck"
  | "contentSurface"
  | "tool"
> &
  DocumentInteractionResetPatch;

type SlideActivationPatch = Pick<
  EditorState,
  "slideDeck" | "contentSurface"
> &
  DocumentInteractionResetPatch;

export const createDocumentInteractionResetPatch = (
  address: CanvasDocumentAddress
): DocumentInteractionResetPatch => ({
  interaction: createEmptyCanvasInteraction(address),
});

export const createSessionActivationPatch = (
  canvasSessions: CanvasSessionDescriptor[],
  activeCanvasId: string,
  runtime: SessionRuntime,
  contentReader: CanvasSurfaceReader,
  address: CanvasDocumentAddress
): SessionActivationPatch => ({
  canvasSessions,
  activeCanvasId,
  canvasMode: runtime.nextMode,
  slideDeck: runtime.nextSlideDeck,
  contentSurface: createCanvasContentSurface(contentReader),
  tool: runtime.nextTool,
  ...createDocumentInteractionResetPatch(address),
});

export const createSlideActivationPatch = (
  slideDeck: SlideDeckDescriptor,
  activeReader: CanvasSurfaceReader,
  address: CanvasDocumentAddress
): SlideActivationPatch => ({
  slideDeck,
  contentSurface: createCanvasContentSurface(activeReader),
  ...createDocumentInteractionResetPatch(address),
});
